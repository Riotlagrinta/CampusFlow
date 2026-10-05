import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { useAppColors } from '@/hooks/use-app-colors';

/** Affiché à la place du contenu quand l'utilisateur navigue en mode invité. */
export function RequireLogin({ message }: { message?: string }) {
  const colors = useAppColors();

  return (
    <View className="flex-1 justify-center items-center p-8">
      <View className="w-16 h-16 rounded-2xl items-center justify-center bg-blue-100 dark:bg-blue-950 mb-5">
        <Lock size={30} color={colors.primary} />
      </View>
      <Text className="text-xl font-bold text-center text-slate-900 dark:text-white mb-2">
        Connexion requise
      </Text>
      <Text className="text-center text-slate-500 dark:text-slate-400 mb-6">
        {message ?? 'Connectez-vous pour accéder à cette fonctionnalité.'}
      </Text>
      <TouchableOpacity
        onPress={() => router.push('/auth/login')}
        accessibilityRole="button"
        className="w-full py-4 rounded-xl items-center bg-blue-600"
      >
        <Text className="text-white font-bold text-lg">Se connecter</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => router.push('/auth/register')}
        accessibilityRole="button"
        className="w-full py-4 mt-3 rounded-xl items-center bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
      >
        <Text className="text-slate-700 dark:text-slate-200 font-bold text-lg">Créer un compte</Text>
      </TouchableOpacity>
    </View>
  );
}
