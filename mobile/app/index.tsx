import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Redirect, router } from 'expo-router';
import { ArrowRight, CircleCheckBig, Zap } from 'lucide-react-native';
import { useAuth } from '../src/context/AuthContext';
import { Screen } from '@/components/screen';
import { LoadingView } from '@/components/state-views';
import { useAppColors } from '@/hooks/use-app-colors';

export default function OnboardingScreen() {
  const { token, isLoading } = useAuth();
  const colors = useAppColors();

  // Relecture et validation de la session stockée en cours.
  if (isLoading) {
    return <LoadingView />;
  }

  // Session valide : l'onboarding n'a plus lieu d'être.
  if (token) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Screen className="bg-white dark:bg-slate-950">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        {/* Hero Section */}
        <View className="items-center px-6 pt-10 pb-6">
          <View className="w-20 h-20 bg-blue-100 dark:bg-blue-950 rounded-2xl items-center justify-center mb-6">
            <Zap size={40} color={colors.primary} />
          </View>
          <Text className="text-3xl font-bold text-center text-slate-900 dark:text-white mb-2">
            DefiTech Student Hub
          </Text>
          <Text className="text-lg text-center text-slate-500 dark:text-slate-400 mb-8">
            L&apos;ERP institutionnel nouvelle génération pour votre réussite académique.
          </Text>
        </View>

        {/* Features Grid */}
        <View className="px-6">
          <FeatureItem
            title="Planning Dynamique"
            desc="Consultez vos cours en temps réel et recevez des rappels intelligents."
          />
          <FeatureItem
            title="Ressources & IA"
            desc="Accédez aux cours et posez vos questions à notre Assistant IA 24/7."
          />
          <FeatureItem
            title="Communauté Active"
            desc="Échangez sur le forum et participez aux quiz pour gagner des XP."
          />
        </View>

        {/* Call to Action */}
        <View className="mt-auto px-6 py-8">
          <TouchableOpacity
            onPress={() => router.push('/auth/login')}
            accessibilityRole="button"
            className="w-full bg-primary py-4 rounded-xl items-center flex-row justify-center shadow-lg shadow-blue-200"
          >
            <Text className="text-white font-bold text-lg mr-2">Se Connecter</Text>
            <ArrowRight size={20} color="white" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/auth/register')}
            accessibilityRole="button"
            className="w-full mt-4 bg-slate-100 dark:bg-slate-800 py-4 rounded-xl items-center border border-slate-200 dark:border-slate-700"
          >
            <Text className="text-slate-700 dark:text-slate-200 font-bold text-lg">Créer un compte</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(tabs)')}
            accessibilityRole="button"
            className="py-3 mt-2 items-center"
          >
            <Text className="text-slate-400 dark:text-slate-500 text-sm">Continuer en tant qu&apos;invité</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Screen>
  );
}

function FeatureItem({ title, desc }: { title: string; desc: string }) {
  return (
    <View className="flex-row items-start mb-4">
      <View className="bg-green-100 dark:bg-green-950 p-2 rounded-full mr-4 mt-1">
        <CircleCheckBig size={20} color="#16a34a" />
      </View>
      <View className="flex-1">
        <Text className="font-bold text-slate-800 dark:text-slate-100 text-base mb-1">{title}</Text>
        <Text className="text-slate-500 dark:text-slate-400 leading-5">{desc}</Text>
      </View>
    </View>
  );
}
