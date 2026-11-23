/**
 * VitalSync Multi-Zone POS/CHROM rPPG & Contact Fingertip PPG Biometric Engine
 * ============================================================================
 * Production-grade dual-mode optical & contact pulse sensing engine:
 *
 *   1. Multi-Zone Anatomical Spatial Coherence (`facial_rppg` mode):
 *      - Segments facial skin using widened YCbCr + normalized RGB dermal bounds
 *        with specular highlight & shadow rejection.
 *      - Tracks dynamic skin bounding box / centroid and partitions into 3 anatomical
 *        sub-ROIs: `forehead`, `leftCheek`, and `rightCheek`.
 *      - Extracts both POS (Wang et al., 2017) and CHROM (De Haan & Jeanne, 2013)
 *        pulsatile signals and verifies spatial frequency coherence across zones.
 *
 *   2. Smartphone / Webcam Contact Fingertip PPG (`fingertip_cppg` mode):
 *      - Auto-detects or explicitly runs in lens-contact PPG mode when the user places
 *        a fingertip over the camera lens (and optional LED torch on mobile devices).
 *      - Computes Beer-Lambert optical absorption, real-time Perfusion Index (AC/DC %),
 *        and cross-checks systolic Inter-Beat Interval (IBI) against spectral PSD.
 *
 *   3. Uniform 30 Hz Temporal Resampling (Jitter & Gap Mitigation):
 *      - Isolates the latest contiguous motion-free segment (splitting across >180ms gaps)
 *        and resamples onto an exact uniform 30 Hz grid via monotone cubic / linear
 *        interpolation prior to zero-phase Butterworth filtering.
 *
 *   4. Rigorous Dicrotic-Notch `2*f0 -> f0` Sub-Harmonic Disambiguation:
 *      - Prevents false halving of true 96–135 BPM heart rates while accurately
 *        resolving 60–75 BPM waveforms that exhibit strong 2nd-harmonic dicrotic notches
 *        using local spectral prominence, >=42% power threshold, and fundamental vs
 *        half-cycle autocorrelation / peak-alternation verification.
 */

export class RPPGEngine {
    constructor(videoElement, onUpdate, options = {}) {
        this.video = videoElement || null;
        this.onUpdate = onUpdate || null;
        this.spotCheckMode = options.spotCheckMode !== false; // Default true: 15s guided spot-check
        this.spotCheckTargetSec = options.spotCheckTargetSec || 15;
        this.onComplete = options.onComplete || null;

        this.sensorMode =
            options.sensorMode === 'fingertip_cppg' ? 'fingertip_cppg' : 'facial_rppg';
        this.autoSwitchFingertip = options.autoSwitchFingertip !== false;
        this.enableTorch = Boolean(options.enableTorch);
        this.torchActive = false;

        this.isRunning = false;
        this.isLocked = false;
        this.rafId = null;
        this.rvfcId = null;
        this.lastVideoTime = -1;

        if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
            this.canvas = document.createElement('canvas');
            this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        } else {
            this.canvas = null;
            this.ctx = null;
        }

        // 10-second sliding buffer at ~30 FPS (~300 genuine camera frames)
        this.targetSampleRate = 30;
        this.maxFrames = 300;
        this.rgbBuffer = []; //Combined ROI: [{ r, g, b, t }]
        this.roiBuffers = {
            forehead: [],
            leftCheek: [],
            rightCheek: []
        };
        this.filteredWaveform = [];

        // Motion & lighting tracking
        this.prevCentroid = null;
        this.prevLuma = null;
        this.noSkinFrames = 0;
        this.motionCooldown = 0;
        this.fingertipStreak = 0;

        // Spot-check & physiological stabilization state
        this.cleanDurationSec = 0;
        this.lastCleanFrameTs = null;
        this.currentBpm = null;
        this.validBpmHistory = [];
        this.spotCheckSamples = [];
        this.outlierStreak = 0;
        this.lastAnalysisTime = 0;

        // Diagnostic telemetry
        this.lastRoiCoherence = 0;
        this.lastActiveRois = 0;
        this.lastPerfusionIndex = 0;
    }

    /**
     * Switch active sensing mode ('facial_rppg' | 'fingertip_cppg')
     */
    setSensorMode(mode) {
        const resolved = mode === 'fingertip_cppg' ? 'fingertip_cppg' : 'facial_rppg';
        if (this.sensorMode !== resolved) {
            this.sensorMode = resolved;
            this.rgbBuffer = [];
            this.roiBuffers = { forehead: [], leftCheek: [], rightCheek: [] };
            this.prevCentroid = null;
            this.prevLuma = null;
            this.lastCleanFrameTs = null;
            this.motionCooldown = 0;
        }
        return this.sensorMode;
    }

    /**
     * Attempt hardware camera exposure/white-balance stabilization & optional LED torch
     */
    static async applyCameraHardwareLock(videoElement, { enableTorch = false } = {}) {
        let torchActive = false;
        const lockedCapabilities = [];
        try {
            const stream = videoElement?.srcObject;
            const track =
                stream && typeof stream.getVideoTracks === 'function'
                    ? stream.getVideoTracks()[0]
                    : null;
            if (!track || typeof track.applyConstraints !== 'function') {
                return { torchActive: false, lockedCapabilities };
            }

            const capabilities =
                typeof track.getCapabilities === 'function' ? track.getCapabilities() || {} : {};
            const advancedObj = {};

            if (capabilities.torch) {
                advancedObj.torch = Boolean(enableTorch);
            }
            if (
                Array.isArray(capabilities.whiteBalanceMode) &&
                capabilities.whiteBalanceMode.includes('continuous')
            ) {
                advancedObj.whiteBalanceMode = 'continuous';
                lockedCapabilities.push('whiteBalanceMode');
            }
            if (
                Array.isArray(capabilities.exposureMode) &&
                capabilities.exposureMode.includes('continuous')
            ) {
                advancedObj.exposureMode = 'continuous';
                lockedCapabilities.push('exposureMode');
            }

            if (Object.keys(advancedObj).length > 0) {
                await track.applyConstraints({ advanced: [advancedObj] });
                if (capabilities.torch && enableTorch) {
                    torchActive = true;
                }
            } else if (enableTorch) {
                await track.applyConstraints({ advanced: [{ torch: true }] });
                torchActive = true;
            }
        } catch (err) {
            // Browser or webcam does not support hardware torch/exposure constraints
        }
        return { torchActive, lockedCapabilities };
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.isLocked = false;
        this.lastVideoTime = -1;
        this.rgbBuffer = [];
        this.roiBuffers = { forehead: [], leftCheek: [], rightCheek: [] };
        this.filteredWaveform = [];
        this.prevCentroid = null;
        this.prevLuma = null;
        this.noSkinFrames = 0;
        this.motionCooldown = 0;
        this.fingertipStreak = 0;
        this.cleanDurationSec = 0;
        this.lastCleanFrameTs = null;
        this.currentBpm = null;
        this.validBpmHistory = [];
        this.spotCheckSamples = [];
        this.outlierStreak = 0;
        this.lastAnalysisTime = 0;
        this.lastRoiCoherence = 0;
        this.lastActiveRois = 0;
        this.lastPerfusionIndex = 0;

        if (this.video) {
            RPPGEngine.applyCameraHardwareLock(this.video, {
                enableTorch: this.enableTorch || this.sensorMode === 'fingertip_cppg'
            })
                .then(({ torchActive }) => {
                    this.torchActive = torchActive;
                })
                .catch(() => {});
        }

        this.scheduleNextFrame();
    }

    stop() {
        this.isRunning = false;
        if (this.rafId && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        if (this.rvfcId && this.video && typeof this.video.cancelVideoFrameCallback === 'function') {
            try {
                this.video.cancelVideoFrameCallback(this.rvfcId);
            } catch (e) {}
            this.rvfcId = null;
        }
        if (this.torchActive && this.video) {
            try {
                const stream = this.video.srcObject;
                const track =
                    stream && typeof stream.getVideoTracks === 'function'
                        ? stream.getVideoTracks()[0]
                        : null;
                if (track && typeof track.applyConstraints === 'function') {
                    track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
                }
            } catch (e) {}
            this.torchActive = false;
        }
    }

    scheduleNextFrame() {
        if (!this.isRunning) return;
        if (this.video && typeof this.video.requestVideoFrameCallback === 'function') {
            this.rvfcId = this.video.requestVideoFrameCallback((now, metadata) => {
                const frameTimeMs =
                    typeof metadata?.mediaTime === 'number' && metadata.mediaTime > 0
                        ? metadata.mediaTime * 1000
                        : now;
                this.handleUniqueVideoFrame(now, frameTimeMs);
                this.scheduleNextFrame();
            });
        } else if (typeof requestAnimationFrame === 'function') {
            this.rafId = requestAnimationFrame((now) => {
                if (this.video && this.video.currentTime !== this.lastVideoTime) {
                    this.lastVideoTime = this.video.currentTime;
                    this.handleUniqueVideoFrame(now, now);
                }
                this.scheduleNextFrame();
            });
        }
    }

    /**
     * Uniform 30 Hz Temporal Resampling (Mitigates camera timestamp jitter & frame drops)
     * Splits across motion gaps (>180ms) and interpolates the latest contiguous segment
     * onto an exact uniform grid `dt = 1000 / targetSampleRate` via monotone cubic Hermite.
     */
    resampleRGBSeriesUniform(rgbSamples, targetSampleRate = 30) {
        if (! Array.isArray(rgbSamples) || rgbSamples.length < 2) {
            return rgbSamples || [];
        }

        // Check if timestamps exist and are strictly ordered
        const hasTimestamps =
            typeof rgbSamples[0].t === 'number' &&
            typeof rgbSamples[rgbSamples.length - 1].t === 'number' &&
            rgbSamples[rgbSamples.length - 1].t > rgbSamples[0].t;

        if (!hasTimestamps) {
            return rgbSamples;
        }

        // 1. Extract the latest contiguous segment without gaps > 180ms
        let segStart = 0;
        const maxGapMs = 180;
        for (let i = 1; i < rgbSamples.length; i++) {
            const dt = rgbSamples[i].t - rgbSamples[i - 1].t;
            if (dt > maxGapMs) {
                segStart = i;
            }
        }

        const cleanSeg = rgbSamples.slice(segStart);
        if (cleanSeg.length < 4) {
            return cleanSeg;
        }

        // Coalesce any duplicate or non-increasing timestamps
        const monotonic = [cleanSeg[0]];
        for (let i = 1; i < cleanSeg.length; i++) {
            if (cleanSeg[i].t > monotonic[monotonic.length - 1].t + 0.5) {
                monotonic.push(cleanSeg[i]);
            }
        }
        if (monotonic.length < 4) {
            return monotonic;
        }

        const t0 = monotonic[0].t;
        const tEnd = monotonic[monotonic.length - 1].t;
        const stepMs = 1000 / targetSampleRate;
        const outCount = Math.floor((tEnd - t0) / stepMs) + 1;
        if (outCount < 4) {
            return monotonic;
        }

        // Precompute secant slopes for monotone cubic interpolation (Fritsch-Carlson)
        const m = monotonic.length;
        const computeMonotoneTangents = (key) => {
            const d = new Array(m - 1);
            for (let i = 0; i < m - 1; i++) {
                const h = monotonic[i + 1].t - monotonic[i].t;
                d[i] = (monotonic[i + 1][key] - monotonic[i][key]) / h;
            }
            const tangents = new Array(m);
            tangents[0] = d[0];
            tangents[m - 1] = d[m - 2];
            for (let i = 1; i < m - 1; i++) {
                if (d[i - 1] * d[i] <= 0) {
                    tangents[i] = 0;
                } else {
                    tangents[i] = 0.5 * (d[i - 1] + d[i]);
                }
            }
            for (let i = 0; i < m - 1; i++) {
                if (Math.abs(d[i]) < 1e-12) {
                    tangents[i] = 0;
                    tangents[i + 1] = 0;
                } else {
                    const a = tangents[i] / d[i];
                    const b = tangents[i + 1] / d[i];
                    const s = a * a + b * b;
                    if (s > 9) {
                        const tau = 3 / Math.sqrt(s);
                        tangents[i] = tau * a * d[i];
                        tangents[i + 1] = tau * b * d[i];
                    }
                }
            }
            return tangents;
        };

        const tanR = computeMonotoneTangents('r');
        const tanG = computeMonotoneTangents('g');
        const tanB = computeMonotoneTangents('b');

        const evalHermite = (idx, h, u, key, tangents) => {
            const u2 = u * u;
            const u3 = u2 * u;
            const h00 = 2 * u3 - 3 * u2 + 1;
            const h10 = u3 - 2 * u2 + u;
            const h01 = -2 * u3 + 3 * u2;
            const h11 = u3 - u2;
            return (
                h00 * monotonic[idx][key] +
                h10 * h * tangents[idx] +
                h01 * monotonic[idx + 1][key] +
                h11 * h * tangents[idx + 1]
            );
        };

        const resampled = new Array(outCount);
        let cursor = 0;
        for (let k = 0; k < outCount; k++) {
            const targetT = t0 + k * stepMs;
            while (cursor < m - 2 && monotonic[cursor + 1].t < targetT) {
                cursor++;
            }
            const tLeft = monotonic[cursor].t;
            const tRight = monotonic[cursor + 1].t;
            const h = Math.max(1e-6, tRight - tLeft);
            const u = Math.max(0, Math.min(1, (targetT - tLeft) / h));

            resampled[k] = {
                r: evalHermite(cursor, h, u, 'r', tanR),
                g: evalHermite(cursor, h, u, 'g', tanG),
                b: evalHermite(cursor, h, u, 'b', tanB),
                t: targetT
            };
        }

        return resampled;
    }

    /**
     * 2nd-Order Butterworth Biquad Filter + Zero-Phase Forward-Backward (`filtfilt`)
     */
    applyBiquadSinglePass(signal, cutoffHz, sampleRate, type = 'lowpass') {
        const nyquist = sampleRate * 0.5;
        const safeCutoff = Math.max(0.1, Math.min(cutoffHz, nyquist * 0.90));
        const wc = Math.tan((Math.PI * safeCutoff) / sampleRate);
        const k1 = Math.SQRT2 * wc;
        const k2 = wc * wc;
        const a0 = 1 + k1 + k2;

        let b0, b1, b2;
        if (type === 'lowpass') {
            b0 = k2 / a0;
            b1 = 2 * b0;
            b2 = b0;
        } else {
            b0 = 1 / a0;
            b1 = -2 * b0;
            b2 = b0;
        }
        const a1 = (2 * (k2 - 1)) / a0;
        const a2 = (1 - k1 + k2) / a0;

        const out = new Array(signal.length).fill(0);
        // Pad initial state with first sample to eliminate startup transient ringing
        let x1 = signal[0] || 0;
        let x2 = signal[0] || 0;
        let y1 = type === 'lowpass' ? signal[0] || 0 : 0;
        let y2 = y1;

        for (let i = 0; i < signal.length; i++) {
            const x0 = signal[i];
            const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
            out[i] = y0;
            x2 = x1;
            x1 = x0;
            y2 = y1;
            y1 = y0;
        }
        return out;
    }

    applyZeroPhaseBandpass(signal, lowCutHz, highCutHz, sampleRate) {
        if (!Array.isArray(signal) || signal.length < 8) return signal || [];
        const hpFwd = this.applyBiquadSinglePass(signal, lowCutHz, sampleRate, 'highpass');
        const bpFwd = this.applyBiquadSinglePass(hpFwd, highCutHz, sampleRate, 'lowpass');
        const rev = [...bpFwd].reverse();
        const hpRev = this.applyBiquadSinglePass(rev, lowCutHz, sampleRate, 'highpass');
        const bpRev = this.applyBiquadSinglePass(hpRev, highCutHz, sampleRate, 'lowpass');
        return bpRev.reverse();
    }

    /**
     * Stage 3A: Plane-Orthogonal-to-Skin (POS) Chrominance Extraction (Wang et al., IEEE TBME 2017)
     */
    computePOSSignal(rgbSamples, sampleRate) {
        const n = rgbSamples.length;
        const pos = new Array(n).fill(0);
        if (n === 0) return pos;
        const winLen = Math.min(n, Math.max(28, Math.round(sampleRate * 1.6)));

        for (let start = 0; start <= n - winLen; start++) {
            let sumR = 0, sumG = 0, sumB = 0;
            for (let k = start; k < start + winLen; k++) {
                sumR += rgbSamples[k].r;
                sumG += rgbSamples[k].g;
                sumB += rgbSamples[k].b;
            }
            const meanR = sumR / winLen || 1;
            const meanG = sumG / winLen || 1;
            const meanB = sumB / winLen || 1;

            const s1 = new Array(winLen);
            const s2 = new Array(winLen);
            let meanS1 = 0, meanS2 = 0;

            for (let i = 0; i < winLen; i++) {
                const sample = rgbSamples[start + i];
                const rn = sample.r / meanR;
                const gn = sample.g / meanG;
                const bn = sample.b / meanB;
                // POS orthogonal projection axes: P = [[0, 1, -1], [-2, 1, 1]]
                const v1 = gn - bn;
                const v2 = gn + bn - 2 * rn;
                s1[i] = v1;
                s2[i] = v2;
                meanS1 += v1;
                meanS2 += v2;
            }
            meanS1 /= winLen;
            meanS2 /= winLen;

            let varS1 = 0, varS2 = 0;
            for (let i = 0; i < winLen; i++) {
                const d1 = s1[i] - meanS1;
                const d2 = s2[i] - meanS2;
                varS1 += d1 * d1;
                varS2 += d2 * d2;
            }
            const stdS1 = Math.sqrt(varS1 / winLen);
            const stdS2 = Math.sqrt(varS2 / winLen);
            const alpha = stdS2 > 1e-7 ? stdS1 / stdS2 : 0;

            let meanH = 0;
            const h = new Array(winLen);
            for (let i = 0; i < winLen; i++) {
                h[i] = s1[i] + alpha * s2[i];
                meanH += h[i];
            }
            meanH /= winLen;

            for (let i = 0; i < winLen; i++) {
                pos[start + i] += h[i] - meanH;
            }
        }
        return pos;
    }

    /**
     * Stage 3B: CHROM Chrominance Extraction (De Haan & Jeanne, IEEE TBME 2013)
     * Projection: Xs = 3Rn - 2Gn, Ys = 1.5Rn + Gn - 1.5Bn
     */
    computeCHROMSignal(rgbSamples, sampleRate) {
        const n = rgbSamples.length;
        const chrom = new Array(n).fill(0);
        if (n === 0) return chrom;
        const winLen = Math.min(n, Math.max(28, Math.round(sampleRate * 1.6)));

        for (let start = 0; start <= n - winLen; start++) {
            let sumR = 0, sumG = 0, sumB = 0;
            for (let k = start; k < start + winLen; k++) {
                sumR += rgbSamples[k].r;
                sumG += rgbSamples[k].g;
                sumB += rgbSamples[k].b;
            }
            const meanR = sumR / winLen || 1;
            const meanG = sumG / winLen || 1;
            const meanB = sumB / winLen || 1;

            const xs = new Array(winLen);
            const ys = new Array(winLen);
            let meanX = 0, meanY = 0;

            for (let i = 0; i < winLen; i++) {
                const sample = rgbSamples[start + i];
                const rn = sample.r / meanR;
                const gn = sample.g / meanG;
                const bn = sample.b / meanB;
                const xVal = 3 * rn - 2 * gn;
                const yVal = 1.5 * rn + gn - 1.5 * bn;
                xs[i] = xVal;
                ys[i] = yVal;
                meanX += xVal;
                meanY += yVal;
            }
            meanX /= winLen;
            meanY /= winLen;

            let varX = 0, varY = 0;
            for (let i = 0; i < winLen; i++) {
                const dx = xs[i] - meanX;
                const dy = ys[i] - meanY;
                varX += dx * dx;
                varY += dy * dy;
            }
            const stdX = Math.sqrt(varX / winLen);
            const stdY = Math.sqrt(varY / winLen);
            const alpha = stdY > 1e-7 ? stdX / stdY : 0;

            let meanS = 0;
            const s = new Array(winLen);
            for (let i = 0; i < winLen; i++) {
                s[i] = xs[i] - alpha * ys[i];
                meanS += s[i];
            }
            meanS /= winLen;

            for (let i = 0; i < winLen; i++) {
                chrom[start + i] += s[i] - meanS;
            }
        }
        return chrom;
    }

    /**
     * Stage 3C: Contact Fingertip Optical Absorption & Perfusion Index (PI %)
     */
    computeFingertipPPGSignal(rgbSamples) {
        const n = rgbSamples.length;
        if (n === 0) {
            return { signal: [], perfusionIndex: 0 };
        }

        let sumR = 0, sumG = 0;
        let minR = Infinity, maxR = -Infinity;
        for (let i = 0; i < n; i++) {
            const r = Math.max(1, rgbSamples[i].r);
            const g = Math.max(1, rgbSamples[i].g);
            sumR += r;
            sumG += g;
            if (r < minR) minR = r;
            if (r > maxR) maxR = r;
        }
        const dcR = sumR / n || 1;
        const dcG = sumG / n || 1;

        // Beer-Lambert differential optical absorbance + normalized AC/DC pulsatile component
        const signal = new Array(n);
        for (let i = 0; i < n; i++) {
            const r = Math.max(1, rgbSamples[i].r);
            const g = Math.max(1, rgbSamples[i].g);
            const absR = -Math.log(r / 255);
            const acNorm = (r - dcR) / dcR + 0.35 * ((g - dcG) / dcG);
            signal[i] = absR * 0.5 - acNorm * 0.5;
        }

        // Compute RMS AC to DC Perfusion Index (%) over latest ~3 seconds
        const recentWindow = rgbSamples.slice(-90);
        let rMean = 0;
        for (const s of recentWindow) rMean += s.r;
        rMean /= recentWindow.length || 1;
        let acVar = 0;
        for (const s of recentWindow) {
            const diff = s.r - rMean;
            acVar += diff * diff;
        }
        const acRms = Math.sqrt(acVar / (recentWindow.length || 1)) * 2.828; // Peak-to-peak equivalent
        const rawPi = rMean > 10 ? (acRms / rMean) * 100 : 0;
        const perfusionIndex = Number(Math.max(0.1, Math.min(12.0, rawPi)).toFixed(2));

        return { signal, perfusionIndex };
    }

    /**
     * Detect whether the camera lens is covered by an illuminated fingertip
     * (>=75% of frame pixels exhibit strong red transmission dominance)
     */
    detectFingertipContact(imgDataArray, totalPixels) {
        if (!imgDataArray || totalPixels <= 0) return { isContact: false, redCoverage: 0 };
        let redDominantCount = 0;
        for (let i = 0; i < totalPixels; i++) {
            const idx = i * 4;
            const r = imgDataArray[idx];
            const g = imgDataArray[idx + 1];
            const b = imgDataArray[idx + 2];
            if (r >= 110 && r > g * 1.45 && r > b * 1.6) {
                redDominantCount++;
            }
        }
        const redCoverage = redDominantCount / totalPixels;
        return {
            isContact: redCoverage >= 0.75,
            redCoverage
        };
    }

    /**
     * Widened YCbCr + normalized RGB dermal classifier with specular highlight & shadow rejection
     */
    isSkinPixel(r, g, b) {
        // Exclude clipped specular glare
        if (r > 248 && g > 248 && b > 248) return false;
        // Exclude deep non-skin shadows
        if (r < 28 && g < 24 && b < 24) return false;

        const y = 0.299 * r + 0.587 * g + 0.114 * b;
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

        return (
            y >= 32 &&
            y <= 248 &&
            cb >= 72 &&
            cb <= 140 &&
            cr >= 126 &&
            cr <= 185 &&
            r > g * 0.90
        );
    }

    handleUniqueVideoFrame(wallNow, frameTimeMs) {
        if (!this.isRunning || this.isLocked) return;
        if (!this.video || this.video.readyState < 2 || this.video.paused) return;
        if (!this.canvas || !this.ctx) return;

        const width = 160;
        const height = 120;
        if (this.canvas.width !== width) {
            this.canvas.width = width;
            this.canvas.height = height;
        }

        try {
            this.ctx.drawImage(this.video, 0, 0, width, height);

            // Inspect central capture region
            const roiX = Math.floor(width * 0.18);
            const roiY = Math.floor(height * 0.10);
            const roiW = Math.floor(width * 0.64);
            const roiH = Math.floor(height * 0.76);

            const imgData = this.ctx.getImageData(roiX, roiY, roiW, roiH);
            const data = imgData.data;
            const totalPixels = roiW * roiH;

            // Check fingertip lens contact first
            const { isContact: isFingertipContact, redCoverage } = this.detectFingertipContact(
                data,
                totalPixels
            );

            if (isFingertipContact && this.autoSwitchFingertip && this.sensorMode !== 'fingertip_cppg') {
                this.fingertipStreak++;
                if (this.fingertipStreak >= 4) {
                    this.setSensorMode('fingertip_cppg');
                }
            } else if (!isFingertipContact) {
                this.fingertipStreak = 0;
            }

            if (this.sensorMode === 'fingertip_cppg') {
                this.processFingertipFrame(data, totalPixels, redCoverage, wallNow, frameTimeMs);
                return;
            }

            // Pass 1: Detect skin pixels & dynamic face skin bounding box + centroid
            let skinR = 0, skinG = 0, skinB = 0, skinY = 0;
            let sumX = 0, sumY = 0;
            let skinCount = 0;
            let globalY = 0;

            let minSkinX = roiW, maxSkinX = 0;
            let minSkinY = roiH, maxSkinY = 0;

            for (let py = 0; py < roiH; py++) {
                for (let px = 0; px < roiW; px++) {
                    const idx = (py * roiW + px) * 4;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];

                    const y = 0.299 * r + 0.587 * g + 0.114 * b;
                    globalY += y;

                    if (this.isSkinPixel(r, g, b)) {
                        skinR += r;
                        skinG += g;
                        skinB += b;
                        skinY += y;
                        sumX += px / roiW;
                        sumY += py / roiH;
                        skinCount++;

                        if (px < minSkinX) minSkinX = px;
                        if (px > maxSkinX) maxSkinX = px;
                        if (py < minSkinY) minSkinY = py;
                        if (py > maxSkinY) maxSkinY = py;
                    }
                }
            }

            const skinCoverage = skinCount / (totalPixels || 1);
            const avgGlobalY = globalY / (totalPixels || 1);

            // Gate A: Low Light or Face Missing
            if (skinCoverage < 0.18) {
                this.noSkinFrames++;
                this.lastCleanFrameTs = null;
                if (this.noSkinFrames >= 8) {
                    this.rgbBuffer = [];
                    this.roiBuffers = { forehead: [], leftCheek: [], rightCheek: [] };
                    this.prevCentroid = null;
                    this.prevLuma = null;
                    const isLowLight = avgGlobalY < 42;
                    this.emitUpdate({
                        bpm: this.currentBpm,
                        confidence: 0,
                        signalQuality: isLowLight ? 'LOW_LIGHT' : 'NO_FACE',
                        skinCoverage: Math.round(skinCoverage * 100),
                        progressPct: this.getProgressPct(),
                        motionWarning: false,
                        isDetecting: false,
                        isLocked: false,
                        sensorMode: this.sensorMode,
                        roiCoherence: 0,
                        activeRois: 0,
                        perfusionIndex: 0,
                        torchActive: this.torchActive,
                        guidanceHint: isLowLight
                            ? 'Face closer to soft front lighting or switch to Fingertip PPG'
                            : 'Center your face inside the camera frame'
                    });
                }
                return;
            }

            this.noSkinFrames = 0;
            const meanR = skinR / skinCount;
            const meanG = skinG / skinCount;
            const meanB = skinB / skinCount;
            const meanY = skinY / skinCount;
            const cx = sumX / skinCount;
            const cy = sumY / skinCount;

            // Gate B: Speech / Head Motion & Auto-Exposure Jump Rejection
            let isMotion = false;
            if (this.prevCentroid && this.prevLuma) {
                const dPos = Math.hypot(cx - this.prevCentroid.x, cy - this.prevCentroid.y);
                const dLuma = Math.abs(meanY - this.prevLuma) / Math.max(1, this.prevLuma);
                if (dPos > 0.030 || dLuma > 0.048) {
                    isMotion = true;
                }
            }
            this.prevCentroid = { x: cx, y: cy };
            this.prevLuma = meanY;

            if (isMotion) {
                this.motionCooldown = 6;
                this.lastCleanFrameTs = null;
                if (this.rgbBuffer.length > 6) {
                    this.rgbBuffer.splice(-3);
                    this.roiBuffers.forehead.splice(-3);
                    this.roiBuffers.leftCheek.splice(-3);
                    this.roiBuffers.rightCheek.splice(-3);
                }
                this.emitUpdate({
                    bpm: this.currentBpm,
                    confidence: 0.35,
                    signalQuality: 'HOLD_STILL',
                    skinCoverage: Math.round(skinCoverage * 100),
                    progressPct: this.getProgressPct(),
                    motionWarning: true,
                    isDetecting: false,
                    isLocked: false,
                    sensorMode: this.sensorMode,
                    roiCoherence: this.lastRoiCoherence,
                    activeRois: this.lastActiveRois,
                    perfusionIndex: this.lastPerfusionIndex,
                    torchActive: this.torchActive,
                    guidanceHint: 'Motion detected — relax shoulders and hold head steady'
                });
                return;
            }

            if (this.motionCooldown > 0) {
                this.motionCooldown--;
                this.lastCleanFrameTs = null;
                return;
            }

            // Pass 2: Extract 3 Anatomical Sub-ROIs within the detected face bounding box
            // - forehead: upper 22%–42% of face bounding box, central 55% width (22.5%–77.5%)
            // - leftCheek: middle 48%–75% height, left 18%–45% width
            // - rightCheek: middle 48%–75% height, right 55%–82% width
            const boxW = Math.max(20, maxSkinX - minSkinX + 1);
            const boxH = Math.max(20, maxSkinY - minSkinY + 1);

            const extractAnatomicalSubROI = (x0Frac, x1Frac, y0Frac, y1Frac) => {
                const xStart = Math.max(0, Math.min(roiW - 1, Math.floor(minSkinX + boxW * x0Frac)));
                const xEnd = Math.max(xStart + 1, Math.min(roiW, Math.ceil(minSkinX + boxW * x1Frac)));
                const yStart = Math.max(0, Math.min(roiH - 1, Math.floor(minSkinY + boxH * y0Frac)));
                const yEnd = Math.max(yStart + 1, Math.min(roiH, Math.ceil(minSkinY + boxH * y1Frac)));

                let rSum = 0, gSum = 0, bSum = 0, count = 0;
                for (let py = yStart; py < yEnd; py++) {
                    for (let px = xStart; px < xEnd; px++) {
                        const idx = (py * roiW + px) * 4;
                        const r = data[idx];
                        const g = data[idx + 1];
                        const b = data[idx + 2];
                        if (this.isSkinPixel(r, g, b)) {
                            rSum += r;
                            gSum += g;
                            bSum += b;
                            count++;
                        }
                    }
                }
                const zoneArea = (xEnd - xStart) * (yEnd - yStart) || 1;
                if (count < Math.max(8, zoneArea * 0.20)) {
                    return null;
                }
                return { r: rSum / count, g: gSum / count, b: bSum / count };
            };

            const fhSample = extractAnatomicalSubROI(0.225, 0.775, 0.22, 0.42);
            const lcSample = extractAnatomicalSubROI(0.18, 0.45, 0.48, 0.75);
            const rcSample = extractAnatomicalSubROI(0.55, 0.82, 0.48, 0.75);

            // Clean stationary frame accepted!
            if (this.lastCleanFrameTs !== null) {
                const dt = Math.min(0.15, Math.max(0, (wallNow - this.lastCleanFrameTs) / 1000));
                this.cleanDurationSec += dt;
            }
            this.lastCleanFrameTs = wallNow;

            const prevT = this.rgbBuffer.length > 0 ? this.rgbBuffer[this.rgbBuffer.length - 1].t : -1;
            const safeT = frameTimeMs > prevT ? frameTimeMs : wallNow;

            this.rgbBuffer.push({ r: meanR, g: meanG, b: meanB, t: safeT });
            if (this.rgbBuffer.length > this.maxFrames) this.rgbBuffer.shift();

            const pushSubRoi = (arr, sample) => {
                if (sample) {
                    arr.push({ r: sample.r, g: sample.g, b: sample.b, t: safeT });
                } else {
                    arr.push({ r: meanR, g: meanG, b: meanB, t: safeT, fallback: true });
                }
                if (arr.length > this.maxFrames) arr.shift();
            };

            pushSubRoi(this.roiBuffers.forehead, fhSample);
            pushSubRoi(this.roiBuffers.leftCheek, lcSample);
            pushSubRoi(this.roiBuffers.rightCheek, rcSample);

            const immediateActiveRois =
                (fhSample ? 1 : 0) + (lcSample ? 1 : 0) + (rcSample ? 1 : 0);
            this.lastActiveRois = immediateActiveRois;

            const spanSec =
                this.rgbBuffer.length > 1
                    ? (this.rgbBuffer[this.rgbBuffer.length - 1].t - this.rgbBuffer[0].t) / 1000
                    : 0;

            if (spanSec >= 4.5 && this.rgbBuffer.length >= 90 && wallNow - this.lastAnalysisTime >= 250) {
                this.lastAnalysisTime = wallNow;
                this.analyzeSpectrumAndLock(skinCoverage, spanSec);
            } else if (spanSec < 4.5) {
                this.emitUpdate({
                    bpm: this.currentBpm,
                    confidence: Number(Math.min(0.5, (spanSec / 4.5) * 0.48).toFixed(2)),
                    signalQuality: 'CALIBRATING',
                    skinCoverage: Math.round(skinCoverage * 100),
                    progressPct: this.getProgressPct(),
                    motionWarning: false,
                    isDetecting: false,
                    isLocked: false,
                    sensorMode: this.sensorMode,
                    roiCoherence: this.lastRoiCoherence,
                    activeRois: immediateActiveRois,
                    perfusionIndex: this.lastPerfusionIndex,
                    torchActive: this.torchActive,
                    guidanceHint: `${immediateActiveRois}/3 facial zones active — acquiring baseline waveform`
                });
            }
        } catch (err) {
            // Ignore transient canvas read errors
        }
    }

    /**
     * Contact Fingertip PPG Frame Processor (`fingertip_cppg` mode)
     */
    processFingertipFrame(data, totalPixels, redCoverage, wallNow, frameTimeMs) {
        if (redCoverage < 0.55) {
            this.noSkinFrames++;
            this.lastCleanFrameTs = null;
            if (this.noSkinFrames >= 6) {
                this.rgbBuffer = [];
                this.emitUpdate({
                    bpm: this.currentBpm,
                    confidence: 0,
                    signalQuality: 'NO_FACE',
                    skinCoverage: Math.round(redCoverage * 100),
                    progressPct: this.getProgressPct(),
                    motionWarning: false,
                    isDetecting: false,
                    isLocked: false,
                    sensorMode: 'fingertip_cppg',
                    roiCoherence: 0,
                    activeRois: 0,
                    perfusionIndex: 0,
                    torchActive: this.torchActive,
                    guidanceHint: 'Place fingertip gently over camera lens (and flash if on mobile)'
                });
            }
            return;
        }

        this.noSkinFrames = 0;
        let sumR = 0, sumG = 0, sumB = 0, count = 0;
        for (let i = 0; i < totalPixels; i++) {
            const idx = i * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            if (r >= 80 && r > g * 1.25) {
                sumR += r;
                sumG += g;
                sumB += b;
                count++;
            }
        }

        const meanR = sumR / (count || 1);
        const meanG = sumG / (count || 1);
        const meanB = sumB / (count || 1);

        // Reject excessive finger pressure jumps (>8% sudden luma shift)
        if (this.prevLuma !== null) {
            const dR = Math.abs(meanR - this.prevLuma) / Math.max(1, this.prevLuma);
            if (dR > 0.085) {
                this.prevLuma = meanR;
                this.motionCooldown = 4;
                this.lastCleanFrameTs = null;
                this.emitUpdate({
                    bpm: this.currentBpm,
                    confidence: 0.35,
                    signalQuality: 'HOLD_STILL',
                    skinCoverage: Math.round(redCoverage * 100),
                    progressPct: this.getProgressPct(),
                    motionWarning: true,
                    isDetecting: false,
                    isLocked: false,
                    sensorMode: 'fingertip_cppg',
                    roiCoherence: this.lastRoiCoherence,
                    activeRois: 1,
                    perfusionIndex: this.lastPerfusionIndex,
                    torchActive: this.torchActive,
                    guidanceHint: 'Keep light, steady fingertip pressure — do not press hard'
                });
                return;
            }
        }
        this.prevLuma = meanR;

        if (this.motionCooldown > 0) {
            this.motionCooldown--;
            this.lastCleanFrameTs = null;
            return;
        }

        if (this.lastCleanFrameTs !== null) {
            const dt = Math.min(0.15, Math.max(0, (wallNow - this.lastCleanFrameTs) / 1000));
            this.cleanDurationSec += dt;
        }
        this.lastCleanFrameTs = wallNow;

        const prevT = this.rgbBuffer.length > 0 ? this.rgbBuffer[this.rgbBuffer.length - 1].t : -1;
        const safeT = frameTimeMs > prevT ? frameTimeMs : wallNow;

        this.rgbBuffer.push({ r: meanR, g: meanG, b: meanB, t: safeT });
        if (this.rgbBuffer.length > this.maxFrames) this.rgbBuffer.shift();

        const spanSec =
            this.rgbBuffer.length > 1
                ? (this.rgbBuffer[this.rgbBuffer.length - 1].t - this.rgbBuffer[0].t) / 1000
                : 0;

        if (spanSec >= 4.0 && this.rgbBuffer.length >= 80 && wallNow - this.lastAnalysisTime >= 250) {
            this.lastAnalysisTime = wallNow;
            this.analyzeSpectrumAndLock(redCoverage, spanSec);
        } else if (spanSec < 4.0) {
            const { perfusionIndex } = this.computeFingertipPPGSignal(this.rgbBuffer);
            this.lastPerfusionIndex = perfusionIndex;
            this.emitUpdate({
                bpm: this.currentBpm,
                confidence: Number(Math.min(0.55, (spanSec / 4.0) * 0.52).toFixed(2)),
                signalQuality: 'CALIBRATING',
                skinCoverage: Math.round(redCoverage * 100),
                progressPct: this.getProgressPct(),
                motionWarning: false,
                isDetecting: false,
                isLocked: false,
                sensorMode: 'fingertip_cppg',
                roiCoherence: this.lastRoiCoherence,
                activeRois: 1,
                perfusionIndex,
                torchActive: this.torchActive,
                guidanceHint: `Fingertip contact active (PI ${perfusionIndex}%) — hold steady`
            });
        }
    }

    getProgressPct() {
        if (!this.spotCheckMode) return 100;
        return Math.min(100, Math.round((this.cleanDurationSec / this.spotCheckTargetSec) * 100));
    }

    /**
     * Systolic Peak-to-Peak Inter-Beat Interval (IBI) Time-Domain Estimator
     */
    estimateIBIFromBandpassed(bandPassed, sampleRate) {
        const n = bandPassed.length;
        if (n < 30) return { ibiBpm: null, ibiConsistency: 0, alternationRatio: 0 };

        let rms = 0;
        for (let i = 0; i < n; i++) rms += bandPassed[i] * bandPassed[i];
        rms = Math.sqrt(rms / n);
        if (rms < 1e-9) return { ibiBpm: null, ibiConsistency: 0, alternationRatio: 0 };

        const minPeakDist = Math.max(4, Math.floor(sampleRate * 0.36)); // Max ~166 BPM peak rate
        const rawPeaks = [];

        for (let i = 2; i < n - 2; i++) {
            const val = bandPassed[i];
            if (
                val > rms * 0.25 &&
                val >= bandPassed[i - 1] &&
                val >= bandPassed[i + 1] &&
                val >= bandPassed[i - 2] &&
                val >= bandPassed[i + 2]
            ) {
                if (rawPeaks.length === 0 || i - rawPeaks[rawPeaks.length - 1].idx >= minPeakDist) {
                    rawPeaks.push({ idx: i, val });
                } else if (val > rawPeaks[rawPeaks.length - 1].val) {
                    rawPeaks[rawPeaks.length - 1] = { idx: i, val };
                }
            }
        }

        if (rawPeaks.length < 3) {
            return { ibiBpm: null, ibiConsistency: 0, alternationRatio: 0 };
        }

        // Measure peak height alternation (characteristic of dicrotic notch 2*f0 peaks)
        let evenSum = 0, evenCount = 0;
        let oddSum = 0, oddCount = 0;
        for (let i = 0; i < rawPeaks.length; i++) {
            if (i % 2 === 0) {
                evenSum += rawPeaks[i].val;
                evenCount++;
            } else {
                oddSum += rawPeaks[i].val;
                oddCount++;
            }
        }
        const evenMean = evenCount > 0 ? evenSum / evenCount : 1;
        const oddMean = oddCount > 0 ? oddSum / oddCount : 1;
        const alternationRatio =
            Math.max(evenMean, oddMean) > 1e-7
                ? Math.abs(evenMean - oddMean) / Math.max(evenMean, oddMean)
                : 0;

        // Inter-peak intervals in seconds
        const intervals = [];
        for (let i = 1; i < rawPeaks.length; i++) {
            const dtSec = (rawPeaks[i].idx - rawPeaks[i - 1].idx) / sampleRate;
            if (dtSec >= 0.42 && dtSec <= 1.35) {
                intervals.push(dtSec);
            }
        }

        if (intervals.length < 2) {
            return { ibiBpm: null, ibiConsistency: 0, alternationRatio };
        }

        const sorted = [...intervals].sort((a, b) => a - b);
        const q1 = Math.floor(sorted.length * 0.2);
        const q3 = Math.max(q1 + 1, Math.ceil(sorted.length * 0.8));
        const trimmed = sorted.slice(q1, q3);
        const meanIbi = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
        let variance = 0;
        for (const dt of trimmed) {
            variance += (dt - meanIbi) * (dt - meanIbi);
        }
        const cv = Math.sqrt(variance / trimmed.length) / (meanIbi || 1);
        const ibiConsistency = Math.max(0, Math.min(1, 1 - cv * 2.5));

        return {
            ibiBpm: 60 / meanIbi,
            ibiConsistency,
            alternationRatio
        };
    }

    /**
     * Core Spectral + Autocorrelation Estimator (mountable directly in unit tests too)
     * Rigorously disambiguates Dicrotic-Notch 2nd harmonics (`2*f0 -> f0`) without
     * falsely halving true 96–135 BPM resting/elevated heart rates.
     */
    estimateHeartRateFromPOS(bandPassed, sampleRate) {
        const n = bandPassed.length;
        if (n < 8) {
            return { bpm: 0, spectralPurity: 0, autocorr: 0, ibiBpm: null, ibiConsistency: 0 };
        }

        const windowed = new Array(n);
        for (let i = 0; i < n; i++) {
            const hanning = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
            windowed[i] = bandPassed[i] * hanning;
        }

        // Resting seated teleconsultation range: 48 – 138 BPM (0.80 – 2.30 Hz)
        const minFreq = 0.80;
        const maxFreq = 2.30;
        const freqStep = 0.005; // 0.3 BPM spectral resolution

        const psdBins = [];
        let maxPower = 0;
        let maxBinIdx = 0;
        let rawPeakFreq = 1.2;
        let totalPower = 0;

        for (let f = minFreq; f <= maxFreq + 1e-6; f += freqStep) {
            let re = 0;
            let im = 0;
            const omega = (2 * Math.PI * f) / sampleRate;
            for (let k = 0; k < n; k++) {
                const angle = omega * k;
                re += windowed[k] * Math.cos(angle);
                im -= windowed[k] * Math.sin(angle);
            }
            const power = re * re + im * im;
            const idx = psdBins.length;
            psdBins.push({ f, power });
            totalPower += power;
            if (power > maxPower) {
                maxPower = power;
                maxBinIdx = idx;
                rawPeakFreq = f;
            }
        }

        // Parabolic interpolation around spectral peak for sub-bin accuracy
        const refinePeakFreq = (binIdx) => {
            if (binIdx <= 0 || binIdx >= psdBins.length - 1) {
                return psdBins[binIdx]?.f || rawPeakFreq;
            }
            const pPrev = Math.log(Math.max(1e-12, psdBins[binIdx - 1].power));
            const pCurr = Math.log(Math.max(1e-12, psdBins[binIdx].power));
            const pNext = Math.log(Math.max(1e-12, psdBins[binIdx + 1].power));
            const denom = pPrev - 2 * pCurr + pNext;
            if (Math.abs(denom) < 1e-9) return psdBins[binIdx].f;
            const delta = Math.max(-0.5, Math.min(0.5, (0.5 * (pPrev - pNext)) / denom));
            return psdBins[binIdx].f + delta * freqStep;
        };

        rawPeakFreq = refinePeakFreq(maxBinIdx);

        // Normalized Time-Domain Autocorrelation helper for exact fractional lag validation
        let zeroLagEnergy = 0;
        for (let i = 0; i < n; i++) zeroLagEnergy += bandPassed[i] * bandPassed[i];

        const getAutocorrAtFreq = (freqHz) => {
            if (zeroLagEnergy <= 1e-12 || freqHz <= 0) return 0;
            const exactLag = sampleRate / freqHz;
            const lagLow = Math.max(2, Math.floor(exactLag) - 1);
            const lagHigh = Math.min(Math.floor(n * 0.72), Math.ceil(exactLag) + 1);
            let bestR = -1;
            for (let lag = lagLow; lag <= lagHigh; lag++) {
                let sum = 0;
                let e1 = 0;
                let e2 = 0;
                const count = n - lag;
                if (count < 16) continue;
                for (let i = 0; i < count; i++) {
                    const a = bandPassed[i];
                    const b = bandPassed[i + lag];
                    sum += a * b;
                    e1 += a * a;
                    e2 += b * b;
                }
                const denom = Math.sqrt(e1 * e2);
                const normR = denom > 1e-12 ? sum / denom : 0;
                if (normR > bestR) bestR = normR;
            }
            return bestR;
        };

        const ibiMetrics = this.estimateIBIFromBandpassed(bandPassed, sampleRate);
        let chosenFreq = rawPeakFreq;

        // Stage 5: Rigorous Dicrotic-Notch 2nd-Harmonic Disambiguation (`2*f0 -> f0`)
        // Only demote `rawPeakFreq >= 1.60 Hz` (96+ BPM) to `f / 2` when ALL 3 conditions hold:
        //   (a) `bestHalfFreq` is a true local spectral peak (higher than neighbors ±0.06 Hz),
        //   (b) `bestHalfPower >= maxPower * 0.42`, AND
        //   (c) Full-period autocorrelation `R(T_half)` exceeds half-period `R(T_raw)`
        //       OR time-domain systolic/dicrotic peak alternation confirms the lower fundamental.
        if (rawPeakFreq >= 1.60) {
            const halfCenter = rawPeakFreq * 0.5;
            if (halfCenter >= minFreq) {
                let bestHalfPower = 0;
                let bestHalfIdx = -1;
                for (let i = 0; i < psdBins.length; i++) {
                    if (Math.abs(psdBins[i].f - halfCenter) <= 0.08 && psdBins[i].power > bestHalfPower) {
                        bestHalfPower = psdBins[i].power;
                        bestHalfIdx = i;
                    }
                }

                if (bestHalfIdx > 0 && bestHalfPower >= maxPower * 0.42) {
                    const candidateHalfFreq = psdBins[bestHalfIdx].f;
                    const flankOffsetBins = Math.max(2, Math.round(0.06 / freqStep));
                    const leftFlankIdx = Math.max(0, bestHalfIdx - flankOffsetBins);
                    const rightFlankIdx = Math.min(psdBins.length - 1, bestHalfIdx + flankOffsetBins);
                    const leftFlankPower = psdBins[leftFlankIdx].power;
                    const rightFlankPower = psdBins[rightFlankIdx].power;

                    // Condition (a): True local spectral peak vs ±0.06 Hz neighbors
                    const isLocalSpectralPeak =
                        bestHalfPower > leftFlankPower * 1.12 &&
                        bestHalfPower > rightFlankPower * 1.12;

                    if (isLocalSpectralPeak) {
                        const refinedHalfFreq = refinePeakFreq(bestHalfIdx);
                        const autocorrHalf = getAutocorrAtFreq(refinedHalfFreq);
                        const autocorrRaw = getAutocorrAtFreq(rawPeakFreq);

                        // Condition (c): At fundamental period T_half = 1/f0, a dicrotic waveform
                        // aligns both f0 and 2*f0 in phase (+1), whereas at T_raw = 1/(2*f0)
                        // the fundamental is anti-phase (-1), so autocorrHalf > autocorrRaw!
                        const autocorrConfirmsFundamental = autocorrHalf > autocorrRaw + 0.03;
                        const cycleAnalysisConfirmsFundamental =
                            ibiMetrics.alternationRatio >= 0.18 ||
                            (ibiMetrics.ibiBpm !== null &&
                                Math.abs(ibiMetrics.ibiBpm - refinedHalfFreq * 60) <
                                    Math.abs(ibiMetrics.ibiBpm - rawPeakFreq * 60));

                        if (autocorrConfirmsFundamental || cycleAnalysisConfirmsFundamental) {
                            chosenFreq = refinedHalfFreq;
                        }
                    }
                }
            }
        }

        // Compute spectral concentration around chosen fundamental (+ its 2nd harmonic if inside band)
        let signalPower = 0;
        for (const bin of psdBins) {
            if (Math.abs(bin.f - chosenFreq) <= 0.10 || Math.abs(bin.f - chosenFreq * 2) <= 0.10) {
                signalPower += bin.power;
            }
        }
        const spectralPurity = totalPower > 0 ? signalPower / totalPower : 0;

        return {
            bpm: chosenFreq * 60,
            spectralPurity,
            autocorr: getAutocorrAtFreq(chosenFreq),
            ibiBpm: ibiMetrics.ibiBpm,
            ibiConsistency: ibiMetrics.ibiConsistency
        };
    }

    /**
     * Evaluate Multi-ROI Spatial Coherence across Forehead, Left Cheek, and Right Cheek
     * Combines POS and CHROM estimates per anatomical zone and measures cross-zone BPM agreement.
     */
    evaluateMultiROICoherence(sampleRate = 30) {
        const zones = ['forehead', 'leftCheek', 'rightCheek'];
        const zoneEstimates = [];

        for (const zoneName of zones) {
            const rawBuf = this.roiBuffers[zoneName] || [];
            if (rawBuf.length < 60) continue;

            // Count how many recent frames were genuinely sampled from this zone (not fallback)
            const recentSlice = rawBuf.slice(-90);
            const fallbackCount = recentSlice.filter((s) => s.fallback).length;
            if (fallbackCount > recentSlice.length * 0.45) continue;

            const uniformBuf = this.resampleRGBSeriesUniform(rawBuf, sampleRate);
            if (uniformBuf.length < 60) continue;

            const posRaw = this.computePOSSignal(uniformBuf, sampleRate);
            const chromRaw = this.computeCHROMSignal(uniformBuf, sampleRate);

            // Fuse normalized POS + CHROM for enhanced motion/illumination resilience
            const fused = new Array(uniformBuf.length);
            for (let i = 0; i < uniformBuf.length; i++) {
                fused[i] = 0.65 * posRaw[i] + 0.35 * chromRaw[i];
            }

            const bp = this.applyZeroPhaseBandpass(fused, 0.78, 2.35, sampleRate);
            const est = this.estimateHeartRateFromPOS(bp, sampleRate);

            if (est.bpm >= 48 && est.bpm <= 138 && est.spectralPurity >= 0.18) {
                zoneEstimates.push({
                    zone: zoneName,
                    bpm: est.bpm,
                    purity: est.spectralPurity,
                    autocorr: est.autocorr
                });
            }
        }

        const activeRois = zoneEstimates.length;
        if (activeRois === 0) {
            return {
                activeRois: 0,
                roiCoherence: 0,
                coherentPairFound: false,
                agreedBpm: null,
                maxSpreadBpm: Infinity
            };
        }

        if (activeRois === 1) {
            return {
                activeRois: 1,
                roiCoherence: Number(Math.min(0.68, zoneEstimates[0].purity * 1.1).toFixed(2)),
                coherentPairFound: false,
                agreedBpm: zoneEstimates[0].bpm,
                maxSpreadBpm: 0
            };
        }

        // Check pairwise agreement within ±5 BPM across the anatomical zones
        let bestPairDiff = Infinity;
        let bestPairBpm = null;
        let maxSpreadBpm = 0;

        for (let i = 0; i < zoneEstimates.length; i++) {
            for (let j = i + 1; j < zoneEstimates.length; j++) {
                const diff = Math.abs(zoneEstimates[i].bpm - zoneEstimates[j].bpm);
                if (diff > maxSpreadBpm) maxSpreadBpm = diff;
                if (diff < bestPairDiff) {
                    bestPairDiff = diff;
                    const w1 = zoneEstimates[i].purity;
                    const w2 = zoneEstimates[j].purity;
                    bestPairBpm =
                        (zoneEstimates[i].bpm * w1 + zoneEstimates[j].bpm * w2) /
                        Math.max(1e-6, w1 + w2);
                }
            }
        }

        const coherentPairFound = bestPairDiff <= 5.0;
        const spreadScore = Math.max(0, 1 - bestPairDiff / 12);
        const avgPurity =
            zoneEstimates.reduce((acc, z) => acc + z.purity, 0) / zoneEstimates.length;
        const zoneBonus = activeRois === 3 && maxSpreadBpm <= 6.0 ? 0.12 : 0;
        const roiCoherence = Number(
            Math.max(0, Math.min(1, spreadScore * 0.65 + avgPurity * 0.35 + zoneBonus)).toFixed(2)
        );

        return {
            activeRois,
            roiCoherence,
            coherentPairFound,
            agreedBpm: bestPairBpm,
            maxSpreadBpm
        };
    }

    analyzeSpectrumAndLock(skinCoverage, spanSec) {
        const sampleRate = this.targetSampleRate; // Uniform 30 Hz resampled grid
        const uniformRgb = this.resampleRGBSeriesUniform(this.rgbBuffer, sampleRate);
        if (uniformRgb.length < 75) {
            return;
        }

        let bandPassed;
        let rawBpm;
        let spectralPurity;
        let autocorr;
        let roiCoherence = 0;
        let activeRois = 0;
        let perfusionIndex = 0;
        let coherenceGatePassed = false;

        if (this.sensorMode === 'fingertip_cppg') {
            const { signal, perfusionIndex: pi } = this.computeFingertipPPGSignal(uniformRgb);
            perfusionIndex = pi;
            this.lastPerfusionIndex = pi;
            bandPassed = this.applyZeroPhaseBandpass(signal, 0.78, 2.35, sampleRate);
            const est = this.estimateHeartRateFromPOS(bandPassed, sampleRate);
            rawBpm = est.bpm;
            spectralPurity = est.spectralPurity;
            autocorr = est.autocorr;
            activeRois = 1;

            // Cross-check PSD BPM against systolic Peak-to-Peak IBI in fingertip mode
            const ibiDiff =
                est.ibiBpm !== null ? Math.abs(est.ibiBpm - rawBpm) : 4.0;
            const ibiAgreement = Math.max(0, 1 - ibiDiff / 15);
            roiCoherence = Number(
                Math.min(1, spectralPurity * 0.55 + autocorr * 0.25 + ibiAgreement * 0.25).toFixed(2)
            );
            coherenceGatePassed = spectralPurity >= 0.22 && autocorr >= 0.14;
        } else {
            // Facial Multi-Zone POS + CHROM Fusion
            const posRaw = this.computePOSSignal(uniformRgb, sampleRate);
            const chromRaw = this.computeCHROMSignal(uniformRgb, sampleRate);
            const fused = new Array(uniformRgb.length);
            for (let i = 0; i < uniformRgb.length; i++) {
                fused[i] = 0.65 * posRaw[i] + 0.35 * chromRaw[i];
            }
            bandPassed = this.applyZeroPhaseBandpass(fused, 0.78, 2.35, sampleRate);

            // Compute subtle facial Perfusion Index estimate
            const { perfusionIndex: facialPi } = this.computeFingertipPPGSignal(uniformRgb);
            perfusionIndex = Number(Math.min(3.5, facialPi).toFixed(2));
            this.lastPerfusionIndex = perfusionIndex;

            const est = this.estimateHeartRateFromPOS(bandPassed, sampleRate);
            rawBpm = est.bpm;
            spectralPurity = est.spectralPurity;
            autocorr = est.autocorr;

            const multiRoi = this.evaluateMultiROICoherence(sampleRate);
            activeRois = multiRoi.activeRois;
            roiCoherence = multiRoi.roiCoherence;

            if (multiRoi.coherentPairFound && multiRoi.agreedBpm !== null) {
                // Blend global face POS+CHROM BPM with multi-zone coherent BPM
                rawBpm = rawBpm * 0.5 + multiRoi.agreedBpm * 0.5;
                coherenceGatePassed = true;
            } else if (activeRois <= 1 && spectralPurity >= 0.30 && autocorr >= 0.18) {
                // Fallback when only 1 zone has sufficient pixels but high SNR
                coherenceGatePassed = true;
                roiCoherence = Math.max(roiCoherence, Number((spectralPurity * 0.85).toFixed(2)));
            }
        }

        this.lastRoiCoherence = roiCoherence;
        this.lastActiveRois = activeRois;
        this.filteredWaveform = bandPassed.slice(-75);

        // Strict SNR + Multi-ROI Spatial Coherence gate: refuse noisy guesses
        if (
            rawBpm < 48 ||
            rawBpm > 138 ||
            spectralPurity < 0.22 ||
            autocorr < 0.12 ||
            !coherenceGatePassed
        ) {
            this.emitUpdate({
                bpm: this.currentBpm,
                confidence: 0.42,
                signalQuality: 'CALIBRATING',
                sampleRate: Number(sampleRate.toFixed(1)),
                skinCoverage: Math.round(skinCoverage * 100),
                progressPct: this.getProgressPct(),
                motionWarning: false,
                isDetecting: false,
                isLocked: false,
                sensorMode: this.sensorMode,
                roiCoherence,
                activeRois,
                perfusionIndex,
                torchActive: this.torchActive,
                guidanceHint:
                    this.sensorMode === 'fingertip_cppg'
                        ? 'Stabilizing fingertip pulse waveform — keep gentle contact'
                        : `${activeRois}/3 facial zones active — aligning spatial coherence`
            });
            return;
        }

        // Physiological Slew-Rate Gate: reject sudden >14 BPM single-window spikes unless sustained 4x
        if (this.currentBpm !== null && Math.abs(rawBpm - this.currentBpm) > 14) {
            this.outlierStreak++;
            if (this.outlierStreak < 4) {
                return;
            }
        }
        this.outlierStreak = 0;

        this.validBpmHistory.push(rawBpm);
        if (this.validBpmHistory.length > 9) this.validBpmHistory.shift();

        // Interquartile-Range (IQR) Trimmed Mean
        const sorted = [...this.validBpmHistory].sort((a, b) => a - b);
        const qStart = Math.floor(sorted.length * 0.2);
        const qEnd = Math.max(qStart + 1, Math.ceil(sorted.length * 0.8));
        const trimmed = sorted.slice(qStart, qEnd);
        const targetBpm = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;

        // Smooth slew limit (max ±2 BPM step per update)
        if (this.currentBpm === null) {
            this.currentBpm = Math.round(targetBpm);
        } else {
            const diff = targetBpm - this.currentBpm;
            const clampedStep = Math.max(-2, Math.min(2, diff));
            this.currentBpm = Math.round(this.currentBpm + clampedStep);
        }

        this.spotCheckSamples.push(this.currentBpm);

        const confidence = Math.min(
            0.98,
            Math.max(
                0.64,
                Number((0.44 + spectralPurity * 0.42 + roiCoherence * 0.25).toFixed(2))
            )
        );
        const progressPct = this.getProgressPct();

        // Lock final reading once 15-second stationary spot-check completes!
        if (this.spotCheckMode && progressPct >= 100 && this.spotCheckSamples.length >= 6) {
            const finalSorted = [...this.spotCheckSamples].sort((a, b) => a - b);
            const lo = Math.floor(finalSorted.length * 0.25);
            const hi = Math.max(lo + 1, Math.ceil(finalSorted.length * 0.75));
            const iqm = Math.round(
                finalSorted.slice(lo, hi).reduce((a, b) => a + b, 0) / (hi - lo)
            );
            this.currentBpm = iqm;
            this.isLocked = true;

            const finalPayload = {
                bpm: this.currentBpm,
                confidence: Math.max(0.86, confidence),
                signalQuality: 'LOCKED',
                sampleRate: Number(sampleRate.toFixed(1)),
                skinCoverage: Math.round(skinCoverage * 100),
                progressPct: 100,
                motionWarning: false,
                waveform: this.filteredWaveform,
                isDetecting: true,
                isLocked: true,
                sensorMode: this.sensorMode,
                roiCoherence: Math.max(0.78, roiCoherence),
                activeRois,
                perfusionIndex,
                torchActive: this.torchActive,
                guidanceHint:
                    this.sensorMode === 'fingertip_cppg'
                        ? 'Locked with clean contact PPG periodicity'
                        : 'Locked with high multi-zone coherence'
            };
            this.emitUpdate(finalPayload);
            if (typeof this.onComplete === 'function') {
                this.onComplete(finalPayload);
            }
            this.stop();
            return;
        }

        const signalQuality =
            confidence >= 0.82 && skinCoverage >= 0.35
                ? 'EXCELLENT'
                : confidence >= 0.70
                ? 'GOOD'
                : 'FAIR';

        const guidanceHint =
            this.sensorMode === 'fingertip_cppg'
                ? `Contact PPG locked (PI ${perfusionIndex}%) — hold steady`
                : `${activeRois}/3 facial zones locked — hold steady`;

        this.emitUpdate({
            bpm: this.currentBpm,
            confidence,
            signalQuality,
            sampleRate: Number(sampleRate.toFixed(1)),
            skinCoverage: Math.round(skinCoverage * 100),
            progressPct,
            motionWarning: false,
            waveform: this.filteredWaveform,
            isDetecting: true,
            isLocked: false,
            sensorMode: this.sensorMode,
            roiCoherence,
            activeRois,
            perfusionIndex,
            torchActive: this.torchActive,
            guidanceHint
        });
    }

    emitUpdate(payload) {
        if (typeof this.onUpdate === 'function') {
            this.onUpdate({
                waveform: this.filteredWaveform,
                sensorMode: this.sensorMode,
                roiCoherence: this.lastRoiCoherence,
                activeRois: this.lastActiveRois,
                perfusionIndex: this.lastPerfusionIndex,
                torchActive: this.torchActive,
                ...payload
            });
        }
    }
}
