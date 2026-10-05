import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Info, RefreshCw, WifiOff } from 'lucide-react-native';
import { useAppColors } from '@/hooks/use-app-colors';

type IconComponent = React.ComponentType<{ size?: number; color?: string }>;

export function LoadingView({ message }: { message?: string }) {
  const colors = useAppColors();
  return (
    <View className="flex-1 justify-center items-center p-6 bg-slate-50 dark:bg-slate-950">
      <ActivityIndicator size="large" color={colors.primary} />
      {message ? (
        <Text className="mt-3 text-slate-500 dark:text-slate-400 text-center">{message}</Text>
      ) : null}
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="flex-1 justify-center items-center p-8">
      <Info size={44} color="#ef4444" />
      <Text className="mt-4 text-center text-slate-700 dark:text-slate-300 font-medium">{message}</Text>
      {onRetry ? (
        <TouchableOpacity
          onPress={onRetry}
          accessibilityRole="button"
          className="mt-5 flex-row items-center px-5 py-3 rounded-xl bg-blue-600"
        >
          <RefreshCw size={16} color="white" />
          <Text className="ml-2 text-white font-bold">Réessayer</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function EmptyView({
  icon: Icon,
  title,
  message,
}: {
  icon: IconComponent;
  title: string;
  message?: string;
}) {
  const colors = useAppColors();
  return (
    <View className="bg-white dark:bg-slate-900 p-8 rounded-2xl items-center border border-dashed border-slate-300 dark:border-slate-700">
      <Icon size={44} color={colors.subtle} />
      <Text className="mt-4 text-center font-bold text-slate-700 dark:text-slate-200">{title}</Text>
      {message ? (
        <Text className="mt-1 text-center text-slate-400 dark:text-slate-500">{message}</Text>
      ) : null}
    </View>
  );
}

/** Bandeau d'état : hors-ligne (données du cache) ou erreur de rafraîchissement. */
export function StatusBanner({ offline, error }: { offline?: boolean; error?: string | null }) {
  if (offline) {
    return (
      <View className="flex-row items-center mb-4 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900">
        <WifiOff size={16} color="#d97706" />
        <Text className="ml-2 flex-1 text-xs font-medium text-amber-700 dark:text-amber-300">
          Hors-ligne : données enregistrées sur cet appareil.
        </Text>
      </View>
    );
  }
  if (error) {
    return (
      <View className="flex-row items-center mb-4 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900">
        <Info size={16} color="#ef4444" />
        <Text className="ml-2 flex-1 text-xs font-medium text-red-700 dark:text-red-300">{error}</Text>
      </View>
    );
  }
  return null;
}
