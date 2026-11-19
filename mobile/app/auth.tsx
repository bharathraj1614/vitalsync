import React, { useMemo, useState } from 'react';
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
import { useAppContext } from '../src/context/AppContext';
import { BackendServerBox } from '../src/components/BackendServerBox';
import { COLORS, RADIUS, SPACING } from '../src/theme/tokens';

const getSafeMobileRedirect = (rawPath?: string | string[], fallback = '/(tabs)') => {
  const value = Array.isArray(rawPath) ? rawPath[0] : rawPath;
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return fallback;
  if (trimmed === '/auth' || trimmed.startsWith('/auth?') || trimmed.startsWith('/auth/')) {
    return fallback;
  }
  return trimmed;
};

export default function AuthScreen() {
  const router = useRouter();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { backendUrl, saveToken, token, isHydrated } = useAppContext();
  const safeRedirect = getSafeMobileRedirect(redirect, '/(tabs)');

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const strength = useMemo(() => {
    if (!password) return { score: 0, label: '', color: COLORS.border };
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    switch (score) {
      case 1:
        return { score: 1, label: 'Weak', color: COLORS.alertRose };
      case 2:
        return { score: 2, label: 'Fair', color: COLORS.cautionAmber };
      case 3:
        return { score: 3, label: 'Good', color: COLORS.cobalt };
      case 4:
        return { score: 4, label: 'Strong', color: COLORS.vitalGreen };
      default:
        return { score: 0, label: 'Too short (min 8 chars)', color: COLORS.alertRose };
    }
  }, [password]);

  const handleSubmit = async () => {
    setErrorMsg('');
    if (!email.trim() || !password) {
      setErrorMsg('Enter your email address and password.');
      return;
    }
    if (mode === 'register') {
      if (!name.trim()) {
        setErrorMsg('Enter your full name to create an account.');
        return;
      }
      if (password.length < 8) {
        setErrorMsg('Password must be at least 8 characters long.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const endpoint =
        mode === 'register' ? '/api/user/register' : '/api/user/login';
      const payload =
        mode === 'register'
          ? { name: name.trim(), email: email.trim(), password }
          : { email: email.trim(), password };

      const { data } = await axios.post(`${backendUrl}${endpoint}`, payload, {
        timeout: 15000,
      });

      if (data.success && data.token) {
        await saveToken(data.token);
        router.replace(safeRedirect as any);
      } else {
        setErrorMsg(data.message || 'Authentication failed.');
      }
    } catch (err: any) {
      setErrorMsg(
        err?.response?.data?.message || err?.message || 'Unable to reach server.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (isHydrated && token) {
    return <Redirect href={safeRedirect as any} />;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.canvas }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.heroCard}>
          <View style={styles.modeToggle}>
            <Pressable
              onPress={() => {
                setMode('login');
                setErrorMsg('');
              }}
              style={[styles.modeTab, mode === 'login' && styles.modeTabActive]}
            >
              <Text style={[styles.modeText, mode === 'login' && styles.modeTextActive]}>
                Sign in
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setMode('register');
                setErrorMsg('');
              }}
              style={[styles.modeTab, mode === 'register' && styles.modeTabActive]}
            >
              <Text style={[styles.modeText, mode === 'register' && styles.modeTextActive]}>
                Create account
              </Text>
            </Pressable>
          </View>

          <Text style={styles.title}>
            {mode === 'login' ? 'Sign in to Prescripto' : 'Create patient account'}
          </Text>
          <Text style={styles.subtitle}>
            {mode === 'login'
              ? 'Access your clinical dossier, upcoming consultations, and digital prescriptions.'
              : 'Set up your patient portal account to book doctors and track medication safety.'}
          </Text>

          {Boolean(errorMsg) && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={COLORS.alertRose} />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          {mode === 'register' && (
            <View style={styles.field}>
              <Text style={styles.label}>Full name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Aarav Mehta"
                placeholderTextColor={COLORS.inkMuted}
                style={styles.input}
              />
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Email address</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="patient@example.com"
              placeholderTextColor={COLORS.inkMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Minimum 8 characters"
                placeholderTextColor={COLORS.inkMuted}
                secureTextEntry={!showPassword}
                style={styles.passwordInput}
              />
              <Pressable onPress={() => setShowPassword((v) => !v)} style={{ padding: 6 }}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={COLORS.inkSecondary}
                />
              </Pressable>
            </View>

            {mode === 'register' && password.length > 0 && (
              <View style={styles.strengthRow}>
                <View style={styles.strengthBars}>
                  {[1, 2, 3, 4].map((lvl) => (
                    <View
                      key={lvl}
                      style={[
                        styles.strengthBar,
                        {
                          backgroundColor:
                            strength.score >= lvl ? strength.color : COLORS.surfaceMuted,
                        },
                      ]}
                    />
                  ))}
                </View>
                <Text style={[styles.strengthLabel, { color: strength.color }]}>
                  {strength.label}
                </Text>
              </View>
            )}
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={({ pressed }) => [
              styles.submitBtn,
              submitting && { opacity: 0.6 },
              pressed && { opacity: 0.9 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitBtnText}>
                {mode === 'login' ? 'Sign in to portal' : 'Create patient account'}
              </Text>
            )}
          </Pressable>
        </View>

        <BackendServerBox />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: SPACING.lg,
    gap: SPACING.lg,
    paddingBottom: 36,
  },
  heroCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: 4,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  modeTabActive: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modeText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.inkSecondary,
  },
  modeTextActive: {
    color: COLORS.ink,
    fontWeight: '700',
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
    color: COLORS.ink,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.inkSecondary,
    lineHeight: 19,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.alertRoseSoft,
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: RADIUS.sm,
    padding: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.alertRose,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.inkSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.canvas,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
    color: COLORS.ink,
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.canvas,
    paddingLeft: 13,
    paddingRight: 6,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 14,
    color: COLORS.ink,
  },
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  strengthBars: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 999,
  },
  strengthLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: COLORS.cobalt,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
