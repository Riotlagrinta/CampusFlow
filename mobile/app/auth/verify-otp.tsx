import React, { useEffect, useState } from 'react';
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
import { ArrowLeft, ShieldCheck, Mail } from 'lucide-react-native';
import api from '../../src/services/api';
import { getErrorMessage, getErrorStatus, logError } from '../../src/services/errors';
import { getPendingRegistration, setPendingRegistration } from '../../src/services/pendingRegistration';
import { paramToString } from '../../src/utils/format';
import { Screen } from '@/components/screen';
import { FormField } from '@/components/form-field';
import { useAppColors } from '@/hooks/use-app-colors';

const CODE_LENGTH = 6;
const RESEND_DELAY_SECONDS = 60;

/** Activation du compte : saisie du code de validation reçu par e-mail. */
export default function VerifyOtp() {
  const params = useLocalSearchParams();
  const colors = useAppColors();

  const presetIdentifier = paramToString(params.identifier);
  const notice = paramToString(params.notice);

  const [identifier, setIdentifier] = useState(presetIdentifier);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Renvoi possible seulement si l'inscription vient d'être faite sur cet appareil.
  const pending = getPendingRegistration();
  const canResend = !!pending && pending.email === identifier.trim().toLowerCase();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const leave = (href: '/auth/login' | '/auth/register') => {
    // Le mot de passe en mémoire n'a plus d'utilité une fois l'écran quitté.
    setPendingRegistration(null);
    router.replace(href);
  };

  const handleVerify = async () => {
    const id = identifier.trim();
    if (!id) {
      Alert.alert('Erreur', 'Indiquez votre e-mail ou votre numéro de téléphone.');
      return;
    }
    if (code.length !== CODE_LENGTH) {
      Alert.alert('Erreur', `Le code comporte ${CODE_LENGTH} chiffres.`);
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/verify-otp', { identifier: id, code });
      setPendingRegistration(null);
      // Le compte est actif : on repasse par la connexion (le mot de passe n'est pas conservé).
      router.replace({
        pathname: '/auth/login',
        params: { identifier: id, notice: 'Compte activé ! Vous pouvez maintenant vous connecter.' },
      });
    } catch (error) {
      logError('verify-otp', error);
      Alert.alert('Validation impossible', getErrorMessage(error, 'Impossible de valider le code.'));
    } finally {
      setLoading(false);
    }
  };

  // Soumettre de nouveau la même inscription fait générer et envoyer un nouveau code.
  const handleResend = async () => {
    if (!pending || cooldown > 0) return;
    setResending(true);
    try {
      await api.post('/auth/register', pending);
      setCode('');
      setCooldown(RESEND_DELAY_SECONDS);
      Alert.alert('Code renvoyé', 'Un nouveau code vient de vous être envoyé. L’ancien n’est plus valable.');
    } catch (error) {
      logError('renvoi du code', error);
      const message = getErrorMessage(error, "Impossible de renvoyer le code.");
      Alert.alert(
        'Envoi impossible',
        getErrorStatus(error) === 502 ? `${message}\n\nRéessayez dans un instant.` : message
      );
    } finally {
      setResending(false);
    }
  };

  const ready = code.length === CODE_LENGTH && identifier.trim().length > 0;

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
            onPress={() => leave('/auth/login')}
            accessibilityRole="button"
            accessibilityLabel="Retour à la connexion"
            className="mb-8 self-start"
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <View className="w-16 h-16 rounded-2xl items-center justify-center bg-blue-100 dark:bg-blue-950 mb-5">
            <ShieldCheck size={32} color={colors.primary} />
          </View>
          <Text className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Valider votre compte</Text>
          <Text className="text-slate-500 dark:text-slate-400 mb-6">
            {presetIdentifier
              ? `Saisissez le code à ${CODE_LENGTH} chiffres reçu par e-mail pour ${presetIdentifier}.`
              : `Saisissez le code à ${CODE_LENGTH} chiffres reçu par e-mail.`}
          </Text>

          {notice ? (
            <View className="mb-6 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-900">
              <Text className="text-blue-700 dark:text-blue-300 font-medium">{notice}</Text>
            </View>
          ) : null}

          {!presetIdentifier ? (
            <FormField
              label="Email ou téléphone"
              icon={Mail}
              placeholder="etudiant@defitech.tg"
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
            />
          ) : null}

          <FormField
            label="Code de validation"
            placeholder="123456"
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, CODE_LENGTH))}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            onSubmitEditing={handleVerify}
          />

          <TouchableOpacity
            onPress={handleVerify}
            disabled={loading || !ready}
            accessibilityRole="button"
            className={`w-full py-4 rounded-xl items-center mt-2 ${
              loading || !ready ? 'bg-blue-300' : 'bg-blue-600'
            }`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-lg">Activer mon compte</Text>
            )}
          </TouchableOpacity>

          {/* Renvoi du code */}
          {canResend ? (
            <TouchableOpacity
              onPress={handleResend}
              disabled={resending || cooldown > 0}
              accessibilityRole="button"
              className="items-center mt-6"
            >
              {resending ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text
                  className={`font-medium ${
                    cooldown > 0 ? 'text-slate-400 dark:text-slate-500' : 'text-blue-600 dark:text-blue-400'
                  }`}
                >
                  {cooldown > 0 ? `Renvoyer le code (${cooldown} s)` : 'Renvoyer le code'}
                </Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => leave('/auth/register')}
              accessibilityRole="button"
              className="items-center mt-6"
            >
              <Text className="text-blue-600 dark:text-blue-400 font-medium text-center">
                Code expiré ou non reçu ? Refaire l&apos;inscription
              </Text>
            </TouchableOpacity>
          )}

          <Text className="text-center text-xs text-slate-400 dark:text-slate-500 mt-6">
            Le code est valable 1 heure. Après 5 essais incorrects il est invalidé : demandez-en alors un
            nouveau. Pensez à vérifier vos courriers indésirables (spams).
          </Text>

          <TouchableOpacity
            onPress={() => leave('/auth/login')}
            accessibilityRole="button"
            className="items-center mt-6"
          >
            <Text className="text-slate-600 dark:text-slate-300 font-medium">Retour à la connexion</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
