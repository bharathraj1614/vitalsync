import React, { useState } from 'react';
import { Image, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { COLORS } from '../theme/tokens';

interface Props {
  uri?: string;
  name?: string;
  size?: number;
  online?: boolean;
  style?: ViewStyle;
}

export const DoctorAvatar: React.FC<Props> = ({
  uri,
  name = 'Doctor',
  size = 52,
  online = false,
  style,
}) => {
  const [failed, setFailed] = useState(false);

  const initials = String(name || 'DR')
    .replace(/^Dr\.\s*/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'DR';

  const hasValidImage = Boolean(uri && !failed && !uri.startsWith('data:image/svg'));

  return (
    <View style={[{ width: size, height: size, position: 'relative' }, style]}>
      {hasValidImage ? (
        <Image
          source={{ uri }}
          onError={() => setFailed(true)}
          style={[
            styles.image,
            { width: size, height: size, borderRadius: size * 0.28 },
          ]}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            { width: size, height: size, borderRadius: size * 0.28 },
          ]}
        >
          <Text style={[styles.initials, { fontSize: Math.max(12, size * 0.34) }]}>
            {initials}
          </Text>
        </View>
      )}
      {online && (
        <View
          style={[
            styles.onlineDot,
            {
              width: Math.max(10, size * 0.24),
              height: Math.max(10, size * 0.24),
              borderRadius: 999,
            },
          ]}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  image: {
    backgroundColor: COLORS.cobaltSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  fallback: {
    backgroundColor: COLORS.cobaltSoft,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: COLORS.cobalt,
    fontWeight: '700',
  },
  onlineDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    backgroundColor: COLORS.vitalGreen,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
});
