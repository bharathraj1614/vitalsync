import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import axios from 'axios';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../../src/context/AppContext';
import { DoctorAvatar } from '../../src/components/DoctorAvatar';
import {
  DAYS_OF_WEEK,
  MONTH_NAMES,
  formatDoctorName,
  generateDoctorSlots,
  groupSlotsByPeriod,
} from '../../src/utils/clinical';
import { COLORS, RADIUS, SPACING } from '../../src/theme/tokens';

const QUICK_REASONS = [
  'General Checkup',
  'Follow-up Consultation',
  'Lab Report Review',
  'Fever / Cold / Cough',
  'Prescription Renewal',
  'Chronic Condition Review',
];

export default function DoctorBookingScreen() {
  const router = useRouter();
  const { docId, prefilledSymptoms } = useLocalSearchParams<{
    docId: string;
    prefilledSymptoms?: string;
  }>();

  const {
    doctors,
    backendUrl,
    token,
    currencySymbol,
    paymentConfig,
    isDoctorOnline,
    getDoctorsData,
    getUserAppointments,
  } = useAppContext();

  const docInfo = useMemo(
    () => doctors.find((d) => d._id === String(docId)) || null,
    [doctors, docId]
  );

  const docSlots = useMemo(() => generateDoctorSlots(docInfo), [docInfo]);

  const [slotIndex, setSlotIndex] = useState(0);
  const [slotTime, setSlotTime] = useState('');
  const [slotDateKey, setSlotDateKey] = useState('');
  const [reasonForVisit, setReasonForVisit] = useState(
    prefilledSymptoms ? String(prefilledSymptoms) : ''
  );
  const [selectedPayment, setSelectedPayment] = useState<'test' | 'stripe' | 'razorpay'>('test');
  const [booking, setBooking] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const firstNonEmpty = docSlots.findIndex((day) => day.length > 0);
    if (firstNonEmpty !== -1) {
      setSlotIndex(firstNonEmpty);
    }
  }, [docSlots]);

  useEffect(() => {
    if (paymentConfig.testMode) setSelectedPayment('test');
    else if (paymentConfig.stripeEnabled) setSelectedPayment('stripe');
    else if (paymentConfig.razorpayEnabled) setSelectedPayment('razorpay');
  }, [paymentConfig]);

  const selectedDaySlots = docSlots[slotIndex] || [];
  const grouped = useMemo(() => groupSlotsByPeriod(selectedDaySlots), [selectedDaySlots]);

  const handleBook = async () => {
    setErrorMsg('');
    if (!token) {
      router.push({
        pathname: '/auth',
        params: { redirect: docId ? `/doctor/${docId}` : '/(tabs)' },
      });
      return;
    }
    if (!docInfo) return;
    if (!slotTime || !slotDateKey) {
      setErrorMsg('Select a date and available time slot first.');
      return;
    }

    const isTest = selectedPayment === 'test' && paymentConfig.testMode;
    setBooking(true);
    try {
      const { data } = await axios.post(
        `${backendUrl}/api/user/book-appointment`,
        {
          docId: docInfo._id,
          slotDate: slotDateKey,
          slotTime,
          reasonForVisit: reasonForVisit.trim(),
          testBypass: isTest,
        },
        { headers: { token } }
      );

      if (!data.success) {
        setErrorMsg(data.message || 'Could not reserve this slot.');
        setBooking(false);
        return;
      }

      const appointmentId = data.appointmentId;

      if (selectedPayment === 'stripe' && appointmentId && !isTest) {
        try {
          const payRes = await axios.post(
            `${backendUrl}/api/user/payment-stripe`,
            { appointmentId },
            { headers: { token } }
          );
          if (payRes.data.success && payRes.data.session_url) {
            await WebBrowser.openBrowserAsync(payRes.data.session_url);
          }
        } catch {
          // Appointment is created; user can finish payment in Consults tab
        }
      } else if (selectedPayment === 'razorpay' && appointmentId && !isTest) {
        try {
          await axios.post(
            `${backendUrl}/api/user/payment-razorpay`,
            { appointmentId },
            { headers: { token } }
          );
        } catch {
          // Appointment is created; user can complete payment in Consults tab
        }
      }

      await Promise.all([getDoctorsData(), getUserAppointments()]);
      router.replace('/(tabs)/appointments');
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message || err?.message || 'Booking failed.');
    } finally {
      setBooking(false);
    }
  };

  if (!docInfo) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color={COLORS.cobalt} />
        <Text style={styles.loadingText}>Loading specialist schedule...</Text>
      </View>
    );
  }

  const online = isDoctorOnline(docInfo._id);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Doctor Profile Card */}
      <View style={styles.docCard}>
        <View style={styles.docHeader}>
          <DoctorAvatar uri={docInfo.image} name={docInfo.name} size={72} online={online} />
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.nameRow}>
              <Text style={styles.docName}>{formatDoctorName(docInfo.name)}</Text>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.cobalt} />
            </View>
            <Text style={styles.docSpec}>{docInfo.speciality}</Text>
            <Text style={styles.docMeta}>
              {docInfo.degree} · {docInfo.experience}
            </Text>
          </View>
        </View>

        {Boolean(docInfo.about) && <Text style={styles.docAbout}>{docInfo.about}</Text>}

        <View style={styles.feeStrip}>
          <Text style={styles.feeLabel}>Consultation fee</Text>
          <Text style={styles.feeValue}>
            {currencySymbol}
            {docInfo.fees}
          </Text>
        </View>
      </View>

      {/* Date Selector */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Select consultation day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {docSlots.map((daySlots, idx) => {
            const firstSlot = daySlots[0];
            const dateObj = firstSlot?.datetime || (() => {
              const d = new Date();
              d.setDate(d.getDate() + idx);
              return d;
            })();
            const selected = idx === slotIndex;
            return (
              <Pressable
                key={idx}
                onPress={() => {
                  setSlotIndex(idx);
                  setSlotTime('');
                  setSlotDateKey('');
                }}
                style={[styles.dayCard, selected && styles.dayCardActive]}
              >
                <Text style={[styles.dayName, selected && { color: '#FFFFFF' }]}>
                  {DAYS_OF_WEEK[dateObj.getDay()]}
                </Text>
                <Text style={[styles.dayNum, selected && { color: '#FFFFFF' }]}>
                  {dateObj.getDate()} {MONTH_NAMES[dateObj.getMonth()]}
                </Text>
                <Text style={[styles.dayCount, selected && { color: '#E0F2FE' }]}>
                  {daySlots.length} open
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Time-of-Day Grouped Slots */}
        <View style={{ gap: 14, marginTop: 4 }}>
          {[
            { label: 'Morning (10:00 – 11:30)', slots: grouped.morning },
            { label: 'Afternoon (12:00 – 16:30)', slots: grouped.afternoon },
            { label: 'Evening (17:00 – 20:30)', slots: grouped.evening },
          ].map((group) =>
            group.slots.length > 0 ? (
              <View key={group.label} style={{ gap: 8 }}>
                <Text style={styles.periodTitle}>{group.label}</Text>
                <View style={styles.slotsGrid}>
                  {group.slots.map((slot) => {
                    const active =
                      slotTime === slot.time && slotDateKey === slot.slotDateKey;
                    return (
                      <Pressable
                        key={`${slot.slotDateKey}-${slot.time}`}
                        onPress={() => {
                          setSlotTime(slot.time);
                          setSlotDateKey(slot.slotDateKey);
                        }}
                        style={[styles.slotChip, active && styles.slotChipActive]}
                      >
                        <Text style={[styles.slotText, active && { color: '#FFFFFF' }]}>
                          {slot.time}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null
          )}

          {selectedDaySlots.length === 0 && (
            <Text style={styles.emptySlotsText}>
              No consultation slots remain for this day. Select another day above.
            </Text>
          )}
        </View>
      </View>

      {/* Reason for Visit */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Reason for visit</Text>
        <View style={styles.reasonsRow}>
          {QUICK_REASONS.map((reason) => {
            const active = reasonForVisit.trim() === reason;
            return (
              <Pressable
                key={reason}
                onPress={() => setReasonForVisit(reason)}
                style={[styles.reasonChip, active && styles.reasonChipActive]}
              >
                <Text style={[styles.reasonChipText, active && { color: COLORS.cobalt }]}>
                  {reason}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <TextInput
          value={reasonForVisit}
          onChangeText={setReasonForVisit}
          placeholder="Describe your symptoms, duration, or questions for the doctor"
          placeholderTextColor={COLORS.inkMuted}
          multiline
          style={styles.reasonInput}
        />
      </View>

      {/* Payment Method */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Payment method</Text>
        <View style={{ gap: 8 }}>
          {paymentConfig.testMode && (
            <Pressable
              onPress={() => setSelectedPayment('test')}
              style={[
                styles.payOption,
                selectedPayment === 'test' && styles.payOptionActive,
              ]}
            >
              <Ionicons
                name={selectedPayment === 'test' ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={selectedPayment === 'test' ? COLORS.cobalt : COLORS.inkMuted}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.payTitle}>Instant confirmation (Test Mode)</Text>
                <Text style={styles.payDesc}>
                  Skips external payment gateway for sandbox testing
                </Text>
              </View>
            </Pressable>
          )}

          {paymentConfig.stripeEnabled && (
            <Pressable
              onPress={() => setSelectedPayment('stripe')}
              style={[
                styles.payOption,
                selectedPayment === 'stripe' && styles.payOptionActive,
              ]}
            >
              <Ionicons
                name={selectedPayment === 'stripe' ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={selectedPayment === 'stripe' ? COLORS.cobalt : COLORS.inkMuted}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.payTitle}>Stripe Checkout</Text>
                <Text style={styles.payDesc}>Card & international checkout in browser</Text>
              </View>
            </Pressable>
          )}

          {paymentConfig.razorpayEnabled && (
            <Pressable
              onPress={() => setSelectedPayment('razorpay')}
              style={[
                styles.payOption,
                selectedPayment === 'razorpay' && styles.payOptionActive,
              ]}
            >
              <Ionicons
                name={selectedPayment === 'razorpay' ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={selectedPayment === 'razorpay' ? COLORS.cobalt : COLORS.inkMuted}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.payTitle}>Razorpay Order</Text>
                <Text style={styles.payDesc}>Creates order & marks pending in Consults</Text>
              </View>
            </Pressable>
          )}
        </View>
      </View>

      {Boolean(errorMsg) && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      <Pressable
        onPress={handleBook}
        disabled={booking || !docInfo.available}
        style={({ pressed }) => [
          styles.bookBtn,
          (booking || !docInfo.available) && { opacity: 0.55 },
          pressed && { opacity: 0.9 },
        ]}
      >
        {booking ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.bookBtnText}>
            {!docInfo.available
              ? 'Doctor currently unavailable'
              : !token
                ? 'Sign in to book consultation'
                : selectedPayment === 'test' && paymentConfig.testMode
                  ? 'Confirm & book consultation'
                  : 'Book consultation'}
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.canvas,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.inkSecondary,
  },
  container: {
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: 36,
  },
  docCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  docHeader: {
    flexDirection: 'row',
    gap: SPACING.md,
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  docName: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.ink,
    flexShrink: 1,
  },
  docSpec: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.cobalt,
  },
  docMeta: {
    fontSize: 12,
    color: COLORS.inkSecondary,
  },
  docAbout: {
    fontSize: 13,
    color: COLORS.inkSecondary,
    lineHeight: 19,
  },
  feeStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  feeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.inkSecondary,
  },
  feeValue: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.ink,
  },
  dayCard: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.canvas,
    alignItems: 'center',
    minWidth: 82,
    gap: 2,
  },
  dayCardActive: {
    backgroundColor: COLORS.cobalt,
    borderColor: COLORS.cobalt,
  },
  dayName: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.inkMuted,
  },
  dayNum: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },
  dayCount: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.inkSecondary,
    fontVariant: ['tabular-nums'],
  },
  periodTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.inkSecondary,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.canvas,
  },
  slotChipActive: {
    backgroundColor: COLORS.cobalt,
    borderColor: COLORS.cobalt,
  },
  slotText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },
  emptySlotsText: {
    fontSize: 13,
    color: COLORS.inkSecondary,
  },
  reasonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  reasonChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.canvas,
  },
  reasonChipActive: {
    borderColor: COLORS.cobalt,
    backgroundColor: COLORS.cobaltSoft,
  },
  reasonChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.inkSecondary,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.canvas,
    padding: 12,
    minHeight: 76,
    textAlignVertical: 'top',
    fontSize: 14,
    color: COLORS.ink,
  },
  payOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: 12,
    backgroundColor: COLORS.canvas,
  },
  payOptionActive: {
    borderColor: COLORS.cobalt,
    backgroundColor: COLORS.cobaltSoft,
  },
  payTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.ink,
  },
  payDesc: {
    fontSize: 12,
    color: COLORS.inkSecondary,
  },
  errorBox: {
    backgroundColor: COLORS.alertRoseSoft,
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: RADIUS.md,
    padding: 12,
  },
  errorText: {
    color: COLORS.alertRose,
    fontSize: 13,
    fontWeight: '600',
  },
  bookBtn: {
    backgroundColor: COLORS.cobalt,
    paddingVertical: 15,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  bookBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
