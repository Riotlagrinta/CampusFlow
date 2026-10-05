import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Mail, Lock, ArrowLeft, Eye, EyeOff } from 'lucide-react-native';
import { isNotActivatedError, useAuth } from '../../src/context/AuthContext';
import { paramToString } from '../../src/utils/format';
import { goBackOrHome } from '@/components/screen-header';
import { Screen } from '@/components/screen';
import { FormField } from '@/components/form-field';
import { useAppColors } from '@/hooks/use-app-colors';

export default function Login() {
  const params = useLocalSearchParams();
  const colors = useAppColors();
  const { signIn } = useAuth();

  const [identifier, setIdentifier] = useState(paramToString(params.identifier));
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const notice = paramToString(params.notice);

  const handleLogin = async () => {
    const id = identifier.trim();
    if (!id || !password) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs.');
      return;
    }

    setLoading(true);
    try {
      await signIn(id, password);
      router.replace('/(tabs)');
    } catch (error: unknown) {
      if (isNotActivatedError(error)) {
        // Compte créé mais jamais activé : on envoie l'utilisateur saisir son code.
        Alert.alert(
          'Compte non activé',
          'Saisissez le code de validation reçu par e-mail pour activer votre compte. Pensez à vérifier vos courriers indésirables (spams).'
        );
        router.push({ pathname: '/auth/verify-otp', params: { identifier: id } });
      } else {
        const message = error instanceof Error ? error.message : 'Identifiants incorrects.';
        Alert.alert('Erreur de connexion', message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen className="bg-white dark:bg-slate-950">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            onPress={goBackOrHome}
            accessibilityRole="button"
            accessibilityLabel="Retour"
            className="mb-8 self-start"
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <Text className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Bon retour 👋</Text>
          <Text className="text-slate-500 dark:text-slate-400 mb-8">
            Connectez-vous pour accéder à votre espace étudiant.
          </Text>

          {notice ? (
            <View className="mb-6 px-4 py-3 rounded-xl bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900">
              <Text className="text-green-700 dark:text-green-300 font-medium">{notice}</Text>
            </View>
          ) : null}

          <FormField
            label="Email ou téléphone"
            icon={Mail}
            placeholder="etudiant@defitech.tg ou 22890000000"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
          />

          <FormField
            label="Mot de passe"
            icon={Lock}
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            onSubmitEditing={handleLogin}
            returnKeyType="go"
            right={
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {showPassword ? <EyeOff size={20} color={colors.muted} /> : <Eye size={20} color={colors.muted} />}
              </TouchableOpacity>
            }
          />

          <TouchableOpacity
            onPress={() =>
              router.push({ pathname: '/auth/forgot-password', params: { identifier: identifier.trim() } })
            }
            accessibilityRole="button"
            className="self-end mb-6"
          >
            <Text className="text-blue-600 dark:text-blue-400 font-medium text-sm">Mot de passe oublié ?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleLogin}
            disabled={loading}
            accessibilityRole="button"
            className={`w-full py-4 rounded-xl items-center ${loading ? 'bg-blue-400' : 'bg-blue-600'}`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-lg">Se connecter</Text>
            )}
          </TouchableOpacity>

          <View className="flex-row justify-center mt-6">
            <Text className="text-slate-500 dark:text-slate-400">Pas encore de compte ? </Text>
            <TouchableOpacity onPress={() => router.push('/auth/register')} accessibilityRole="button">
              <Text className="text-blue-600 dark:text-blue-400 font-bold">S&apos;inscrire</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
