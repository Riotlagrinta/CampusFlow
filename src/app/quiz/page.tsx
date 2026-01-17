'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Trophy, 
  Brain, 
  ChevronRight, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  RotateCcw,
  Loader2,
  Star,
  Zap
} from 'lucide-react';
import { useSound } from '@/hooks/useSound';

type Quiz = {
  id: string;
  title: string;
  description: string;
  subject: string;
  xpReward: number;
  _count: { questions: number };
};

type Question = {
  id: string;
  question: string;
  options: string; // JSON
  answer: number;
};

export default function QuizPage() {
  const { play } = useSound();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<any>(null);
  const [step, setStep] = useState<'list' | 'playing' | 'result'>('list');
  const [loading, setLoading] = useState(true);
  
  // Game State
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async () => {
    try {
      const res = await fetch('/api/quiz');
      const data = await res.json();
      setQuizzes(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const startQuiz = async (quiz: Quiz) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/quiz/${quiz.id}`);
      const data = await res.json();
      setActiveQuiz(data);
      setStep('playing');
      setCurrentQuestionIdx(0);
      setScore(0);
      setAnswers([]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (optionIdx: number) => {
    const isCorrect = optionIdx === activeQuiz.questions[currentQuestionIdx].answer;
    if (isCorrect) {
      setScore(prev => prev + 1);
      play('xp');
    } else {
      play('send');
    }

    const newAnswers = [...answers, optionIdx];
    setAnswers(newAnswers);

    if (currentQuestionIdx < activeQuiz.questions.length - 1) {
      setCurrentQuestionIdx(prev => prev + 1);
    } else {
      finishQuiz(newAnswers);
    }
  };

  const finishQuiz = async (finalAnswers: number[]) => {
    setSubmitting(true);
    const finalScore = Math.round((score / activeQuiz.questions.length) * 100);
    
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quizId: activeQuiz.id,
          score: finalScore,
          email: user.email
        }),
      });
      play('success');
      setStep('result');
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && step === 'list') return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20">
      
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Centre de Quizz</h1>
        <p className="text-zinc-500 dark:text-zinc-400">Testez vos connaissances et gagnez de l&apos;XP bonus.</p>
      </div>

      <AnimatePresence mode="wait">
        {step === 'list' && (
          <motion.div 
            key="list"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {quizzes.map((quiz) => (
              <div 
                key={quiz.id}
                className="group p-8 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[2rem] hover:shadow-2xl transition-all cursor-pointer relative overflow-hidden"
                onClick={() => startQuiz(quiz)}
              >
                <div className="relative z-10 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-2xl text-blue-600">
                      <Brain size={24} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">+{quiz.xpReward} XP</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{quiz.title}</h3>
                    <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{quiz.description}</p>
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t border-zinc-50 dark:border-zinc-800">
                    <div className="flex items-center gap-2 text-xs text-zinc-400 font-bold uppercase">
                      <Clock size={14} /> {quiz._count.questions} Questions
                    </div>
                    <ChevronRight size={18} className="text-zinc-300 group-hover:text-blue-600 transition-colors" />
                  </div>
                </div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-500" />
              </div>
            ))}
          </motion.div>
        )}

        {step === 'playing' && activeQuiz && (
          <motion.div 
            key="playing"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-2xl mx-auto bg-white dark:bg-zinc-900 p-8 md:p-12 rounded-[3rem] shadow-2xl border border-zinc-200 dark:border-zinc-800"
          >
            {/* Progress Bar */}
            <div className="mb-10 space-y-4">
              <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-zinc-400">
                <span>Question {currentQuestionIdx + 1} / {activeQuiz.questions.length}</span>
                <span>{Math.round(((currentQuestionIdx + 1) / activeQuiz.questions.length) * 100)}%</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-blue-600" 
                  initial={{ width: 0 }}
                  animate={{ width: `${((currentQuestionIdx + 1) / activeQuiz.questions.length) * 100}%` }}
                />
              </div>
            </div>

            <h2 className="text-2xl font-bold mb-10 text-center leading-tight">
              {activeQuiz.questions[currentQuestionIdx].question}
            </h2>

            <div className="space-y-3">
              {JSON.parse(activeQuiz.questions[currentQuestionIdx].options).map((option: string, i: number) => (
                <button
                  key={i}
                  onClick={() => handleAnswer(i)}
                  className="w-full p-5 text-left bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all font-medium text-zinc-700 dark:text-zinc-300 flex items-center justify-between group"
                >
                  {option}
                  <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-all" />
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {step === 'result' && (
          <motion.div 
            key="result"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md mx-auto text-center space-y-8 bg-white dark:bg-zinc-900 p-12 rounded-[3rem] shadow-2xl border border-zinc-200 dark:border-zinc-800"
          >
            <div className="w-24 h-24 bg-blue-600 rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl shadow-blue-500/30">
              <Trophy size={48} className="text-white" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-3xl font-black">Terminé !</h2>
              <p className="text-zinc-500">Vous avez obtenu un score de</p>
              <div className="text-6xl font-black text-blue-600 tracking-tighter">
                {Math.round((score / activeQuiz.questions.length) * 100)}%
              </div>
            </div>

            <div className="p-6 bg-zinc-50 dark:bg-zinc-950 rounded-2xl space-y-2">
               <div className="flex items-center justify-center gap-2 text-emerald-500 font-bold uppercase tracking-widest text-xs">
                  <Zap size={14} fill="currentColor" /> XP Gagné
               </div>
               <div className="text-2xl font-black">+{Math.round((activeQuiz.xpReward * (score / activeQuiz.questions.length)))} XP</div>
            </div>

            <button 
              onClick={() => setStep('list')}
              className="w-full py-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl font-bold flex items-center justify-center gap-2"
            >
              <RotateCcw size={20} /> Retour aux quizz
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
