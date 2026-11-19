import React, { useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../../src/context/AppContext';
import { DoctorAvatar } from '../../src/components/DoctorAvatar';
import {
  SPECIALITIES,
  calculateBmi,
  calculateProfileCompleteness,
  formatDoctorName,
  slotDateFormat,
} from '../../src/utils/clinical';
import { COLORS, RADIUS, SPACING } from '../../src/theme/tokens';

export default function HomeScreen() {
  const router = useRouter();
  const {
    token,
    userData,
    doctors,
    appointments,
    onlineDoctors,
    isDoctorOnline,
    currencySymbol,
    getDoctorsData,
    getUserAppointments,
    loadUserProfileData,
  } = useAppContext();

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      getDoctorsData(),
      token ? loadUserProfileData() : Promise.resolve(),
      token ? getUserAppointments() : Promise.resolve(),
    ]);
    setRefreshing(false);
  };

  const completeness = useMemo(() => calculateProfileCompleteness(userData), [userData]);
  const bmi = useMemo(
    () => calculateBmi(userData?.heightCm, userData?.weightKg),
    [userData?.heightCm, userData?.weightKg]
  );

  const nextAppointment = useMemo(() => {
    if (!token || !appointments.length) return null;
    const active = appointments.filter((a) => !a.cancelled && !a.isCompleted);
    return active[0] || null;
  }, [token, appointments]);

  const featuredDoctors = useMemo(() => {
    const available = doctors.filter((d) => d.available);
    const list = available.length > 0 ? available : doctors;
    return list.slice(0, 6);
  }, [doctors]);

  const allergySummary = useMemo(() => {
    if (!userData) return null;
    const count = userData.allergies?.length || 0;
    if (count > 0) {
      return {
        label: `${count} recorded ${count === 1 ? 'allergy' : 'allergies'}`,
        tone: 'rose' as const,
      };
    }
    if (userData.noKnownAllergies) {
      return { label: 'No known allergies', tone: 'teal' as const };
    }
    return { label: 'Allergies unrecorded', tone: 'amber' as const };
  }, [userData]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.cobalt}
          />
        }
      >
        {/* Top Clinical Header */}
        <View style={styles.topBar}>
          <View>
            <View style={styles.brandRow}>
              <View style={styles.brandIcon}>
                <Ionicons name="medkit" size={16} color="#FFFFFF" />
              </View>
              <Text style={styles.brandTitle}>Prescripto</Text>
              <View style={styles.vitalTag}>
                <Text style={styles.vitalTagText}>VitalSync</Text>
              </View>
            </View>
            <Text style={styles.subtitle}>Patient telehealth companion</Text>
          </View>

          <View style={styles.topActions}>
            <View style={styles.onlinePill}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlinePillText}>{onlineDoctors.length} live</Text>
            </View>
            {!token ? (
              <Pressable
                onPress={() => router.push('/auth')}
                style={({ pressed }) => [styles.signInChip, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.signInChipText}>Sign in</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => router.push('/(tabs)/profile')}
                style={({ pressed }) => [styles.profileIconBtn, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name="person-outline" size={18} color={COLORS.ink} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Signature Element: Patient Clinical Ticket */}
        <View style={styles.ticketCard}>
          {token && userData ? (
            <>
              <View style={styles.ticketHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ticketCaption}>Patient clinical ticket</Text>
                  <Text style={styles.ticketName} numberOfLines={1}>
                    {userData.name}
                  </Text>
                </View>
                <View style={styles.bloodBadge}>
                  <Text style={styles.bloodLabel}>Blood</Text>
                  <Text style={styles.bloodValue}>
                    {userData.bloodGroup || 'Unset'}
                  </Text>
                </View>
              </View>

              {/* Status Pills Row */}
              <View style={styles.ticketPillsRow}>
                {allergySummary && (
                  <View
                    style={[
                      styles.statusPill,
                      allergySummary.tone === 'rose'
                        ? styles.pillRose
                        : allergySummary.tone === 'teal'
                          ? styles.pillTeal
                          : styles.pillAmber,
                    ]}
                  >
                    <Ionicons
                      name={
                        allergySummary.tone === 'rose'
                          ? 'alert-circle'
                          : allergySummary.tone === 'teal'
                            ? 'shield-checkmark'
                            : 'help-circle'
                      }
                      size={13}
                      color={
                        allergySummary.tone === 'rose'
                          ? COLORS.alertRose
                          : allergySummary.tone === 'teal'
                            ? COLORS.vitalGreen
                            : COLORS.cautionAmber
                      }
                    />
                    <Text
                      style={[
                        styles.statusPillText,
                        {
                          color:
                            allergySummary.tone === 'rose'
                              ? COLORS.alertRose
                              : allergySummary.tone === 'teal'
                                ? COLORS.vitalGreen
                                : COLORS.cautionAmber,
                        },
                      ]}
                    >
                      {allergySummary.label}
                    </Text>
                  </View>
                )}

                <View style={styles.neutralPill}>
                  <Text style={styles.neutralPillText}>
                    {bmi ? `BMI ${bmi.value} (${bmi.category})` : 'BMI not recorded'}
                  </Text>
                </View>
              </View>

              {/* Profile Completeness Meter */}
              <Pressable
                onPress={() => router.push('/(tabs)/profile')}
                style={({ pressed }) => [styles.completenessWrap, pressed && { opacity: 0.85 }]}
              >
                <View style={styles.completenessTop}>
                  <Text style={styles.completenessLabel}>Clinical dossier readiness</Text>
                  <Text style={styles.completenessPercent}>{completeness.percentage}%</Text>
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
                {completeness.missingFields.length > 0 && (
                  <Text style={styles.completenessHint} numberOfLines={1}>
                    Missing: {completeness.missingFields.slice(0, 2).join(', ')}
                  </Text>
                )}
              </Pressable>

              {/* Next Scheduled Consultation Strip */}
              {nextAppointment ? (
                <View style={styles.nextConsultBox}>
                  <View style={styles.nextConsultTop}>
                    <Text style={styles.nextConsultTitle}>Next scheduled consultation</Text>
                    <View
                      style={[
                        styles.payPill,
                        {
                          backgroundColor: nextAppointment.payment
                            ? COLORS.vitalGreenSoft
                            : COLORS.cautionAmberSoft,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.payPillText,
                          {
                            color: nextAppointment.payment
                              ? COLORS.vitalGreen
                              : COLORS.cautionAmber,
                          },
                        ]}
                      >
                        {nextAppointment.payment ? 'Confirmed' : 'Payment pending'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.nextConsultDocRow}>
                    <DoctorAvatar
                      uri={nextAppointment.docData?.image}
                      name={nextAppointment.docData?.name}
                      size={44}
                      online={isDoctorOnline(nextAppointment.docId)}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.nextConsultDocName} numberOfLines={1}>
                        {formatDoctorName(nextAppointment.docData?.name)}
                      </Text>
                      <Text style={styles.nextConsultSpec} numberOfLines={1}>
                        {nextAppointment.docData?.speciality}
                      </Text>
                      <Text style={styles.nextConsultTime}>
                        {slotDateFormat(nextAppointment.slotDate)} at {nextAppointment.slotTime}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.nextConsultActions}>
                    <Pressable
                      onPress={() =>
                        router.push(`/chat/${nextAppointment._id}` as any)
                      }
                      style={({ pressed }) => [
                        styles.nextActionPrimary,
                        pressed && { opacity: 0.88 },
                      ]}
                    >
                      <Ionicons name="chatbubble-ellipses-outline" size={15} color="#FFFFFF" />
                      <Text style={styles.nextActionPrimaryText}>Message doctor</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => router.push('/(tabs)/appointments')}
                      style={({ pressed }) => [
                        styles.nextActionSecondary,
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <Text style={styles.nextActionSecondaryText}>View consults</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.noConsultStrip}>
                  <Text style={styles.noConsultText}>No upcoming consultations scheduled.</Text>
                  <Pressable onPress={() => router.push('/(tabs)/doctors')}>
                    <Text style={styles.noConsultLink}>Browse specialists</Text>
                  </Pressable>
                </View>
              )}
            </>
          ) : (
            <View style={styles.guestTicket}>
              <View style={styles.guestBadge}>
                <Ionicons name="clipboard-outline" size={20} color={COLORS.cobalt} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.guestTitle}>Set up your patient dossier</Text>
                <Text style={styles.guestBody}>
                  Sign in to sync appointments, digital prescriptions, allergy alerts, and live
                  doctor chat.
                </Text>
              </View>
              <Pressable
                onPress={() => router.push('/auth')}
                style={({ pressed }) => [styles.guestBtn, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.guestBtnText}>Sign in or create account</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Clinical Tools Row */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Clinical tools</Text>
        </View>
        <View style={styles.toolsRow}>
          <Pressable
            onPress={() => router.push('/(tabs)/triage')}
            style={({ pressed }) => [styles.toolCard, pressed && { opacity: 0.9 }]}
          >
            <View style={[styles.toolIconWrap, { backgroundColor: COLORS.cobaltSoft }]}>
              <Ionicons name="pulse" size={20} color={COLORS.cobalt} />
            </View>
            <Text style={styles.toolTitle}>AI Symptom Triage</Text>
            <Text style={styles.toolDesc}>
              Describe symptoms for protocol-guided urgency & specialist matching
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/drug-checker')}
            style={({ pressed }) => [styles.toolCard, pressed && { opacity: 0.9 }]}
          >
            <View style={[styles.toolIconWrap, { backgroundColor: COLORS.vitalGreenSoft }]}>
              <Ionicons name="shield-checkmark" size={20} color={COLORS.vitalGreen} />
            </View>
            <Text style={styles.toolTitle}>Medicine Safety</Text>
            <Text style={styles.toolDesc}>
              Cross-check prescriptions against your recorded allergies
            </Text>
          </Pressable>
        </View>

        {/* Speciality Selector */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Browse by speciality</Text>
          <Pressable onPress={() => router.push('/(tabs)/doctors')}>
            <Text style={styles.sectionLink}>All doctors</Text>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.specialityScroll}
        >
          {SPECIALITIES.map((spec) => (
            <Pressable
              key={spec}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/doctors',
                  params: { speciality: spec },
                })
              }
              style={({ pressed }) => [styles.specialityChip, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="medical-outline" size={14} color={COLORS.cobalt} />
              <Text style={styles.specialityChipText}>{spec}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Available Specialists */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Available specialists</Text>
          <Text style={styles.sectionMeta}>{doctors.length} registered</Text>
        </View>

        <View style={styles.doctorList}>
          {featuredDoctors.map((doc) => {
            const online = isDoctorOnline(doc._id);
            return (
              <Pressable
                key={doc._id}
                onPress={() => router.push(`/doctor/${doc._id}` as any)}
                style={({ pressed }) => [styles.doctorCard, pressed && { opacity: 0.9 }]}
              >
                <DoctorAvatar uri={doc.image} name={doc.name} size={56} online={online} />
                <View style={styles.doctorBody}>
                  <View style={styles.doctorTopLine}>
                    <Text style={styles.doctorName} numberOfLines={1}>
                      {formatDoctorName(doc.name)}
                    </Text>
                    <View
                      style={[
                        styles.availBadge,
                        {
                          backgroundColor: doc.available
                            ? COLORS.vitalGreenSoft
                            : COLORS.surfaceMuted,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.availText,
                          { color: doc.available ? COLORS.vitalGreen : COLORS.inkMuted },
                        ]}
                      >
                        {online ? 'Online now' : doc.available ? 'Available' : 'Unavailable'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.doctorSpec} numberOfLines={1}>
                    {doc.speciality}
                  </Text>
                  <View style={styles.doctorMetaRow}>
                    <Text style={styles.doctorMeta}>{doc.degree}</Text>
                    <Text style={styles.doctorMeta}>{doc.experience}</Text>
                    <Text style={styles.doctorFee}>
                      {currencySymbol}
                      {doc.fees}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
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
    paddingBottom: 32,
    gap: SPACING.lg,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: COLORS.cobalt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.ink,
    letterSpacing: -0.3,
  },
  vitalTag: {
    backgroundColor: COLORS.cobaltSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.pill,
  },
  vitalTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.cobalt,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.inkSecondary,
    marginTop: 2,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  onlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: COLORS.vitalGreen,
  },
  onlinePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },
  signInChip: {
    backgroundColor: COLORS.cobalt,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
  },
  signInChipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  profileIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  ticketCaption: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.inkMuted,
  },
  ticketName: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.ink,
    marginTop: 2,
  },
  bloodBadge: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  bloodLabel: {
    fontSize: 10,
    color: COLORS.inkMuted,
    fontWeight: '600',
  },
  bloodValue: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.ink,
  },
  ticketPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
  },
  pillRose: {
    backgroundColor: COLORS.alertRoseSoft,
  },
  pillTeal: {
    backgroundColor: COLORS.vitalGreenSoft,
  },
  pillAmber: {
    backgroundColor: COLORS.cautionAmberSoft,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  neutralPill: {
    backgroundColor: COLORS.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
  },
  neutralPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.inkSecondary,
    fontVariant: ['tabular-nums'],
  },
  completenessWrap: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: 6,
  },
  completenessTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  completenessLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.inkSecondary,
  },
  completenessPercent: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  completenessHint: {
    fontSize: 11,
    color: COLORS.inkMuted,
  },
  nextConsultBox: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
    gap: SPACING.md,
  },
  nextConsultTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nextConsultTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.ink,
  },
  payPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  payPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  nextConsultDocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  nextConsultDocName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.ink,
  },
  nextConsultSpec: {
    fontSize: 12,
    color: COLORS.cobalt,
    fontWeight: '600',
  },
  nextConsultTime: {
    fontSize: 12,
    color: COLORS.inkSecondary,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  nextConsultActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  nextActionPrimary: {
    flex: 1,
    backgroundColor: COLORS.cobalt,
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  nextActionPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  nextActionSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
  },
  nextActionSecondaryText: {
    color: COLORS.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  noConsultStrip: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noConsultText: {
    fontSize: 12,
    color: COLORS.inkSecondary,
  },
  noConsultLink: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.cobalt,
  },
  guestTicket: {
    gap: SPACING.md,
  },
  guestBadge: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.cobaltSoft,
    alignItems: 'center',
    justifyContent: 'center',
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
  guestBtn: {
    backgroundColor: COLORS.cobalt,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  guestBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.ink,
  },
  sectionLink: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.cobalt,
  },
  sectionMeta: {
    fontSize: 12,
    color: COLORS.inkMuted,
    fontVariant: ['tabular-nums'],
  },
  toolsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  toolCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: 8,
  },
  toolIconWrap: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.ink,
  },
  toolDesc: {
    fontSize: 12,
    color: COLORS.inkSecondary,
    lineHeight: 17,
  },
  specialityScroll: {
    gap: SPACING.sm,
    paddingRight: SPACING.md,
  },
  specialityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: RADIUS.pill,
  },
  specialityChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.ink,
  },
  doctorList: {
    gap: SPACING.md,
  },
  doctorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
  },
  doctorBody: {
    flex: 1,
    gap: 3,
  },
  doctorTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  doctorName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.ink,
    flex: 1,
  },
  availBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  availText: {
    fontSize: 11,
    fontWeight: '700',
  },
  doctorSpec: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.cobalt,
  },
  doctorMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 2,
  },
  doctorMeta: {
    fontSize: 12,
    color: COLORS.inkSecondary,
  },
  doctorFee: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.ink,
    marginLeft: 'auto',
    fontVariant: ['tabular-nums'],
  },
});
