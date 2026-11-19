import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../../src/context/AppContext';
import { BackendServerBox } from '../../src/components/BackendServerBox';
import {
  BLOOD_GROUPS,
  COMMON_ALLERGY_OPTIONS,
  COMMON_CHRONIC_CONDITIONS,
  MedicationEntry,
  UserData,
  calculateBmi,
  calculateProfileCompleteness,
} from '../../src/utils/clinical';
import { COLORS, RADIUS, SPACING } from '../../src/theme/tokens';

const GENDER_OPTIONS = ['Male', 'Female', 'Other'] as const;

export default function ProfileScreen() {
  const router = useRouter();
  const {
    token,
    backendUrl,
    userData,
    setUserData,
    loadUserProfileData,
    logout,
  } = useAppContext();

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<UserData | null>(null);
  const [newAllergy, setNewAllergy] = useState('');
  const [newMedName, setNewMedName] = useState('');
  const [newMedDosage, setNewMedDosage] = useState('');
  const [newCondition, setNewCondition] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (userData) {
      setDraft({
        ...userData,
        address: { line1: userData.address?.line1 || '', line2: userData.address?.line2 || '' },
        emergencyContact: {
          name: userData.emergencyContact?.name || '',
          relation: userData.emergencyContact?.relation || '',
          phone: userData.emergencyContact?.phone || '',
        },
        allergies: [...(userData.allergies || [])],
        currentMedications: [...(userData.currentMedications || [])],
        chronicConditions: [...(userData.chronicConditions || [])],
      });
    } else {
      setDraft(null);
    }
  }, [userData]);

  const activeData = isEditing ? draft : userData;
  const completeness = useMemo(() => calculateProfileCompleteness(activeData), [activeData]);
  const bmi = useMemo(
    () => calculateBmi(activeData?.heightCm, activeData?.weightKg),
    [activeData?.heightCm, activeData?.weightKg]
  );

  const normalizedMeds = useMemo<MedicationEntry[]>(() => {
    const list = activeData?.currentMedications || [];
    return list
      .map((item) =>
        typeof item === 'string'
          ? { name: item, dosage: '' }
          : { name: item?.name || '', dosage: item?.dosage || '' }
      )
      .filter((m) => m.name);
  }, [activeData?.currentMedications]);

  const updateDraft = (patch: Partial<UserData>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const toggleAllergy = (item: string) => {
    if (!draft) return;
    const current = draft.allergies || [];
    const exists = current.some((a) => a.toLowerCase() === item.toLowerCase());
    const next = exists
      ? current.filter((a) => a.toLowerCase() !== item.toLowerCase())
      : [...current, item];
    updateDraft({
      allergies: next,
      noKnownAllergies: next.length > 0 ? false : draft.noKnownAllergies,
    });
  };

  const addCustomAllergy = () => {
    if (!draft) return;
    const clean = newAllergy.trim();
    if (!clean) return;
    if (!(draft.allergies || []).some((a) => a.toLowerCase() === clean.toLowerCase())) {
      updateDraft({
        allergies: [...(draft.allergies || []), clean],
        noKnownAllergies: false,
      });
    }
    setNewAllergy('');
  };

  const addMedication = () => {
    if (!draft) return;
    const cleanName = newMedName.trim();
    if (!cleanName) return;
    const existing = normalizedMeds;
    updateDraft({
      currentMedications: [...existing, { name: cleanName, dosage: newMedDosage.trim() }],
      noCurrentMedications: false,
    });
    setNewMedName('');
    setNewMedDosage('');
  };

  const removeMedication = (idx: number) => {
    if (!draft) return;
    updateDraft({
      currentMedications: normalizedMeds.filter((_, i) => i !== idx),
    });
  };

  const toggleCondition = (item: string) => {
    if (!draft) return;
    const current = draft.chronicConditions || [];
    const exists = current.some((c) => c.toLowerCase() === item.toLowerCase());
    const next = exists
      ? current.filter((c) => c.toLowerCase() !== item.toLowerCase())
      : [...current, item];
    updateDraft({
      chronicConditions: next,
      noChronicConditions: next.length > 0 ? false : draft.noChronicConditions,
    });
  };

  const addCustomCondition = () => {
    if (!draft) return;
    const clean = newCondition.trim();
    if (!clean) return;
    if (!(draft.chronicConditions || []).some((c) => c.toLowerCase() === clean.toLowerCase())) {
      updateDraft({
        chronicConditions: [...(draft.chronicConditions || []), clean],
        noChronicConditions: false,
      });
    }
    setNewCondition('');
  };

  const handleSave = async () => {
    if (!draft || !token) return;
    if (!draft.name?.trim()) {
      setFeedback({ ok: false, text: 'Patient name cannot be empty.' });
      return;
    }

    const finalAllergies = [...(draft.allergies || [])];
    let finalNoAllergies = Boolean(draft.noKnownAllergies);
    if (newAllergy.trim()) {
      finalAllergies.push(newAllergy.trim());
      finalNoAllergies = false;
      setNewAllergy('');
    }

    const finalMeds = [...normalizedMeds];
    let finalNoMeds = Boolean(draft.noCurrentMedications);
    if (newMedName.trim()) {
      finalMeds.push({ name: newMedName.trim(), dosage: newMedDosage.trim() });
      finalNoMeds = false;
      setNewMedName('');
      setNewMedDosage('');
    }

    const finalConditions = [...(draft.chronicConditions || [])];
    let finalNoConditions = Boolean(draft.noChronicConditions);
    if (newCondition.trim()) {
      finalConditions.push(newCondition.trim());
      finalNoConditions = false;
      setNewCondition('');
    }

    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        name: draft.name.trim(),
        phone: draft.phone?.trim() || '000000000',
        address: draft.address || { line1: '', line2: '' },
        gender: draft.gender || 'Not Selected',
        dob: draft.dob?.trim() || 'Not Selected',
        bloodGroup: draft.bloodGroup || '',
        heightCm: draft.heightCm ? String(draft.heightCm) : '',
        weightKg: draft.weightKg ? String(draft.weightKg) : '',
        emergencyContact: draft.emergencyContact || {},
        allergies: finalNoAllergies ? [] : finalAllergies,
        noKnownAllergies: finalNoAllergies,
        currentMedications: finalNoMeds ? [] : finalMeds,
        noCurrentMedications: finalNoMeds,
        chronicConditions: finalNoConditions ? [] : finalConditions,
        noChronicConditions: finalNoConditions,
        onboardingCompleted: true,
      };

      const { data } = await axios.post(`${backendUrl}/api/user/update-profile`, payload, {
        headers: { token },
      });

      if (data.success) {
        if (data.userData) setUserData(data.userData);
        await loadUserProfileData();
        setIsEditing(false);
        setFeedback({ ok: true, text: 'Medical profile saved and synced.' });
      } else {
        setFeedback({ ok: false, text: data.message || 'Unable to save medical profile.' });
      }
    } catch (err: any) {
      setFeedback({ ok: false, text: err?.message || 'Save request failed.' });
    } finally {
      setSaving(false);
    }
  };

  if (!token) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.pageTitle}>Patient dossier</Text>

          <View style={styles.guestCard}>
            <Ionicons name="shield-checkmark-outline" size={28} color={COLORS.cobalt} />
            <Text style={styles.guestTitle}>Sign in to manage your clinical profile</Text>
            <Text style={styles.guestBody}>
              Store drug allergies, active medications, blood group, BMI metrics, and emergency
              contacts for safer prescribing.
            </Text>
            <Pressable
              onPress={() => router.push('/auth')}
              style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.primaryBtnText}>Sign in or register</Text>
            </Pressable>
          </View>

          <BackendServerBox />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.pageTitle}>Patient dossier</Text>
            <Text style={styles.pageSubtitle}>{activeData?.email || ''}</Text>
          </View>
          <Pressable
            onPress={() => {
              setFeedback(null);
              if (isEditing && userData) {
                setDraft(userData);
              }
              setIsEditing((v) => !v);
            }}
            style={styles.editToggleBtn}
          >
            <Ionicons
              name={isEditing ? 'close-outline' : 'create-outline'}
              size={16}
              color={COLORS.ink}
            />
            <Text style={styles.editToggleText}>{isEditing ? 'Cancel' : 'Edit dossier'}</Text>
          </Pressable>
        </View>

        {feedback && (
          <View
            style={[
              styles.feedbackBanner,
              {
                backgroundColor: feedback.ok ? COLORS.vitalGreenSoft : COLORS.alertRoseSoft,
                borderColor: feedback.ok ? '#99F6E4' : '#FECDD3',
              },
            ]}
          >
            <Text
              style={[
                styles.feedbackText,
                { color: feedback.ok ? COLORS.vitalGreen : COLORS.alertRose },
              ]}
            >
              {feedback.text}
            </Text>
          </View>
        )}

        {/* Completeness Card */}
        <View style={styles.card}>
          <View style={styles.completenessTop}>
            <Text style={styles.cardTitle}>Profile completeness</Text>
            <Text style={styles.percentText}>{completeness.percentage}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${completeness.percentage}%`,
                  backgroundColor:
                    completeness.percentage >= 80 ? COLORS.vitalGreen : COLORS.cobalt,
                },
              ]}
            />
          </View>
          {completeness.missingFields.length > 0 ? (
            <Text style={styles.missingText}>
              Missing: {completeness.missingFields.join(', ')}
            </Text>
          ) : (
            <Text style={styles.completeText}>All clinical baseline fields recorded.</Text>
          )}
        </View>

        {/* Identity & Contact */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal & contact details</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Full name</Text>
            {isEditing ? (
              <TextInput
                value={draft?.name || ''}
                onChangeText={(t) => updateDraft({ name: t })}
                style={styles.input}
                placeholder="Patient full name"
              />
            ) : (
              <Text style={styles.value}>{activeData?.name || 'Not set'}</Text>
            )}
          </View>

          <View style={styles.row2}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.label}>Mobile phone</Text>
              {isEditing ? (
                <TextInput
                  value={draft?.phone === '000000000' ? '' : draft?.phone || ''}
                  onChangeText={(t) => updateDraft({ phone: t })}
                  style={styles.input}
                  keyboardType="phone-pad"
                  placeholder="+91 9876543210"
                />
              ) : (
                <Text style={styles.value}>
                  {activeData?.phone && activeData.phone !== '000000000'
                    ? activeData.phone
                    : 'Not recorded'}
                </Text>
              )}
            </View>

            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.label}>Date of birth</Text>
              {isEditing ? (
                <TextInput
                  value={draft?.dob === 'Not Selected' ? '' : draft?.dob || ''}
                  onChangeText={(t) => updateDraft({ dob: t })}
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                />
              ) : (
                <Text style={styles.value}>
                  {activeData?.dob && activeData.dob !== 'Not Selected'
                    ? activeData.dob
                    : 'Not recorded'}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Gender</Text>
            {isEditing ? (
              <View style={styles.chipRow}>
                {GENDER_OPTIONS.map((g) => {
                  const selected = draft?.gender === g;
                  return (
                    <Pressable
                      key={g}
                      onPress={() => updateDraft({ gender: g })}
                      style={[styles.choiceChip, selected && styles.choiceChipActive]}
                    >
                      <Text
                        style={[styles.choiceChipText, selected && styles.choiceChipTextActive]}
                      >
                        {g}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.value}>{activeData?.gender || 'Not Selected'}</Text>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Residential address</Text>
            {isEditing ? (
              <View style={{ gap: 8 }}>
                <TextInput
                  value={draft?.address?.line1 || ''}
                  onChangeText={(t) =>
                    updateDraft({ address: { ...draft?.address, line1: t } })
                  }
                  style={styles.input}
                  placeholder="Street / apartment"
                />
                <TextInput
                  value={draft?.address?.line2 || ''}
                  onChangeText={(t) =>
                    updateDraft({ address: { ...draft?.address, line2: t } })
                  }
                  style={styles.input}
                  placeholder="City / postal code"
                />
              </View>
            ) : (
              <Text style={styles.value}>
                {[activeData?.address?.line1, activeData?.address?.line2]
                  .filter(Boolean)
                  .join(', ') || 'Not recorded'}
              </Text>
            )}
          </View>
        </View>

        {/* Vitals & Anthropometrics */}
        <View style={styles.card}>
          <View style={styles.cardHeaderBetween}>
            <Text style={styles.cardTitle}>Vitals & baseline metrics</Text>
            {bmi && (
              <View style={styles.bmiPill}>
                <Text style={styles.bmiText}>
                  BMI {bmi.value} ({bmi.category})
                </Text>
              </View>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Blood group</Text>
            {isEditing ? (
              <View style={styles.chipRow}>
                {BLOOD_GROUPS.map((bg) => {
                  const selected = draft?.bloodGroup === bg;
                  return (
                    <Pressable
                      key={bg}
                      onPress={() => updateDraft({ bloodGroup: bg })}
                      style={[styles.choiceChip, selected && styles.choiceChipActive]}
                    >
                      <Text
                        style={[styles.choiceChipText, selected && styles.choiceChipTextActive]}
                      >
                        {bg}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.value}>{activeData?.bloodGroup || 'Not recorded'}</Text>
            )}
          </View>

          <View style={styles.row2}>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.label}>Height (cm)</Text>
              {isEditing ? (
                <TextInput
                  value={draft?.heightCm ? String(draft.heightCm) : ''}
                  onChangeText={(t) => updateDraft({ heightCm: t })}
                  keyboardType="numeric"
                  style={styles.input}
                  placeholder="170"
                />
              ) : (
                <Text style={styles.value}>
                  {activeData?.heightCm ? `${activeData.heightCm} cm` : 'Not recorded'}
                </Text>
              )}
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={styles.label}>Weight (kg)</Text>
              {isEditing ? (
                <TextInput
                  value={draft?.weightKg ? String(draft.weightKg) : ''}
                  onChangeText={(t) => updateDraft({ weightKg: t })}
                  keyboardType="numeric"
                  style={styles.input}
                  placeholder="68"
                />
              ) : (
                <Text style={styles.value}>
                  {activeData?.weightKg ? `${activeData.weightKg} kg` : 'Not recorded'}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Allergies */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Drug & food allergies</Text>

          {isEditing && (
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>No known allergies</Text>
              <Switch
                value={Boolean(draft?.noKnownAllergies)}
                onValueChange={(val) =>
                  updateDraft({
                    noKnownAllergies: val,
                    allergies: val ? [] : draft?.allergies || [],
                  })
                }
                trackColor={{ true: COLORS.vitalGreen, false: COLORS.border }}
              />
            </View>
          )}

          {activeData?.noKnownAllergies ? (
            <View style={styles.safeNote}>
              <Text style={styles.safeNoteText}>Confirmed: No known drug or food allergies.</Text>
            </View>
          ) : (
            <View style={styles.chipRow}>
              {(activeData?.allergies || []).length > 0 ? (
                activeData!.allergies!.map((alg, idx) => (
                  <View key={`${alg}-${idx}`} style={styles.allergyChip}>
                    <Text style={styles.allergyChipText}>{alg}</Text>
                    {isEditing && (
                      <Pressable onPress={() => toggleAllergy(alg)}>
                        <Ionicons name="close-circle" size={16} color={COLORS.alertRose} />
                      </Pressable>
                    )}
                  </View>
                ))
              ) : (
                <Text style={styles.mutedText}>No allergies listed yet.</Text>
              )}
            </View>
          )}

          {isEditing && !draft?.noKnownAllergies && (
            <View style={{ gap: 10 }}>
              <Text style={styles.label}>Quick add common allergies</Text>
              <View style={styles.chipRow}>
                {COMMON_ALLERGY_OPTIONS.map((opt) => {
                  const selected = (draft?.allergies || []).some(
                    (a) => a.toLowerCase() === opt.toLowerCase()
                  );
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => toggleAllergy(opt)}
                      style={[styles.choiceChip, selected && styles.choiceChipRose]}
                    >
                      <Text
                        style={[
                          styles.choiceChipText,
                          selected && { color: COLORS.alertRose },
                        ]}
                      >
                        {opt}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.addRow}>
                <TextInput
                  value={newAllergy}
                  onChangeText={setNewAllergy}
                  placeholder="Add custom allergy"
                  style={[styles.input, { flex: 1 }]}
                />
                <Pressable onPress={addCustomAllergy} style={styles.addBtn}>
                  <Text style={styles.addBtnText}>Add</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {/* Current Medications */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current medications</Text>

          {isEditing && (
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>No regular medications</Text>
              <Switch
                value={Boolean(draft?.noCurrentMedications)}
                onValueChange={(val) =>
                  updateDraft({
                    noCurrentMedications: val,
                    currentMedications: val ? [] : draft?.currentMedications || [],
                  })
                }
                trackColor={{ true: COLORS.vitalGreen, false: COLORS.border }}
              />
            </View>
          )}

          {activeData?.noCurrentMedications ? (
            <View style={styles.safeNote}>
              <Text style={styles.safeNoteText}>Confirmed: Not taking any regular medicines.</Text>
            </View>
          ) : normalizedMeds.length > 0 ? (
            <View style={{ gap: 8 }}>
              {normalizedMeds.map((m, idx) => (
                <View key={`${m.name}-${idx}`} style={styles.medRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.medName}>{m.name}</Text>
                    {Boolean(m.dosage) && <Text style={styles.medDosage}>{m.dosage}</Text>}
                  </View>
                  {isEditing && (
                    <Pressable onPress={() => removeMedication(idx)}>
                      <Ionicons name="trash-outline" size={17} color={COLORS.alertRose} />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.mutedText}>No regular medications listed.</Text>
          )}

          {isEditing && !draft?.noCurrentMedications && (
            <View style={{ gap: 8 }}>
              <View style={styles.row2}>
                <TextInput
                  value={newMedName}
                  onChangeText={setNewMedName}
                  placeholder="Medicine name"
                  style={[styles.input, { flex: 1.3 }]}
                />
                <TextInput
                  value={newMedDosage}
                  onChangeText={setNewMedDosage}
                  placeholder="Dosage (e.g. 500mg)"
                  style={[styles.input, { flex: 1 }]}
                />
              </View>
              <Pressable onPress={addMedication} style={styles.secondaryFullBtn}>
                <Text style={styles.secondaryFullBtnText}>Add medication to list</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Chronic Conditions */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Chronic medical conditions</Text>

          {isEditing && (
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>No chronic conditions</Text>
              <Switch
                value={Boolean(draft?.noChronicConditions)}
                onValueChange={(val) =>
                  updateDraft({
                    noChronicConditions: val,
                    chronicConditions: val ? [] : draft?.chronicConditions || [],
                  })
                }
                trackColor={{ true: COLORS.vitalGreen, false: COLORS.border }}
              />
            </View>
          )}

          {activeData?.noChronicConditions ? (
            <View style={styles.safeNote}>
              <Text style={styles.safeNoteText}>Confirmed: No chronic conditions reported.</Text>
            </View>
          ) : (
            <View style={styles.chipRow}>
              {(activeData?.chronicConditions || []).length > 0 ? (
                activeData!.chronicConditions!.map((cond, idx) => (
                  <View key={`${cond}-${idx}`} style={styles.condChip}>
                    <Text style={styles.condChipText}>{cond}</Text>
                    {isEditing && (
                      <Pressable onPress={() => toggleCondition(cond)}>
                        <Ionicons name="close-circle" size={16} color={COLORS.cobalt} />
                      </Pressable>
                    )}
                  </View>
                ))
              ) : (
                <Text style={styles.mutedText}>No chronic conditions listed.</Text>
              )}
            </View>
          )}

          {isEditing && !draft?.noChronicConditions && (
            <View style={{ gap: 10 }}>
              <View style={styles.chipRow}>
                {COMMON_CHRONIC_CONDITIONS.map((opt) => {
                  const selected = (draft?.chronicConditions || []).some(
                    (c) => c.toLowerCase() === opt.toLowerCase()
                  );
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => toggleCondition(opt)}
                      style={[styles.choiceChip, selected && styles.choiceChipActive]}
                    >
                      <Text
                        style={[styles.choiceChipText, selected && styles.choiceChipTextActive]}
                      >
                        {opt}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.addRow}>
                <TextInput
                  value={newCondition}
                  onChangeText={setNewCondition}
                  placeholder="Add custom condition"
                  style={[styles.input, { flex: 1 }]}
                />
                <Pressable onPress={addCustomCondition} style={styles.addBtn}>
                  <Text style={styles.addBtnText}>Add</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {/* Emergency Contact */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Emergency contact</Text>
          {isEditing ? (
            <View style={{ gap: 8 }}>
              <TextInput
                value={draft?.emergencyContact?.name || ''}
                onChangeText={(t) =>
                  updateDraft({
                    emergencyContact: { ...draft?.emergencyContact, name: t },
                  })
                }
                placeholder="Contact full name"
                style={styles.input}
              />
              <View style={styles.row2}>
                <TextInput
                  value={draft?.emergencyContact?.relation || ''}
                  onChangeText={(t) =>
                    updateDraft({
                      emergencyContact: { ...draft?.emergencyContact, relation: t },
                    })
                  }
                  placeholder="Relationship"
                  style={[styles.input, { flex: 1 }]}
                />
                <TextInput
                  value={draft?.emergencyContact?.phone || ''}
                  onChangeText={(t) =>
                    updateDraft({
                      emergencyContact: { ...draft?.emergencyContact, phone: t },
                    })
                  }
                  placeholder="Emergency phone"
                  keyboardType="phone-pad"
                  style={[styles.input, { flex: 1 }]}
                />
              </View>
            </View>
          ) : (
            <Text style={styles.value}>
              {activeData?.emergencyContact?.name
                ? `${activeData.emergencyContact.name} (${activeData.emergencyContact.relation || 'Contact'}) — ${activeData.emergencyContact.phone || 'No phone'}`
                : 'No emergency contact recorded'}
            </Text>
          )}
        </View>

        {isEditing && (
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveMainBtn,
              saving && { opacity: 0.6 },
              pressed && { opacity: 0.9 },
            ]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveMainBtnText}>Save medical profile</Text>
            )}
          </Pressable>
        )}

        <BackendServerBox />

        <Pressable
          onPress={logout}
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="log-out-outline" size={17} color={COLORS.alertRose} />
          <Text style={styles.logoutBtnText}>Sign out of patient portal</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.canvas,
  },
  scrollContent: {
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: 36,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.ink,
  },
  pageSubtitle: {
    fontSize: 12,
    color: COLORS.inkSecondary,
    marginTop: 2,
  },
  editToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
  },
  editToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.ink,
  },
  feedbackBanner: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: '600',
  },
  guestCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    gap: SPACING.md,
    alignItems: 'flex-start',
  },
  guestTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.ink,
  },
  guestBody: {
    fontSize: 13,
    color: COLORS.inkSecondary,
    lineHeight: 19,
  },
  primaryBtn: {
    backgroundColor: COLORS.cobalt,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  cardHeaderBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.ink,
  },
  completenessTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  percentText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: COLORS.surfaceMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  missingText: {
    fontSize: 12,
    color: COLORS.inkSecondary,
    lineHeight: 17,
  },
  completeText: {
    fontSize: 12,
    color: COLORS.vitalGreen,
    fontWeight: '600',
  },
  field: {
    gap: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.inkMuted,
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.ink,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.canvas,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: COLORS.ink,
  },
  row2: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.canvas,
  },
  choiceChipActive: {
    backgroundColor: COLORS.cobaltSoft,
    borderColor: COLORS.cobalt,
  },
  choiceChipRose: {
    backgroundColor: COLORS.alertRoseSoft,
    borderColor: '#FDA4AF',
  },
  choiceChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.inkSecondary,
  },
  choiceChipTextActive: {
    color: COLORS.cobalt,
  },
  bmiPill: {
    backgroundColor: COLORS.cobaltSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.pill,
  },
  bmiText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.cobalt,
    fontVariant: ['tabular-nums'],
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.canvas,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.ink,
  },
  safeNote: {
    backgroundColor: COLORS.vitalGreenSoft,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: RADIUS.sm,
  },
  safeNoteText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.vitalGreen,
  },
  allergyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.alertRoseSoft,
    borderWidth: 1,
    borderColor: '#FECDD3',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
  },
  allergyChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.alertRose,
  },
  condChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.cobaltSoft,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
  },
  condChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.cobalt,
  },
  mutedText: {
    fontSize: 13,
    color: COLORS.inkMuted,
  },
  addRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addBtn: {
    backgroundColor: COLORS.ink,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  medRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  medName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.ink,
  },
  medDosage: {
    fontSize: 12,
    color: COLORS.inkSecondary,
  },
  secondaryFullBtn: {
    backgroundColor: COLORS.surfaceMuted,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  secondaryFullBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.ink,
  },
  saveMainBtn: {
    backgroundColor: COLORS.cobalt,
    paddingVertical: 15,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  saveMainBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: '#FECDD3',
    paddingVertical: 13,
    borderRadius: RADIUS.md,
  },
  logoutBtnText: {
    color: COLORS.alertRose,
    fontSize: 14,
    fontWeight: '700',
  },
});
