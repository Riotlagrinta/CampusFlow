import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Mail, Lock, ArrowLeft, Smartphone, User, Users } from 'lucide-react-native';
import api from '../../src/services/api';
import { getErrorMessage, getErrorStatus, logError } from '../../src/services/errors';
import { setPendingRegistration, type RegistrationPayload } from '../../src/services/pendingRegistration';
import { MIN_PASSWORD_LENGTH, validatePassword } from '../../src/utils/format';
import { goBackOrHome } from '@/components/screen-header';
import { Screen } from '@/components/screen';
import { FormField } from '@/components/form-field';
import { useAppColors } from '@/hooks/use-app-colors';

interface AcademicOption {
  id: string;
  name: string;
  code?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?\d{8,15}$/;

export default function Register() {
  const colors = useAppColors();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    referralCode: '',
    fieldId: '',
    academicLevelId: '',
  });

  const [options, setOptions] = useState<{ fields: AcademicOption[]; levels: AcademicOption[] }>({
    fields: [],
    levels: [],
  });
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const update = (patch: Partial<typeof formData>) => setFormData((prev) => ({ ...prev, ...patch }));

  // Filières et niveaux depuis le serveur (route publique).
  const loadOptions = useCallback(async () => {
    setOptionsLoading(true);
    setOptionsError(null);
    try {
      const res = await api.get('/academic/options');
      const body: unknown = res.data;
      const fields = body && typeof body === 'object' ? (body as { fields?: unknown }).fields : null;
      const levels = body && typeof body === 'object' ? (body as { levels?: unknown }).levels : null;
      setOptions({
        fields: Array.isArray(fields) ? (fields as AcademicOption[]) : [],
        levels: Array.isArray(levels) ? (levels as AcademicOption[]) : [],
      });
    } catch (error) {
      logError('options académiques', error);
      setOptionsError(getErrorMessage(error, 'Impossible de charger les filières et niveaux.'));
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const validate = (): string | null => {
    if (!formData.firstName.trim()) return 'Veuillez saisir votre prénom.';
    if (!formData.lastName.trim()) return 'Veuillez saisir votre nom.';
    if (!EMAIL_PATTERN.test(formData.email.trim())) return 'Adresse e-mail invalide.';
    if (!PHONE_PATTERN.test(formData.phone.replace(/[\s.-]/g, ''))) {
      return 'Numéro de téléphone invalide (8 à 15 chiffres, indicatif inclus, ex. 22890000000).';
    }
    if (!formData.fieldId) return 'Veuillez choisir votre filière.';
    if (!formData.academicLevelId) return 'Veuillez choisir votre niveau.';
    const passwordProblem = validatePassword(formData.password);
    if (passwordProblem) return passwordProblem;
    if (formData.password !== formData.confirmPassword) return 'Les mots de passe ne correspondent pas.';
    return null;
  };

  const handleRegister = async () => {
    const problem = validate();
    if (problem) {
      Alert.alert('Erreur', problem);
      return;
    }

    setLoading(true);
    try {
      const referralCode = formData.referralCode.trim();

      // L'API attend `levelId` pour le niveau académique.
      const payload: RegistrationPayload = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.replace(/[\s.-]/g, ''),
        password: formData.password,
        fieldId: formData.fieldId,
        levelId: formData.academicLevelId,
        ...(referralCode ? { referralCode } : {}),
      };
      const res = await api.post('/auth/register', payload);

      if (res.data?.success === false) {
        const reason: unknown = res.data?.error;
        Alert.alert('Erreur', typeof reason === 'string' && reason ? reason : 'Une erreur est survenue.');
        return;
      }

      // Le compte reste inactif tant que le code reçu n'est pas saisi. L'inscription est gardée
      // en mémoire pour pouvoir renvoyer le code (même requête = nouveau code).
      setPendingRegistration(payload);
      const serverMessage: unknown = res.data?.message;
      router.replace({
        pathname: '/auth/verify-otp',
        params: {
          identifier: payload.email,
          ...(typeof serverMessage === 'string' && serverMessage ? { notice: serverMessage } : {}),
        },
      });
    } catch (error) {
      logError('inscription', error);
      const message = getErrorMessage(error, 'Impossible de créer le compte.');
      // 502 : le code n'a pas pu être envoyé (e-mail indisponible) ; le même envoi peut être retenté.
      Alert.alert(
        "Erreur d'inscription",
        getErrorStatus(error) === 502
          ? `${message}\n\nVous pouvez réessayer avec les mêmes informations pour recevoir un nouveau code.`
          : message
      );
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
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            onPress={goBackOrHome}
            accessibilityRole="button"
            accessibilityLabel="Retour"
            className="mb-6 self-start"
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <Text className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Inscription</Text>
          <Text className="text-slate-500 dark:text-slate-400 mb-8">Rejoignez la communauté DefiTech.</Text>

          <FormField
            label="Prénom"
            icon={User}
            placeholder="Jean"
            value={formData.firstName}
            onChangeText={(text) => update({ firstName: text })}
            autoCapitalize="words"
            autoComplete="given-name"
            maxLength={50}
          />
          <FormField
            label="Nom"
            icon={Users}
            placeholder="Dupont"
            value={formData.lastName}
            onChangeText={(text) => update({ lastName: text })}
            autoCapitalize="words"
            autoComplete="family-name"
            maxLength={50}
          />
          <FormField
            label="Email institutionnel"
            icon={Mail}
            placeholder="jean.dupont@defitech.tg"
            value={formData.email}
            onChangeText={(text) => update({ email: text })}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            hint="Le code de validation sera envoyé à cette adresse : utilisez une adresse que vous consultez."
          />
          <FormField
            label="Numéro de téléphone (avec indicatif pays)"
            icon={Smartphone}
            placeholder="22890000000"
            value={formData.phone}
            onChangeText={(text) => update({ phone: text })}
            keyboardType="phone-pad"
            autoComplete="tel"
            hint="Ce numéro sert d'identifiant de connexion et doit être unique."
          />

          {/* Filière */}
          <View className="mb-4">
            <Text className="text-slate-700 dark:text-slate-300 font-medium mb-2">Filière</Text>
            {optionsLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : optionsError ? (
              <View>
                <Text className="text-red-600 dark:text-red-400 text-sm mb-2">{optionsError}</Text>
                <TouchableOpacity
                  onPress={loadOptions}
                  accessibilityRole="button"
                  className="self-start px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800"
                >
                  <Text className="font-bold text-slate-700 dark:text-slate-200">Réessayer</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {options.fields.map((f) => {
                  const selected = formData.fieldId === f.id;
                  return (
                    <TouchableOpacity
                      key={f.id}
                      onPress={() => update({ fieldId: f.id })}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={f.name}
                      className={`px-3 py-2 rounded-lg border ${
                        selected
                          ? 'bg-blue-600 border-blue-600'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          selected ? 'text-white' : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {f.code || f.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Niveau */}
          <View className="mb-4">
            <Text className="text-slate-700 dark:text-slate-300 font-medium mb-2">Niveau</Text>
            {!optionsLoading && !optionsError ? (
              <View className="flex-row flex-wrap gap-2">
                {options.levels.map((l) => {
                  const selected = formData.academicLevelId === l.id;
                  return (
                    <TouchableOpacity
                      key={l.id}
                      onPress={() => update({ academicLevelId: l.id })}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      className={`px-3 py-2 rounded-lg border ${
                        selected
                          ? 'bg-green-600 border-green-600'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          selected ? 'text-white' : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {l.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </View>

          <FormField
            label="Mot de passe"
            icon={Lock}
            placeholder="••••••••"
            secureTextEntry
            value={formData.password}
            onChangeText={(text) => update({ password: text })}
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
            value={formData.confirmPassword}
            onChangeText={(text) => update({ confirmPassword: text })}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <FormField
            label="Code de parrainage (facultatif)"
            placeholder="ABC-1234"
            value={formData.referralCode}
            onChangeText={(text) => update({ referralCode: text })}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          <TouchableOpacity
            onPress={handleRegister}
            disabled={loading}
            accessibilityRole="button"
            className={`w-full py-4 rounded-xl items-center mt-2 mb-6 ${loading ? 'bg-slate-300' : 'bg-green-600'}`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-lg">S&apos;inscrire</Text>
            )}
          </TouchableOpacity>

          <View className="flex-row justify-center pb-8">
            <Text className="text-slate-500 dark:text-slate-400">Déjà inscrit ? </Text>
            <TouchableOpacity onPress={() => router.replace('/auth/login')} accessibilityRole="button">
              <Text className="text-green-600 dark:text-green-400 font-bold">Se connecter</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
