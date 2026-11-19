import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../../src/context/AppContext';
import { COLORS } from '../../src/theme/tokens';

export default function TabLayout() {
  const { unreadChatCount } = useAppContext();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.cobalt,
        tabBarInactiveTintColor: COLORS.inkMuted,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'medical' : 'medical-outline'}
              size={22}
              color={focused ? COLORS.cobalt : COLORS.inkMuted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="doctors"
        options={{
          title: 'Specialists',
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'people' : 'people-outline'}
              size={22}
              color={focused ? COLORS.cobalt : COLORS.inkMuted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="triage"
        options={{
          title: 'AI Triage',
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'pulse' : 'pulse-outline'}
              size={22}
              color={focused ? COLORS.cobalt : COLORS.inkMuted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="appointments"
        options={{
          title: 'Consults',
          tabBarBadge: unreadChatCount > 0 ? unreadChatCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: COLORS.alertRose,
            color: '#FFFFFF',
            fontSize: 10,
          },
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              size={22}
              color={focused ? COLORS.cobalt : COLORS.inkMuted}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Dossier',
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name={focused ? 'person-circle' : 'person-circle-outline'}
              size={22}
              color={focused ? COLORS.cobalt : COLORS.inkMuted}
            />
          ),
        }}
      />
    </Tabs>
  );
}
