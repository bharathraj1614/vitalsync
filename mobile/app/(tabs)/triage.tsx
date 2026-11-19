import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  AssistantMessage,
  AssistantUnderstood,
  AssistantVerdict,
  useAppContext,
} from '../../src/context/AppContext';
import { DoctorAvatar } from '../../src/components/DoctorAvatar';
import { DoctorData, formatDoctorName } from '../../src/utils/clinical';
import { COLORS, RADIUS, SPACING, getRiskStyle, getUrgencyStyle } from '../../src/theme/tokens';

const UnderstoodBar: React.FC<{
  understood: AssistantUnderstood;
  disabled: boolean;
  onOverride: (id: string, label: string) => void;
}> = ({ understood, disabled, onOverride }) => {
  const [editing, setEditing] = useState(false);
  if (!understood?.label) return null;

  return (
    <View style={styles.understoodCard}>
      <View style={styles.understoodTop}>
        <Ionicons name="checkmark-circle" size={14} color={COLORS.vitalGreen} />
        <Text style={styles.understoodLabel}>
          Topic: <Text style={{ fontWeight: '700', color: COLORS.ink }}>{understood.label}</Text>
        </Text>
        {!disabled && Boolean(understood.alternatives?.length) && (
          <Pressable onPress={() => setEditing((v) => !v)}>
            <Text style={styles.changeLink}>{editing ? 'Cancel' : 'Change'}</Text>
          </Pressable>
        )}
      </View>

      {Boolean(understood.prefilledDetails?.length) && (
        <View style={styles.tagRow}>
          {understood.prefilledDetails!.map((d, idx) => (
            <View key={idx} style={styles.detailTag}>
              <Text style={styles.detailTagText}>{d.label}</Text>
            </View>
          ))}
        </View>
      )}

      {editing && Boolean(understood.alternatives?.length) && (
        <View style={styles.altRow}>
          {understood.alternatives!.map((alt) => (
            <Pressable
              key={alt.id}
              onPress={() => {
                setEditing(false);
                onOverride(alt.id, alt.label);
              }}
              style={styles.altChip}
            >
              <Text style={styles.altChipText}>{alt.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
};

const VerdictCard: React.FC<{
  verdict: AssistantVerdict;
  currencySymbol: string;
  onSelectDoctor: (doc: DoctorData) => void;
  onBrowseSpeciality: (spec: string) => void;
}> = ({ verdict, currencySymbol, onSelectDoctor, onBrowseSpeciality }) => {
  const [tab, setTab] = useState<'primary' | 'secondary'>('primary');
  const urgency = getUrgencyStyle(verdict.urgencyLevel);
  const hasSecondary = Boolean(verdict.secondarySpeciality);

  const activeSpec =
    tab === 'secondary' && hasSecondary
      ? verdict.secondarySpeciality || 'General physician'
      : verdict.primarySpeciality || 'General physician';
  const activeReasoning =
    tab === 'secondary' && hasSecondary
      ? verdict.secondaryReasoning
      : verdict.primaryReasoning;
  const activeDoctors =
    tab === 'secondary' && hasSecondary
      ? verdict.secondaryDoctors || []
      : verdict.primaryDoctors || [];

  return (
    <View style={styles.verdictCard}>
      {verdict.isEmergencyBypass && (
        <View style={styles.emergencyBanner}>
          <View style={styles.emergencyHeader}>
            <Ionicons name="warning" size={16} color="#FECDD3" />
            <Text style={styles.emergencyTitle}>Emergency alert — Call 108 / 112 immediately</Text>
          </View>
          {Boolean(verdict.emergencyBanner) && (
            <Text style={styles.emergencyBody}>{verdict.emergencyBanner}</Text>
          )}
        </View>
      )}

      <View style={styles.verdictBadges}>
        <View
          style={[
            styles.urgencyBadge,
            { backgroundColor: urgency.bg, borderColor: urgency.border },
          ]}
        >
          <View style={[styles.urgencyDot, { backgroundColor: urgency.dot }]} />
          <Text style={[styles.urgencyText, { color: urgency.text }]}>{urgency.label}</Text>
        </View>

        {Boolean(verdict.possibleConcernArea) && (
          <View style={styles.concernBadge}>
            <Text style={styles.concernText}>{verdict.possibleConcernArea}</Text>
          </View>
        )}
      </View>

      {hasSecondary && (
        <View style={styles.specTabBar}>
          <Pressable
            onPress={() => setTab('primary')}
            style={[styles.specTab, tab === 'primary' && styles.specTabActive]}
          >
            <Text style={[styles.specTabText, tab === 'primary' && styles.specTabTextActive]}>
              1. {verdict.primarySpeciality}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('secondary')}
            style={[styles.specTab, tab === 'secondary' && styles.specTabActive]}
          >
            <Text style={[styles.specTabText, tab === 'secondary' && styles.specTabTextActive]}>
              2. {verdict.secondarySpeciality}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.verdictSection}>
        <Text style={styles.verdictSpecTitle}>Recommended: {activeSpec}</Text>
        {Boolean(activeReasoning) && (
          <Text style={styles.verdictReasoning}>{activeReasoning}</Text>
        )}
      </View>

      {Boolean(verdict.immediateAdvice) && (
        <View style={styles.selfCareBox}>
          <Text style={styles.selfCareText}>
            <Text style={{ fontWeight: '700', color: '#134E4A' }}>Self-care guidance: </Text>
            {verdict.immediateAdvice}
          </Text>
        </View>
      )}

      {activeDoctors.length > 0 && (
        <View style={styles.matchedDocsWrap}>
          <Text style={styles.matchedDocsTitle}>
            Matched specialists ({activeDoctors.length})
          </Text>
          {activeDoctors.map((doc) => (
            <Pressable
              key={doc._id}
              onPress={() => onSelectDoctor(doc)}
              style={({ pressed }) => [styles.matchedDocRow, pressed && { opacity: 0.85 }]}
            >
              <DoctorAvatar uri={doc.image} name={doc.name} size={42} />
              <View style={{ flex: 1 }}>
                <Text style={styles.matchedDocName} numberOfLines={1}>
                  {formatDoctorName(doc.name)}
                </Text>
                <Text style={styles.matchedDocMeta} numberOfLines={1}>
                  {doc.speciality} · {doc.experience}
                </Text>
              </View>
              <View style={styles.matchedDocRight}>
                <Text style={styles.matchedDocFee}>
                  {currencySymbol}
                  {doc.fees}
                </Text>
                <Text style={styles.bookLabel}>Book</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      <Pressable
        onPress={() => onBrowseSpeciality(activeSpec)}
        style={({ pressed }) => [styles.browseSpecBtn, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.browseSpecBtnText}>Browse {activeSpec} doctors</Text>
      </Pressable>
    </View>
  );
};

export default function TriageScreen() {
  const router = useRouter();
  const {
    token,
    userData,
    currencySymbol,
    assistantMessages,
    assistantTriageState,
    assistantLoading,
    sendAssistantMessage,
    resetAssistantChat,
  } = useAppContext();

  const [input, setInput] = useState('');
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const handleSend = () => {
    const clean = input.trim();
    if (!clean || assistantLoading) return;
    setInput('');
    sendAssistantMessage(clean);
  };

  const openDoctorBooking = (doc: DoctorData) => {
    router.push({
      pathname: '/doctor/[docId]' as any,
      params: {
        docId: doc._id,
        prefilledSymptoms: assistantTriageState.chiefComplaint || '',
      },
    });
  };

  const openSpecialityList = (spec: string) => {
    router.push({
      pathname: '/(tabs)/doctors',
      params: { speciality: spec },
    });
  };

  const allergiesMissing =
    Boolean(token && userData) &&
    !(userData?.allergies && userData.allergies.length > 0) &&
    !userData?.noKnownAllergies;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>AI Symptom Triage</Text>
            <Text style={styles.headerSubtitle}>
              {assistantTriageState.active
                ? `Clarifying symptoms (step ${assistantTriageState.questionCount}/2)`
                : 'Protocol-guided urgency & specialist matching'}
            </Text>
          </View>
          <Pressable
            onPress={resetAssistantChat}
            style={({ pressed }) => [styles.resetBtn, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="refresh-outline" size={15} color={COLORS.ink} />
            <Text style={styles.resetBtnText}>Reset session</Text>
          </Pressable>
        </View>

        {allergiesMissing && (
          <Pressable
            onPress={() => router.push('/(tabs)/profile')}
            style={styles.allergyBanner}
          >
            <Ionicons name="alert-circle-outline" size={16} color={COLORS.cautionAmber} />
            <Text style={styles.allergyBannerText}>
              Record your drug allergies in Dossier for safer medicine screening.
            </Text>
          </Pressable>
        )}

        {/* Messages Stream */}
        <ScrollView
          ref={scrollRef}
          style={styles.stream}
          contentContainerStyle={styles.streamContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {assistantMessages.map((msg: AssistantMessage, index: number) => {
            const isLastBotMsg =
              msg.role === 'bot' && index === assistantMessages.length - 1;

            return (
              <View key={msg.id || index} style={styles.messageGroup}>
                {(!msg.verdict || msg.role === 'user') && Boolean(msg.text) && (
                  <View
                    style={[
                      styles.bubble,
                      msg.role === 'user' ? styles.userBubble : styles.botBubble,
                    ]}
                  >
                    <Text
                      style={[
                        styles.bubbleText,
                        msg.role === 'user' && { color: '#FFFFFF' },
                      ]}
                    >
                      {msg.text}
                    </Text>
                  </View>
                )}

                {msg.role === 'bot' && msg.understood && (
                  <UnderstoodBar
                    understood={msg.understood}
                    disabled={!isLastBotMsg || assistantLoading}
                    onOverride={(protocolId, label) =>
                      sendAssistantMessage('', {
                        overrideProtocolId: protocolId,
                        overrideLabel: label,
                      })
                    }
                  />
                )}

                {msg.role === 'bot' && msg.safetyReport && (
                  <View
                    style={[
                      styles.safetyBox,
                      {
                        backgroundColor: getRiskStyle(msg.safetyReport.overallRisk).bg,
                        borderColor: getRiskStyle(msg.safetyReport.overallRisk).border,
                      },
                    ]}
                  >
                    <View style={styles.safetyHeader}>
                      <Text style={styles.safetyTitle}>Medication & Allergy Check</Text>
                      <View
                        style={[
                          styles.safetyBadge,
                          {
                            backgroundColor: getRiskStyle(msg.safetyReport.overallRisk).badgeBg,
                          },
                        ]}
                      >
                        <Text style={styles.safetyBadgeText}>
                          {msg.safetyReport.overallRisk || 'SAFE'}
                        </Text>
                      </View>
                    </View>
                    {Boolean(msg.safetyReport.summary || msg.safetyReport.aiSummary) && (
                      <Text style={styles.safetyBody}>
                        {msg.safetyReport.summary || msg.safetyReport.aiSummary}
                      </Text>
                    )}
                  </View>
                )}

                {msg.role === 'bot' && msg.verdict && (
                  <VerdictCard
                    verdict={msg.verdict}
                    currencySymbol={currencySymbol}
                    onSelectDoctor={openDoctorBooking}
                    onBrowseSpeciality={openSpecialityList}
                  />
                )}

                {msg.role === 'bot' &&
                  !msg.verdict &&
                  Boolean(msg.doctors?.length) && (
                    <View style={styles.matchedDocsWrap}>
                      {msg.doctors!.map((doc) => (
                        <Pressable
                          key={doc._id}
                          onPress={() => openDoctorBooking(doc)}
                          style={styles.matchedDocRow}
                        >
                          <DoctorAvatar uri={doc.image} name={doc.name} size={42} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.matchedDocName}>
                              {formatDoctorName(doc.name)}
                            </Text>
                            <Text style={styles.matchedDocMeta}>
                              {doc.speciality} · {currencySymbol}
                              {doc.fees}
                            </Text>
                          </View>
                          <Text style={styles.bookLabel}>Book</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}

                {msg.role === 'bot' && isLastBotMsg && msg.canSkipToVerdict && (
                  <Pressable
                    onPress={() => sendAssistantMessage('', { forceVerdict: true })}
                    disabled={assistantLoading}
                    style={styles.skipBtn}
                  >
                    <Text style={styles.skipBtnText}>Skip to doctor recommendation</Text>
                  </Pressable>
                )}

                {msg.role === 'bot' &&
                  isLastBotMsg &&
                  Boolean(msg.quickOptions?.length) && (
                    <View style={styles.quickOptionsWrap}>
                      {msg.quickOptions!.map((opt, idx) => (
                        <Pressable
                          key={idx}
                          disabled={assistantLoading}
                          onPress={() => sendAssistantMessage(opt)}
                          style={({ pressed }) => [
                            styles.quickOptionChip,
                            pressed && { opacity: 0.8 },
                          ]}
                        >
                          <Text style={styles.quickOptionText}>{opt}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
              </View>
            );
          })}

          {assistantLoading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={COLORS.cobalt} />
              <Text style={styles.loadingText}>Analyzing clinical details...</Text>
            </View>
          )}
        </ScrollView>

        {/* Bottom Input */}
        <View style={styles.inputBar}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Describe your symptoms or ask about a medicine..."
            placeholderTextColor={COLORS.inkMuted}
            multiline
            style={styles.textInput}
            onSubmitEditing={handleSend}
          />
          <Pressable
            onPress={handleSend}
            disabled={!input.trim() || assistantLoading}
            style={({ pressed }) => [
              styles.sendBtn,
              (!input.trim() || assistantLoading) && { opacity: 0.45 },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="send" size={17} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
    paddingVertical: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.ink,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.inkSecondary,
    marginTop: 1,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.canvas,
  },
  resetBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.ink,
  },
  allergyBanner: {
    backgroundColor: COLORS.cautionAmberSoft,
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
    paddingHorizontal: SPACING.lg,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  allergyBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
  },
  stream: {
    flex: 1,
  },
  streamContent: {
    padding: SPACING.lg,
    gap: SPACING.md,
    paddingBottom: 24,
  },
  messageGroup: {
    gap: SPACING.sm,
  },
  bubble: {
    maxWidth: '86%',
    borderRadius: RADIUS.lg,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.cobalt,
    borderBottomRightRadius: 4,
  },
  botBubble: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.ink,
  },
  understoodCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: 8,
  },
  understoodTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  understoodLabel: {
    fontSize: 12,
    color: COLORS.inkSecondary,
    flex: 1,
  },
  changeLink: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.cobalt,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  detailTag: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  detailTagText: {
    fontSize: 11,
    color: COLORS.inkSecondary,
    fontWeight: '500',
  },
  altRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
  },
  altChip: {
    backgroundColor: COLORS.cobaltSoft,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  altChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.cobalt,
  },
  safetyBox: {
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: 6,
  },
  safetyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  safetyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.ink,
  },
  safetyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.pill,
  },
  safetyBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  safetyBody: {
    fontSize: 12,
    color: COLORS.ink,
    lineHeight: 18,
  },
  verdictCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  emergencyBanner: {
    backgroundColor: '#881337',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: 4,
  },
  emergencyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emergencyTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  emergencyBody: {
    color: '#FFE4E6',
    fontSize: 12,
    lineHeight: 17,
  },
  verdictBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  urgencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
  },
  urgencyDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  urgencyText: {
    fontSize: 12,
    fontWeight: '700',
  },
  concernBadge: {
    backgroundColor: COLORS.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
  },
  concernText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.inkSecondary,
  },
  specTabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.canvas,
    padding: 4,
    borderRadius: RADIUS.md,
    gap: 4,
  },
  specTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: RADIUS.sm,
  },
  specTabActive: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  specTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.inkSecondary,
  },
  specTabTextActive: {
    color: COLORS.ink,
    fontWeight: '700',
  },
  verdictSection: {
    gap: 4,
  },
  verdictSpecTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.ink,
  },
  verdictReasoning: {
    fontSize: 13,
    color: COLORS.inkSecondary,
    lineHeight: 19,
  },
  selfCareBox: {
    borderLeftWidth: 3,
    borderLeftColor: COLORS.vitalGreen,
    backgroundColor: COLORS.vitalGreenSoft,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderTopRightRadius: RADIUS.sm,
    borderBottomRightRadius: RADIUS.sm,
  },
  selfCareText: {
    fontSize: 12,
    color: COLORS.ink,
    lineHeight: 18,
  },
  matchedDocsWrap: {
    gap: 8,
  },
  matchedDocsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.ink,
  },
  matchedDocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: 10,
  },
  matchedDocName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.ink,
  },
  matchedDocMeta: {
    fontSize: 12,
    color: COLORS.inkSecondary,
  },
  matchedDocRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  matchedDocFee: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.ink,
    fontVariant: ['tabular-nums'],
  },
  bookLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.cobalt,
  },
  browseSpecBtn: {
    backgroundColor: COLORS.ink,
    borderRadius: RADIUS.md,
    paddingVertical: 11,
    alignItems: 'center',
  },
  browseSpecBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  skipBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.cobalt,
    backgroundColor: COLORS.cobaltSoft,
  },
  skipBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.cobalt,
  },
  quickOptionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  quickOptionChip: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.ink,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  loadingText: {
    fontSize: 12,
    color: COLORS.inkSecondary,
  },
  inputBar: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  textInput: {
    flex: 1,
    maxHeight: 100,
    minHeight: 42,
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.ink,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.cobalt,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
