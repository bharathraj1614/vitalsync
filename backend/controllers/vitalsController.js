import vitalReadingModel from '../models/vitalReadingModel.js';
import appointmentModel from '../models/appointmentModel.js';
import { emitToDoctor, notifyParty } from '../socket.js';
import { computeNEWS2 } from '../utils/news2Calculator.js';

const parseOptionalNum = (val, min, max, round = true) => {
    if (val === null || val === undefined || val === '') return null;
    const n = Number(val);
    if (!Number.isFinite(n) || n < min || n > max) return null;
    return round ? Math.round(n) : Number(n.toFixed(1));
};

// POST /api/vitals/save
export const saveVitalReading = async (req, res) => {
    try {
        const {
            appointmentId,
            heartRate,
            systolicBp,
            diastolicBp,
            spo2,
            temperatureF,
            respiratoryRate,
            bloodGlucose,
            source,
            confidence,
            roiCoherence,
            perfusionIndex,
            signalQuality,
            method,
            notes
        } = req.body;
        const userId = req.body.userId; // populated by authUser

        const hr = parseOptionalNum(heartRate, 25, 240, true);
        const sbp = parseOptionalNum(systolicBp, 40, 300, true);
        const dbp = parseOptionalNum(diastolicBp, 25, 200, true);
        const ox = parseOptionalNum(spo2, 50, 100, true);
        const tempF = parseOptionalNum(temperatureF, 90, 110, false);
        const rr = parseOptionalNum(respiratoryRate, 4, 60, true);
        const glu = parseOptionalNum(bloodGlucose, 20, 700, true);

        if (hr === null && sbp === null && ox === null && tempF === null && glu === null) {
            return res.status(400).json({
                success: false,
                message: 'Please provide at least one valid physiological vital sign (Pulse, BP, SpO₂, Temp, or Glucose).'
            });
        }

        const triage = computeNEWS2({
            heartRate: hr,
            systolicBp: sbp,
            diastolicBp: dbp,
            spo2: ox,
            temperatureF: tempF,
            respiratoryRate: rr,
            bloodGlucose: glu
        });

        const allowedSources = [
            'manual',
            'rppg_spot_check',
            'fingertip_cppg',
            'ble_heart_rate',
            'tap_cadence',
            'hybrid'
        ];
        const resolvedSource = allowedSources.includes(source)
            ? source
            : signalQuality === 'BLE_GATT_VERIFIED'
            ? 'ble_heart_rate'
            : signalQuality === 'CLINICIAN_TAP_LOCKED'
            ? 'tap_cadence'
            : signalQuality && signalQuality !== 'CLINICAL_DEVICE'
            ? 'rppg_spot_check'
            : 'manual';

        const methodMap = {
            rppg_spot_check: '15s Multi-ROI Facial POS-rPPG Spot-Check',
            fingertip_cppg: '15s Contact Fingertip Optical PPG',
            ble_heart_rate: 'Web Bluetooth GATT Heart Rate Sensor',
            tap_cadence: 'Guided Radial/Carotid Tap-to-Pulse Cadence',
            hybrid: 'Home Clinical Devices + Biometric Pulse Adjunct',
            manual: 'Validated Home Clinical Devices'
        };

        const resolvedMethod = method || methodMap[resolvedSource] || methodMap.manual;

        const rawRoiCoherence = roiCoherence ?? req.body.roiCoherenceScore;
        const parsedRoiCoherence =
            rawRoiCoherence !== undefined && rawRoiCoherence !== null && rawRoiCoherence !== '' && Number.isFinite(Number(rawRoiCoherence))
                ? Number(Number(rawRoiCoherence).toFixed(3))
                : null;

        const rawPerfusionIndex = perfusionIndex ?? req.body.perfusionIndexPct;
        const parsedPerfusionIndex =
            rawPerfusionIndex !== undefined && rawPerfusionIndex !== null && rawPerfusionIndex !== '' && Number.isFinite(Number(rawPerfusionIndex))
                ? Number(Number(rawPerfusionIndex).toFixed(2))
                : null;

        const reading = new vitalReadingModel({
            userId,
            appointmentId: appointmentId || null,
            heartRate: hr,
            systolicBp: sbp,
            diastolicBp: dbp,
            spo2: ox,
            temperatureF: tempF,
            respiratoryRate: rr,
            bloodGlucose: glu,
            news2Score: triage.news2Score,
            news2Risk: triage.news2Risk,
            clinicalFlags: triage.clinicalFlags,
            source: resolvedSource,
            confidence: confidence !== undefined && Number.isFinite(Number(confidence)) ? Number(confidence) : 1.0,
            roiCoherence: parsedRoiCoherence,
            perfusionIndex: parsedPerfusionIndex,
            signalQuality: signalQuality || 'CLINICAL_DEVICE',
            method: resolvedMethod,
            notes: notes || '',
            timestamp: new Date()
        });

        await reading.save();

        if (appointmentId) {
            try {
                const appointment = await appointmentModel.findById(appointmentId);
                if (appointment) {
                    emitToDoctor(appointment.docId, 'vitals-saved', {
                        appointmentId: String(appointmentId),
                        reading
                    });

                    const summaryParts = [];
                    if (sbp && dbp) summaryParts.push(`BP ${sbp}/${dbp}`);
                    if (ox) summaryParts.push(`SpO₂ ${ox}%`);
                    if (tempF) summaryParts.push(`Temp ${tempF}°F`);
                    if (hr) summaryParts.push(`HR ${hr} BPM`);

                    notifyParty({
                        recipientRole: 'doctor',
                        recipientId: appointment.docId,
                        type: 'vitals_recorded',
                        title:
                            triage.news2Risk !== 'LOW'
                                ? `⚠️ Clinical Vitals Alert (NEWS2: ${triage.news2Score})`
                                : `Patient Vitals Recorded (${summaryParts.join(' • ') || 'EHR Updated'})`,
                        body:
                            triage.clinicalFlags.length > 0
                                ? `${appointment.userData?.name || 'Patient'}: ${triage.clinicalFlags.join(', ')}`
                                : `${appointment.userData?.name || 'Patient'} logged ${summaryParts.join(', ')}.`,
                        appointmentId: String(appointmentId),
                        link: `/doctor-video-call/${appointmentId}`,
                        senderName: appointment.userData?.name || 'Patient',
                        senderImage: appointment.userData?.image || ''
                    });
                }
            } catch (e) {}
        }

        return res.json({
            success: true,
            message: 'Clinical vitals recorded to Electronic Health Record',
            reading
        });
    } catch (error) {
        console.error('Save vitals error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/vitals/history (authenticated user)
export const getUserVitalsHistory = async (req, res) => {
    try {
        const { userId } = req.body;
        const vitals = await vitalReadingModel.find({ userId }).sort({ timestamp: -1 });

        return res.json({
            success: true,
            vitals,
            count: vitals.length
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/vitals/:appointmentId
export const getAppointmentVitals = async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const requesterId = req.userId || req.body?.userId || req.docId || req.body?.docId;

        const appointment = await appointmentModel.findById(appointmentId).select('userId docId');
        if (!appointment) {
            return res.status(404).json({ success: false, message: 'Appointment not found' });
        }

        const isAuthorized =
            (requesterId &&
                (String(appointment.userId) === String(requesterId) ||
                    String(appointment.docId) === String(requesterId))) ||
            req.isAdmin;

        if (!isAuthorized) {
            return res.status(403).json({ success: false, message: 'Unauthorized to view vitals for this appointment' });
        }

        const vitals = await vitalReadingModel.find({ appointmentId }).sort({ timestamp: -1 });

        return res.json({
            success: true,
            vitals,
            count: vitals.length
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
