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
import { ArrowLeft, KeyRound, Mail, Lock } from 'lucide-react-native';
import api from '../../src/services/api';
import { getErrorMessage, logError } from '../../src/services/errors';
import { MIN_PASSWORD_LENGTH, paramToString, validatePassword } from '../../src/utils/format';
import { goBackOrHome } from '@/components/screen-header';
import { Screen } from '@/components/screen';
import { FormField } from '@/components/form-field';
import { useAppColors } from '@/hooks/use-app-colors';

const CODE_LENGTH = 6;

type Step = 'request' | 'reset';

/** Mot de passe oublié : 1) demande du code, 2) code + nouveau mot de passe. */
export default function ForgotPassword() {
  const params = useLocalSearchParams();
  const colors = useAppColors();

  const [step, setStep] = useState<Step>('request');
  const [identifier, setIdentifier] = useState(paramToString(params.identifier));
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const hasIdentifier = () => {
    if (identifier.trim().length >= 3) return true;
    Alert.alert('Erreur', 'Indiquez votre e-mail ou votre numéro de téléphone.');
    return false;
  };

  // L'utilisateur a déjà reçu un code : on passe directement à la saisie.
  const goToReset = () => {
    if (hasIdentifier()) setStep('reset');
  };

  const handleRequest = async () => {
    if (!hasIdentifier()) return;
    const id = identifier.trim();

    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { identifier: id });
      // Le serveur répond de la même façon que le compte existe ou non.
      setStep('reset');
    } catch (error) {
      logError('forgot-password', error);
      Alert.alert('Erreur', getErrorMessage(error, "Impossible d'envoyer le code."));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (code.length !== CODE_LENGTH) {
      Alert.alert('Erreur', `Le code comporte ${CODE_LENGTH} chiffres.`);
      return;
    }
    const passwordProblem = validatePassword(newPassword);
    if (passwordProblem) {
      Alert.alert('Erreur', passwordProblem);
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Erreur', 'Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { identifier: identifier.trim(), code, newPassword });
      router.replace({
        pathname: '/auth/login',
        params: {
          identifier: identifier.trim(),
          notice: 'Mot de passe modifié. Connectez-vous avec le nouveau.',
        },
      });
    } catch (error) {
      logError('reset-password', error);
      Alert.alert('Erreur', getErrorMessage(error, 'Impossible de modifier le mot de passe.'));
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
            onPress={step === 'reset' ? () => setStep('request') : goBackOrHome}
            accessibilityRole="button"
            accessibilityLabel="Retour"
            className="mb-8 self-start"
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <View className="w-16 h-16 rounded-2xl items-center justify-center bg-blue-100 dark:bg-blue-950 mb-5">
            <KeyRound size={32} color={colors.primary} />
          </View>

          {step === 'request' ? (
            <>
              <Text className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Mot de passe oublié</Text>
              <Text className="text-slate-500 dark:text-slate-400 mb-8">
                Indiquez l&apos;e-mail ou le numéro de téléphone de votre compte : un code de sécurité sera envoyé par e-mail à l&apos;adresse du compte.
              </Text>

              <FormField
                label="Email ou téléphone"
                icon={Mail}
                placeholder="etudiant@defitech.tg ou 22890000000"
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleRequest}
              />

              <TouchableOpacity
                onPress={handleRequest}
                disabled={loading}
                accessibilityRole="button"
                className={`w-full py-4 rounded-xl items-center mt-2 ${loading ? 'bg-blue-400' : 'bg-blue-600'}`}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold text-lg">Envoyer le code</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={goToReset} accessibilityRole="button" className="items-center mt-6">
                <Text className="text-blue-600 dark:text-blue-400 font-medium">J&apos;ai déjà un code</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Nouveau mot de passe</Text>
              <Text className="text-slate-500 dark:text-slate-400 mb-8">
                Si un compte correspond à « {identifier.trim()} », un code à {CODE_LENGTH} chiffres vient
                d&apos;être envoyé par e-mail (valable 15 minutes). Pensez à vérifier vos courriers
                indésirables (spams).
              </Text>

              <FormField
                label="Code de sécurité"
                placeholder="123456"
                value={code}
                onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, CODE_LENGTH))}
                keyboardType="number-pad"
                maxLength={CODE_LENGTH}
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
              />
              <FormField
                label="Nouveau mot de passe"
                icon={Lock}
                placeholder="••••••••"
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                hint={`Au moins ${MIN_PASSWORD_LENGTH} caractères.`}
              />
              <FormField
                label="Confirmer le mot de passe"
                icon={Lock}
                placeholder="••••••••"
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                onSubmitEditing={handleReset}
              />

              <TouchableOpacity
                onPress={handleReset}
                disabled={loading}
                accessibilityRole="button"
                className={`w-full py-4 rounded-xl items-center mt-2 ${loading ? 'bg-blue-400' : 'bg-blue-600'}`}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold text-lg">Modifier le mot de passe</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
