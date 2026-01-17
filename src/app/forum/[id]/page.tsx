'use client';

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Clock, 
  Send, 
  Loader2,
  MessageSquare
} from 'lucide-react';
import { useSound } from '@/hooks/useSound';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

type Answer = {
  id: string;
  content: string;
  createdAt: string;
  author: { firstName: string; lastName: string; level: number };
  isAccepted: boolean;
};

type QuestionDetail = {
  id: string;
  title: string;
  content: string;
  tags: string | null;
  createdAt: string;
  author: { firstName: string; lastName: string; level: number };
  answers: Answer[];
};

export default function QuestionDetailPage() {
  const { play } = useSound();
  const { id } = useParams();
  const [question, setQuestion] = useState<QuestionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [newAnswer, setNewAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (id) fetchQuestionDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchQuestionDetail = async () => {
    try {
      const res = await fetch(`/api/forum/questions/${id}`);
      if (res.ok) {
        const data = await res.json();
        setQuestion(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePostAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnswer.trim()) return;

    setSubmitting(true);
    play('send');
    try {
      const res = await fetch(`/api/forum/questions/${id}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newAnswer }),
      });

      if (res.ok) {
        const createdAnswer = await res.json();
        setQuestion(prev => prev ? {
          ...prev,
          answers: [...prev.answers, createdAnswer]
        } : null);
        setNewAnswer('');
        play('xp');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;
  if (!question) return <div className="text-center py-20">Question introuvable.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      
      <Link href="/forum" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">
        <ArrowLeft size={16} /> Retour au forum
      </Link>

      {/* Question Header */}
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 leading-tight">
          {question.title}
        </h1>
        
        <div className="flex items-center gap-4 text-sm text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 pb-6">
           <div className="flex items-center gap-2">
             <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center font-bold text-xs">
                {question.author.firstName.charAt(0)}
             </div>
             <span className="font-medium text-zinc-900 dark:text-zinc-200">
               {question.author.firstName} {question.author.lastName}
             </span>
           </div>
           <span>•</span>
           <div className="flex items-center gap-1">
             <Clock size={14} />
             <span>{new Date(question.createdAt).toLocaleDateString()}</span>
           </div>
        </div>

        {/* Question Content */}
        <div className="prose dark:prose-invert max-w-none">
          <ReactMarkdown>{question.content}</ReactMarkdown>
        </div>
      </div>

      {/* Answers Section */}
      <div className="space-y-6 pt-8">
        <h3 className="text-xl font-bold flex items-center gap-2">
           <MessageSquare size={20} />
           {question.answers.length} Réponses
        </h3>

        <div className="space-y-6">
           {question.answers.map((answer) => (
             <div key={answer.id} className="p-6 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">
                        {answer.author.firstName} {answer.author.lastName}
                      </span>
                      <span className="text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">Lvl {answer.author.level}</span>
                   </div>
                   <span className="text-xs text-zinc-400">{new Date(answer.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="text-zinc-700 dark:text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                   {answer.content}
                </div>
             </div>
           ))}
        </div>

        {/* Reply Form */}
        <div className="mt-8 bg-zinc-50 dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
           <h4 className="font-bold text-sm mb-4">Votre réponse</h4>
           <form onSubmit={handlePostAnswer} className="space-y-4">
              <textarea 
                className="w-full bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none h-32 resize-none"
                placeholder="Écrivez votre réponse ici. Le Markdown est supporté."
                value={newAnswer}
                onChange={e => setNewAnswer(e.target.value)}
                required
              />
              <div className="flex justify-end">
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm transition-all flex items-center gap-2"
                >
                  {submitting ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                  Envoyer
                </button>
              </div>
           </form>
        </div>

      </div>
    </div>
  );
}
