import { Tabs } from 'expo-router';
import React from 'react';
import { LayoutGrid, Search } from 'lucide-react-native';

import { HapticTab } from '@/components/haptic-tab';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0066cc',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          borderTopWidth: 0,
          elevation: 0,
          height: 60,
          paddingBottom: 10,
        }
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color }) => <LayoutGrid size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explorer',
          tabBarIcon: ({ color }) => <Search size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
