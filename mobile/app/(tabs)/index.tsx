import React, { useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import {
  Calendar,
  BookOpen,
  MessageSquare,
  GraduationCap,
  User,
  Sparkles,
  Bot,
  Flame,
  Trophy,
  Clock,
} from 'lucide-react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import api from '../../src/services/api';
import { PAYMENTS_ENABLED, XP_PER_LEVEL } from '../../src/config';
import { formatDate } from '../../src/utils/format';
import { useCachedResource } from '@/hooks/use-cached-resource';
import { useAppColors } from '@/hooks/use-app-colors';
import { Screen } from '@/components/screen';
import { StatusBanner } from '@/components/state-views';

interface DashboardStats {
  rank?: number;
  nextCourse?: { title?: string; time?: string; teacher?: string } | null;
}

const MENU_ITEMS = [
  { title: 'Planning', icon: Calendar, color: 'bg-blue-500', href: '/planning' },
  { title: 'Quiz', icon: BookOpen, color: 'bg-green-500', href: '/quiz' },
  { title: 'Forum', icon: MessageSquare, color: 'bg-purple-500', href: '/forum' },
  { title: 'Ressources', icon: GraduationCap, color: 'bg-orange-500', href: '/resources' },
] as const;

export default function Dashboard() {
  const { token, user, refreshUser } = useAuth();
  const colors = useAppColors();

  const fetchStats = useCallback(async (): Promise<DashboardStats> => {
    const response = await api.get('/user/dashboard-stats');
    return response.data as DashboardStats;
  }, []);

  const stats = useCachedResource<DashboardStats>('dashboard', fetchStats, !!token);
  const refreshStats = stats.refresh;
  const reloadStats = stats.reload;

  const onRefresh = useCallback(async () => {
    await Promise.all([refreshStats(), refreshUser()]);
  }, [refreshStats, refreshUser]);

  // Au retour sur l'accueil (après un quiz, un achat...), XP et jetons sont relus en silence.
  // Le premier focus est ignoré : le chargement initial s'en charge déjà.
  const hasFocusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnce.current) {
        hasFocusedOnce.current = true;
        return;
      }
      if (token) {
        void reloadStats();
        void refreshUser();
      }
    }, [token, reloadStats, refreshUser])
  );

  // --- Mode invité : aucune donnée personnelle, on invite à se connecter ---
  if (!token) {
    return (
      <Screen edges={['top']}>
        <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 32 }}>
          <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium">Bienvenue 👋</Text>
          <Text className="text-2xl font-bold text-slate-900 dark:text-white mb-8">Mode invité</Text>

          <View className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800">
            <Text className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              Connectez-vous pour tout débloquer
            </Text>
            <Text className="text-slate-500 dark:text-slate-400 mb-6">
              Planning, ressources de cours, quiz, forum et assistant IA sont réservés aux étudiants
              connectés.
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
        </ScrollView>
      </Screen>
    );
  }

  const xp = user?.xp ?? 0;
  const level = user?.level ?? Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpInLevel = xp % XP_PER_LEVEL;
  const progress = Math.min((xpInLevel / XP_PER_LEVEL) * 100, 100);

  // Abonnement : jamais affiché tant que les paiements sont désactivés (freemium).
  const premiumUntil =
    PAYMENTS_ENABLED && user?.isSubscribed && user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) > new Date()
      ? user.subscriptionExpiresAt
      : null;

  const nextCourse = stats.data?.nextCourse ?? null;

  return (
    <Screen edges={['top']}>
      <ScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={stats.refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-1">
            <Text className="text-slate-500 dark:text-slate-400 text-sm font-medium">Bonjour 👋</Text>
            <Text className="text-2xl font-bold text-slate-900 dark:text-white" numberOfLines={1}>
              {user?.firstName || 'Étudiant'}
            </Text>
          </View>
          <View className="flex-row items-center">
            {/* Jetons bonus gagnés gratuitement : toujours affichés ; lien vers la boutique seulement si les paiements sont activés. */}
            {PAYMENTS_ENABLED ? (
              <TouchableOpacity
                onPress={() => router.push('/shop')}
                accessibilityRole="button"
                accessibilityLabel={`${user?.aiBonusRequests ?? 0} jetons IA, ouvrir la boutique`}
                className="bg-blue-50 dark:bg-blue-950 px-3 py-2 rounded-2xl border border-blue-100 dark:border-blue-900 mr-2 flex-row items-center"
              >
                <Sparkles size={16} color="#3b82f6" />
                <Text className="text-blue-600 dark:text-blue-400 font-black text-xs ml-1.5">
                  {user?.aiBonusRequests ?? 0}
                </Text>
              </TouchableOpacity>
            ) : (
              <View
                accessible
                accessibilityLabel={`${user?.aiBonusRequests ?? 0} jetons IA bonus`}
                className="bg-blue-50 dark:bg-blue-950 px-3 py-2 rounded-2xl border border-blue-100 dark:border-blue-900 mr-2 flex-row items-center"
              >
                <Sparkles size={16} color="#3b82f6" />
                <Text className="text-blue-600 dark:text-blue-400 font-black text-xs ml-1.5">
                  {user?.aiBonusRequests ?? 0}
                </Text>
              </View>
            )}
            <TouchableOpacity
              onPress={() => router.push('/profile')}
              accessibilityRole="button"
              accessibilityLabel="Mon profil"
              className="p-2 bg-white dark:bg-slate-900 rounded-full border border-slate-100 dark:border-slate-800"
            >
              <User size={24} color={colors.muted} />
            </TouchableOpacity>
          </View>
        </View>

        <StatusBanner offline={stats.offline} />

        {/* Prochain cours */}
        <View className="bg-white dark:bg-slate-900 p-5 rounded-[2rem] mb-6 border border-slate-100 dark:border-slate-800">
          <Text className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
            Prochain cours
          </Text>
          {nextCourse ? (
            <>
              <Text className="text-xl font-black text-slate-900 dark:text-white mb-1">
                {nextCourse.title || 'Cours'}
              </Text>
              <View className="flex-row items-center">
                <Clock size={14} color={colors.muted} />
                <Text className="text-slate-500 dark:text-slate-400 text-xs ml-2 font-medium">
                  {[nextCourse.time, nextCourse.teacher && nextCourse.teacher !== 'N/A' ? nextCourse.teacher : null]
                    .filter(Boolean)
                    .join(' • ') || 'Horaire à confirmer'}
                </Text>
              </View>
            </>
          ) : (
            <Text className="text-slate-500 dark:text-slate-400">
              {stats.loading
                ? 'Chargement…'
                : stats.error
                  ? 'Planning indisponible pour le moment.'
                  : "Aucun cours prévu aujourd'hui."}
            </Text>
          )}
        </View>

        {/* XP */}
        <View className="bg-blue-600 p-6 rounded-3xl mb-6">
          <View className="flex-row justify-between items-start mb-1">
            <Text className="text-white/80 text-sm">XP actuelle</Text>
            {stats.data?.rank ? (
              <View className="flex-row items-center">
                <Trophy size={14} color="white" />
                <Text className="text-white/90 text-xs font-bold ml-1">Rang #{stats.data.rank}</Text>
              </View>
            ) : null}
          </View>
          <Text className="text-white text-3xl font-bold mb-4">{xp} XP</Text>
          <View className="h-2 bg-white/20 rounded-full overflow-hidden">
            <View className="h-full bg-white" style={{ width: `${progress}%` }} />
          </View>
          <View className="flex-row justify-between mt-2">
            <Text className="text-white/80 text-xs">
              {xpInLevel} / {XP_PER_LEVEL} XP
            </Text>
            <Text className="text-white/80 text-xs">Niveau {level}</Text>
          </View>
          {user?.streak ? (
            <View className="flex-row items-center mt-3">
              <Flame size={14} color="#fdba74" />
              <Text className="text-white/90 text-xs font-bold ml-1">
                Série de {user.streak} jour{user.streak > 1 ? 's' : ''}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Menu principal */}
        <Text className="text-lg font-bold text-slate-900 dark:text-white mb-4">Menu Principal</Text>
        <View className="flex-row flex-wrap justify-between">
          {MENU_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.title}
              onPress={() => router.push(item.href)}
              accessibilityRole="button"
              accessibilityLabel={item.title}
              className="w-[48%] bg-white dark:bg-slate-900 p-4 rounded-2xl mb-4 border border-slate-100 dark:border-slate-800 items-center"
            >
              <View className={`${item.color} p-3 rounded-xl mb-3`}>
                <item.icon size={24} color="white" />
              </View>
              <Text className="font-semibold text-slate-800 dark:text-slate-100">{item.title}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Assistant IA */}
        <TouchableOpacity
          onPress={() => router.push('/ai-assistant')}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir l'assistant IA"
          className="bg-slate-900 dark:bg-slate-800 p-5 rounded-3xl mb-6 flex-row items-center justify-between"
        >
          <View className="flex-1">
            <View className="flex-row items-center mb-1">
              <Sparkles size={18} color="#60a5fa" />
              <Text className="text-blue-400 font-bold ml-2">Assistant IA</Text>
            </View>
            <Text className="text-white text-base font-medium">Une question sur un cours ?</Text>
            <Text className="text-white/60 text-xs mt-1">Réponses instantanées, 24h/24</Text>
          </View>
          <View className="bg-white/10 p-3 rounded-2xl">
            <Bot size={32} color="white" />
          </View>
        </TouchableOpacity>

        {/* Filière et abonnement */}
        <View className="bg-indigo-50 dark:bg-indigo-950 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-900 mb-4">
          <Text className="text-indigo-800 dark:text-indigo-300 font-bold mb-1">Filière</Text>
          <Text className="text-indigo-700 dark:text-indigo-200 text-sm">
            {user?.fieldName || 'Non définie'} - {user?.academicLevelName || 'Niveau inconnu'}
          </Text>
          {premiumUntil ? (
            <Text className="text-indigo-700 dark:text-indigo-200 text-xs mt-2 font-medium">
              Abonnement actif jusqu&apos;au {formatDate(premiumUntil)}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
