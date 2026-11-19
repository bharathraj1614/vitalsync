import React, { useEffect, useRef, useState } from 'react';
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
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../../src/context/AppContext';
import { DoctorAvatar } from '../../src/components/DoctorAvatar';
import { AppointmentData, formatDoctorName, slotDateFormat } from '../../src/utils/clinical';
import { COLORS, RADIUS, SPACING } from '../../src/theme/tokens';

interface ChatMessage {
  _id?: string;
  clientTempId?: string;
  sender: 'user' | 'doctor';
  senderName?: string;
  text: string;
  attachmentUrl?: string;
  attachmentType?: string;
  attachmentName?: string;
  readBy?: string[];
  timestamp?: string;
}

const QUICK_PROMPTS = [
  'Hello Doctor, I have a question about my symptoms.',
  'Could you clarify how to take the prescribed medicine?',
  'I am ready to join the consultation.',
];

export default function ChatScreen() {
  const router = useRouter();
  const { appointmentId } = useLocalSearchParams<{ appointmentId: string }>();
  const {
    backendUrl,
    token,
    isHydrated,
    userData,
    socket,
    isDoctorOnline,
    fetchUnreadChatCount,
  } = useAppContext();

  const [appointment, setAppointment] = useState<AppointmentData | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [otherTyping, setOtherTyping] = useState(false);

  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token || !appointmentId) {
      setLoading(false);
      return;
    }

    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const [initRes, msgRes, aptRes] = await Promise.all([
          axios.post(
            `${backendUrl}/api/chat/get-or-create`,
            { appointmentId },
            { headers: { token } }
          ),
          axios.post(
            `${backendUrl}/api/chat/messages`,
            { appointmentId },
            { headers: { token } }
          ),
          axios.get(`${backendUrl}/api/user/appointment/${appointmentId}`, {
            headers: { token },
          }),
        ]);
        if (!mounted) return;
        if (aptRes.data?.success) setAppointment(aptRes.data.appointment);
        else if (initRes.data?.appointment) setAppointment(initRes.data.appointment);
        if (msgRes.data?.success) setMessages(msgRes.data.messages || []);
      } catch (err) {
        console.warn('Chat load error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    if (socket) {
      socket.emit('join-room', String(appointmentId));
      socket.emit('mark-messages-read', {
        roomId: String(appointmentId),
        readerRole: 'user',
      });
      fetchUnreadChatCount();
    }

    return () => {
      mounted = false;
      if (socket && appointmentId) {
        socket.emit('leave-room', String(appointmentId));
      }
    };
  }, [appointmentId, token, backendUrl, socket, fetchUnreadChatCount]);

  useEffect(() => {
    if (!socket || !appointmentId) return;

    const handleIncoming = (msg: ChatMessage & { appointmentId?: string }) => {
      if (msg.appointmentId && String(msg.appointmentId) !== String(appointmentId)) {
        return;
      }
      setMessages((prev) => {
        if (msg._id && prev.some((m) => String(m._id) === String(msg._id))) {
          return prev;
        }
        if (msg.clientTempId) {
          const idx = prev.findIndex((m) => m.clientTempId === msg.clientTempId);
          if (idx > -1) {
            const copy = [...prev];
            copy[idx] = msg;
            return copy;
          }
        }
        return [...prev, msg];
      });

      if (msg.sender !== 'user') {
        setOtherTyping(false);
        socket.emit('mark-messages-read', {
          roomId: String(appointmentId),
          readerRole: 'user',
        });
      }
    };

    const handleTyping = ({
      roomId,
      sender,
      isTyping,
    }: {
      roomId: string;
      sender: string;
      isTyping: boolean;
    }) => {
      if (String(roomId) === String(appointmentId) && sender === 'doctor') {
        setOtherTyping(Boolean(isTyping));
      }
    };

    const handleMessagesRead = ({
      roomId,
      readerRole,
    }: {
      roomId: string;
      readerRole: string;
    }) => {
      if (String(roomId) === String(appointmentId) && readerRole === 'doctor') {
        setMessages((prev) =>
          prev.map((m) => {
            const readBy = m.readBy || [];
            return readBy.includes('doctor')
              ? m
              : { ...m, readBy: [...readBy, 'doctor'] };
          })
        );
      }
    };

    socket.on('chat-message', handleIncoming);
    socket.on('typing', handleTyping);
    socket.on('messages-read', handleMessagesRead);

    return () => {
      socket.off('chat-message', handleIncoming);
      socket.off('typing', handleTyping);
      socket.off('messages-read', handleMessagesRead);
    };
  }, [socket, appointmentId]);

  const emitTyping = (isTyping: boolean) => {
    if (!socket || !appointmentId) return;
    socket.emit('typing', {
      roomId: String(appointmentId),
      sender: 'user',
      senderName: userData?.name || 'Patient',
      isTyping,
    });
  };

  const handleChangeText = (text: string) => {
    setInput(text);
    emitTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => emitTyping(false), 1600);
  };

  const sendMessage = async (overrideText?: string) => {
    const clean = (overrideText ?? input).trim();
    if (!clean || !appointmentId || !token) return;

    const clientTempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const messageObj: ChatMessage = {
      clientTempId,
      sender: 'user',
      senderName: userData?.name || 'Patient',
      text: clean,
      readBy: ['user'],
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, messageObj]);
    if (!overrideText) setInput('');
    emitTyping(false);

    if (socket && socket.connected) {
      socket.emit('chat-message', {
        roomId: String(appointmentId),
        message: messageObj,
      });
    } else {
      try {
        const { data } = await axios.post(
          `${backendUrl}/api/chat/send-message`,
          { appointmentId, ...messageObj },
          { headers: { token } }
        );
        if (data.success && data.message) {
          setMessages((prev) =>
            prev.map((m) => (m.clientTempId === clientTempId ? data.message : m))
          );
        }
      } catch (err) {
        console.warn('REST message fallback error:', err);
      }
    }
  };

  if (!isHydrated) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color={COLORS.cobalt} />
      </View>
    );
  }

  if (!token) {
    return (
      <Redirect
        href={{
          pathname: '/auth',
          params: {
            redirect: appointmentId ? `/chat/${appointmentId}` : '/(tabs)/appointments',
          },
        }}
      />
    );
  }

  const docData = appointment?.docData;
  const docOnline = appointment?.docId ? isDoctorOnline(appointment.docId) : false;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Doctor Context Strip */}
      <View style={styles.docStrip}>
        <DoctorAvatar
          uri={docData?.image}
          name={docData?.name || 'Doctor'}
          size={42}
          online={docOnline}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.docName} numberOfLines={1}>
            {formatDoctorName(docData?.name)}
          </Text>
          <Text style={styles.docMeta} numberOfLines={1}>
            {docOnline ? 'Online now' : docData?.speciality || 'Consultation thread'}
            {appointment?.slotDate
              ? ` · ${slotDateFormat(appointment.slotDate)} ${appointment.slotTime}`
              : ''}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push(`/prescription/${appointmentId}` as any)}
          style={styles.rxBtn}
        >
          <Ionicons name="document-text-outline" size={15} color={COLORS.cobalt} />
          <Text style={styles.rxBtnText}>Rx</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={COLORS.cobalt} />
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 && (
            <View style={styles.emptyThreadBox}>
              <Text style={styles.emptyThreadTitle}>Start your consultation thread</Text>
              <Text style={styles.emptyThreadBody}>
                Share follow-up questions, lab updates, or dosage clarifications directly with your
                doctor.
              </Text>
            </View>
          )}

          {messages.map((msg, idx) => {
            const isUser = msg.sender === 'user';
            const readByDoc = (msg.readBy || []).includes('doctor');
            return (
              <View
                key={msg._id || msg.clientTempId || idx}
                style={[styles.bubble, isUser ? styles.userBubble : styles.docBubble]}
              >
                <Text style={[styles.bubbleText, isUser && { color: '#FFFFFF' }]}>
                  {msg.text}
                </Text>

                {msg.attachmentType === 'prescription' && (
                  <Pressable
                    onPress={() => router.push(`/prescription/${appointmentId}` as any)}
                    style={styles.rxAttachment}
                  >
                    <Ionicons name="document-text" size={14} color={COLORS.cobalt} />
                    <Text style={styles.rxAttachmentText}>
                      {msg.attachmentName || 'Open Digital Prescription'}
                    </Text>
                  </Pressable>
                )}

                <View style={styles.bubbleFooter}>
                  <Text
                    style={[
                      styles.timeText,
                      isUser && { color: 'rgba(255,255,255,0.75)' },
                    ]}
                  >
                    {msg.timestamp
                      ? new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </Text>
                  {isUser && (
                    <Ionicons
                      name={readByDoc ? 'checkmark-done' : 'checkmark'}
                      size={13}
                      color={readByDoc ? '#99F6E4' : 'rgba(255,255,255,0.75)'}
                    />
                  )}
                </View>
              </View>
            );
          })}

          {otherTyping && (
            <View style={styles.typingPill}>
              <Text style={styles.typingText}>Doctor is typing...</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Quick Prompts */}
      <View style={styles.promptsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {QUICK_PROMPTS.map((p, idx) => (
            <Pressable
              key={idx}
              onPress={() => sendMessage(p)}
              style={styles.promptChip}
            >
              <Text style={styles.promptText}>{p}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Input Bar */}
      <View style={styles.inputBar}>
        <TextInput
          value={input}
          onChangeText={handleChangeText}
          placeholder="Message your doctor..."
          placeholderTextColor={COLORS.inkMuted}
          multiline
          style={styles.input}
        />
        <Pressable
          onPress={() => sendMessage()}
          disabled={!input.trim()}
          style={[styles.sendBtn, !input.trim() && { opacity: 0.45 }]}
        >
          <Ionicons name="send" size={17} color="#FFFFFF" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.inkSecondary,
  },
  signInBtn: {
    backgroundColor: COLORS.cobalt,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
  },
  signInText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  docStrip: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  docName: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.ink,
  },
  docMeta: {
    fontSize: 12,
    color: COLORS.inkSecondary,
    marginTop: 1,
  },
  rxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.cobaltSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
  },
  rxBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.cobalt,
  },
  messagesList: {
    padding: SPACING.lg,
    gap: SPACING.sm,
    paddingBottom: 20,
  },
  emptyThreadBox: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: 4,
  },
  emptyThreadTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.ink,
  },
  emptyThreadBody: {
    fontSize: 13,
    color: COLORS.inkSecondary,
    lineHeight: 18,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: RADIUS.lg,
    paddingHorizontal: 13,
    paddingVertical: 10,
    gap: 5,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.cobalt,
    borderBottomRightRadius: 4,
  },
  docBubble: {
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
  rxAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.cobaltSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
  },
  rxAttachmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.cobalt,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  timeText: {
    fontSize: 10,
    color: COLORS.inkMuted,
    fontVariant: ['tabular-nums'],
  },
  typingPill: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.pill,
  },
  typingText: {
    fontSize: 11,
    color: COLORS.inkSecondary,
    fontStyle: 'italic',
  },
  promptsWrap: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
  },
  promptChip: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  promptText: {
    fontSize: 12,
    color: COLORS.inkSecondary,
    fontWeight: '500',
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
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
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
