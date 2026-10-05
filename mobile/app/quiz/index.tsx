import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { BookOpen, Trophy, Play, BookX } from 'lucide-react-native';
import { useAuth } from '../../src/context/AuthContext';
import api from '../../src/services/api';
import { getErrorMessage, logError } from '../../src/services/errors';
import { toList } from '../../src/utils/format';
import { getCurrentSemester } from '../../src/utils/semester';
import { useCachedResource } from '@/hooks/use-cached-resource';
import { useAppColors } from '@/hooks/use-app-colors';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { RequireLogin } from '@/components/require-login';
import { SemesterToggle } from '@/components/semester-toggle';
import { EmptyView, ErrorView, LoadingView, StatusBanner } from '@/components/state-views';

interface QuizSummary {
  id: string;
  title: string;
  description?: string | null;
  subjectName?: string | null;
  subject?: { name?: string } | null;
  xpReward?: number;
  _count?: { questions?: number };
  myBestScore?: number | null;
  xpEarned?: number;
}

interface RawQuestion {
  id: string;
  question: string;
  // JSON sérialisé (tableau de libellés) côté serveur.
  options: unknown;
}

interface PlayableQuestion {
  id: string;
  question: string;
  options: string[];
}

interface ActiveQuiz {
  id: string;
  title: string;
  questions: PlayableQuestion[];
  index: number;
  answers: number[];
}

interface QuizResult {
  score: number;
  correctCount?: number;
  total?: number;
  passed?: boolean;
  passScore?: number;
  xpGained?: number;
  alreadyRewarded?: boolean;
  leveledUp?: boolean;
  level?: number | null;
}

interface DashboardRank {
  rank?: number;
}

const PAGE_SIZE = 50;
const MAX_PAGES = 4;

function parseOptions(options: unknown): string[] {
  let parsed: unknown = options;
  if (typeof options === 'string') {
    try {
      parsed = JSON.parse(options);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed) ? parsed.map((option) => String(option)) : [];
}

export default function QuizScreen() {
  const { token, refreshUser } = useAuth();
  const colors = useAppColors();

  const [semester, setSemester] = useState(getCurrentSemester());
  const [starting, setStarting] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveQuiz | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);

  const fetchQuizzes = useCallback(async (): Promise<QuizSummary[]> => {
    const items: QuizSummary[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await api.get('/quiz', {
        params: { semester, limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) },
      });
      const batch = toList<QuizSummary>(response.data);
      items.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      cursor = batch[batch.length - 1].id;
    }
    return items;
  }, [semester]);

  const fetchRank = useCallback(async (): Promise<DashboardRank> => {
    const response = await api.get('/user/dashboard-stats');
    return response.data as DashboardRank;
  }, []);

  const quizzes = useCachedResource<QuizSummary[]>(`quizzes:S${semester}`, fetchQuizzes, !!token);
  // Même clé que l'accueil : le classement est partagé et mis en cache.
  const rank = useCachedResource<DashboardRank>('dashboard', fetchRank, !!token);

  const startQuiz = async (quizId: string) => {
    setStarting(quizId);
    try {
      const response = await api.get(`/quiz/${encodeURIComponent(quizId)}`);
      const detail = response.data as { id: string; title: string; questions?: RawQuestion[] };

      const questions: PlayableQuestion[] = (detail.questions ?? []).map((q) => ({
        id: q.id,
        question: q.question,
        options: parseOptions(q.options),
      }));

      if (questions.length === 0) {
        Alert.alert('Quiz indisponible', "Ce quiz ne contient pas encore de questions.");
        return;
      }
      if (questions.some((q) => q.options.length < 2)) {
        Alert.alert('Quiz indisponible', 'Ce quiz est mal formé. Signalez-le à un administrateur.');
        return;
      }

      setResult(null);
      setSubmitError(null);
      setActive({ id: detail.id, title: detail.title, questions, index: 0, answers: [] });
    } catch (error) {
      logError('démarrage du quiz', error);
      Alert.alert('Erreur', getErrorMessage(error, 'Impossible de charger le quiz.'));
    } finally {
      setStarting(null);
    }
  };

  const submitAnswers = useCallback(
    async (quiz: ActiveQuiz, answers: number[]) => {
      setSubmitting(true);
      setSubmitError(null);
      try {
        // Une réponse (index de l'option) par question, dans l'ordre reçu ; le serveur corrige.
        const response = await api.post('/quiz', { quizId: quiz.id, answers });
        const data = response.data as Partial<QuizResult>;
        setResult({
          score: typeof data.score === 'number' ? data.score : 0,
          correctCount: data.correctCount,
          total: data.total ?? quiz.questions.length,
          passed: data.passed,
          passScore: data.passScore,
          xpGained: data.xpGained,
          alreadyRewarded: data.alreadyRewarded,
          leveledUp: data.leveledUp,
          level: data.level,
        });
        void refreshUser();
      } catch (error) {
        logError('envoi du quiz', error);
        setSubmitError(getErrorMessage(error, "Impossible d'envoyer vos réponses."));
      } finally {
        setSubmitting(false);
      }
    },
    [refreshUser]
  );

  const chooseOption = (optionIndex: number) => {
    if (!active || submitting) return;
    const answers = [...active.answers, optionIndex];
    const isLast = active.index + 1 >= active.questions.length;
    const next: ActiveQuiz = { ...active, answers, index: isLast ? active.index : active.index + 1 };
    setActive(next);
    if (isLast) void submitAnswers(next, answers);
  };

  const closeQuiz = () => {
    setActive(null);
    setResult(null);
    setSubmitError(null);
    void quizzes.reload();
    void rank.reload();
  };

  const confirmLeave = () => {
    if (result) {
      closeQuiz();
      return;
    }
    Alert.alert('Quitter le quiz ?', 'Votre progression sera perdue.', [
      { text: 'Continuer', style: 'cancel' },
      { text: 'Quitter', style: 'destructive', onPress: closeQuiz },
    ]);
  };

  if (!token) {
    return (
      <Screen>
        <ScreenHeader title="Quiz & Défis" />
        <RequireLogin message="Connectez-vous pour passer des quiz et gagner de l'XP." />
      </Screen>
    );
  }

  // ---------------------------------------------------------------- Quiz en cours / résultat
  if (active) {
    const total = active.questions.length;

    if (result || submitting || submitError) {
      return (
        <Screen>
          <ScreenHeader title={active.title} />
          <View className="flex-1 justify-center items-center p-8">
            {submitting ? (
              <>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text className="mt-4 text-slate-500 dark:text-slate-400">Correction en cours…</Text>
              </>
            ) : submitError ? (
              <>
                <Text className="text-center text-slate-700 dark:text-slate-300 font-medium mb-5">
                  {submitError}
                </Text>
                <TouchableOpacity
                  onPress={() => submitAnswers(active, active.answers)}
                  accessibilityRole="button"
                  className="px-6 py-3 rounded-xl bg-blue-600 mb-3"
                >
                  <Text className="text-white font-bold">Réessayer l&apos;envoi</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={closeQuiz} accessibilityRole="button" className="px-6 py-3">
                  <Text className="text-slate-500 dark:text-slate-400 font-medium">Abandonner</Text>
                </TouchableOpacity>
              </>
            ) : result ? (
              <>
                <View className="w-24 h-24 rounded-full items-center justify-center bg-blue-100 dark:bg-blue-950 mb-5">
                  <Trophy size={44} color={result.passed ? '#f59e0b' : colors.muted} />
                </View>
                <Text className="text-5xl font-black text-slate-900 dark:text-white">{result.score}%</Text>
                <Text className="mt-2 text-slate-500 dark:text-slate-400">
                  {result.correctCount !== undefined
                    ? `${result.correctCount} bonne${result.correctCount > 1 ? 's' : ''} réponse${
                        result.correctCount > 1 ? 's' : ''
                      } sur ${result.total ?? total}`
                    : `${total} questions`}
                </Text>
                <Text
                  className={`mt-4 font-bold text-lg ${
                    result.passed ? 'text-green-600 dark:text-green-400' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {result.passed
                    ? 'Bravo, quiz réussi !'
                    : `Seuil de réussite : ${result.passScore ?? 50}%. Réessayez !`}
                </Text>
                {result.xpGained ? (
                  <Text className="mt-2 text-blue-600 dark:text-blue-400 font-bold">+{result.xpGained} XP</Text>
                ) : result.alreadyRewarded ? (
                  <Text className="mt-2 text-slate-500 dark:text-slate-400 text-center">
                    L&apos;XP de ce quiz a déjà été obtenue.
                  </Text>
                ) : null}
                {result.leveledUp && result.level ? (
                  <Text className="mt-2 text-amber-600 dark:text-amber-400 font-bold">
                    Niveau {result.level} atteint !
                  </Text>
                ) : null}
                <TouchableOpacity
                  onPress={closeQuiz}
                  accessibilityRole="button"
                  className="mt-8 w-full py-4 rounded-xl items-center bg-blue-600"
                >
                  <Text className="text-white font-bold text-lg">Terminer</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </Screen>
      );
    }

    const current = active.questions[active.index];
    return (
      <Screen>
        <ScreenHeader title={active.title} subtitle={`Question ${active.index + 1} / ${total}`} />
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-6">
            <View
              className="h-full bg-blue-600"
              style={{ width: `${(active.index / total) * 100}%` }}
            />
          </View>

          <Text className="text-xl font-bold text-slate-900 dark:text-white mb-6">{current.question}</Text>

          {current.options.map((option, optionIndex) => (
            <TouchableOpacity
              key={`${current.id}-${optionIndex}`}
              onPress={() => chooseOption(optionIndex)}
              accessibilityRole="button"
              className="bg-white dark:bg-slate-900 p-4 rounded-xl mb-3 border border-slate-200 dark:border-slate-700"
            >
              <Text className="text-slate-800 dark:text-slate-100 font-medium">{option}</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity onPress={confirmLeave} accessibilityRole="button" className="items-center mt-6 py-3">
            <Text className="text-slate-500 dark:text-slate-400 font-medium">Quitter le quiz</Text>
          </TouchableOpacity>
        </ScrollView>
      </Screen>
    );
  }

  // ---------------------------------------------------------------- Liste des quiz
  return (
    <Screen>
      <ScreenHeader title="Quiz & Défis" />

      {quizzes.loading ? (
        <LoadingView />
      ) : quizzes.error && !quizzes.data ? (
        <ErrorView message={quizzes.error} onRetry={quizzes.reload} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={quizzes.refreshing} onRefresh={quizzes.refresh} />}
        >
          <StatusBanner offline={quizzes.offline} error={quizzes.data ? quizzes.error : null} />

          {rank.data?.rank ? (
            <View className="bg-blue-600 p-6 rounded-3xl flex-row items-center justify-between mb-6">
              <View className="flex-1">
                <Text className="text-white/80 font-medium text-sm">Classement actuel</Text>
                <Text className="text-white text-2xl font-bold">#{rank.data.rank}</Text>
              </View>
              <Trophy size={40} color="white" />
            </View>
          ) : null}

          <SemesterToggle value={semester} onChange={setSemester} />

          <Text className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Quiz disponibles</Text>

          {(quizzes.data ?? []).length === 0 ? (
            <EmptyView
              icon={BookX}
              title="Aucun quiz pour ce semestre"
              message="Essayez l'autre semestre ou revenez plus tard."
            />
          ) : (
            (quizzes.data ?? []).map((quiz) => {
              const questionCount = quiz._count?.questions ?? 0;
              const subject = quiz.subject?.name || quiz.subjectName;
              return (
                <View
                  key={quiz.id}
                  className="bg-white dark:bg-slate-900 p-5 rounded-2xl mb-4 border border-slate-100 dark:border-slate-800"
                >
                  <Text className="font-bold text-slate-900 dark:text-white text-lg mb-1">{quiz.title}</Text>
                  {subject ? (
                    <Text className="text-slate-500 dark:text-slate-400 text-sm mb-1">{subject}</Text>
                  ) : null}
                  {quiz.xpReward ? (
                    <Text className="text-blue-600 dark:text-blue-400 font-bold text-sm">
                      Récompense : {quiz.xpReward} XP
                    </Text>
                  ) : null}

                  <View className="flex-row items-center mt-3 mb-4">
                    <BookOpen size={16} color={colors.muted} />
                    <Text className="text-slate-500 dark:text-slate-400 text-xs ml-1">
                      {questionCount} question{questionCount > 1 ? 's' : ''}
                    </Text>
                    {typeof quiz.myBestScore === 'number' ? (
                      <Text className="text-slate-500 dark:text-slate-400 text-xs ml-4">
                        Meilleur score : {quiz.myBestScore}%
                      </Text>
                    ) : null}
                  </View>

                  <TouchableOpacity
                    onPress={() => startQuiz(quiz.id)}
                    disabled={starting !== null || questionCount === 0}
                    accessibilityRole="button"
                    className={`py-3 rounded-xl items-center flex-row justify-center ${
                      questionCount === 0 ? 'bg-slate-300 dark:bg-slate-700' : 'bg-blue-600'
                    }`}
                  >
                    {starting === quiz.id ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <>
                        <Play size={16} color="white" fill="white" />
                        <Text className="text-white font-bold ml-2">
                          {questionCount === 0
                            ? 'Bientôt disponible'
                            : typeof quiz.myBestScore === 'number'
                              ? 'Rejouer le quiz'
                              : 'Commencer le quiz'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
