import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { SafetyReport, useAppContext } from '../src/context/AppContext';
import { COLORS, RADIUS, SPACING, getRiskStyle } from '../src/theme/tokens';

const SAMPLE_PAIRS = [
  { label: 'Warfarin + Aspirin', meds: ['Warfarin', 'Aspirin'] },
  { label: 'Ibuprofen + Lisinopril', meds: ['Ibuprofen', 'Lisinopril'] },
  { label: 'Paracetamol + Cetirizine', meds: ['Paracetamol', 'Cetirizine'] },
  { label: 'Metformin + Atorvastatin', meds: ['Metformin', 'Atorvastatin'] },
];

export default function DrugCheckerScreen() {
  const router = useRouter();
  const { backendUrl, token, userData } = useAppContext();

  const [medicines, setMedicines] = useState<Array<{ name: string }>>([
    { name: '' },
    { name: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<SafetyReport | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const addMedicine = () => setMedicines((prev) => [...prev, { name: '' }]);

  const removeMedicine = (index: number) => {
    if (medicines.length <= 1) return;
    setMedicines((prev) => prev.filter((_, i) => i !== index));
  };

  const updateMedicine = (index: number, value: string) => {
    setMedicines((prev) => prev.map((m, i) => (i === index ? { name: value } : m)));
  };

  const loadSample = (meds: string[]) => {
    setMedicines(meds.map((name) => ({ name })));
    setReport(null);
    setErrorMsg('');
  };

  const runCheck = async () => {
    const validMeds = medicines.filter((m) => m.name.trim());
    if (validMeds.length === 0) {
      setErrorMsg('Enter at least one medicine name to run a safety check.');
      return;
    }

    setErrorMsg('');
    setLoading(true);
    setReport(null);

    try {
      const { data } = await axios.post(`${backendUrl}/api/ddi/check`, {
        medicines: validMeds,
        userId: token && userData?._id ? userData._id : undefined,
        patientAllergies: userData?.allergies || [],
        currentMedications: userData?.currentMedications || [],
      });

      if (data.success && data.report) {
        setReport(data.report);
      } else {
        setErrorMsg(data.message || 'Unable to evaluate drug interactions.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Safety engine request failed.');
    } finally {
      setLoading(false);
    }
  };

  const userAllergies = userData?.allergies || [];
  const riskStyle = getRiskStyle(report?.overallRisk);
  const allergyAlerts = report?.allergyAlerts || [];
  const interactions = report?.interactions || [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Patient Profile Link Card */}
      {token && userData && (
        <View style={styles.profileStrip}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.profileTitle}>Screening for {userData.name}</Text>
            <Text style={styles.profileSub}>
              {userAllergies.length > 0
                ? `Allergies included: ${userAllergies.join(', ')}`
                : 'No recorded allergies in your dossier.'}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/profile')}>
            <Text style={styles.updateLink}>Edit dossier</Text>
          </Pressable>
        </View>
      )}

      {/* Sample Pairs */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Quick clinical examples</Text>
        <View style={styles.samplesWrap}>
          {SAMPLE_PAIRS.map((pair) => (
            <Pressable
              key={pair.label}
              onPress={() => loadSample(pair.meds)}
              style={styles.sampleChip}
            >
              <Text style={styles.sampleText}>{pair.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Inputs */}
        <View style={styles.divider} />
        <Text style={styles.cardTitle}>Medicines to compare</Text>

        <View style={{ gap: 10 }}>
          {medicines.map((med, idx) => (
            <View key={idx} style={styles.inputRow}>
              <TextInput
                value={med.name}
                onChangeText={(val) => updateMedicine(idx, val)}
                placeholder={`Medicine #${idx + 1} (e.g. Aspirin, Metformin)`}
                placeholderTextColor={COLORS.inkMuted}
                style={styles.input}
              />
              {medicines.length > 1 && (
                <Pressable
                  onPress={() => removeMedicine(idx)}
                  style={styles.removeBtn}
                >
                  <Ionicons name="trash-outline" size={17} color={COLORS.alertRose} />
                </Pressable>
              )}
            </View>
          ))}
        </View>

        {Boolean(errorMsg) && <Text style={styles.errorText}>{errorMsg}</Text>}

        <View style={styles.btnRow}>
          <Pressable onPress={addMedicine} style={styles.addBtn}>
            <Ionicons name="add" size={16} color={COLORS.ink} />
            <Text style={styles.addBtnText}>Add medicine</Text>
          </Pressable>

          <Pressable
            onPress={runCheck}
            disabled={loading}
            style={[styles.runBtn, loading && { opacity: 0.6 }]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.runBtnText}>Run safety check</Text>
            )}
          </Pressable>
        </View>
      </View>

      {/* Report Results */}
      {report && (
        <View
          style={[
            styles.reportCard,
            { backgroundColor: riskStyle.bg, borderColor: riskStyle.border },
          ]}
        >
          <View style={styles.reportTop}>
            <View style={[styles.riskBadge, { backgroundColor: riskStyle.badgeBg }]}>
              <Text style={styles.riskBadgeText}>{riskStyle.label}</Text>
            </View>
            <Text style={styles.reportCounts}>
              {interactions.length} interaction{interactions.length === 1 ? '' : 's'},{' '}
              {allergyAlerts.length} allergy alert{allergyAlerts.length === 1 ? '' : 's'}
            </Text>
          </View>

          {Boolean(report.aiSummary || report.summary) && (
            <View style={styles.whiteBox}>
              <Text style={styles.boxHeading}>Clinical safety summary</Text>
              <Text style={styles.boxText}>{report.aiSummary || report.summary}</Text>
            </View>
          )}

          {allergyAlerts.map((alert, idx) => (
            <View key={`a-${idx}`} style={styles.whiteBox}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemTitle}>
                  Allergy {alert.allergen} ↔ {alert.drug}
                </Text>
                <Text style={styles.severityRose}>{alert.severity}</Text>
              </View>
              {Boolean(alert.effect) && <Text style={styles.boxText}>{alert.effect}</Text>}
              {Boolean(alert.recommendation) && (
                <Text style={styles.precautionText}>{alert.recommendation}</Text>
              )}
            </View>
          ))}

          {interactions.map((item, idx) => (
            <View key={`d-${idx}`} style={styles.whiteBox}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemTitle}>
                  {item.drugA} ↔ {item.drugB}
                </Text>
                <Text
                  style={[
                    styles.severityBadge,
                    {
                      color:
                        item.severity === 'SEVERE'
                          ? COLORS.alertRose
                          : COLORS.cautionAmber,
                    },
                  ]}
                >
                  {item.severity}
                </Text>
              </View>
              {Boolean(item.mechanism) && (
                <Text style={styles.boxText}>
                  <Text style={{ fontWeight: '700' }}>Mechanism: </Text>
                  {item.mechanism}
                </Text>
              )}
              {Boolean(item.effect) && (
                <Text style={styles.boxText}>
                  <Text style={{ fontWeight: '700' }}>Clinical effect: </Text>
                  {item.effect}
                </Text>
              )}
              {Boolean(item.recommendation) && (
                <Text style={styles.precautionText}>{item.recommendation}</Text>
              )}
            </View>
          ))}

          {report.overallRisk === 'SEVERE' && (
            <Pressable
              onPress={() => router.push('/(tabs)/doctors')}
              style={styles.consultBtn}
            >
              <Text style={styles.consultBtnText}>Consult a specialist</Text>
            </Pressable>
          )}

          <Text style={styles.disclaimer}>
            Screening is informational support and does not replace advice from a licensed
            physician or pharmacist.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: 36,
  },
  profileStrip: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  profileTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.ink,
  },
  profileSub: {
    fontSize: 12,
    color: COLORS.inkSecondary,
  },
  updateLink: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.cobalt,
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
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.ink,
  },
  samplesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sampleChip: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
  },
  sampleText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.ink,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.canvas,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.ink,
  },
  removeBtn: {
    padding: 10,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.alertRoseSoft,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.alertRose,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.canvas,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.ink,
  },
  runBtn: {
    flex: 1,
    backgroundColor: COLORS.cobalt,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  reportCard: {
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  reportTop: {
    gap: 6,
    alignItems: 'flex-start',
  },
  riskBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
  },
  riskBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  reportCounts: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.ink,
  },
  whiteBox: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: 6,
  },
  boxHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.ink,
  },
  boxText: {
    fontSize: 13,
    color: COLORS.inkSecondary,
    lineHeight: 19,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.ink,
    flex: 1,
  },
  severityRose: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.alertRose,
  },
  severityBadge: {
    fontSize: 11,
    fontWeight: '800',
  },
  precautionText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.cobalt,
    backgroundColor: COLORS.cobaltSoft,
    padding: 9,
    borderRadius: RADIUS.sm,
  },
  consultBtn: {
    backgroundColor: COLORS.alertRose,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  consultBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  disclaimer: {
    fontSize: 11,
    color: COLORS.inkSecondary,
    lineHeight: 16,
  },
});
