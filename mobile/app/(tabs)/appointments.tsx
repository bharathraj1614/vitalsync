import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import axios from 'axios';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../../src/context/AppContext';
import { DoctorAvatar } from '../../src/components/DoctorAvatar';
import {
  AppointmentData,
  DAYS_OF_WEEK,
  MONTH_NAMES,
  SlotItem,
  formatDoctorName,
  generateDoctorSlots,
  groupSlotsByPeriod,
  slotDateFormat,
} from '../../src/utils/clinical';
import { COLORS, RADIUS, SPACING } from '../../src/theme/tokens';

type FilterTab = 'all' | 'upcoming' | 'completed' | 'cancelled';

export default function AppointmentsScreen() {
  const router = useRouter();
  const {
    token,
    backendUrl,
    appointments,
    appointmentsLoading,
    getUserAppointments,
    getDoctorsData,
    doctors,
    paymentConfig,
    isDoctorOnline,
    currencySymbol,
  } = useAppContext();

  const [filter, setFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string>('');

  // Cancel confirmation modal state
  const [cancelTarget, setCancelTarget] = useState<AppointmentData | null>(null);

  // Payment modal state
  const [paymentTarget, setPaymentTarget] = useState<AppointmentData | null>(null);
  const [razorpayOrderInfo, setRazorpayOrderInfo] = useState<{
    orderId: string;
    amount: number;
    currency: string;
  } | null>(null);

  // Reschedule modal state
  const [rescheduleTarget, setRescheduleTarget] = useState<AppointmentData | null>(null);
  const [rescheduleSlots, setRescheduleSlots] = useState<SlotItem[][]>([]);
  const [rescheduleDayIdx, setRescheduleDayIdx] = useState(0);
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleDateKey, setRescheduleDateKey] = useState('');
  const [rescheduling, setRescheduling] = useState(false);

  const filteredAppointments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return appointments.filter((apt) => {
      if (filter === 'upcoming' && (apt.cancelled || apt.isCompleted)) return false;
      if (filter === 'completed' && !apt.isCompleted) return false;
      if (filter === 'cancelled' && !apt.cancelled) return false;
      if (!q) return true;
      return (
        apt.docData?.name?.toLowerCase().includes(q) ||
        apt.docData?.speciality?.toLowerCase().includes(q) ||
        apt.reasonForVisit?.toLowerCase().includes(q)
      );
    });
  }, [appointments, filter, searchQuery]);

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    const targetId = cancelTarget._id;
    setCancelTarget(null);
    setBusyId(targetId);
    setFeedback(null);
    try {
      const { data } = await axios.post(
        `${backendUrl}/api/user/cancel-appointment`,
        { appointmentId: targetId },
        { headers: { token } }
      );
      if (data.success) {
        setFeedback({ ok: true, text: data.message || 'Consultation cancelled.' });
        await Promise.all([getUserAppointments(), getDoctorsData()]);
      } else {
        setFeedback({ ok: false, text: data.message || 'Could not cancel consultation.' });
      }
    } catch (err: any) {
      setFeedback({ ok: false, text: err?.message || 'Cancel request failed.' });
    } finally {
      setBusyId('');
    }
  };

  const openReschedule = (apt: AppointmentData) => {
    const liveDoc = doctors.find((d) => d._id === apt.docId) || apt.docData;
    const generated = generateDoctorSlots(liveDoc);
    const firstNonEmpty = generated.findIndex((day) => day.length > 0);
    setRescheduleSlots(generated);
    setRescheduleDayIdx(firstNonEmpty !== -1 ? firstNonEmpty : 0);
    setRescheduleTime('');
    setRescheduleDateKey('');
    setRescheduleTarget(apt);
  };

  const handleConfirmReschedule = async () => {
    if (!rescheduleTarget || !rescheduleTime || !rescheduleDateKey) return;
    setRescheduling(true);
    setFeedback(null);
    try {
      const { data } = await axios.post(
        `${backendUrl}/api/user/reschedule-appointment`,
        {
          appointmentId: rescheduleTarget._id,
          newSlotDate: rescheduleDateKey,
          newSlotTime: rescheduleTime,
        },
        { headers: { token } }
      );
      if (data.success) {
        setFeedback({ ok: true, text: data.message || 'Consultation rescheduled.' });
        setRescheduleTarget(null);
        await Promise.all([getUserAppointments(), getDoctorsData()]);
      } else {
        setFeedback({ ok: false, text: data.message || 'Reschedule failed.' });
      }
    } catch (err: any) {
      setFeedback({ ok: false, text: err?.message || 'Reschedule request failed.' });
    } finally {
      setRescheduling(false);
    }
  };

  const handleTestBypassPay = async (aptId: string) => {
    setBusyId(aptId);
    setFeedback(null);
    try {
      const { data } = await axios.post(
        `${backendUrl}/api/user/payment-test-bypass`,
        { appointmentId: aptId },
        { headers: { token } }
      );
      if (data.success) {
        setPaymentTarget(null);
        setRazorpayOrderInfo(null);
        setFeedback({ ok: true, text: data.message || 'Payment confirmed.' });
        await getUserAppointments();
      } else {
        setFeedback({ ok: false, text: data.message || 'Test mode bypass is disabled.' });
      }
    } catch (err: any) {
      setFeedback({ ok: false, text: err?.message || 'Payment error.' });
    } finally {
      setBusyId('');
    }
  };

  const handleStripeCheckout = async (aptId: string) => {
    setBusyId(aptId);
    setFeedback(null);
    try {
      const { data } = await axios.post(
        `${backendUrl}/api/user/payment-stripe`,
        { appointmentId: aptId },
        { headers: { token } }
      );
      if (data.success && data.session_url) {
        setPaymentTarget(null);
        await WebBrowser.openBrowserAsync(data.session_url);
        await getUserAppointments();
      } else {
        setFeedback({ ok: false, text: data.message || 'Unable to launch Stripe Checkout.' });
      }
    } catch (err: any) {
      setFeedback({ ok: false, text: err?.message || 'Stripe error.' });
    } finally {
      setBusyId('');
    }
  };

  const handleRazorpayOrder = async (aptId: string) => {
    setBusyId(aptId);
    setFeedback(null);
    try {
      const { data } = await axios.post(
        `${backendUrl}/api/user/payment-razorpay`,
        { appointmentId: aptId },
        { headers: { token } }
      );
      if (data.success && data.order) {
        setRazorpayOrderInfo({
          orderId: data.order.id,
          amount: data.order.amount,
          currency: data.order.currency || 'INR',
        });
      } else {
        setFeedback({ ok: false, text: data.message || 'Failed to create Razorpay order.' });
      }
    } catch (err: any) {
      setFeedback({ ok: false, text: err?.message || 'Razorpay order creation failed.' });
    } finally {
      setBusyId('');
    }
  };

  if (!token) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.guestWrap}>
          <View style={styles.guestIcon}>
            <Ionicons name="calendar-outline" size={30} color={COLORS.cobalt} />
          </View>
          <Text style={styles.guestTitle}>Your consultations live here</Text>
          <Text style={styles.guestBody}>
            Sign in to view booked appointments, complete fee payments, chat with your doctor, and
            open digital prescriptions.
          </Text>
          <Pressable
            onPress={() => router.push('/auth')}
            style={({ pressed }) => [styles.guestBtn, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.guestBtnText}>Sign in to patient portal</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const rescheduleDaySlots = rescheduleSlots[rescheduleDayIdx] || [];
  const groupedReschedule = groupSlotsByPeriod(rescheduleDaySlots);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My consultations</Text>

        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={COLORS.inkMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Filter by doctor, speciality, or reason"
            placeholderTextColor={COLORS.inkMuted}
            style={styles.searchInput}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterTabsRow}
        >
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'upcoming', label: 'Upcoming' },
              { key: 'completed', label: 'Completed' },
              { key: 'cancelled', label: 'Cancelled' },
            ] as const
          ).map((t) => {
            const active = filter === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setFilter(t.key)}
                style={[styles.filterTab, active && styles.filterTabActive]}
              >
                <Text style={[styles.filterTabText, active && styles.filterTabTextActive]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
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
          <Pressable onPress={() => setFeedback(null)}>
            <Ionicons name="close" size={16} color={COLORS.inkSecondary} />
          </Pressable>
        </View>
      )}

      <FlatList
        data={filteredAppointments}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={appointmentsLoading}
            onRefresh={getUserAppointments}
            tintColor={COLORS.cobalt}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="calendar-clear-outline" size={32} color={COLORS.inkMuted} />
            <Text style={styles.emptyTitle}>No consultations in this view</Text>
            <Text style={styles.emptyBody}>
              Book a specialist consultation or adjust your search filter.
            </Text>
            <Pressable
              onPress={() => router.push('/(tabs)/doctors')}
              style={styles.bookNowBtn}
            >
              <Text style={styles.bookNowText}>Browse specialists</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => {
          const online = isDoctorOnline(item.docId);
          const isBusy = busyId === item._id;
          const status = item.cancelled
            ? { label: 'Cancelled', bg: COLORS.alertRoseSoft, color: COLORS.alertRose }
            : item.isCompleted
              ? { label: 'Completed', bg: COLORS.cobaltSoft, color: COLORS.cobalt }
              : item.payment
                ? { label: 'Paid & confirmed', bg: COLORS.vitalGreenSoft, color: COLORS.vitalGreen }
                : { label: 'Payment pending', bg: COLORS.cautionAmberSoft, color: COLORS.cautionAmber };

          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <DoctorAvatar
                  uri={item.docData?.image}
                  name={item.docData?.name}
                  size={56}
                  online={online}
                />
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.docName} numberOfLines={1}>
                      {formatDoctorName(item.docData?.name)}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                      <Text style={[styles.statusText, { color: status.color }]}>
                        {status.label}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.docSpec}>{item.docData?.speciality}</Text>

                  <View style={styles.scheduleRow}>
                    <Ionicons name="time-outline" size={13} color={COLORS.inkSecondary} />
                    <Text style={styles.scheduleText}>
                      {slotDateFormat(item.slotDate)} at {item.slotTime}
                    </Text>
                    <Text style={styles.feeText}>
                      {currencySymbol}
                      {item.amount}
                    </Text>
                  </View>
                </View>
              </View>

              {Boolean(item.reasonForVisit) && (
                <View style={styles.reasonBox}>
                  <Text style={styles.reasonLabel}>Reason: </Text>
                  <Text style={styles.reasonValue} numberOfLines={2}>
                    {item.reasonForVisit}
                  </Text>
                </View>
              )}

              <View style={styles.actionsWrap}>
                {!item.cancelled && !item.payment && !item.isCompleted && (
                  <Pressable
                    onPress={() => {
                      setRazorpayOrderInfo(null);
                      setPaymentTarget(item);
                    }}
                    disabled={isBusy}
                    style={({ pressed }) => [styles.primaryAction, pressed && { opacity: 0.88 }]}
                  >
                    <Ionicons name="card-outline" size={15} color="#FFFFFF" />
                    <Text style={styles.primaryActionText}>Pay consultation fee</Text>
                  </Pressable>
                )}

                {!item.cancelled && (
                  <Pressable
                    onPress={() => router.push(`/chat/${item._id}` as any)}
                    style={({ pressed }) => [styles.secondaryAction, pressed && { opacity: 0.85 }]}
                  >
                    <Ionicons name="chatbubble-outline" size={14} color={COLORS.ink} />
                    <Text style={styles.secondaryActionText}>Message doctor</Text>
                  </Pressable>
                )}

                {!item.cancelled && (
                  <Pressable
                    onPress={() => router.push(`/prescription/${item._id}` as any)}
                    style={({ pressed }) => [styles.secondaryAction, pressed && { opacity: 0.85 }]}
                  >
                    <Ionicons name="document-text-outline" size={14} color={COLORS.ink} />
                    <Text style={styles.secondaryActionText}>View prescription</Text>
                  </Pressable>
                )}

                {!item.cancelled && !item.isCompleted && (
                  <Pressable
                    onPress={() => openReschedule(item)}
                    disabled={isBusy}
                    style={({ pressed }) => [styles.secondaryAction, pressed && { opacity: 0.85 }]}
                  >
                    <Ionicons name="calendar-outline" size={14} color={COLORS.ink} />
                    <Text style={styles.secondaryActionText}>Reschedule</Text>
                  </Pressable>
                )}

                {!item.cancelled && !item.isCompleted && (
                  <Pressable
                    onPress={() => setCancelTarget(item)}
                    disabled={isBusy}
                    style={({ pressed }) => [styles.dangerAction, pressed && { opacity: 0.85 }]}
                  >
                    <Text style={styles.dangerActionText}>Cancel</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        }}
      />

      {/* Cancel Confirmation Modal */}
      <Modal
        visible={Boolean(cancelTarget)}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cancel consultation?</Text>
            <Text style={styles.modalBody}>
              Release your {cancelTarget ? slotDateFormat(cancelTarget.slotDate) : ''} at{' '}
              {cancelTarget?.slotTime} slot with {formatDoctorName(cancelTarget?.docData?.name)}?
            </Text>
            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setCancelTarget(null)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Keep slot</Text>
              </Pressable>
              <Pressable onPress={confirmCancel} style={styles.modalDangerBtn}>
                <Text style={styles.modalDangerText}>Confirm cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Payment Modal */}
      <Modal
        visible={Boolean(paymentTarget)}
        transparent
        animationType="slide"
        onRequestClose={() => setPaymentTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Pay consultation fee</Text>
              <Pressable onPress={() => setPaymentTarget(null)}>
                <Ionicons name="close" size={20} color={COLORS.inkSecondary} />
              </Pressable>
            </View>

            {paymentTarget && (
              <Text style={styles.modalBody}>
                {formatDoctorName(paymentTarget.docData?.name)} — {currencySymbol}
                {paymentTarget.amount}
              </Text>
            )}

            {razorpayOrderInfo && (
              <View style={styles.orderBox}>
                <Text style={styles.orderTitle}>Razorpay order created</Text>
                <Text style={styles.orderMeta}>Order ID: {razorpayOrderInfo.orderId}</Text>
                <Text style={styles.orderMeta}>
                  Amount: {(razorpayOrderInfo.amount / 100).toFixed(2)} {razorpayOrderInfo.currency}
                </Text>
                <Text style={styles.orderHint}>
                  Native Razorpay Checkout requires a custom dev build. If Test Mode is enabled on
                  the server, confirm immediately below.
                </Text>
              </View>
            )}

            <View style={{ gap: 10, marginTop: 4 }}>
              {paymentConfig.testMode && paymentTarget && (
                <Pressable
                  onPress={() => handleTestBypassPay(paymentTarget._id)}
                  disabled={busyId === paymentTarget._id}
                  style={styles.payMethodPrimary}
                >
                  {busyId === paymentTarget._id ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.payMethodPrimaryText}>
                      Confirm immediately (Test Mode)
                    </Text>
                  )}
                </Pressable>
              )}

              {paymentConfig.stripeEnabled && paymentTarget && (
                <Pressable
                  onPress={() => handleStripeCheckout(paymentTarget._id)}
                  disabled={busyId === paymentTarget._id}
                  style={styles.payMethodSecondary}
                >
                  <Text style={styles.payMethodSecondaryText}>Pay with Stripe Checkout</Text>
                </Pressable>
              )}

              {paymentConfig.razorpayEnabled && paymentTarget && (
                <Pressable
                  onPress={() => handleRazorpayOrder(paymentTarget._id)}
                  disabled={busyId === paymentTarget._id}
                  style={styles.payMethodSecondary}
                >
                  <Text style={styles.payMethodSecondaryText}>Create Razorpay order</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Reschedule Modal */}
      <Modal
        visible={Boolean(rescheduleTarget)}
        transparent
        animationType="slide"
        onRequestClose={() => setRescheduleTarget(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Reschedule appointment</Text>
              <Pressable onPress={() => setRescheduleTarget(null)}>
                <Ionicons name="close" size={20} color={COLORS.inkSecondary} />
              </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {rescheduleSlots.map((daySlots, idx) => {
                const dateObj = daySlots[0]?.datetime;
                if (!dateObj) return null;
                const selected = idx === rescheduleDayIdx;
                return (
                  <Pressable
                    key={idx}
                    onPress={() => {
                      setRescheduleDayIdx(idx);
                      setRescheduleTime('');
                      setRescheduleDateKey('');
                    }}
                    style={[styles.dayCard, selected && styles.dayCardActive]}
                  >
                    <Text style={[styles.dayName, selected && { color: '#FFFFFF' }]}>
                      {DAYS_OF_WEEK[dateObj.getDay()]}
                    </Text>
                    <Text style={[styles.dayNum, selected && { color: '#FFFFFF' }]}>
                      {dateObj.getDate()} {MONTH_NAMES[dateObj.getMonth()]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 12 }}>
              {[
                { label: 'Morning', slots: groupedReschedule.morning },
                { label: 'Afternoon', slots: groupedReschedule.afternoon },
                { label: 'Evening', slots: groupedReschedule.evening },
              ].map((group) =>
                group.slots.length > 0 ? (
                  <View key={group.label} style={{ gap: 6 }}>
                    <Text style={styles.periodLabel}>{group.label}</Text>
                    <View style={styles.slotsGrid}>
                      {group.slots.map((s) => {
                        const active =
                          rescheduleTime === s.time && rescheduleDateKey === s.slotDateKey;
                        return (
                          <Pressable
                            key={`${s.slotDateKey}-${s.time}`}
                            onPress={() => {
                              setRescheduleTime(s.time);
                              setRescheduleDateKey(s.slotDateKey);
                            }}
                            style={[styles.slotChip, active && styles.slotChipActive]}
                          >
                            <Text style={[styles.slotChipText, active && { color: '#FFFFFF' }]}>
                              {s.time}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null
              )}
              {rescheduleDaySlots.length === 0 && (
                <Text style={styles.modalBody}>No open slots on this day.</Text>
              )}
            </ScrollView>

            <Pressable
              onPress={handleConfirmReschedule}
              disabled={!rescheduleTime || rescheduling}
              style={[
                styles.payMethodPrimary,
                (!rescheduleTime || rescheduling) && { opacity: 0.5 },
              ]}
            >
              {rescheduling ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.payMethodPrimaryText}>Confirm new slot</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.canvas,
  },
  header: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    gap: SPACING.md,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.ink,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.ink,
  },
  filterTabsRow: {
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.canvas,
  },
  filterTabActive: {
    backgroundColor: COLORS.ink,
    borderColor: COLORS.ink,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.inkSecondary,
  },
  filterTabTextActive: {
    color: '#FFFFFF',
  },
  feedbackBanner: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  listContent: {
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  cardTop: {
    flexDirection: 'row',
    gap: SPACING.md,
    alignItems: 'center',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  docName: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.ink,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  docSpec: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.cobalt,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  scheduleText: {
    fontSize: 12,
    color: COLORS.inkSecondary,
    fontVariant: ['tabular-nums'],
    flex: 1,
  },
  feeText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },
  reasonBox: {
    flexDirection: 'row',
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  reasonLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.inkSecondary,
  },
  reasonValue: {
    fontSize: 12,
    color: COLORS.ink,
    flex: 1,
  },
  actionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
  },
  primaryAction: {
    backgroundColor: COLORS.cobalt,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: RADIUS.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  secondaryAction: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  secondaryActionText: {
    color: COLORS.ink,
    fontSize: 12,
    fontWeight: '600',
  },
  dangerAction: {
    backgroundColor: COLORS.alertRoseSoft,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
  },
  dangerActionText: {
    color: COLORS.alertRose,
    fontSize: 12,
    fontWeight: '700',
  },
  guestWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 12,
  },
  guestIcon: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: COLORS.cobaltSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.ink,
    textAlign: 'center',
  },
  guestBody: {
    fontSize: 14,
    color: COLORS.inkSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  guestBtn: {
    marginTop: 6,
    backgroundColor: COLORS.cobalt,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: RADIUS.md,
  },
  guestBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.ink,
  },
  emptyBody: {
    fontSize: 13,
    color: COLORS.inkSecondary,
    textAlign: 'center',
  },
  bookNowBtn: {
    marginTop: 6,
    backgroundColor: COLORS.cobalt,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
  },
  bookNowText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 29, 46, 0.45)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.ink,
  },
  modalBody: {
    fontSize: 14,
    color: COLORS.inkSecondary,
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.ink,
  },
  modalDangerBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.alertRose,
    alignItems: 'center',
  },
  modalDangerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  orderBox: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: 4,
  },
  orderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.ink,
  },
  orderMeta: {
    fontSize: 12,
    color: COLORS.inkSecondary,
    fontVariant: ['tabular-nums'],
  },
  orderHint: {
    fontSize: 11,
    color: COLORS.inkMuted,
    marginTop: 4,
    lineHeight: 16,
  },
  payMethodPrimary: {
    backgroundColor: COLORS.cobalt,
    paddingVertical: 13,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  payMethodPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  payMethodSecondary: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  payMethodSecondaryText: {
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  dayCard: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.canvas,
    alignItems: 'center',
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
    fontWeight: '700',
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },
  periodLabel: {
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
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.canvas,
  },
  slotChipActive: {
    backgroundColor: COLORS.cobalt,
    borderColor: COLORS.cobalt,
  },
  slotChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },
});
