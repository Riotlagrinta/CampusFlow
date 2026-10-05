import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Linking, ActivityIndicator } from 'react-native';
import { Redirect, useLocalSearchParams, router } from 'expo-router';
import { Smartphone, Copy, Info, MessageCircle, CircleCheck } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import api from '../../src/services/api';
import { ADMIN_WHATSAPP, FLOOZ_NUMBER, PAYMENTS_DISABLED_MESSAGE, PAYMENTS_ENABLED, TMONEY_NUMBER } from '../../src/config';
import { findPack } from '../../src/packs';
import { getErrorMessage, isPaymentsDisabled, logError } from '../../src/services/errors';
import { paramToString, toList } from '../../src/utils/format';
import { useAuth } from '../../src/context/AuthContext';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { RequireLogin } from '@/components/require-login';
import { ErrorView } from '@/components/state-views';

type ManualMethod = 'TMONEY' | 'FLOOZ';
type PaymentStatus = 'COMPLETED' | 'PENDING' | 'FAILED' | 'EXPIRED' | 'UNKNOWN';

interface TransactionRow {
  id: string;
  packName?: string;
  status?: string;
}

const MANUAL_METHODS: { key: ManualMethod; label: string; number: string; selected: string; icon: string }[] = [
  {
    key: 'TMONEY',
    label: 'Manuel T-Money',
    number: TMONEY_NUMBER,
    selected: 'border-yellow-400 bg-yellow-50 dark:bg-yellow-950',
    icon: 'bg-yellow-400',
  },
  {
    key: 'FLOOZ',
    label: 'Manuel Flooz',
    number: FLOOZ_NUMBER,
    selected: 'border-blue-600 bg-blue-50 dark:bg-blue-950',
    icon: 'bg-blue-600',
  },
];

// Les coordonnées du paiement manuel viennent de la configuration (EXPO_PUBLIC_*) :
// sans elles, la section est masquée.
const AVAILABLE_METHODS = MANUAL_METHODS.filter((method) => method.number);
const MANUAL_ENABLED = ADMIN_WHATSAPP.length > 0 && AVAILABLE_METHODS.length > 0;

const STATUS_COPY: Record<PaymentStatus, { title: string; text: string }> = {
  COMPLETED: { title: 'Paiement confirmé', text: 'Vos jetons ont été crédités sur votre compte.' },
  PENDING: {
    title: 'Paiement en cours de confirmation',
    text: "Dès que l'opérateur confirme le paiement, vos jetons sont crédités automatiquement. Vous pouvez revérifier dans un instant.",
  },
  FAILED: {
    title: 'Paiement non abouti',
    text: "Le paiement a été refusé ou annulé. Aucun montant n'a été crédité : vous pouvez réessayer.",
  },
  EXPIRED: {
    title: 'Paiement expiré',
    text: "Ce paiement n'a pas été confirmé dans les 24 heures. Si votre compte mobile a été débité, contactez le support avant de réessayer ; sinon, vous pouvez recommencer votre achat.",
  },
  UNKNOWN: {
    title: 'Vérification impossible',
    text: "Nous n'avons pas pu vérifier l'état du paiement. S'il a abouti, vos jetons seront crédités automatiquement.",
  },
};

function CheckoutContent() {
  const params = useLocalSearchParams();
  const packId = paramToString(params.packId);
  const pack = findPack(packId);
  const { token, refreshUser } = useAuth();

  const [method, setMethod] = useState<ManualMethod | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);

  if (!token) {
    return (
      <Screen>
        <ScreenHeader title="Finaliser votre achat" />
        <RequireLogin message="Connectez-vous pour acheter des jetons IA." />
      </Screen>
    );
  }

  if (!pack) {
    return (
      <Screen>
        <ScreenHeader title="Finaliser votre achat" />
        <ErrorView message="Cette offre n'existe pas ou n'est plus disponible." onRetry={() => router.replace('/shop')} />
      </Screen>
    );
  }

  /**
   * Relit l'état réel du paiement : le serveur interroge Genius Pay, rien n'est supposé côté app.
   * `knownId` est la transaction créée par /payment/genius/create ; sans lui (ancien serveur),
   * on retombe sur la recherche de la dernière transaction de l'offre.
   */
  const checkPayment = async (knownId: string | null) => {
    setChecking(true);
    try {
      let status: unknown;

      if (knownId) {
        // /verify renvoie l'état courant quel qu'il soit (et règle la transaction si elle est en attente).
        const verifyResponse = await api.post('/payment/genius/verify', { transactionId: knownId });
        status = verifyResponse.data?.status;
      } else {
        const listResponse = await api.get('/user/transactions', { params: { take: 5 } });
        const transactions = toList<TransactionRow>(listResponse.data);
        const latest = transactions.find((tx) => tx.packName === pack.name) ?? transactions[0];
        if (!latest) {
          setPaymentStatus('UNKNOWN');
          return;
        }

        status = latest.status;
        if (status === 'PENDING') {
          const verifyResponse = await api.post('/payment/genius/verify', { transactionId: latest.id });
          status = verifyResponse.data?.status;
        }
      }

      const resolved: PaymentStatus =
        status === 'COMPLETED' || status === 'PENDING' || status === 'FAILED' || status === 'EXPIRED'
          ? status
          : 'UNKNOWN';
      setPaymentStatus(resolved);
      if (resolved === 'COMPLETED') void refreshUser();
    } catch (error) {
      logError('vérification du paiement', error);
      setPaymentStatus('UNKNOWN');
    } finally {
      setChecking(false);
    }
  };

  const handleGeniusPay = async () => {
    setLoading(true);
    setPaymentStatus(null);
    setTransactionId(null);
    try {
      const res = await api.post('/payment/genius/create', { packId: pack.id });
      const url: unknown = res.data?.url;
      const createdId: unknown = res.data?.transactionId;

      // Seule une page de paiement en HTTPS est ouverte.
      if (typeof url !== 'string' || !url.startsWith('https://')) {
        Alert.alert('Erreur', "Impossible d'initialiser le paiement.");
        return;
      }

      const newTransactionId = typeof createdId === 'string' && createdId.length > 0 ? createdId : null;
      setTransactionId(newTransactionId);

      // Navigateur intégré : on reprend la main quand l'utilisateur le ferme.
      await WebBrowser.openBrowserAsync(url);
      await checkPayment(newTransactionId);
    } catch (error) {
      logError('paiement Genius', error);
      if (isPaymentsDisabled(error)) {
        Alert.alert('Paiements indisponibles', PAYMENTS_DISABLED_MESSAGE);
        return;
      }
      Alert.alert('Erreur', getErrorMessage(error, 'Problème de connexion au serveur de paiement.'));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copié !', 'Le numéro a été copié dans votre presse-papiers.');
  };

  const handleNotifyAdmin = async () => {
    if (!method) return;
    const selected = AVAILABLE_METHODS.find((item) => item.key === method);
    setLoading(true);

    try {
      // Enregistre la demande (une seule par offre en attente) pour que l'admin puisse la valider.
      const res = await api.post('/payment/manual-request', { packId: pack.id, method });
      const reference: unknown = res.data?.reference;
      const alreadyPending = res.data?.alreadyPending === true;

      const message =
        `Bonjour Admin ! Je viens d'effectuer un transfert de ${pack.price} FCFA par ${selected?.label ?? method} ` +
        `pour le ${pack.name}.` +
        (typeof reference === 'string' ? ` Référence : ${reference}.` : '') +
        ` Voici ma preuve de paiement (capture d'écran) :`;

      await Linking.openURL(`https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(message)}`);

      if (alreadyPending) {
        Alert.alert('Demande déjà enregistrée', 'Une demande est déjà en attente de validation pour cette offre.');
      }
      router.replace('/(tabs)');
    } catch (error) {
      logError('demande de paiement manuel', error);
      if (isPaymentsDisabled(error)) {
        Alert.alert('Paiements indisponibles', PAYMENTS_DISABLED_MESSAGE);
        return;
      }
      Alert.alert('Erreur', getErrorMessage(error, "Impossible d'enregistrer la demande ou d'ouvrir WhatsApp."));
    } finally {
      setLoading(false);
    }
  };

  const selectedNumber = AVAILABLE_METHODS.find((item) => item.key === method)?.number ?? '';

  return (
    <Screen className="bg-white dark:bg-slate-950">
      <ScreenHeader title="Finaliser votre achat" />

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
        <View className="mb-6">
          <Text className="text-slate-500 dark:text-slate-400 font-medium">
            Suivez les instructions pour activer vos jetons.
          </Text>
        </View>

        {/* Récapitulatif */}
        <View className="bg-slate-50 dark:bg-slate-900 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 flex-row items-center justify-between mb-8">
          <View className="flex-1 mr-3">
            <Text className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 tracking-widest mb-1">
              Pack sélectionné
            </Text>
            <Text className="text-xl font-bold text-slate-900 dark:text-white">{pack.name}</Text>
            <Text className="text-sm text-slate-500 dark:text-slate-400 font-medium">{pack.tokens} jetons IA</Text>
          </View>
          <Text className="text-2xl font-black text-slate-900 dark:text-white">{pack.price} FCFA</Text>
        </View>

        {/* Résultat du paiement en ligne */}
        {paymentStatus ? (
          <View
            className={`p-5 rounded-2xl mb-8 border ${
              paymentStatus === 'COMPLETED'
                ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900'
                : paymentStatus === 'FAILED'
                  ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900'
                  : 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900'
            }`}
          >
            <View className="flex-row items-center mb-1">
              {paymentStatus === 'COMPLETED' ? (
                <CircleCheck size={18} color="#16a34a" />
              ) : (
                <Info size={18} color={paymentStatus === 'FAILED' ? '#ef4444' : '#d97706'} />
              )}
              <Text className="ml-2 font-bold text-slate-900 dark:text-white">{STATUS_COPY[paymentStatus].title}</Text>
            </View>
            <Text className="text-sm text-slate-600 dark:text-slate-300">{STATUS_COPY[paymentStatus].text}</Text>

            <View className="flex-row flex-wrap mt-4">
              {paymentStatus === 'FAILED' || paymentStatus === 'EXPIRED' ? (
                <TouchableOpacity
                  onPress={() => void handleGeniusPay()}
                  disabled={loading || checking}
                  accessibilityRole="button"
                  accessibilityLabel="Réessayer le paiement"
                  className="px-4 py-2 mr-3 rounded-lg bg-slate-900 dark:bg-slate-700"
                >
                  <Text className="text-white font-bold text-xs">Réessayer le paiement</Text>
                </TouchableOpacity>
              ) : null}
              {paymentStatus !== 'COMPLETED' && paymentStatus !== 'FAILED' && paymentStatus !== 'EXPIRED' ? (
                <TouchableOpacity
                  onPress={() => void checkPayment(transactionId)}
                  disabled={checking}
                  accessibilityRole="button"
                  className="px-4 py-2 mr-3 rounded-lg bg-slate-900 dark:bg-slate-700"
                >
                  {checking ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text className="text-white font-bold text-xs">Vérifier à nouveau</Text>
                  )}
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => router.replace('/(tabs)')}
                accessibilityRole="button"
                className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-800"
              >
                <Text className="text-slate-700 dark:text-slate-200 font-bold text-xs">Retour à l&apos;accueil</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Étape 1 : mode de paiement */}
        <View className="mb-8">
          <View className="flex-row items-center mb-4">
            <View className="w-6 h-6 bg-slate-900 dark:bg-slate-700 rounded-full items-center justify-center mr-3">
              <Text className="text-white text-xs font-black">1</Text>
            </View>
            <Text className="font-bold text-slate-800 dark:text-slate-100">Choisissez votre moyen de paiement</Text>
          </View>

          <TouchableOpacity
            onPress={handleGeniusPay}
            disabled={loading || checking}
            accessibilityRole="button"
            accessibilityLabel="Payer automatiquement avec T-Money ou Flooz"
            className="p-6 rounded-[2rem] border-2 border-blue-500 bg-blue-50/50 dark:bg-blue-950 flex-row items-center"
          >
            <View className="w-12 h-12 bg-blue-600 rounded-2xl items-center justify-center">
              {loading && !method ? <ActivityIndicator color="white" /> : <Smartphone color="white" />}
            </View>
            <View className="ml-4 flex-1">
              <Text className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 tracking-widest">
                Recommandé
              </Text>
              <Text className="text-lg font-black text-slate-900 dark:text-white">Paiement automatique</Text>
              <Text className="text-xs text-slate-500 dark:text-slate-400 font-medium italic">
                T-Money & Flooz via Genius Pay
              </Text>
            </View>
          </TouchableOpacity>

          {MANUAL_ENABLED ? (
            <>
              <View className="flex-row items-center py-4">
                <View className="flex-1 h-[1px] bg-slate-200 dark:bg-slate-800" />
                <Text className="mx-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Ou manuel
                </Text>
                <View className="flex-1 h-[1px] bg-slate-200 dark:bg-slate-800" />
              </View>

              <View className="flex-row justify-between">
                {AVAILABLE_METHODS.map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    onPress={() => setMethod(item.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: method === item.key }}
                    className={`flex-1 mx-1 p-6 rounded-3xl border-2 items-center ${
                      method === item.key
                        ? item.selected
                        : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <View className={`w-12 h-12 ${item.icon} rounded-2xl items-center justify-center mb-3`}>
                      <Smartphone color="white" />
                    </View>
                    <Text className="font-black text-[10px] uppercase tracking-widest text-slate-900 dark:text-white text-center">
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}
        </View>

        {MANUAL_ENABLED && method ? (
          <View>
            <View className="flex-row items-center mb-4">
              <View className="w-6 h-6 bg-slate-900 dark:bg-slate-700 rounded-full items-center justify-center mr-3">
                <Text className="text-white text-xs font-black">2</Text>
              </View>
              <Text className="font-bold text-slate-800 dark:text-slate-100">Effectuez le transfert</Text>
            </View>

            <View className="bg-slate-900 p-8 rounded-[2.5rem] mb-6">
              <Text className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">
                Numéro à créditer
              </Text>
              <View className="flex-row items-center justify-between">
                <Text selectable className="text-3xl font-black text-white tracking-tighter">
                  {selectedNumber}
                </Text>
                <TouchableOpacity
                  onPress={() => copyToClipboard(selectedNumber)}
                  accessibilityRole="button"
                  accessibilityLabel="Copier le numéro"
                  className="bg-white/10 p-3 rounded-xl"
                >
                  <Copy size={20} color="white" />
                </TouchableOpacity>
              </View>

              <View className="flex-row items-start mt-6 bg-white/5 p-4 rounded-2xl border border-white/5">
                <Info size={16} color="#60a5fa" />
                <Text className="text-xs text-slate-400 ml-2 flex-1">
                  Vérifiez bien le numéro avant de confirmer le transfert.
                </Text>
              </View>
            </View>

            <View className="flex-row items-center mb-4">
              <View className="w-6 h-6 bg-slate-900 dark:bg-slate-700 rounded-full items-center justify-center mr-3">
                <Text className="text-white text-xs font-black">3</Text>
              </View>
              <Text className="font-bold text-slate-800 dark:text-slate-100">Envoyez votre preuve</Text>
            </View>

            <Text className="text-sm text-slate-500 dark:text-slate-400 font-medium mb-4">
              Une fois le transfert effectué, envoyez une capture d&apos;écran de la confirmation à
              l&apos;administrateur. Vos jetons sont crédités après sa validation.
            </Text>

            <TouchableOpacity
              onPress={handleNotifyAdmin}
              disabled={loading}
              accessibilityRole="button"
              className={`w-full py-5 rounded-[2rem] flex-row items-center justify-center ${
                loading ? 'bg-emerald-400' : 'bg-emerald-600'
              }`}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <MessageCircle size={20} color="white" />
                  <Text className="text-white font-black uppercase text-xs tracking-widest ml-3">
                    Preuve par WhatsApp
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <View className="h-10" />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

export default function CheckoutScreen() {
  // Paiements désactivés (freemium) : l'écran n'existe pas ; navigation directe = retour à l'accueil.
  if (!PAYMENTS_ENABLED) return <Redirect href="/" />;
  return <CheckoutContent />;
}
