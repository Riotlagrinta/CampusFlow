import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useAppColors } from '@/hooks/use-app-colors';

/** Retour à l'écran précédent, ou à l'accueil s'il n'y en a pas (ex. après une redirection). */
export function goBackOrHome() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  /** Élément affiché à droite (icône hors-ligne, compteur de jetons...). */
  right?: React.ReactNode;
  /** Remplace le retour par défaut (ex. remonter d'un dossier). */
  onBack?: () => void;
};

export function ScreenHeader({ title, subtitle, right, onBack }: ScreenHeaderProps) {
  const colors = useAppColors();

  return (
    <View className="px-4 py-4 flex-row items-center justify-between bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
      <View className="flex-row items-center flex-1">
        <TouchableOpacity
          onPress={onBack ?? goBackOrHome}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="mr-4"
        >
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-slate-900 dark:text-white" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-xs text-slate-500 dark:text-slate-400 font-medium" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {right ? <View className="ml-3">{right}</View> : null}
    </View>
  );
}
