import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import 'react-native-reanimated';
import "../global.css";
import { AuthProvider, useAuth } from '../src/context/AuthContext';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

/**
 * Renvoie vers la connexion quand une session ouverte se termine (déconnexion,
 * jeton expiré ou révoqué). Ne fait rien en mode invité ni au démarrage.
 */
function SessionWatcher() {
  const { token, isLoading } = useAuth();
  const router = useRouter();
  const hadSession = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (token) {
      hadSession.current = true;
      return;
    }
    if (hadSession.current) {
      hadSession.current = false;
      router.replace('/auth/login');
    }
  }, [token, isLoading, router]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="auth/login" />
          <Stack.Screen name="auth/register" />
          <Stack.Screen name="auth/verify-otp" />
          <Stack.Screen name="auth/forgot-password" />
          <Stack.Screen name="(tabs)" />
        </Stack>
        <SessionWatcher />
        <StatusBar style="auto" />
      </ThemeProvider>
    </AuthProvider>
  );
}
