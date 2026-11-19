import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';
import type { AppointmentData, DoctorData, UserData } from '../utils/clinical';

const TOKEN_KEY = 'prescripto_token';
const BACKEND_URL_KEY = 'prescripto_backend_url';
const DEFAULT_BACKEND_URL = (
  process.env.EXPO_PUBLIC_BACKEND_URL || 'https://vitalsync-mhaq.onrender.com'
).replace(/\/+$/, '');

export const BACKEND_PRESETS = [
  { label: 'VitalSync Cloud (Render)', url: 'https://vitalsync-mhaq.onrender.com' },
  { label: 'Localhost (Web / iOS Sim)', url: 'http://localhost:4000' },
  { label: 'Android Emulator (10.0.2.2)', url: 'http://10.0.2.2:4000' },
] as const;

export interface PaymentConfig {
  testMode: boolean;
  razorpayEnabled: boolean;
  stripeEnabled: boolean;
}

export interface AssistantAlternative {
  id: string;
  label: string;
}

export interface AssistantUnderstood {
  label?: string;
  prefilledDetails?: Array<{ label: string }>;
  alternatives?: AssistantAlternative[];
}

export interface AssistantVerdict {
  urgencyLevel?: string;
  isEmergencyBypass?: boolean;
  emergencyBanner?: string;
  possibleConcernArea?: string;
  primarySpeciality?: string;
  primaryReasoning?: string;
  primaryDoctors?: DoctorData[];
  secondarySpeciality?: string;
  secondaryReasoning?: string;
  secondaryDoctors?: DoctorData[];
  immediateAdvice?: string;
}

export interface SafetyAlertItem {
  allergen?: string;
  drug?: string;
  severity?: string;
  effect?: string;
  recommendation?: string;
}

export interface SafetyInteractionItem {
  drugA?: string;
  drugB?: string;
  severity?: string;
  mechanism?: string;
  effect?: string;
  recommendation?: string;
}

export interface SafetyReport {
  overallRisk?: string;
  summary?: string;
  aiSummary?: string;
  allergyAlerts?: SafetyAlertItem[];
  interactions?: SafetyInteractionItem[];
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'bot';
  intent?: string;
  text: string;
  understood?: AssistantUnderstood | null;
  quickOptions?: string[];
  actionButton?: { label?: string; path?: string } | null;
  navigateTo?: string | null;
  canSkipToVerdict?: boolean;
  verdict?: AssistantVerdict | null;
  safetyReport?: SafetyReport | null;
  doctors?: DoctorData[];
  secondaryDoctors?: DoctorData[];
}

export interface TriageState {
  active: boolean;
  questionCount: number;
  chiefComplaint: string;
  organDomain: string | null;
  lastSlotName: string;
  collectedFacts: string[];
}

export interface NotificationItem {
  _id: string;
  type?: string;
  title: string;
  body: string;
  appointmentId?: string;
  link?: string;
  isRead?: boolean;
  createdAt?: string;
}

interface AppContextValue {
  currencySymbol: string;
  backendUrl: string;
  setBackendUrl: (url: string) => Promise<void>;
  token: string;
  saveToken: (newToken: string) => Promise<void>;
  logout: () => Promise<void>;
  isHydrated: boolean;
  doctors: DoctorData[];
  doctorsLoading: boolean;
  getDoctorsData: () => Promise<void>;
  userData: UserData | null;
  setUserData: React.Dispatch<React.SetStateAction<UserData | null>>;
  loadUserProfileData: () => Promise<void>;
  appointments: AppointmentData[];
  appointmentsLoading: boolean;
  getUserAppointments: () => Promise<void>;
  paymentConfig: PaymentConfig;
  fetchPaymentConfig: () => Promise<void>;
  socket: Socket | null;
  onlineDoctors: string[];
  isDoctorOnline: (docId: string) => boolean;
  notifications: NotificationItem[];
  unreadNotifCount: number;
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (notificationId?: string | null) => Promise<void>;
  unreadChatCount: number;
  fetchUnreadChatCount: () => Promise<void>;
  assistantMessages: AssistantMessage[];
  assistantTriageState: TriageState;
  assistantLoading: boolean;
  latestVerdict: AssistantVerdict | null;
  sendAssistantMessage: (
    rawText: string,
    options?: {
      forceVerdict?: boolean;
      overrideProtocolId?: string | null;
      overrideLabel?: string;
    }
  ) => Promise<void>;
  resetAssistantChat: () => Promise<void>;
}

const INITIAL_TRIAGE_STATE: TriageState = {
  active: false,
  questionCount: 0,
  chiefComplaint: '',
  organDomain: null,
  lastSlotName: '',
  collectedFacts: [],
};

const createWelcomeMessage = (id = 'welcome-msg'): AssistantMessage => ({
  id,
  role: 'bot',
  intent: 'welcome',
  text: "Hello! I'm your VitalSync Clinical Assistant. Describe your symptoms in your own words, ask if a medicine is safe with your allergies, or ask to find a specialist.",
  quickOptions: [
    'I have severe hairfall at the top of my head',
    'Pooping right after drinking water happens daily',
    'Throbbing headache on one side for 2 days',
    'Is Ibuprofen safe with my profile?',
  ],
  doctors: [],
  secondaryDoctors: [],
  verdict: null,
  safetyReport: null,
  canSkipToVerdict: false,
});

export const AppContext = createContext<AppContextValue | undefined>(undefined);

export const useAppContext = (): AppContextValue => {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppContext must be used inside AppContextProvider');
  }
  return ctx;
};

export const AppContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const currencySymbol = '₹';

  const [backendUrl, setBackendUrlState] = useState<string>(DEFAULT_BACKEND_URL);
  const [token, setTokenState] = useState<string>('');
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  const [doctors, setDoctors] = useState<DoctorData[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState<boolean>(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState<boolean>(false);
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>({
    testMode: false,
    razorpayEnabled: true,
    stripeEnabled: false,
  });

  const [socket, setSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [onlineDoctors, setOnlineDoctors] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);

  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([
    createWelcomeMessage(),
  ]);
  const [assistantTriageState, setAssistantTriageState] =
    useState<TriageState>(INITIAL_TRIAGE_STATE);
  const [assistantLoading, setAssistantLoading] = useState<boolean>(false);
  const [latestVerdict, setLatestVerdict] = useState<AssistantVerdict | null>(null);

  // Hydrate token and backendUrl from AsyncStorage on startup
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [storedToken, storedUrl] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(BACKEND_URL_KEY),
        ]);
        if (!active) return;
        if (storedToken) setTokenState(storedToken);
        if (storedUrl) setBackendUrlState(storedUrl.replace(/\/+$/, ''));
      } catch (err) {
        console.warn('Storage hydration error:', err);
      } finally {
        if (active) setIsHydrated(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setBackendUrl = useCallback(async (url: string) => {
    const clean = String(url || '').trim().replace(/\/+$/, '') || DEFAULT_BACKEND_URL;
    setBackendUrlState(clean);
    await AsyncStorage.setItem(BACKEND_URL_KEY, clean);
  }, []);

  const saveToken = useCallback(async (newToken: string) => {
    setTokenState(newToken);
    if (newToken) {
      await AsyncStorage.setItem(TOKEN_KEY, newToken);
    } else {
      await AsyncStorage.removeItem(TOKEN_KEY);
    }
  }, []);

  const logout = useCallback(async () => {
    setTokenState('');
    setUserData(null);
    setAppointments([]);
    setNotifications([]);
    setUnreadChatCount(0);
    await AsyncStorage.removeItem(TOKEN_KEY);
  }, []);

  const getDoctorsData = useCallback(async () => {
    if (!backendUrl) return;
    setDoctorsLoading(true);
    try {
      const { data } = await axios.get(`${backendUrl}/api/doctor/list`, { timeout: 12000 });
      if (data.success && Array.isArray(data.doctors)) {
        setDoctors(data.doctors);
      }
    } catch (error) {
      console.warn('Doctors fetch error:', error);
    } finally {
      setDoctorsLoading(false);
    }
  }, [backendUrl]);

  const fetchPaymentConfig = useCallback(async () => {
    if (!backendUrl) return;
    try {
      const { data } = await axios.get(`${backendUrl}/api/user/payment-config`, { timeout: 10000 });
      if (data.success) {
        setPaymentConfig({
          testMode: Boolean(data.testMode),
          razorpayEnabled: Boolean(data.razorpayEnabled),
          stripeEnabled: Boolean(data.stripeEnabled),
        });
      }
    } catch (error) {
      console.warn('Payment config error:', error);
    }
  }, [backendUrl]);

  const loadUserProfileData = useCallback(async () => {
    if (!token || !backendUrl) return;
    try {
      const { data } = await axios.get(`${backendUrl}/api/user/get-profile`, {
        headers: { token },
        timeout: 12000,
      });
      if (data.success && data.userData) {
        setUserData(data.userData);
      }
    } catch (error: any) {
      if (error?.response?.status === 401) {
        await logout();
      } else {
        console.warn('Profile load error:', error?.message);
      }
    }
  }, [backendUrl, token, logout]);

  const getUserAppointments = useCallback(async () => {
    if (!token || !backendUrl) {
      setAppointments([]);
      return;
    }
    setAppointmentsLoading(true);
    try {
      const { data } = await axios.get(`${backendUrl}/api/user/appointments`, {
        headers: { token },
        timeout: 12000,
      });
      if (data.success && Array.isArray(data.appointments)) {
        setAppointments([...data.appointments].reverse());
      }
    } catch (error) {
      console.warn('Appointments load error:', error);
    } finally {
      setAppointmentsLoading(false);
    }
  }, [backendUrl, token]);

  const fetchNotifications = useCallback(async () => {
    if (!token || !backendUrl) {
      setNotifications([]);
      return;
    }
    try {
      const { data } = await axios.get(`${backendUrl}/api/chat/notifications`, {
        headers: { token },
        timeout: 10000,
      });
      if (data.success) {
        setNotifications(data.notifications || []);
      }
    } catch (error) {
      console.warn('Notifications fetch error:', error);
    }
  }, [backendUrl, token]);

  const fetchUnreadChatCount = useCallback(async () => {
    if (!token || !backendUrl) {
      setUnreadChatCount(0);
      return;
    }
    try {
      const { data } = await axios.get(`${backendUrl}/api/chat/inbox`, {
        headers: { token },
        timeout: 10000,
      });
      if (data.success && Array.isArray(data.threads)) {
        const total = data.threads.reduce((sum: number, t: any) => sum + (t.unreadCount || 0), 0);
        setUnreadChatCount(total);
      }
    } catch (error) {
      console.warn('Unread chat count error:', error);
    }
  }, [backendUrl, token]);

  const markNotificationRead = useCallback(
    async (notificationId: string | null = null) => {
      if (!token || !backendUrl) return;
      try {
        await axios.post(
          `${backendUrl}/api/chat/notifications/mark-read`,
          { notificationId },
          { headers: { token } }
        );
        setNotifications((prev) =>
          prev.map((n) =>
            !notificationId || n._id === notificationId ? { ...n, isRead: true } : n
          )
        );
      } catch (error) {
        console.warn('Mark notification read error:', error);
      }
    },
    [backendUrl, token]
  );

  const isDoctorOnline = useCallback(
    (docId: string) => onlineDoctors.includes(String(docId)),
    [onlineDoctors]
  );

  // Initial & server-change fetches
  useEffect(() => {
    if (!isHydrated) return;
    getDoctorsData();
    fetchPaymentConfig();
  }, [isHydrated, getDoctorsData, fetchPaymentConfig]);

  useEffect(() => {
    if (!isHydrated) return;
    if (token) {
      loadUserProfileData();
      getUserAppointments();
      fetchNotifications();
      fetchUnreadChatCount();
    } else {
      setUserData(null);
      setAppointments([]);
      setNotifications([]);
      setUnreadChatCount(0);
    }
  }, [
    isHydrated,
    token,
    loadUserProfileData,
    getUserAppointments,
    fetchNotifications,
    fetchUnreadChatCount,
  ]);

  // Persistent Socket.IO connection
  useEffect(() => {
    if (!isHydrated || !backendUrl) return;

    const newSocket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      auth: token ? { token } : {},
    });
    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      if (token) {
        newSocket.emit('register-session', { token });
      }
      newSocket.emit('get-presence');
    });

    newSocket.on('presence-update', ({ onlineDoctors: docs = [] }: { onlineDoctors?: string[] }) => {
      setOnlineDoctors(docs.map(String));
    });

    newSocket.on('doctors-updated', () => {
      getDoctorsData();
    });

    newSocket.on('appointment-updated', () => {
      getDoctorsData();
      getUserAppointments();
      fetchUnreadChatCount();
    });

    newSocket.on('chat-thread-updated', () => {
      fetchUnreadChatCount();
    });

    newSocket.on('messages-read', () => {
      fetchUnreadChatCount();
    });

    newSocket.on('notification', (notif: NotificationItem) => {
      setNotifications((prev) => [notif, ...prev.filter((n) => n._id !== notif._id)]);
    });

    return () => {
      newSocket.disconnect();
      socketRef.current = null;
    };
  }, [isHydrated, backendUrl, token, getDoctorsData, getUserAppointments, fetchUnreadChatCount]);

  const sendAssistantMessage = useCallback(
    async (
      rawText: string,
      {
        forceVerdict = false,
        overrideProtocolId = null,
        overrideLabel = '',
      }: {
        forceVerdict?: boolean;
        overrideProtocolId?: string | null;
        overrideLabel?: string;
      } = {}
    ) => {
      const cleanText = String(rawText || '').trim();
      if ((!cleanText && !forceVerdict && !overrideProtocolId) || assistantLoading) return;

      const lowerClean = cleanText.toLowerCase();
      if (
        lowerClean === 'start a new symptom check' ||
        lowerClean === 'check my symptoms instead' ||
        lowerClean === 'new symptom check'
      ) {
        setAssistantTriageState(INITIAL_TRIAGE_STATE);
        setLatestVerdict(null);
        setAssistantMessages((prev) => [
          ...prev.map((m) => ({ ...m, canSkipToVerdict: false })),
          { id: `user-${Date.now()}`, role: 'user', text: cleanText },
          {
            id: `bot-${Date.now() + 1}`,
            role: 'bot',
            intent: 'welcome',
            text: 'Ready for a fresh symptom check! Tell me what symptoms you are experiencing, when they started, and how they feel.',
            quickOptions: [
              'I have severe hairfall at the top of my head',
              'Pooping right after drinking water happens daily',
              'Throbbing headache on one side for 2 days',
              'Itchy skin rash on my arms',
            ],
          },
        ]);
        return;
      }

      const userBubbleText = overrideProtocolId
        ? `Changed complaint to: ${overrideLabel || overrideProtocolId}`
        : forceVerdict && !cleanText
          ? 'Show my doctor recommendation now'
          : cleanText;

      setAssistantMessages((prev) => [
        ...prev.map((m) => ({ ...m, canSkipToVerdict: false })),
        { id: `user-${Date.now()}`, role: 'user', text: userBubbleText },
      ]);

      setAssistantLoading(true);
      try {
        const { data } = await axios.post(`${backendUrl}/api/chatbot/assistant`, {
          userId: userData?._id || 'anonymous',
          message: cleanText,
          triageState: assistantTriageState,
          forceVerdict,
          overrideProtocolId,
        });

        if (data.success) {
          if (data.triageState) setAssistantTriageState(data.triageState);
          if (data.verdict) setLatestVerdict(data.verdict);
          else if (data.intent === 'welcome' || data.intent === 'session_reset') {
            setLatestVerdict(null);
          }

          setAssistantMessages((prev) => [
            ...prev,
            {
              id: `bot-${Date.now()}`,
              role: 'bot',
              intent: data.intent || 'general_chat',
              text: data.response || '',
              understood: data.understood || null,
              quickOptions: data.quickOptions || [],
              actionButton: data.actionButton || null,
              navigateTo: data.navigateTo || null,
              canSkipToVerdict: Boolean(data.canSkipToVerdict),
              verdict: data.verdict || null,
              safetyReport: data.safetyReport || null,
              doctors: data.doctors || [],
              secondaryDoctors: data.secondaryDoctors || [],
            },
          ]);
        } else {
          setAssistantMessages((prev) => [
            ...prev,
            {
              id: `bot-${Date.now()}`,
              role: 'bot',
              intent: 'error',
              text: data.message || "I couldn't process that request right now. Please try again.",
            },
          ]);
        }
      } catch (error) {
        setAssistantMessages((prev) => [
          ...prev,
          {
            id: `bot-${Date.now()}`,
            role: 'bot',
            intent: 'error',
            text: 'Clinical assistant is temporarily unreachable. Check your backend connection and try again.',
          },
        ]);
      } finally {
        setAssistantLoading(false);
      }
    },
    [assistantLoading, assistantTriageState, backendUrl, userData?._id]
  );

  const resetAssistantChat = useCallback(async () => {
    try {
      await axios.post(`${backendUrl}/api/chatbot/clear`, {
        userId: userData?._id || 'anonymous',
      });
    } catch {
      // ignore network error during reset
    }
    setAssistantTriageState(INITIAL_TRIAGE_STATE);
    setLatestVerdict(null);
    setAssistantMessages([createWelcomeMessage(`welcome-${Date.now()}`)]);
  }, [backendUrl, userData?._id]);

  const unreadNotifCount = notifications.filter((n) => !n.isRead).length;

  return (
    <AppContext.Provider
      value={{
        currencySymbol,
        backendUrl,
        setBackendUrl,
        token,
        saveToken,
        logout,
        isHydrated,
        doctors,
        doctorsLoading,
        getDoctorsData,
        userData,
        setUserData,
        loadUserProfileData,
        appointments,
        appointmentsLoading,
        getUserAppointments,
        paymentConfig,
        fetchPaymentConfig,
        socket,
        onlineDoctors,
        isDoctorOnline,
        notifications,
        unreadNotifCount,
        fetchNotifications,
        markNotificationRead,
        unreadChatCount,
        fetchUnreadChatCount,
        assistantMessages,
        assistantTriageState,
        assistantLoading,
        latestVerdict,
        sendAssistantMessage,
        resetAssistantChat,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
