import { Tabs } from 'expo-router';
import React from 'react';
import { LayoutGrid, User } from 'lucide-react-native';

import { HapticTab } from '@/components/haptic-tab';
import { useAppColors } from '@/hooks/use-app-colors';

export default function TabLayout() {
  const colors = useAppColors();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          borderTopWidth: 0,
          elevation: 0,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color }) => <LayoutGrid size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => <User size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
