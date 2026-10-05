'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Brain, ChevronRight, Clock, CheckCircle2, XCircle, RotateCcw, Loader2, Zap } from 'lucide-react';
import { useSound } from '@/hooks/useSound';
import { TiltCard } from '@/components/TiltCard';
import { fadeUp } from '@/lib/utils';
import { getCurrentSemester } from '@/lib/semester';

type Quiz = {
  id: string;
  title: string;
  description: string | null;
  xpReward: number;
  subject: { name: string } | null;
  _count: { questions: number };
  myBestScore: number | null;
  xpEarned: number;
};

type ActiveQuiz = {
  id: string;
  title: string;
  xpReward: number;
  questions: { id: string; question: string; options: string[] }[];
};

type QuizResult = {
  score: number;
  correctCount: number;
  total: number;
  passed: boolean;
  passScore: number;
  xpGained: number;
  alreadyRewarded: boolean;
  leveledUp: boolean;
  newBadges: { slug: string; name: string }[];
};

// Les options sont stockées en JSON dans la base : on ne fait pas confiance au format.
function parseOptions(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return typeof data?.error === 'string' ? data.error : fallback;
  } catch {
    return fallback;
  }
}

export default function QuizPage() {
  const { play } = useSound();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<ActiveQuiz | null>(null);
  const [step, setStep] = useState<'list' | 'playing' | 'result'>('list');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentSemester, setCurrentSemester] = useState<number>(() => getCurrentSemester());
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  // Évite une double soumission si l'utilisateur clique deux fois sur la dernière réponse.
  const submittingRef = useRef(false);
  // Évite qu'une réponse tardive (ancien semestre, page suivante obsolète) écrase la liste affichée.
  const latestRequest = useRef(0);

  // Sans curseur : (re)charge la première page ; avec curseur : ajoute la page suivante (X-Next-Cursor).
  const fetchQuizzes = useCallback(async (cursor?: string) => {
    const requestId = ++latestRequest.current;
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ semester: String(currentSemester) });
      if (cursor) params.set('cursor', cursor);

      const res = await fetch(`/api/quiz?${params}`);
      if (requestId !== latestRequest.current) return;
      if (!res.ok) throw new Error(await readError(res, 'Impossible de charger les quizz.'));
      const data: unknown = await res.json();
      if (requestId !== latestRequest.current) return;

      const page = Array.isArray(data) ? (data as Quiz[]) : [];
      setQuizzes(prev => (cursor ? [...prev, ...page] : page));
      setNextCursor(res.headers.get('X-Next-Cursor'));
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      if (!cursor) {
        setQuizzes([]);
        setNextCursor(null);
      }
      setLoadError(err instanceof Error ? err.message : 'Impossible de charger les quizz.');
    } finally {
      if (requestId === latestRequest.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [currentSemester]);

  // Invalide les requêtes en cours (changement de semestre, démontage de la page).
  const cancelPending = useCallback(() => { latestRequest.current++; }, []);

  useEffect(() => {
    fetchQuizzes();
    return cancelPending;
  }, [fetchQuizzes, cancelPending]);

  const startQuiz = async (quiz: Quiz) => {
    if (quiz._count.questions === 0) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/quiz/${quiz.id}`);
      if (!res.ok) throw new Error(await readError(res, 'Impossible de charger ce quiz.'));
      const data = await res.json();
      const questions: ActiveQuiz['questions'] = (Array.isArray(data.questions) ? data.questions : []).map(
        (q: { id: string; question: string; options: string }) => ({ id: q.id, question: q.question, options: parseOptions(q.options) })
      );
      if (questions.length === 0 || questions.some(q => q.options.length < 2)) {
        throw new Error("Ce quiz n'est pas disponible pour le moment.");
      }
      setActiveQuiz({ id: data.id, title: data.title, xpReward: data.xpReward, questions });
      setStep('playing');
      setCurrentQuestionIdx(0);
      setAnswers([]);
      setResult(null);
      setSubmitError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Impossible de charger ce quiz.');
    } finally {
      setLoading(false);
    }
  };

  const submitAnswers = async (quiz: ActiveQuiz, finalAnswers: number[]) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // On envoie les réponses brutes : le score est calculé côté serveur.
      const res = await fetch('/api/quiz', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId: quiz.id, answers: finalAnswers }),
      });
      if (!res.ok) throw new Error(await readError(res, "Impossible d'enregistrer vos réponses."));
      const data: QuizResult = await res.json();
      setResult({ ...data, newBadges: data.newBadges ?? [] });
      play('success');
      if (data.xpGained > 0) play('xp');
      setStep('result');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Impossible d'enregistrer vos réponses.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleAnswer = (optionIdx: number) => {
    if (!activeQuiz || submittingRef.current) return;
    const newAnswers = [...answers, optionIdx];
    setAnswers(newAnswers);
    if (currentQuestionIdx < activeQuiz.questions.length - 1) setCurrentQuestionIdx(prev => prev + 1);
    else submitAnswers(activeQuiz, newAnswers);
  };

  const backToList = () => {
    setStep('list');
    setActiveQuiz(null);
    setResult(null);
    setSubmitError(null);
    fetchQuizzes();
  };

  if (loading && step === 'list') return (
    <div className="flex justify-center py-20" role="status" aria-label="Chargement des quizz">
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
        <Loader2 className="text-blue-600" size={32} />
      </motion.div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 md:space-y-8 pb-20 px-2 md:px-0 overflow-x-hidden">

      {/* Ambient */}
      <motion.div className="fixed top-10 right-10 w-80 h-80 bg-purple-500/5 rounded-full blur-[120px] -z-10 pointer-events-none"
        animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 7, repeat: Infinity }} />

      {/* Header */}
      <motion.div {...fadeUp()} className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Centre de Quizz</h1>
          <p className="text-sm md:text-base text-zinc-500 dark:text-zinc-400">Testez vos connaissances et gagnez de l&apos;XP bonus.</p>
        </div>
        {step === 'list' && (
          <motion.div {...fadeUp(0.1)} className="flex bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 self-start md:self-center">
            {[1, 2].map(s => (
              <motion.button key={s} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={() => setCurrentSemester(s)}
                aria-pressed={currentSemester === s}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${currentSemester === s ? 'bg-zinc-100 dark:bg-zinc-800 text-blue-600' : 'text-zinc-500'}`}
              >S{s}</motion.button>
            ))}
          </motion.div>
        )}
      </motion.div>

      {loadError && (
        <div role="alert" className="mx-2 flex items-center justify-between gap-3 p-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 text-sm text-red-600 dark:text-red-400">
          <span className="flex items-center gap-2"><XCircle size={16} className="shrink-0" /> {loadError}</span>
          {step === 'list' && (
            <button type="button" onClick={() => fetchQuizzes()} className="shrink-0 font-bold underline">Réessayer</button>
          )}
        </div>
      )}

      <AnimatePresence mode="wait">
        {step === 'list' && (
          <motion.div key="list" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 px-2">
            {quizzes.length === 0 && !loadError && (
              <div className="md:col-span-2 text-center py-20 text-zinc-400 border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-3xl">
                <Brain size={48} className="mx-auto mb-4 opacity-50" />
                <p>Aucun quiz disponible pour ce semestre.</p>
              </div>
            )}
            {quizzes.map((quiz, i) => {
              const empty = quiz._count.questions === 0;
              return (
                <motion.div key={quiz.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                  <TiltCard>
                    <motion.div
                      whileHover={empty ? undefined : { scale: 1.02 }}
                      role="button"
                      tabIndex={empty ? -1 : 0}
                      aria-disabled={empty}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startQuiz(quiz); } }}
                      className={`group p-6 md:p-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl md:rounded-[2rem] transition-all relative overflow-hidden ${empty ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-xl cursor-pointer'}`}
                      onClick={() => startQuiz(quiz)}
                    >
                      {/* Hover glow */}
                      <motion.div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-[2rem] pointer-events-none" />
                      <div className="relative z-10 space-y-4">
                        <div className="flex justify-between items-start">
                          <motion.div whileHover={{ rotate: 10 }} className="p-2.5 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-blue-600">
                            <Brain size={20} />
                          </motion.div>
                          {quiz.xpEarned > 0 ? (
                            <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">
                              <CheckCircle2 size={10} /> +{quiz.xpEarned} XP obtenus
                            </span>
                          ) : (
                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">+{quiz.xpReward} XP</span>
                          )}
                        </div>
                        <div>
                          <h3 className="text-lg md:text-xl font-bold">{quiz.title}</h3>
                          <p className="text-xs md:text-sm text-zinc-500 mt-1 line-clamp-2">{quiz.description}</p>
                        </div>
                        <div className="flex items-center justify-between pt-4 border-t border-zinc-50 dark:border-zinc-800">
                          <div className="flex items-center gap-3 text-[10px] text-zinc-400 font-bold uppercase">
                            <span className="flex items-center gap-2"><Clock size={12} /> {empty ? 'Bientôt disponible' : `${quiz._count.questions} Questions`}</span>
                            {quiz.myBestScore !== null && <span className="text-blue-500">Meilleur : {quiz.myBestScore}%</span>}
                          </div>
                          <motion.div whileHover={{ x: 4 }}><ChevronRight size={16} className="text-zinc-300 group-hover:text-blue-600 transition-colors" /></motion.div>
                        </div>
                      </div>
                    </motion.div>
                  </TiltCard>
                </motion.div>
              );
            })}
            {nextCursor && (
              <div className="md:col-span-2 flex justify-center">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => fetchQuizzes(nextCursor)}
                  className="px-6 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl text-sm font-bold border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {loadingMore && <Loader2 size={16} className="animate-spin" />}
                  {loadingMore ? 'Chargement...' : 'Charger plus'}
                </button>
              </div>
            )}
          </motion.div>
        )}

        {step === 'playing' && activeQuiz && (
          <motion.div key="playing" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="max-w-2xl mx-auto bg-white dark:bg-zinc-900 p-6 md:p-12 rounded-3xl md:rounded-[3rem] shadow-xl border border-zinc-100 dark:border-zinc-800 mx-2">
            {submitting || submitError ? (
              <div className="text-center space-y-6 py-8" role="status">
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin text-blue-600 mx-auto" size={32} />
                    <p className="text-sm text-zinc-500">Correction en cours...</p>
                  </>
                ) : (
                  <>
                    <XCircle className="text-red-500 mx-auto" size={32} />
                    <p role="alert" className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
                    <div className="flex gap-3 justify-center">
                      <button type="button" onClick={backToList}
                        className="px-5 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl font-bold text-zinc-600 dark:text-zinc-300">Abandonner</button>
                      <button type="button" onClick={() => submitAnswers(activeQuiz, answers)}
                        className="px-5 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors">Réessayer</button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="mb-8 md:mb-10 space-y-3">
                  <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-zinc-400">
                    <span>Question {currentQuestionIdx + 1} / {activeQuiz.questions.length}</span>
                    <span>{Math.round(((currentQuestionIdx + 1) / activeQuiz.questions.length) * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-blue-600" initial={{ width: 0 }}
                      animate={{ width: `${((currentQuestionIdx + 1) / activeQuiz.questions.length) * 100}%` }}
                      transition={{ duration: 0.4, ease: 'easeOut' }} />
                  </div>
                </div>
                <h2 className="text-xl md:text-2xl font-bold mb-8 md:mb-10 text-center leading-tight">
                  {activeQuiz.questions[currentQuestionIdx].question}
                </h2>
                <div className="space-y-3">
                  {activeQuiz.questions[currentQuestionIdx].options.map((option, i) => (
                    <motion.button key={i} type="button" whileHover={{ scale: 1.02, x: 4 }} whileTap={{ scale: 0.98 }}
                      onClick={() => handleAnswer(i)}
                      className="w-full p-4 md:p-5 text-left bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl md:rounded-2xl hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-all font-medium text-sm md:text-base text-zinc-700 dark:text-zinc-300 flex items-center justify-between group"
                    >
                      <span className="flex-1 pr-4">{option}</span>
                      <ChevronRight size={16} className="text-zinc-300 group-hover:text-blue-600 transition-colors shrink-0" />
                    </motion.button>
                  ))}
                </div>
                <button type="button" onClick={backToList}
                  className="mt-8 mx-auto block text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
                  Abandonner le quiz
                </button>
              </>
            )}
          </motion.div>
        )}

        {step === 'result' && activeQuiz && result && (
          <motion.div key="result" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 150 }}
            className="max-w-md mx-auto text-center space-y-6 md:space-y-8 bg-white dark:bg-zinc-900 p-8 md:p-12 rounded-3xl md:rounded-[3rem] shadow-xl border border-zinc-100 dark:border-zinc-800 mx-2">
            <motion.div
              initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
              className="w-20 h-20 md:w-24 md:h-24 bg-blue-600 rounded-2xl md:rounded-[2rem] flex items-center justify-center mx-auto shadow-xl shadow-blue-500/20"
            >
              <Trophy size={40} className="text-white md:w-12 md:h-12" />
            </motion.div>
            <div className="space-y-2">
              <h2 className="text-2xl md:text-3xl font-black">{result.passed ? 'Bravo !' : 'Terminé !'}</h2>
              <p className="text-xs md:text-sm text-zinc-500 uppercase font-bold tracking-widest">Score obtenu</p>
              <motion.div
                className="text-5xl md:text-6xl font-black text-blue-600 tracking-tighter"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              >
                {result.score}%
              </motion.div>
              <p className="text-xs text-zinc-400">{result.correctCount} / {result.total} bonnes réponses</p>
            </div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
              className="p-5 md:p-6 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center justify-center gap-2 text-emerald-500 font-black uppercase tracking-widest text-[10px]">
                <Zap size={12} fill="currentColor" /> XP Gagné
              </div>
              <div className="text-xl md:text-2xl font-black mt-1">+{result.xpGained} XP</div>
              {result.xpGained === 0 && (
                <p className="text-xs text-zinc-500 mt-2">
                  {result.alreadyRewarded
                    ? 'Vous avez déjà obtenu les XP de ce quiz.'
                    : !result.passed
                      ? `Il faut au moins ${result.passScore}% pour gagner des XP.`
                      : 'Ce quiz ne rapporte pas d’XP.'}
                </p>
              )}
              {result.leveledUp && <p className="text-xs font-bold text-blue-600 mt-2">Niveau supérieur atteint !</p>}
              {result.newBadges.map(b => (
                <p key={b.slug} className="text-xs font-bold text-amber-500 mt-2">Nouveau badge : {b.name}</p>
              ))}
            </motion.div>
            <div className="flex flex-col gap-3">
              {!result.passed && (
                <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    const quiz = quizzes.find(q => q.id === activeQuiz.id);
                    if (quiz) startQuiz(quiz); else backToList();
                  }}
                  className="w-full py-4 bg-blue-600 text-white rounded-xl md:rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors"
                >
                  <RotateCcw size={18} /> Réessayer
                </motion.button>
              )}
              <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={backToList}
                className="w-full py-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl md:rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
              >
                Retour aux quizz
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
