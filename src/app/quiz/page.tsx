'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Brain, ChevronRight, Clock, CheckCircle2, XCircle, RotateCcw, Loader2, Star, Zap } from 'lucide-react';
import { useSound } from '@/hooks/useSound';
import { TiltCard } from '@/components/TiltCard';

type Quiz = { id: string; title: string; description: string; subject: string; xpReward: number; _count: { questions: number }; };
type Question = { id: string; question: string; options: string; answer: number; };

const fadeUp = (delay = 0) => ({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay, type: 'spring' as const, stiffness: 80 } });

export default function QuizPage() {
  const { play } = useSound();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<{ id: string; title: string; xpReward: number; questions: { question: string; options: string; answer: number }[] } | null>(null);
  const [step, setStep] = useState<'list' | 'playing' | 'result'>('list');
  const [loading, setLoading] = useState(true);
  const [currentSemester, setCurrentSemester] = useState<number>(2);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { fetchQuizzes(); }, [currentSemester]);

  const fetchQuizzes = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/quiz?semester=${currentSemester}`);
      setQuizzes(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const startQuiz = async (quiz: Quiz) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/quiz/${quiz.id}`);
      setActiveQuiz(await res.json());
      setStep('playing'); setCurrentQuestionIdx(0); setScore(0); setAnswers([]);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleAnswer = (optionIdx: number) => {
    if (!activeQuiz) return;
    const isCorrect = optionIdx === activeQuiz.questions[currentQuestionIdx].answer;
    if (isCorrect) { setScore(prev => prev + 1); play('xp'); } else { play('send'); }
    const newAnswers = [...answers, optionIdx];
    setAnswers(newAnswers);
    if (currentQuestionIdx < activeQuiz.questions.length - 1) setCurrentQuestionIdx(prev => prev + 1);
    else finishQuiz(newAnswers);
  };

  const finishQuiz = async (finalAnswers: number[]) => {
    if (!activeQuiz) return;
    setSubmitting(true);
    try {
      // HIGH FIX: on envoie les réponses brutes — le score est calculé côté serveur.
      const res = await fetch('/api/quiz', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId: activeQuiz.id, answers: finalAnswers }),
      });
      const data = await res.json();
      if (data.score !== undefined) setScore(Math.round((data.score / 100) * activeQuiz.questions.length));
      play('success'); setStep('result');
    } catch (err) { console.error(err); }
    finally { setSubmitting(false); }
  };

  if (loading && step === 'list') return (
    <div className="flex justify-center py-20">
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
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${currentSemester === s ? 'bg-zinc-100 dark:bg-zinc-800 text-blue-600' : 'text-zinc-500'}`}
              >S{s}</motion.button>
            ))}
          </motion.div>
        )}
      </motion.div>

      <AnimatePresence mode="wait">
        {step === 'list' && (
          <motion.div key="list" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 px-2">
            {quizzes.map((quiz, i) => (
              <motion.div key={quiz.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                <TiltCard>
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    className="group p-6 md:p-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl md:rounded-[2rem] hover:shadow-xl transition-all cursor-pointer relative overflow-hidden"
                    onClick={() => startQuiz(quiz)}
                  >
                    {/* Hover glow */}
                    <motion.div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-[2rem] pointer-events-none" />
                    <div className="relative z-10 space-y-4">
                      <div className="flex justify-between items-start">
                        <motion.div whileHover={{ rotate: 10 }} className="p-2.5 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-blue-600">
                          <Brain size={20} />
                        </motion.div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">+{quiz.xpReward} XP</span>
                      </div>
                      <div>
                        <h3 className="text-lg md:text-xl font-bold">{quiz.title}</h3>
                        <p className="text-xs md:text-sm text-zinc-500 mt-1 line-clamp-2">{quiz.description}</p>
                      </div>
                      <div className="flex items-center justify-between pt-4 border-t border-zinc-50 dark:border-zinc-800">
                        <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-bold uppercase">
                          <Clock size={12} /> {quiz._count.questions} Questions
                        </div>
                        <motion.div whileHover={{ x: 4 }}><ChevronRight size={16} className="text-zinc-300 group-hover:text-blue-600 transition-colors" /></motion.div>
                      </div>
                    </div>
                  </motion.div>
                </TiltCard>
              </motion.div>
            ))}
          </motion.div>
        )}

        {step === 'playing' && activeQuiz && (
          <motion.div key="playing" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="max-w-2xl mx-auto bg-white dark:bg-zinc-900 p-6 md:p-12 rounded-3xl md:rounded-[3rem] shadow-xl border border-zinc-100 dark:border-zinc-800 mx-2">
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
              {JSON.parse(activeQuiz.questions[currentQuestionIdx].options).map((option: string, i: number) => (
                <motion.button key={i} whileHover={{ scale: 1.02, x: 4 }} whileTap={{ scale: 0.98 }}
                  onClick={() => handleAnswer(i)}
                  className="w-full p-4 md:p-5 text-left bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl md:rounded-2xl hover:border-blue-500 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-all font-medium text-sm md:text-base text-zinc-700 dark:text-zinc-300 flex items-center justify-between group"
                >
                  <span className="flex-1 pr-4">{option}</span>
                  <ChevronRight size={16} className="text-zinc-300 group-hover:text-blue-600 transition-colors shrink-0" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'result' && activeQuiz && (
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
              <h2 className="text-2xl md:text-3xl font-black">Terminé !</h2>
              <p className="text-xs md:text-sm text-zinc-500 uppercase font-bold tracking-widest">Score obtenu</p>
              <motion.div
                className="text-5xl md:text-6xl font-black text-blue-600 tracking-tighter"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              >
                {Math.round((score / activeQuiz.questions.length) * 100)}%
              </motion.div>
            </div>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
              className="p-5 md:p-6 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center justify-center gap-2 text-emerald-500 font-black uppercase tracking-widest text-[10px]">
                <Zap size={12} fill="currentColor" /> XP Gagné
              </div>
              <div className="text-xl md:text-2xl font-black mt-1">+{Math.round(activeQuiz.xpReward * (score / activeQuiz.questions.length))} XP</div>
            </motion.div>
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={() => setStep('list')}
              className="w-full py-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl md:rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            >
              <RotateCcw size={18} /> Retour aux quizz
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
