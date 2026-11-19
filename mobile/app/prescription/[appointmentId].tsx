import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafetyReport, useAppContext } from '../../src/context/AppContext';
import { formatDoctorName } from '../../src/utils/clinical';
import { COLORS, RADIUS, SPACING, getRiskStyle } from '../../src/theme/tokens';

interface PrescriptionMedicine {
  name: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}

interface PrescriptionRecord {
  _id: string;
  userId?: string;
  diagnosis?: string;
  medicines?: PrescriptionMedicine[];
  notes?: string;
  followUpDate?: string;
  prescriptionHash?: string;
  isVerified?: boolean;
  createdAt?: string;
  safetyReport?: SafetyReport;
  appointmentId?: {
    docData?: {
      name?: string;
      speciality?: string;
      degree?: string;
    };
    userData?: {
      name?: string;
      gender?: string;
      dob?: string;
      allergies?: string[];
    };
  };
}

export default function PrescriptionScreen() {
  const router = useRouter();
  const { appointmentId } = useLocalSearchParams<{ appointmentId: string }>();
  const { backendUrl, token, isHydrated, userData, socket } = useAppContext();

  const [prescription, setPrescription] = useState<PrescriptionRecord | null>(null);
  const [patientAllergies, setPatientAllergies] = useState<string[]>([]);
  const [patientMeds, setPatientMeds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifying, setNotifying] = useState(false);
  const [alertNotice, setAlertNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchPrescription = useCallback(async () => {
    if (!token || !appointmentId) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await axios.get(
        `${backendUrl}/api/prescription/patient/${appointmentId}`,
        { headers: { token } }
      );
      if (data.success && data.prescription) {
        setPrescription(data.prescription);
        if (data.user) {
          setPatientAllergies(data.user.allergies || []);
          setPatientMeds(data.user.currentMedications || []);
        }
      }
    } catch (err) {
      console.warn('Prescription fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [appointmentId, backendUrl, token]);

  useEffect(() => {
    fetchPrescription();
  }, [fetchPrescription]);

  useEffect(() => {
    if (!socket || !appointmentId) return;
    const handleUpdate = (payload: { appointmentId?: string }) => {
      if (!payload?.appointmentId || String(payload.appointmentId) === String(appointmentId)) {
        fetchPrescription();
      }
    };
    socket.on('prescription-updated', handleUpdate);
    return () => {
      socket.off('prescription-updated', handleUpdate);
    };
  }, [socket, appointmentId, fetchPrescription]);

  const handleNotifyConflict = async () => {
    if (!prescription || notifying) return;
    setNotifying(true);
    setAlertNotice(null);
    try {
      const { data } = await axios.post(`${backendUrl}/api/ddi/check`, {
        medicines: prescription.medicines || [],
        userId: userData?._id || prescription.userId,
        appointmentId,
        patientAllergies: patientAllergies.length ? patientAllergies : userData?.allergies || [],
        currentMedications: patientMeds.length
          ? patientMeds
          : userData?.currentMedications || [],
        notifyDoctorOnConflict: true,
      });
      if (data.success) {
        if (data.report) {
          setPrescription((prev) => (prev ? { ...prev, safetyReport: data.report } : prev));
        }
        setAlertNotice({
          ok: true,
          text: 'Your prescribing physician has been notified of this conflict.',
        });
      } else {
        setAlertNotice({ ok: false, text: data.message || 'Unable to notify doctor.' });
      }
    } catch (err: any) {
      setAlertNotice({ ok: false, text: err?.message || 'Alert request failed.' });
    } finally {
      setNotifying(false);
    }
  };

  if (!isHydrated || (token && loading)) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color={COLORS.cobalt} />
        <Text style={styles.loadingText}>Retrieving digital prescription...</Text>
      </View>
    );
  }

  if (!token) {
    return (
      <Redirect
        href={{
          pathname: '/auth',
          params: {
            redirect: appointmentId
              ? `/prescription/${appointmentId}`
              : '/(tabs)/appointments',
          },
        }}
      />
    );
  }

  if (!prescription) {
    return (
      <View style={styles.centerBox}>
        <View style={styles.emptyIcon}>
          <Ionicons name="document-text-outline" size={30} color={COLORS.inkMuted} />
        </View>
        <Text style={styles.emptyTitle}>No prescription issued yet</Text>
        <Text style={styles.emptyBody}>
          Once your doctor creates and signs your digital prescription, medications and safety checks
          will appear here automatically.
        </Text>
        <Pressable onPress={() => router.back()} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>Back to consultations</Text>
        </Pressable>
      </View>
    );
  }

  const apt = prescription.appointmentId;
  const safety = prescription.safetyReport;
  const riskStyle = getRiskStyle(safety?.overallRisk);
  const allergyAlerts = safety?.allergyAlerts || [];
  const interactions = safety?.interactions || [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Prescription Header Banner */}
      <View style={styles.rxBanner}>
        <View style={styles.rxBannerTop}>
          <View style={styles.verifiedBadge}>
            <Ionicons name="lock-closed" size={12} color="#99F6E4" />
            <Text style={styles.verifiedText}>
              {prescription.isVerified ? 'Digital Rx Verified' : 'Digital Rx'}
            </Text>
          </View>
          <Text style={styles.rxRef}>Ref #{prescription._id.slice(-8).toUpperCase()}</Text>
        </View>

        <Text style={styles.rxTitle}>{formatDoctorName(apt?.docData?.name)}</Text>
        <Text style={styles.rxSubtitle}>
          {apt?.docData?.speciality || 'Telehealth Specialist'}
          {prescription.createdAt
            ? ` · Issued ${new Date(prescription.createdAt).toLocaleDateString()}`
            : ''}
        </Text>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickRow}>
        <Pressable
          onPress={() => router.push(`/chat/${appointmentId}` as any)}
          style={styles.quickBtn}
        >
          <Ionicons name="chatbubble-outline" size={15} color={COLORS.cobalt} />
          <Text style={styles.quickBtnText}>Message doctor</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/drug-checker')}
          style={styles.quickBtn}
        >
          <Ionicons name="shield-checkmark-outline" size={15} color={COLORS.vitalGreen} />
          <Text style={styles.quickBtnText}>Drug safety checker</Text>
        </Pressable>
      </View>

      {/* Clinical Diagnosis */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Clinical diagnosis</Text>
        <Text style={styles.diagnosisText}>
          {prescription.diagnosis || 'Routine clinical teleconsultation completed.'}
        </Text>
      </View>

      {/* Prescribed Medications */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Prescribed medications ({prescription.medicines?.length || 0})
        </Text>
        <View style={{ gap: 10 }}>
          {(prescription.medicines || []).map((med, idx) => (
            <View key={idx} style={styles.medItem}>
              <View style={styles.medTop}>
                <Text style={styles.medName}>{med.name}</Text>
                {Boolean(med.dosage) && <Text style={styles.medDosage}>{med.dosage}</Text>}
              </View>
              <View style={styles.medMetaRow}>
                {Boolean(med.frequency) && (
                  <Text style={styles.medMeta}>Schedule: {med.frequency}</Text>
                )}
                {Boolean(med.duration) && (
                  <Text style={styles.medMeta}>Duration: {med.duration}</Text>
                )}
              </View>
              {Boolean(med.instructions) && (
                <Text style={styles.medInstruction}>{med.instructions}</Text>
              )}
            </View>
          ))}
        </View>
      </View>

      {/* Safety Report */}
      {safety && (
        <View
          style={[
            styles.safetyCard,
            { backgroundColor: riskStyle.bg, borderColor: riskStyle.border },
          ]}
        >
          <View style={styles.safetyTop}>
            <Text style={styles.safetyTitle}>Pharmacological & allergy screening</Text>
            <View style={[styles.riskBadge, { backgroundColor: riskStyle.badgeBg }]}>
              <Text style={styles.riskBadgeText}>{safety.overallRisk || 'SAFE'}</Text>
            </View>
          </View>

          <Text style={[styles.safetySummary, { color: riskStyle.text }]}>
            {safety.aiSummary ||
              safety.summary ||
              'Prescription screened against recorded allergies and medications.'}
          </Text>

          {allergyAlerts.map((alert, idx) => (
            <View key={`alg-${idx}`} style={styles.conflictItem}>
              <Text style={styles.conflictHeader}>
                Allergy: {alert.allergen} · Drug: {alert.drug}
              </Text>
              {Boolean(alert.effect) && (
                <Text style={styles.conflictBody}>{alert.effect}</Text>
              )}
            </View>
          ))}

          {interactions.map((item, idx) => (
            <View key={`ddi-${idx}`} style={styles.conflictItem}>
              <Text style={styles.conflictHeader}>
                {item.drugA} ↔ {item.drugB} ({item.severity})
              </Text>
              {Boolean(item.effect) && <Text style={styles.conflictBody}>{item.effect}</Text>}
            </View>
          ))}

          {safety.overallRisk && safety.overallRisk !== 'SAFE' && (
            <Pressable
              onPress={handleNotifyConflict}
              disabled={notifying}
              style={styles.alertDocBtn}
            >
              {notifying ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="notifications-outline" size={15} color="#FFFFFF" />
                  <Text style={styles.alertDocText}>Alert doctor of conflict</Text>
                </>
              )}
            </Pressable>
          )}

          {alertNotice && (
            <Text
              style={{
                fontSize: 12,
                fontWeight: '700',
                color: alertNotice.ok ? COLORS.vitalGreen : COLORS.alertRose,
              }}
            >
              {alertNotice.text}
            </Text>
          )}
        </View>
      )}

      {/* Advice & Follow-up */}
      {(Boolean(prescription.notes) || Boolean(prescription.followUpDate)) && (
        <View style={styles.card}>
          {Boolean(prescription.notes) && (
            <View style={{ gap: 4 }}>
              <Text style={styles.cardTitle}>Clinical advice</Text>
              <Text style={styles.notesText}>{prescription.notes}</Text>
            </View>
          )}
          {Boolean(prescription.followUpDate) && (
            <View style={styles.followUpStrip}>
              <Ionicons name="calendar-outline" size={15} color={COLORS.cobalt} />
              <Text style={styles.followUpText}>
                Recommended follow-up: {prescription.followUpDate}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Cryptographic Signature Hash */}
      {Boolean(prescription.prescriptionHash) && (
        <View style={styles.hashCard}>
          <Text style={styles.hashLabel}>SHA-256 prescription integrity hash</Text>
          <Text style={styles.hashValue} selectable>
            {prescription.prescriptionHash}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 10,
    backgroundColor: COLORS.canvas,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.inkSecondary,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.ink,
  },
  emptyBody: {
    fontSize: 13,
    color: COLORS.inkSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  primaryBtn: {
    backgroundColor: COLORS.cobalt,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    marginTop: 4,
  },
  secondaryBtnText: {
    color: COLORS.ink,
    fontWeight: '600',
    fontSize: 13,
  },
  container: {
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: 36,
  },
  rxBanner: {
    backgroundColor: COLORS.ink,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: 6,
  },
  rxBannerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(13, 148, 136, 0.25)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  verifiedText: {
    color: '#99F6E4',
    fontSize: 11,
    fontWeight: '700',
  },
  rxRef: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  rxTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
    marginTop: 4,
  },
  rxSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
  },
  quickRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  quickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
  },
  quickBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.ink,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.ink,
  },
  diagnosisText: {
    fontSize: 14,
    color: COLORS.ink,
    lineHeight: 20,
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: 12,
  },
  medItem: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: 12,
    gap: 4,
  },
  medTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  medName: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.ink,
    flex: 1,
  },
  medDosage: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.cobalt,
  },
  medMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  medMeta: {
    fontSize: 12,
    color: COLORS.inkSecondary,
    fontWeight: '500',
  },
  medInstruction: {
    fontSize: 12,
    color: COLORS.inkMuted,
    marginTop: 2,
  },
  safetyCard: {
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  safetyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  safetyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.ink,
    flex: 1,
  },
  riskBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  riskBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  safetySummary: {
    fontSize: 13,
    lineHeight: 19,
  },
  conflictItem: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: RADIUS.sm,
    padding: 10,
    gap: 3,
  },
  conflictHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.ink,
  },
  conflictBody: {
    fontSize: 12,
    color: COLORS.inkSecondary,
    lineHeight: 17,
  },
  alertDocBtn: {
    backgroundColor: COLORS.alertRose,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  alertDocText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  notesText: {
    fontSize: 13,
    color: COLORS.inkSecondary,
    lineHeight: 19,
  },
  followUpStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.cobaltSoft,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: RADIUS.sm,
  },
  followUpText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.cobalt,
  },
  hashCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: 4,
  },
  hashLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.inkMuted,
  },
  hashValue: {
    fontSize: 11,
    color: COLORS.inkSecondary,
    fontVariant: ['tabular-nums'],
  },
});
