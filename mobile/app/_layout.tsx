import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppContextProvider } from '../src/context/AppContext';
import { COLORS } from '../src/theme/tokens';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppContextProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: COLORS.surface },
            headerTintColor: COLORS.ink,
            headerTitleStyle: { fontWeight: '700', fontSize: 16 },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: COLORS.canvas },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="auth"
            options={{ title: 'Patient sign in', presentation: 'modal' }}
          />
          <Stack.Screen
            name="doctor/[docId]"
            options={{ title: 'Book consultation' }}
          />
          <Stack.Screen
            name="prescription/[appointmentId]"
            options={{ title: 'Digital prescription' }}
          />
          <Stack.Screen
            name="chat/[appointmentId]"
            options={{ title: 'Doctor message thread' }}
          />
          <Stack.Screen
            name="drug-checker"
            options={{ title: 'Medicine safety checker' }}
          />
        </Stack>
      </AppContextProvider>
    </SafeAreaProvider>
  );
}
