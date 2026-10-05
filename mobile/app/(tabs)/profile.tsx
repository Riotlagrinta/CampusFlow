import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { LogOut, ChevronRight, Sparkles, Copy, Flame, Trophy, Zap } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import api from '../../src/services/api';
import { PAYMENTS_ENABLED, XP_PER_LEVEL } from '../../src/config';
import { getErrorMessage, logError } from '../../src/services/errors';
import { formatDate, fullName, initials } from '../../src/utils/format';
import { useAppColors } from '@/hooks/use-app-colors';
import { Screen } from '@/components/screen';
import { FormField } from '@/components/form-field';
import { RequireLogin } from '@/components/require-login';

export default function ProfileScreen() {
  const { token, user, refreshUser, signOut } = useAuth();
  const colors = useAppColors();

  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [bio, setBio] = useState('');

  useEffect(() => {
    if (token) void refreshUser();
  }, [token, refreshUser]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshUser();
    setRefreshing(false);
  }, [refreshUser]);

  const startEditing = () => {
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
    setBio(user?.bio ?? '');
    setEditing(true);
  };

  const saveProfile = async () => {
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) {
      Alert.alert('Erreur', 'Le prénom et le nom sont obligatoires.');
      return;
    }

    setSaving(true);
    try {
      await api.patch('/user/profile', { firstName: first, lastName: last, bio: bio.trim() });
      await refreshUser();
      setEditing(false);
    } catch (error) {
      logError('mise à jour du profil', error);
      Alert.alert('Erreur', getErrorMessage(error, 'Impossible de mettre à jour le profil.'));
    } finally {
      setSaving(false);
    }
  };

  const copyReferralCode = async () => {
    if (!user?.referralCode) return;
    await Clipboard.setStringAsync(user.referralCode);
    Alert.alert('Copié !', 'Votre code de parrainage a été copié.');
  };

  const confirmSignOut = () => {
    Alert.alert('Déconnexion', 'Voulez-vous vraiment vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Se déconnecter',
        style: 'destructive',
        // La redirection vers la connexion est faite par le SessionWatcher du layout racine.
        onPress: () => {
          void signOut();
        },
      },
    ]);
  };

  if (!token) {
    return (
      <Screen edges={['top']}>
        <RequireLogin message="Connectez-vous pour consulter votre profil et vos statistiques." />
      </Screen>
    );
  }

  const xp = user?.xp ?? 0;
  const level = user?.level ?? Math.floor(xp / XP_PER_LEVEL) + 1;
  // Abonnement : jamais affiché tant que les paiements sont désactivés (freemium).
  const premiumUntil =
    PAYMENTS_ENABLED && user?.isSubscribed && user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) > new Date()
      ? user.subscriptionExpiresAt
      : null;
  const academic = [user?.fieldName, user?.academicLevelName].filter(Boolean).join(' • ');

  return (
    <Screen edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Carte d'identité */}
          <View className="bg-white dark:bg-slate-900 p-6 items-center border-b border-slate-200 dark:border-slate-800">
            {user?.image ? (
              <Image
                source={{ uri: user.image }}
                accessibilityLabel="Photo de profil"
                className="w-24 h-24 rounded-full mb-4"
              />
            ) : (
              <View className="w-24 h-24 bg-blue-100 dark:bg-blue-950 rounded-full mb-4 items-center justify-center border-4 border-blue-50 dark:border-blue-900">
                <Text className="text-3xl font-bold text-blue-600 dark:text-blue-400">{initials(user)}</Text>
              </View>
            )}
            <Text className="text-2xl font-bold text-slate-900 dark:text-white text-center">
              {fullName(user)}
            </Text>
            <Text className="text-slate-500 dark:text-slate-400">{user?.email}</Text>
            {academic ? (
              <Text className="text-slate-500 dark:text-slate-400 text-sm mt-1">{academic}</Text>
            ) : null}
            {user?.bio ? (
              <Text className="text-slate-600 dark:text-slate-300 text-sm text-center mt-3">{user.bio}</Text>
            ) : null}

            {!editing ? (
              <TouchableOpacity
                onPress={startEditing}
                accessibilityRole="button"
                className="mt-4 px-6 py-2 bg-blue-600 rounded-full"
              >
                <Text className="text-white font-bold">Modifier le profil</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Édition */}
          {editing ? (
            <View className="m-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">
              <FormField label="Prénom" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
              <FormField label="Nom" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
              <FormField
                label="Bio"
                value={bio}
                onChangeText={setBio}
                multiline
                maxLength={300}
                placeholder="Quelques mots sur vous"
              />
              <View className="flex-row">
                <TouchableOpacity
                  onPress={() => setEditing(false)}
                  disabled={saving}
                  accessibilityRole="button"
                  className="flex-1 mr-2 py-3 rounded-xl items-center bg-slate-100 dark:bg-slate-800"
                >
                  <Text className="font-bold text-slate-700 dark:text-slate-200">Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveProfile}
                  disabled={saving}
                  accessibilityRole="button"
                  className={`flex-1 ml-2 py-3 rounded-xl items-center ${saving ? 'bg-blue-400' : 'bg-blue-600'}`}
                >
                  {saving ? <ActivityIndicator color="white" /> : <Text className="font-bold text-white">Enregistrer</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* Statistiques */}
          <View className="flex-row px-4 mt-4">
            <StatCard icon={<Zap size={18} color="#3b82f6" />} label="XP" value={String(xp)} />
            <StatCard icon={<Trophy size={18} color="#f59e0b" />} label="Niveau" value={String(level)} />
            <StatCard icon={<Flame size={18} color="#f97316" />} label="Série" value={`${user?.streak ?? 0} j`} />
          </View>

          {/* Jetons et abonnement (jetons bonus gratuits seuls tant que les paiements sont désactivés) */}
          {PAYMENTS_ENABLED ? (
            <TouchableOpacity
              onPress={() => router.push('/shop')}
              accessibilityRole="button"
              className="mx-4 mt-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 flex-row items-center"
            >
              <Sparkles size={22} color="#3b82f6" />
              <View className="flex-1 ml-4">
                <Text className="text-slate-800 dark:text-slate-100 font-medium">
                  {user?.aiBonusRequests ?? 0} jeton{(user?.aiBonusRequests ?? 0) > 1 ? 's' : ''} IA
                </Text>
                <Text className="text-xs text-slate-500 dark:text-slate-400">
                  {premiumUntil
                    ? `Abonnement actif jusqu'au ${formatDate(premiumUntil)}`
                    : 'Recharger dans la boutique'}
                </Text>
              </View>
              <ChevronRight size={20} color={colors.subtle} />
            </TouchableOpacity>
          ) : (
            <View className="mx-4 mt-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 flex-row items-center">
              <Sparkles size={22} color="#3b82f6" />
              <View className="flex-1 ml-4">
                <Text className="text-slate-800 dark:text-slate-100 font-medium">
                  {user?.aiBonusRequests ?? 0} jeton{(user?.aiBonusRequests ?? 0) > 1 ? 's' : ''} IA bonus
                </Text>
                <Text className="text-xs text-slate-500 dark:text-slate-400">
                  Gagnés gratuitement (parrainage). Le quota gratuit est renouvelé chaque jour.
                </Text>
              </View>
            </View>
          )}

          {/* Parrainage */}
          {user?.referralCode ? (
            <View className="mx-4 mt-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 flex-row items-center">
              <View className="flex-1">
                <Text className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Code de parrainage
                </Text>
                <Text selectable className="text-lg font-black text-slate-900 dark:text-white mt-1">
                  {user.referralCode}
                </Text>
              </View>
              <TouchableOpacity
                onPress={copyReferralCode}
                accessibilityRole="button"
                accessibilityLabel="Copier le code de parrainage"
                className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800"
              >
                <Copy size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Déconnexion */}
          <TouchableOpacity
            onPress={confirmSignOut}
            accessibilityRole="button"
            className="mt-8 mx-4 flex-row items-center justify-center p-4 bg-red-50 dark:bg-red-950 rounded-2xl border border-red-100 dark:border-red-900"
          >
            <LogOut size={22} color="#ef4444" />
            <Text className="ml-2 text-red-600 dark:text-red-400 font-bold text-lg">Déconnexion</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View className="flex-1 mx-1 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 items-center">
      {icon}
      <Text className="mt-2 text-xl font-black text-slate-900 dark:text-white">{value}</Text>
      <Text className="text-xs text-slate-500 dark:text-slate-400 font-medium">{label}</Text>
    </View>
  );
}
