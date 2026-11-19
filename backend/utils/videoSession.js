import crypto from 'crypto';
import appointmentModel from '../models/appointmentModel.js';
import turnUsageModel from '../models/turnUsageModel.js';
import { checkAppointmentWindow } from './calendarHelper.js';
import { sendTurnQuotaAlertEmail } from './emailService.js';

/**
 * VitalSync Production Video Session Layer
 * ========================================
 * Server-authoritative signaling for 1:1 teleconsultations.
 *
 *  - Authorization: a socket may only join `video:<appointmentId>` if its handshake JWT
 *    belongs to that appointment's patient (userId) or doctor (docId).
 *  - Isolation: video signaling uses a dedicated `video:` room namespace, so chat sockets
 *    joined to the plain appointment room can never receive SDP / ICE payloads.
 *  - Single seat per role: a second tab/device for the same role replaces the first.
 *  - Reconnect-aware: transient socket drops keep the room alive for a grace period and
 *    peers are told whether a rejoin is a `resume` (existing RTCPeerConnection still alive).
 *  - Short-lived TURN credentials (coturn `use-auth-secret` / RFC 7635 style REST creds).
 *  - Call-quality audit log persisted to appointment.callLogs.
 */

const ROLES = ['user', 'doctor'];
const EMPTY_ROOM_GRACE_MS = 45 * 1000;
const MAX_SIGNAL_BYTES = 64 * 1024;
const TURN_CREDENTIAL_TTL_SEC = 6 * 60 * 60;
const TURN_QUOTA_CACHE_MS = 60 * 1000;
const MAX_TURN_DELTA_BYTES = 100 * 1024 * 1024;
const TURN_SESSION_FALLBACK_BYTES = 2 * 1024 * 1024;
const BYTES_PER_GB = 1024 * 1024 * 1024;

// appointmentId -> { participants: Map<role, {socketId, name, joinedAt}>, sessionStartedAt, peakParticipants, finalizeTimer, reconnects, turnRelayBytes, turnFallbackApplied }
const videoRooms = new Map();

const roomKey = (appointmentId) => `video:${appointmentId}`;

const getRoom = (appointmentId) => {
    const id = String(appointmentId);
    if (!videoRooms.has(id)) {
        videoRooms.set(id, {
            participants: new Map(),
            sessionStartedAt: null,
            finalizeTimer: null,
            reconnects: 0,
            turnRelayBytes: 0,
            turnFallbackApplied: false,
            endedBy: null,
            endReason: null
        });
    }
    return videoRooms.get(id);
};

let cachedTurnQuota = { monthKey: '', bytesUsed: 0, fetchedAt: 0 };

const getCurrentUtcMonthKey = () => new Date().toISOString().slice(0, 7);

const getTurnQuotaConfig = () => {
    const rawLimitGb = Number(process.env.TURN_MONTHLY_LIMIT_GB);
    const defaultLimitGb = String(process.env.CLOUDFLARE_TURN_KEY_ID || '').trim()
        ? 950
        : (String(process.env.TURN_API_URL || '').trim() ? 18 : 950);
    const limitGb = Number.isFinite(rawLimitGb) && rawLimitGb > 0 ? rawLimitGb : defaultLimitGb;

    const rawWarn = Number(process.env.TURN_WARN_PERCENT);
    const warnPercent = Number.isFinite(rawWarn) ? Math.min(99, Math.max(1, rawWarn)) : 80;

    const rawHard = Number(process.env.TURN_HARD_STOP_PERCENT);
    const hardStopPercent = Number.isFinite(rawHard)
        ? Math.min(100, Math.max(warnPercent, rawHard))
        : Math.max(warnPercent, 95);

    const alertEmail = String(
        process.env.TURN_ALERT_EMAIL ||
        process.env.ADMIN_EMAIL ||
        process.env.EMAIL_USER ||
        process.env.SMTP_USER ||
        ''
    ).trim();

    return { limitGb, warnPercent, hardStopPercent, alertEmail };
};

const getMonthlyTurnBytesUsed = async (forceRefresh = false) => {
    const monthKey = getCurrentUtcMonthKey();
    const now = Date.now();
    if (
        !forceRefresh &&
        cachedTurnQuota.monthKey === monthKey &&
        now - cachedTurnQuota.fetchedAt < TURN_QUOTA_CACHE_MS
    ) {
        return cachedTurnQuota.bytesUsed;
    }

    try {
        const doc = await turnUsageModel.findOne({ monthKey }).select('bytesUsed').lean();
        const bytesUsed = Math.max(0, Number(doc?.bytesUsed || 0));
        cachedTurnQuota = { monthKey, bytesUsed, fetchedAt: now };
        return bytesUsed;
    } catch {
        return cachedTurnQuota.monthKey === monthKey ? cachedTurnQuota.bytesUsed : 0;
    }
};

const getTurnQuotaStatus = async (forceRefresh = false, bytesOverride = null) => {
    const monthKey = getCurrentUtcMonthKey();
    const { limitGb, warnPercent, hardStopPercent, alertEmail } = getTurnQuotaConfig();
    const usedBytes = bytesOverride !== null
        ? Math.max(0, Number(bytesOverride))
        : await getMonthlyTurnBytesUsed(forceRefresh);
    const limitBytes = limitGb * BYTES_PER_GB;
    const usedGb = Number((usedBytes / BYTES_PER_GB).toFixed(3));
    const percent = limitBytes > 0
        ? Math.min(100, Number(((usedBytes / limitBytes) * 100).toFixed(1)))
        : 0;

    return {
        monthKey,
        usedBytes,
        usedGb,
        limitGb,
        limitBytes,
        percent,
        warnPercent,
        hardStopPercent,
        alertEmail,
        warnReached: percent >= warnPercent,
        quotaExceeded: percent >= hardStopPercent
    };
};

const emitTurnQuotaAlert = (io, payload) => {
    if (!io) return;
    io.to('admin:global').emit('turn:quota-alert', payload);
    const rooms = io.sockets?.adapter?.rooms;
    if (rooms) {
        for (const roomName of rooms.keys()) {
            if (typeof roomName === 'string' && roomName.startsWith('doctor:')) {
                io.to(roomName).emit('turn:quota-alert', payload);
            }
        }
    }
};

const evaluateAndNotifyTurnQuota = async (io, bytesUsed) => {
    try {
        const status = await getTurnQuotaStatus(false, bytesUsed);
        if (status.quotaExceeded) {
            const claimed = await turnUsageModel.findOneAndUpdate(
                { monthKey: status.monthKey, cutoffEmailSentAt: null },
                { $set: { cutoffEmailSentAt: new Date() } },
                { new: true }
            );
            if (claimed) {
                emitTurnQuotaAlert(io, {
                    level: 'cutoff',
                    monthKey: status.monthKey,
                    usedGb: status.usedGb,
                    limitGb: status.limitGb,
                    pct: status.percent
                });
                if (status.alertEmail) {
                    await sendTurnQuotaAlertEmail({
                        toEmail: status.alertEmail,
                        level: 'cutoff',
                        monthKey: status.monthKey,
                        usedGb: status.usedGb,
                        limitGb: status.limitGb,
                        percent: status.percent
                    });
                }
            }
            return status;
        }

        if (status.warnReached) {
            const claimed = await turnUsageModel.findOneAndUpdate(
                { monthKey: status.monthKey, warnEmailSentAt: null },
                { $set: { warnEmailSentAt: new Date() } },
                { new: true }
            );
            if (claimed) {
                emitTurnQuotaAlert(io, {
                    level: 'warning',
                    monthKey: status.monthKey,
                    usedGb: status.usedGb,
                    limitGb: status.limitGb,
                    pct: status.percent
                });
                if (status.alertEmail) {
                    await sendTurnQuotaAlertEmail({
                        toEmail: status.alertEmail,
                        level: 'warning',
                        monthKey: status.monthKey,
                        usedGb: status.usedGb,
                        limitGb: status.limitGb,
                        percent: status.percent
                    });
                }
            }
        }
        return status;
    } catch {
        return null;
    }
};

const recordTurnUsageBytes = async (deltaBytes, io = null) => {
    const safeDelta = Math.max(0, Math.round(Number(deltaBytes) || 0));
    if (!safeDelta) return null;
    const monthKey = getCurrentUtcMonthKey();
    try {
        const updated = await turnUsageModel.findOneAndUpdate(
            { monthKey },
            { $inc: { bytesUsed: safeDelta } },
            { upsert: true, new: true }
        );
        const bytesUsed = Math.max(0, Number(updated?.bytesUsed || safeDelta));
        cachedTurnQuota = { monthKey, bytesUsed, fetchedAt: Date.now() };
        return await evaluateAndNotifyTurnQuota(io, bytesUsed);
    } catch {
        return null;
    }
};

const hasTurnServerEntry = (iceServers = []) =>
    iceServers.some((entry) => {
        const urls = Array.isArray(entry?.urls) ? entry.urls : [entry?.urls];
        return urls.some((u) => /^turns?:/i.test(String(u || '')));
    });

const TURN_DYNAMIC_CACHE_MS = 10 * 60 * 1000;
const TURN_FETCH_TIMEOUT_MS = 4000;
const DEFAULT_CLOUDFLARE_TURN_TTL_SEC = 86400;
let cachedDynamicTurn = { expiresAt: 0, servers: [] };
let cachedCloudflareTurn = { expiresAt: 0, servers: [] };
let cloudflareTurnInFlight = null;

const normalizeIceServers = (entries) => {
    if (!Array.isArray(entries)) return [];
    return entries.filter((entry) => {
        if (!entry || !entry.urls) return false;
        return Array.isArray(entry.urls) ? entry.urls.length > 0 : Boolean(entry.urls);
    });
};

const fetchCloudflareTurnServers = async () => {
    const keyId = String(process.env.CLOUDFLARE_TURN_KEY_ID || '').trim();
    const apiToken = String(process.env.CLOUDFLARE_TURN_API_TOKEN || '').trim();
    if (!keyId || !apiToken || typeof fetch !== 'function') return [];

    const now = Date.now();
    if (now < cachedCloudflareTurn.expiresAt && cachedCloudflareTurn.servers.length > 0) {
        return cachedCloudflareTurn.servers;
    }

    if (cloudflareTurnInFlight) {
        return cloudflareTurnInFlight;
    }

    const parsedTtl = Number.parseInt(process.env.CLOUDFLARE_TURN_TTL_SEC || '', 10);
    const ttlSec = Number.isFinite(parsedTtl)
        ? Math.min(86400, Math.max(60, parsedTtl))
        : DEFAULT_CLOUDFLARE_TURN_TTL_SEC;

    cloudflareTurnInFlight = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TURN_FETCH_TIMEOUT_MS);
        try {
            const url = `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`;
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ttl: ttlSec }),
                signal: controller.signal
            });
            if (!res.ok) return [];
            const data = await res.json();
            const rawList = Array.isArray(data?.iceServers)
                ? data.iceServers
                : (data?.iceServers ? [data.iceServers] : []);
            const validServers = normalizeIceServers(rawList);
            if (validServers.length > 0) {
                const cacheMs = Math.min(TURN_DYNAMIC_CACHE_MS, Math.max(30 * 1000, Math.floor(ttlSec * 1000 * 0.8)));
                cachedCloudflareTurn = {
                    expiresAt: Date.now() + cacheMs,
                    servers: validServers
                };
                return validServers;
            }
            return [];
        } catch {
            // Safe fallback to STUN/other configured TURN if Cloudflare TURN API is unreachable
            return [];
        } finally {
            clearTimeout(timer);
            cloudflareTurnInFlight = null;
        }
    })();

    return cloudflareTurnInFlight;
};

/**
 * Build ICE server list.
 *  CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN = Cloudflare Realtime TURN short-lived credentials
 *  TURN_API_URL     = optional endpoint returning WebRTC iceServers JSON (e.g. Metered credentials API)
 *  TURN_URLS        = "turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp"
 *  TURN_SECRET      = shared secret configured in coturn (`static-auth-secret`) -> ephemeral HMAC credentials
 *  or TURN_USERNAME / TURN_CREDENTIAL for static long-term credentials.
 */
export const buildIceServersWithStatus = async (identity = 'vitalsync') => {
    const iceServers = [
        {
            urls: [
                'stun:stun.l.google.com:19302',
                'stun:stun.cloudflare.com:3478'
            ]
        }
    ];

    const quotaStatus = await getTurnQuotaStatus();
    if (quotaStatus.quotaExceeded) {
        return { iceServers, turnQuotaExceeded: true };
    }

    const cfServers = await fetchCloudflareTurnServers();
    if (cfServers.length > 0) {
        iceServers.push(...cfServers);
    }

    const turnUrls = String(process.env.TURN_URLS || process.env.TURN_URL || '')
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean);

    if (turnUrls.length) {
        if (process.env.TURN_SECRET) {
            const expiry = Math.floor(Date.now() / 1000) + TURN_CREDENTIAL_TTL_SEC;
            const username = `${expiry}:${identity}`;
            const credential = crypto
                .createHmac('sha1', process.env.TURN_SECRET)
                .update(username)
                .digest('base64');
            iceServers.push({ urls: turnUrls, username, credential });
        } else if (process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
            iceServers.push({
                urls: turnUrls,
                username: process.env.TURN_USERNAME,
                credential: process.env.TURN_CREDENTIAL
            });
        }
    }

    const turnApiUrl = String(process.env.TURN_API_URL || '').trim();
    if (turnApiUrl && typeof fetch === 'function') {
        const now = Date.now();
        if (now < cachedDynamicTurn.expiresAt && cachedDynamicTurn.servers.length > 0) {
            iceServers.push(...cachedDynamicTurn.servers);
        } else {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), TURN_FETCH_TIMEOUT_MS);
            try {
                const res = await fetch(turnApiUrl, { signal: controller.signal });
                if (res.ok) {
                    const data = await res.json();
                    const rawList = Array.isArray(data) ? data : data?.iceServers;
                    const validServers = normalizeIceServers(rawList);
                    if (validServers.length > 0) {
                        cachedDynamicTurn = {
                            expiresAt: now + TURN_DYNAMIC_CACHE_MS,
                            servers: validServers
                        };
                        iceServers.push(...validServers);
                    }
                }
            } catch {
                // Ignore dynamic TURN API failure so STUN/static TURN fallback still succeeds
            } finally {
                clearTimeout(timer);
            }
        }
    }

    return { iceServers, turnQuotaExceeded: false };
};

export const buildIceServers = async (identity = 'vitalsync') => {
    const { iceServers } = await buildIceServersWithStatus(identity);
    return iceServers;
};

const isTestOrDevOverrideAllowed = () =>
    String(process.env.PAYMENT_TEST_MODE || '').toLowerCase() === 'true' ||
    process.env.NODE_ENV !== 'production';

const finalizeSession = async (appointmentId, reason = 'completed', endedBy = null) => {
    const room = videoRooms.get(String(appointmentId));
    if (!room) return;
    if (room.finalizeTimer) clearTimeout(room.finalizeTimer);

    const startedAt = room.sessionStartedAt;
    videoRooms.delete(String(appointmentId));

    if (!startedAt) return; // Both parties never connected simultaneously: nothing to audit

    const endedAt = new Date();
    try {
        await appointmentModel.findByIdAndUpdate(appointmentId, {
            $push: {
                callLogs: {
                    startedAt,
                    endedAt,
                    durationSec: Math.max(0, Math.round((endedAt - startedAt) / 1000)),
                    endedBy: endedBy || room.endedBy || null,
                    endReason: reason,
                    signalingReconnects: room.reconnects,
                    turnRelayBytes: room.turnRelayBytes || 0
                }
            }
        });
    } catch (err) {
        console.log('Video session log error:', err.message);
    }
};

const scheduleFinalizeIfEmpty = (appointmentId) => {
    const room = videoRooms.get(String(appointmentId));
    if (!room || room.participants.size > 0) return;
    if (room.finalizeTimer) clearTimeout(room.finalizeTimer);
    room.finalizeTimer = setTimeout(() => {
        const latest = videoRooms.get(String(appointmentId));
        if (latest && latest.participants.size === 0) {
            finalizeSession(appointmentId, latest.endReason || 'all-left');
        }
    }, EMPTY_ROOM_GRACE_MS);
};

const findSeat = (socket, appointmentId) => {
    const room = videoRooms.get(String(appointmentId));
    if (!room) return null;
    for (const [role, seat] of room.participants.entries()) {
        if (seat.socketId === socket.id) return { room, role, seat };
    }
    return null;
};

/**
 * Attach video handlers to a connected socket.
 * `socket.data.userId` / `socket.data.docId` are populated by the JWT handshake in socket.js.
 */
export const registerVideoHandlers = (io, socket) => {
    socket.on('video:join', async (payload = {}, ack = () => {}) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
            const appointmentId = String(payload.appointmentId || '');
            if (!/^[0-9a-fA-F]{24}$/.test(appointmentId)) {
                return reply({ ok: false, code: 'BAD_REQUEST', message: 'Invalid consultation room.' });
            }

            const appointment = await appointmentModel.findById(appointmentId).lean();
            if (!appointment) {
                return reply({ ok: false, code: 'NOT_FOUND', message: 'Consultation not found.' });
            }

            // Role resolution strictly from verified JWT identity (never from client-supplied role)
            let role = null;
            if (socket.data?.docId && String(appointment.docId) === socket.data.docId) role = 'doctor';
            else if (socket.data?.userId && String(appointment.userId) === socket.data.userId) role = 'user';

            if (!role) {
                return reply({ ok: false, code: 'FORBIDDEN', message: 'You are not a participant of this consultation.' });
            }
            if (appointment.cancelled) {
                return reply({ ok: false, code: 'CANCELLED', message: 'This appointment has been cancelled.' });
            }
            if (!appointment.payment) {
                return reply({
                    ok: false,
                    code: 'PAYMENT_PENDING',
                    message: role === 'user'
                        ? 'Please complete the consultation fee payment to unlock the room.'
                        : 'The patient has not completed payment yet.'
                });
            }

            const room = getRoom(appointmentId);
            room.userId = String(appointment.userId);
            room.docId = String(appointment.docId);

            // Clinical window check:
            //  - Doctors may open their own patient's paid consultation room slightly early/late (OPD queue flexibility).
            //  - Patients may join during the scheduled window, OR immediately if the doctor is already seated in the room,
            //    OR via explicit dev/test override in non-production / test environments.
            const testMode = String(process.env.PAYMENT_TEST_MODE || '').toLowerCase() === 'true';
            const windowStatus = checkAppointmentWindow(appointment.slotDate, appointment.slotTime, testMode);
            const doctorAlreadySeated = room.participants.has('doctor');
            const bypassAllowed =
                role === 'doctor' ||
                doctorAlreadySeated ||
                (Boolean(payload.override) && isTestOrDevOverrideAllowed());

            if (windowStatus.status !== 'OPEN' && !bypassAllowed) {
                return reply({ ok: false, code: windowStatus.status, message: windowStatus.message });
            }

            const name = role === 'doctor'
                ? (appointment.docData?.name || 'Doctor')
                : (appointment.userData?.name || 'Patient');
            const image = role === 'doctor' ? appointment.docData?.image : appointment.userData?.image;

            const initialMediaState = {
                audio: payload.mediaState?.audio !== false,
                video: payload.mediaState?.video !== false,
                screen: Boolean(payload.mediaState?.screen),
                dataSaver: Boolean(payload.mediaState?.dataSaver),
                handRaised: false
            };

            // Fetch ICE servers before mutating room state or emitting video:peer-joined so the
            // joiner's ack (and its iceServers) cannot arrive after peer-joined / early offers.
            const { iceServers, turnQuotaExceeded } = await buildIceServersWithStatus(`${role}-${appointmentId}`);
            if (socket.disconnected) {
                return reply({ ok: false, code: 'DISCONNECTED', message: 'Socket disconnected.' });
            }

            if (room.finalizeTimer) {
                clearTimeout(room.finalizeTimer);
                room.finalizeTimer = null;
            }

            // Single seat per role: evict a previous tab/device of the same participant
            const existing = room.participants.get(role);
            const isSameSocketRejoin = Boolean(existing && existing.socketId === socket.id);
            if (existing && existing.socketId !== socket.id) {
                const oldSocket = io.sockets.sockets.get(existing.socketId);
                if (oldSocket) {
                    oldSocket.emit('video:replaced', { appointmentId });
                    oldSocket.leave(roomKey(appointmentId));
                } else {
                    room.reconnects += 1;
                }
            }

            room.participants.set(role, {
                socketId: socket.id,
                name,
                image: image || '',
                joinedAt: new Date(),
                mediaState: initialMediaState
            });
            socket.join(roomKey(appointmentId));
            socket.data.videoRooms = new Set([...(socket.data.videoRooms || []), appointmentId]);

            if (!turnQuotaExceeded && !room.turnFallbackApplied && hasTurnServerEntry(iceServers)) {
                room.turnFallbackApplied = true;
                recordTurnUsageBytes(TURN_SESSION_FALLBACK_BYTES, io).catch(() => {});
            }

            const otherRole = ROLES.find((r) => r !== role);
            const other = room.participants.get(otherRole);

            if (other) {
                if (!room.sessionStartedAt) room.sessionStartedAt = new Date();
                if (!isSameSocketRejoin) {
                    // Notify existing peer first so it is ready before the joiner's offer arrives
                    socket.to(roomKey(appointmentId)).emit('video:peer-joined', {
                        role,
                        name,
                        image: image || '',
                        resume: Boolean(payload.resume),
                        mediaState: initialMediaState
                    });
                }
                // Both participants are now seated: dismiss any open incoming-call modal on other tabs/devices
                if (room.userId) io.to(`user:${room.userId}`).emit('call-answered', { appointmentId });
                if (room.docId) io.to(`doctor:${room.docId}`).emit('call-answered', { appointmentId });
            }

            return reply({
                ok: true,
                role,
                // Perfect-negotiation politeness: patient yields on offer collisions, doctor wins
                polite: role === 'user',
                peer: other
                    ? { role: otherRole, name: other.name, image: other.image, mediaState: other.mediaState || null }
                    : null,
                iceServers,
                turnQuotaExceeded,
                serverTime: Date.now()
            });
        } catch (err) {
            console.log('video:join error:', err.message);
            return reply({ ok: false, code: 'SERVER_ERROR', message: 'Unable to join the consultation room.' });
        }
    });

    // Lightweight authenticated ICE-server refresh for long calls or ICE restarts
    socket.on('video:ice-servers', async (payload = {}, ack = () => {}) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
            if (!socket.data?.userId && !socket.data?.docId) {
                return reply({ ok: false, code: 'UNAUTHORIZED', message: 'Authentication required.' });
            }
            const appointmentId = String(payload?.appointmentId || '');
            const identity = socket.data?.docId
                ? `doctor-${appointmentId || socket.data.docId}`
                : `user-${appointmentId || socket.data.userId}`;
            const { iceServers, turnQuotaExceeded } = await buildIceServersWithStatus(identity);
            return reply({ ok: true, iceServers, turnQuotaExceeded, serverTime: Date.now() });
        } catch {
            return reply({ ok: false, code: 'SERVER_ERROR', message: 'Unable to fetch ICE servers.' });
        }
    });

    // Client-reported TURN relay byte telemetry (from seated participants only, bounded per report)
    socket.on('video:turn-usage', async (payload = {}) => {
        const appointmentId = String(payload.appointmentId || '');
        const seat = findSeat(socket, appointmentId);
        if (!seat) return;
        const rawDelta = Number(payload.deltaBytes);
        if (!Number.isFinite(rawDelta) || rawDelta <= 0) return;
        const deltaBytes = Math.min(MAX_TURN_DELTA_BYTES, Math.round(rawDelta));
        seat.room.turnRelayBytes = (seat.room.turnRelayBytes || 0) + deltaBytes;
        await recordTurnUsageBytes(deltaBytes, io);
    });

    // SDP / ICE relay (only from seated participants, size-capped)
    socket.on('video:signal', (payload = {}) => {
        const appointmentId = String(payload.appointmentId || '');
        if (!findSeat(socket, appointmentId)) return;
        const message = { description: payload.description || null, candidate: payload.candidate || null };
        if (JSON.stringify(message).length > MAX_SIGNAL_BYTES) return;
        socket.to(roomKey(appointmentId)).emit('video:signal', message);
    });

    // Mic / camera / screen-share / data-saver state broadcast
    socket.on('video:media-state', (payload = {}) => {
        const appointmentId = String(payload.appointmentId || '');
        const seat = findSeat(socket, appointmentId);
        if (!seat) return;
        const nextState = {
            audio: Boolean(payload.audio),
            video: Boolean(payload.video),
            screen: Boolean(payload.screen),
            dataSaver: Boolean(payload.dataSaver),
            handRaised: Boolean(payload.handRaised)
        };
        seat.seat.mediaState = nextState;
        socket.to(roomKey(appointmentId)).emit('video:media-state', nextState);
    });

    // Live Speech-to-Text clinical captions relay
    socket.on('video:caption', (payload = {}) => {
        const appointmentId = String(payload.appointmentId || '');
        const seat = findSeat(socket, appointmentId);
        if (!seat) return;
        const text = String(payload.text || '').trim().slice(0, 600);
        if (!text) return;
        socket.to(roomKey(appointmentId)).emit('video:caption', {
            text,
            isFinal: Boolean(payload.isFinal),
            speakerRole: seat.role,
            speakerName: seat.seat.name,
            timestamp: Date.now()
        });
    });

    // Quick floating reactions / clinical cues
    socket.on('video:reaction', (payload = {}) => {
        const appointmentId = String(payload.appointmentId || '');
        const seat = findSeat(socket, appointmentId);
        if (!seat) return;
        const emoji = String(payload.emoji || '').trim().slice(0, 16);
        const label = String(payload.label || '').trim().slice(0, 48);
        if (!emoji && !label) return;
        socket.to(roomKey(appointmentId)).emit('video:reaction', {
            id: crypto.randomUUID(),
            emoji,
            label,
            by: seat.role,
            name: seat.seat.name,
            timestamp: Date.now()
        });
    });

    // Real-time contactless rPPG vitals stream inside video room
    socket.on('video:vitals', (payload = {}) => {
        const appointmentId = String(payload.appointmentId || '');
        const seat = findSeat(socket, appointmentId);
        if (!seat || !payload.vitals) return;
        socket.to(roomKey(appointmentId)).emit('vitals-update', payload.vitals);
        socket.to(appointmentId).emit('vitals-update', payload.vitals);
    });

    // Instant in-call notification when doctor signs & issues an e-Prescription
    socket.on('video:rx-issued', (payload = {}) => {
        const appointmentId = String(payload.appointmentId || '');
        const seat = findSeat(socket, appointmentId);
        if (!seat || seat.role !== 'doctor') return;
        socket.to(roomKey(appointmentId)).emit('video:rx-issued', {
            appointmentId,
            diagnosis: String(payload.diagnosis || '').slice(0, 200),
            doctorName: seat.seat.name,
            issuedAt: Date.now()
        });
    });

    // Two-party recording consent protocol (request -> accept/decline -> stop)
    socket.on('video:recording', (payload = {}) => {
        const appointmentId = String(payload.appointmentId || '');
        const seat = findSeat(socket, appointmentId);
        if (!seat) return;
        const action = ['request', 'accept', 'decline', 'stop'].includes(payload.action) ? payload.action : null;
        if (!action) return;
        socket.to(roomKey(appointmentId)).emit('video:recording', { action, by: seat.role, name: seat.seat.name });
    });

    socket.on('video:leave', (payload = {}) => {
        const appointmentId = String(payload.appointmentId || '');
        const seat = findSeat(socket, appointmentId);
        if (!seat) return;

        seat.room.participants.delete(seat.role);
        socket.leave(roomKey(appointmentId));

        const endForAll = Boolean(payload.endForAll);
        if (endForAll) {
            socket.to(roomKey(appointmentId)).emit('video:ended', { by: seat.role, name: seat.seat.name });
            // Also dismiss global incoming-call banners on personal rooms
            if (seat.room.userId) io.to(`user:${seat.room.userId}`).emit('call-ended', { appointmentId });
            if (seat.room.docId) io.to(`doctor:${seat.room.docId}`).emit('call-ended', { appointmentId });
            seat.room.endedBy = seat.role;
            finalizeSession(appointmentId, 'ended-for-all', seat.role);
            return;
        }

        socket.to(roomKey(appointmentId)).emit('video:peer-left', { role: seat.role, reason: 'left' });
        seat.room.endedBy = seat.role;
        seat.room.endReason = 'left';
        scheduleFinalizeIfEmpty(appointmentId);
    });

    socket.on('disconnect', () => {
        const rooms = socket.data?.videoRooms;
        if (!rooms) return;
        for (const appointmentId of rooms) {
            const seat = findSeat(socket, appointmentId);
            if (!seat) continue;
            seat.room.participants.delete(seat.role);
            socket.to(roomKey(appointmentId)).emit('video:peer-left', { role: seat.role, reason: 'disconnected' });
            seat.room.endReason = 'disconnected';
            scheduleFinalizeIfEmpty(appointmentId);
        }
    });
};

export const getVideoRoomSnapshot = (appointmentId) => {
    const room = videoRooms.get(String(appointmentId));
    if (!room) return { active: false, participants: [] };
    return {
        active: true,
        sessionStartedAt: room.sessionStartedAt,
        participants: Array.from(room.participants.keys())
    };
};
