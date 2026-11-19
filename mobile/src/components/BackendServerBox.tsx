import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { BACKEND_PRESETS, useAppContext } from '../context/AppContext';
import { COLORS, RADIUS, SPACING } from '../theme/tokens';

export const BackendServerBox: React.FC = () => {
  const { backendUrl, setBackendUrl, getDoctorsData, fetchPaymentConfig } = useAppContext();
  const [draftUrl, setDraftUrl] = useState(backendUrl);
  const [testing, setTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const applyAndTest = async (targetUrl: string) => {
    const clean = targetUrl.trim().replace(/\/+$/, '');
    if (!clean) return;
    setDraftUrl(clean);
    await setBackendUrl(clean);
    setTesting(true);
    setStatusMessage(null);
    try {
      const res = await axios.get(`${clean}/`, { timeout: 8000 });
      setStatusMessage({
        ok: true,
        text: `Connected (${typeof res.data === 'string' ? res.data : 'API ready'})`,
      });
      getDoctorsData();
      fetchPaymentConfig();
    } catch (err: any) {
      setStatusMessage({
        ok: false,
        text: err?.message || 'Unable to reach server',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          <Ionicons name="server-outline" size={16} color={COLORS.inkSecondary} />
          <Text style={styles.title}>Backend server connection</Text>
        </View>
        <Text style={styles.activeUrl} numberOfLines={1}>
          {backendUrl}
        </Text>
      </View>

      <View style={styles.presetsWrap}>
        {BACKEND_PRESETS.map((preset) => {
          const isSelected = backendUrl === preset.url;
          return (
            <Pressable
              key={preset.url}
              onPress={() => applyAndTest(preset.url)}
              style={[styles.presetChip, isSelected && styles.presetChipActive]}
            >
              <Text style={[styles.presetText, isSelected && styles.presetTextActive]}>
                {preset.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.inputRow}>
        <TextInput
          value={draftUrl}
          onChangeText={setDraftUrl}
          placeholder="https://your-api-host.com"
          placeholderTextColor={COLORS.inkMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        <Pressable
          onPress={() => applyAndTest(draftUrl)}
          disabled={testing}
          style={({ pressed }) => [styles.testBtn, pressed && { opacity: 0.85 }]}
        >
          {testing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.testBtnText}>Test connection</Text>
          )}
        </Pressable>
      </View>

      {statusMessage && (
        <View
          style={[
            styles.statusBanner,
            {
              backgroundColor: statusMessage.ok ? COLORS.vitalGreenSoft : COLORS.alertRoseSoft,
              borderColor: statusMessage.ok ? '#99F6E4' : '#FECDD3',
            },
          ]}
        >
          <Ionicons
            name={statusMessage.ok ? 'checkmark-circle' : 'alert-circle'}
            size={15}
            color={statusMessage.ok ? COLORS.vitalGreen : COLORS.alertRose}
          />
          <Text
            style={[
              styles.statusText,
              { color: statusMessage.ok ? COLORS.vitalGreen : COLORS.alertRose },
            ]}
          >
            {statusMessage.text}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  headerRow: {
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.ink,
  },
  activeUrl: {
    fontSize: 12,
    color: COLORS.inkMuted,
  },
  presetsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.canvas,
  },
  presetChipActive: {
    borderColor: COLORS.cobalt,
    backgroundColor: COLORS.cobaltSoft,
  },
  presetText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.inkSecondary,
  },
  presetTextActive: {
    color: COLORS.cobalt,
  },
  inputRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: COLORS.ink,
    backgroundColor: COLORS.canvas,
  },
  testBtn: {
    backgroundColor: COLORS.ink,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADIUS.sm,
    minWidth: 112,
    alignItems: 'center',
  },
  testBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
});
