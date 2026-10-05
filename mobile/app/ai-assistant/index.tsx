import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Send, Bot, Zap } from 'lucide-react-native';
import { router } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import api from '../../src/services/api';
import { PAYMENTS_ENABLED } from '../../src/config';
import { getErrorMessage, isQuotaExceeded, logError } from '../../src/services/errors';
import { useAppColors } from '@/hooks/use-app-colors';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { RequireLogin } from '@/components/require-login';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  /** Message d'erreur affiché dans la conversation : jamais renvoyé au modèle. */
  isError?: boolean;
}

interface AiQuota {
  used: number;
  limit: number;
  bonus: number;
  remaining: number;
}

const GREETING: Message = {
  id: 'greeting',
  text: "Bonjour ! Je suis votre assistant DefiTech. Comment puis-je vous aider dans vos révisions aujourd'hui ?",
  sender: 'ai',
};

// Quota épuisé quand les paiements sont désactivés (freemium) : jamais de renvoi vers la boutique.
const QUOTA_EXHAUSTED_FREE_MESSAGE =
  'Votre quota IA du jour est épuisé. Il est renouvelé chaque jour : réessayez demain.';

// Limites du serveur (POST /api/chat) : message ≤ 4000 caractères, historique ≤ 20 messages.
const MAX_MESSAGE_CHARS = 4000;
const HISTORY_MESSAGES = 10;
// Une réponse IA peut durer jusqu'à 60 s côté serveur (maxDuration) : on attend un peu plus.
const CHAT_TIMEOUT_MS = 65000;

function parseQuota(data: unknown): AiQuota | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  const limit = num(d.limit);
  const used = num(d.used);
  const bonus = num(d.bonus);
  const remaining = typeof d.remaining === 'number' ? d.remaining : Math.max(0, limit - used) + bonus;
  return { used, limit, bonus, remaining };
}

export default function AIAssistant() {
  const { token, refreshUser } = useAuth();
  const colors = useAppColors();

  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [quota, setQuota] = useState<AiQuota | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const nextId = useRef(1);

  const loadQuota = useCallback(async () => {
    try {
      const res = await api.get('/user/ai-quota');
      setQuota(parseQuota(res.data));
    } catch (error) {
      // Compteur indisponible (hors-ligne...) : l'envoi reste possible, le serveur fait foi.
      logError('quota IA', error);
    }
  }, []);

  useEffect(() => {
    if (token) void loadQuota();
  }, [token, loadQuota]);

  const pushMessage = (message: Omit<Message, 'id'>) => {
    const id = `m${nextId.current++}`;
    setMessages((previous) => [...previous, { ...message, id }]);
  };

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || isTyping) return;

    // Contexte de conversation : derniers échanges réels (ni message d'accueil, ni erreurs).
    const history = messages
      .filter((m) => m.id !== GREETING.id && !m.isError)
      .slice(-HISTORY_MESSAGES)
      .map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text.slice(0, MAX_MESSAGE_CHARS),
      }));

    pushMessage({ text, sender: 'user' });
    setInputText('');
    setIsTyping(true);

    try {
      const response = await api.post('/chat', { message: text, history }, { timeout: CHAT_TIMEOUT_MS });
      const reply: unknown = response.data?.reply;
      pushMessage({
        text: typeof reply === 'string' && reply ? reply : "Je n'ai pas pu générer de réponse.",
        sender: 'ai',
      });
      // Compteur et jetons relus auprès du serveur (la requête a pu consommer un jeton bonus).
      void loadQuota();
      void refreshUser();
    } catch (error: unknown) {
      logError('chat', error);
      const quotaExhausted = isQuotaExceeded(error);
      pushMessage({
        text:
          quotaExhausted && !PAYMENTS_ENABLED
            ? QUOTA_EXHAUSTED_FREE_MESSAGE
            : getErrorMessage(error, "Désolé, j'ai rencontré une erreur. Réessayez dans un instant."),
        sender: 'ai',
        isError: true,
      });

      if (quotaExhausted) {
        setQuota((previous) => (previous ? { ...previous, remaining: 0 } : previous));
        if (PAYMENTS_ENABLED) {
          Alert.alert(
            'Quota épuisé',
            "Vous avez épuisé vos requêtes IA. Rechargez vos jetons dans la boutique !",
            [{ text: 'Boutique', onPress: () => router.push('/shop') }, { text: "D'accord" }]
          );
        } else {
          // Paiements désactivés (freemium) : aucun renvoi vers la boutique.
          Alert.alert('Quota épuisé', QUOTA_EXHAUSTED_FREE_MESSAGE, [{ text: "D'accord" }]);
        }
      }
    } finally {
      setIsTyping(false);
    }
  };

  if (!token) {
    return (
      <Screen>
        <ScreenHeader title="Assistant IA" />
        <RequireLogin message="Connectez-vous pour discuter avec l'assistant IA." />
      </Screen>
    );
  }

  const canSend = inputText.trim().length > 0 && !isTyping;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-slate-50 dark:bg-slate-950"
    >
      <Screen>
        <ScreenHeader
          title="Assistant IA"
          subtitle="En ligne"
          right={
            PAYMENTS_ENABLED ? (
              <TouchableOpacity
                onPress={() => router.push('/shop')}
                accessibilityRole="button"
                accessibilityLabel="Requêtes IA restantes, ouvrir la boutique"
                className="bg-blue-50 dark:bg-blue-950 px-3 py-1 rounded-full flex-row items-center"
              >
                <Zap size={14} color="#3b82f6" />
                <Text className="text-blue-600 dark:text-blue-400 text-xs font-bold ml-1">
                  {quota ? `${quota.remaining} requête${quota.remaining > 1 ? 's' : ''}` : 'Boutique'}
                </Text>
              </TouchableOpacity>
            ) : quota ? (
              // Paiements désactivés (freemium) : simple compteur, sans lien vers la boutique.
              <View
                accessible
                accessibilityLabel={`${quota.remaining} requêtes IA restantes aujourd'hui`}
                className="bg-blue-50 dark:bg-blue-950 px-3 py-1 rounded-full flex-row items-center"
              >
                <Zap size={14} color="#3b82f6" />
                <Text className="text-blue-600 dark:text-blue-400 text-xs font-bold ml-1">
                  {`${quota.remaining} requête${quota.remaining > 1 ? 's' : ''}`}
                </Text>
              </View>
            ) : undefined
          }
        />

        <ScrollView
          ref={scrollViewRef}
          className="flex-1"
          contentContainerStyle={{ padding: 16 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((msg) => (
            <View
              key={msg.id}
              className={`mb-4 flex-row ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'ai' && (
                <View className="bg-blue-600 w-8 h-8 rounded-full items-center justify-center mr-2 self-end">
                  <Bot size={18} color="white" />
                </View>
              )}
              <View
                className={`max-w-[80%] p-4 rounded-2xl ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 rounded-tr-none'
                    : msg.isError
                      ? 'bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-tl-none'
                      : 'bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-tl-none'
                }`}
              >
                <Text
                  selectable
                  className={`leading-5 ${
                    msg.sender === 'user'
                      ? 'text-white'
                      : msg.isError
                        ? 'text-red-700 dark:text-red-300'
                        : 'text-slate-800 dark:text-slate-100'
                  }`}
                >
                  {msg.text}
                </Text>
              </View>
            </View>
          ))}
          {isTyping && (
            <View className="flex-row mb-4">
              <View className="bg-blue-600 w-8 h-8 rounded-full items-center justify-center mr-2">
                <Bot size={18} color="white" />
              </View>
              <View className="bg-white dark:bg-slate-900 p-4 rounded-2xl rounded-tl-none border border-slate-100 dark:border-slate-800">
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            </View>
          )}
        </ScrollView>

        <View className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
          <View className="flex-row items-center bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-2">
            <TextInput
              placeholder="Posez votre question académique..."
              placeholderTextColor={colors.placeholder}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={MAX_MESSAGE_CHARS}
              accessibilityLabel="Votre question"
              className="flex-1 text-slate-900 dark:text-white max-h-24 py-2"
            />
            <TouchableOpacity
              onPress={sendMessage}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Envoyer"
              className={`p-2 ml-2 rounded-xl ${canSend ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
            >
              <Send size={20} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
