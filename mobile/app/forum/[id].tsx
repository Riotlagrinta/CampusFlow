import React, { useCallback, useState } from 'react';
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
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { CircleCheck, Send } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import api from '../../src/services/api';
import { getErrorMessage, logError } from '../../src/services/errors';
import { formatDate, fullName, paramToString, plainText } from '../../src/utils/format';
import { useCachedResource } from '@/hooks/use-cached-resource';
import { useAppColors } from '@/hooks/use-app-colors';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { RequireLogin } from '@/components/require-login';
import { ErrorView, LoadingView, StatusBanner } from '@/components/state-views';

interface Author {
  firstName?: string | null;
  lastName?: string | null;
}

interface Answer {
  id: string;
  content: string;
  createdAt?: string;
  isAccepted?: boolean;
  author?: Author | null;
}

interface QuestionDetail {
  id: string;
  title: string;
  content: string;
  tags?: string | null;
  createdAt?: string;
  author?: Author | null;
  answers?: Answer[];
}

const ANSWER_MIN_LENGTH = 2;
const ANSWER_MAX_LENGTH = 5000;

export default function ForumQuestionScreen() {
  const params = useLocalSearchParams();
  const id = paramToString(params.id);
  const { token } = useAuth();
  const colors = useAppColors();

  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const fetchQuestion = useCallback(async (): Promise<QuestionDetail> => {
    const response = await api.get(`/forum/questions/${encodeURIComponent(id)}`);
    return response.data as QuestionDetail;
  }, [id]);

  const question = useCachedResource<QuestionDetail>(`forumQuestion:${id}`, fetchQuestion, !!token && !!id);

  const sendReply = async () => {
    const content = reply.trim();
    if (content.length < ANSWER_MIN_LENGTH) {
      Alert.alert('Erreur', 'Votre réponse est trop courte.');
      return;
    }

    setSending(true);
    try {
      await api.post(`/forum/questions/${encodeURIComponent(id)}/answers`, { content });
      setReply('');
      await question.reload();
    } catch (error) {
      logError('réponse forum', error);
      Alert.alert('Erreur', getErrorMessage(error, "Impossible de publier la réponse."));
    } finally {
      setSending(false);
    }
  };

  if (!token) {
    return (
      <Screen>
        <ScreenHeader title="Question" />
        <RequireLogin message="Connectez-vous pour lire et répondre aux questions du forum." />
      </Screen>
    );
  }

  const detail = question.data;
  const answers = detail?.answers ?? [];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-slate-50 dark:bg-slate-950"
    >
      <Screen>
        <ScreenHeader title="Question" />

        {question.loading ? (
          <LoadingView />
        ) : !detail ? (
          <ErrorView message={question.error ?? 'Question introuvable.'} onRetry={question.reload} />
        ) : (
          <>
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ padding: 16 }}
              keyboardShouldPersistTaps="handled"
              refreshControl={<RefreshControl refreshing={question.refreshing} onRefresh={question.refresh} />}
            >
              <StatusBanner offline={question.offline} error={question.error} />

              <View className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 mb-6">
                <Text className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                  {plainText(detail.title)}
                </Text>
                <Text selectable className="text-slate-700 dark:text-slate-300 leading-6">
                  {plainText(detail.content)}
                </Text>
                {detail.tags ? (
                  <View className="flex-row flex-wrap mt-3">
                    {detail.tags
                      .split(',')
                      .filter(Boolean)
                      .map((tag) => (
                        <View key={tag} className="bg-blue-50 dark:bg-blue-950 px-2 py-1 rounded-md mr-2 mb-1">
                          <Text className="text-xs font-bold text-blue-600 dark:text-blue-400">{tag.trim()}</Text>
                        </View>
                      ))}
                  </View>
                ) : null}
                <Text className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                  Par {fullName(detail.author, 'Anonyme')}
                  {detail.createdAt ? ` • ${formatDate(detail.createdAt)}` : ''}
                </Text>
              </View>

              <Text className="text-lg font-bold text-slate-900 dark:text-white mb-3">
                {answers.length} réponse{answers.length > 1 ? 's' : ''}
              </Text>

              {answers.length === 0 ? (
                <Text className="text-slate-500 dark:text-slate-400 mb-6">
                  Aucune réponse pour l&apos;instant. Soyez le premier à répondre !
                </Text>
              ) : (
                answers.map((answer) => (
                  <View
                    key={answer.id}
                    className={`p-4 rounded-2xl mb-3 border ${
                      answer.isAccepted
                        ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900'
                        : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800'
                    }`}
                  >
                    {answer.isAccepted ? (
                      <View className="flex-row items-center mb-2">
                        <CircleCheck size={16} color="#16a34a" />
                        <Text className="ml-1 text-xs font-bold text-green-700 dark:text-green-400">
                          Réponse acceptée
                        </Text>
                      </View>
                    ) : null}
                    <Text selectable className="text-slate-800 dark:text-slate-200 leading-6">
                      {plainText(answer.content)}
                    </Text>
                    <Text className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                      {fullName(answer.author, 'Anonyme')}
                      {answer.createdAt ? ` • ${formatDate(answer.createdAt)}` : ''}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

            <View className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
              <View className="flex-row items-end bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-2">
                <TextInput
                  placeholder="Votre réponse..."
                  placeholderTextColor={colors.placeholder}
                  value={reply}
                  onChangeText={setReply}
                  multiline
                  maxLength={ANSWER_MAX_LENGTH}
                  accessibilityLabel="Votre réponse"
                  className="flex-1 text-slate-900 dark:text-white max-h-28 py-2"
                />
                <TouchableOpacity
                  onPress={sendReply}
                  disabled={sending || reply.trim().length < ANSWER_MIN_LENGTH}
                  accessibilityRole="button"
                  accessibilityLabel="Publier la réponse"
                  className={`p-2 ml-2 rounded-xl ${
                    sending || reply.trim().length < ANSWER_MIN_LENGTH ? 'bg-slate-300 dark:bg-slate-600' : 'bg-blue-600'
                  }`}
                >
                  {sending ? <ActivityIndicator size="small" color="white" /> : <Send size={20} color="white" />}
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
