'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Clock,
  Send,
  Loader2,
  MessageSquare,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useSound } from '@/hooks/useSound';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';

type Author = { id: string; firstName: string | null; lastName: string | null; level: number };

type Answer = {
  id: string;
  content: string;
  createdAt: string;
  author: Author;
  isAccepted: boolean;
};

type QuestionDetail = {
  id: string;
  title: string;
  content: string;
  tags: string | null;
  createdAt: string;
  author: Author;
  answers: Answer[];
};

const ANSWER_MAX = 5000;

const displayName = (a: Author) => [a.firstName, a.lastName].filter(Boolean).join(' ') || 'Étudiant';

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return typeof data?.error === 'string' ? data.error : fallback;
  } catch {
    return fallback;
  }
}

export default function QuestionDetailPage() {
  const { play } = useSound();
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;

  const [question, setQuestion] = useState<QuestionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newAnswer, setNewAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const fetchQuestionDetail = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch(`/api/forum/questions/${id}`, { signal });
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) throw new Error(await readError(res, 'Impossible de charger la question.'));
      setQuestion(await res.json());
      setNotFound(false);
      setLoadError(null);
    } catch (err) {
      if (signal.aborted) return;
      setLoadError(err instanceof Error ? err.message : 'Impossible de charger la question.');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    fetchQuestionDetail(controller.signal);
    return () => controller.abort();
  }, [id, reloadKey, fetchQuestionDetail]);

  const handlePostAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnswer.trim() || submitting) return;

    setSubmitting(true);
    setActionError(null);
    play('send');
    try {
      const res = await fetch(`/api/forum/questions/${id}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newAnswer }),
      });
      if (!res.ok) throw new Error(await readError(res, "Impossible de publier la réponse."));

      const createdAnswer: Answer = await res.json();
      setQuestion(prev => prev ? { ...prev, answers: [...prev.answers, createdAnswer] } : null);
      setNewAnswer('');
      play('xp');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Impossible de publier la réponse.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccept = async (answerId: string) => {
    if (acceptingId) return;
    setAcceptingId(answerId);
    setActionError(null);
    try {
      const res = await fetch(`/api/forum/answers/${answerId}/accept`, { method: 'POST' });
      if (!res.ok) {
        // 409 : une autre réponse a déjà été acceptée entre-temps, notre vue est périmée.
        if (res.status === 409) setReloadKey(k => k + 1);
        throw new Error(await readError(res, "Impossible d'accepter cette réponse."));
      }
      const result: { xpAwarded?: boolean } | null = await res.json().catch(() => null);
      setQuestion(prev => prev ? {
        ...prev,
        answers: prev.answers.map(a => a.id === answerId ? { ...a, isAccepted: true } : a),
      } : null);
      // Déjà acceptée (ou XP non crédité) : on resynchronise avec l'état réel du serveur.
      if (result?.xpAwarded === false) setReloadKey(k => k + 1);
      play('success');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Impossible d'accepter cette réponse.");
    } finally {
      setAcceptingId(null);
    }
  };

  if (loading) return <div className="flex justify-center py-20" role="status" aria-label="Chargement"><Loader2 className="animate-spin" /></div>;

  if (loadError && !question) return (
    <div className="max-w-4xl mx-auto text-center py-20 space-y-4">
      <p role="alert" className="text-red-600 dark:text-red-400">{loadError}</p>
      <button type="button" onClick={() => { setLoading(true); setLoadError(null); setReloadKey(k => k + 1); }}
        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm transition-all">Réessayer</button>
    </div>
  );

  if (notFound || !question) return (
    <div className="max-w-4xl mx-auto text-center py-20 space-y-4">
      <p>Question introuvable.</p>
      <Link href="/forum" className="text-sm text-blue-600 hover:underline">Retour au forum</Link>
    </div>
  );

  const isQuestionAuthor = !!currentUserId && question.author.id === currentUserId;
  const hasAcceptedAnswer = question.answers.some(a => a.isAccepted);
  const answerCount = question.answers.length;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 px-2 md:px-0">

      <Link href="/forum" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">
        <ArrowLeft size={16} /> Retour au forum
      </Link>

      {/* Question Header */}
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 leading-tight break-words">
          {question.title}
        </h1>

        <div className="flex items-center gap-4 text-sm text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 pb-6">
           <div className="flex items-center gap-2">
             <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center font-bold text-xs">
                {(question.author.firstName ?? '?').charAt(0)}
             </div>
             <span className="font-medium text-zinc-900 dark:text-zinc-200">
               {displayName(question.author)}
             </span>
           </div>
           <span>•</span>
           <div className="flex items-center gap-1">
             <Clock size={14} />
             <span>{new Date(question.createdAt).toLocaleDateString()}</span>
           </div>
        </div>

        {/* Question Content */}
        <div className="prose dark:prose-invert max-w-none break-words">
          <ReactMarkdown>{question.content}</ReactMarkdown>
        </div>
      </div>

      {/* Answers Section */}
      <div className="space-y-6 pt-8">
        <h3 className="text-xl font-bold flex items-center gap-2">
           <MessageSquare size={20} />
           {answerCount} {answerCount > 1 ? 'Réponses' : 'Réponse'}
        </h3>

        {actionError && (
          <div role="alert" className="flex items-center gap-2 p-4 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 text-sm text-red-600 dark:text-red-400">
            <XCircle size={16} className="shrink-0" /> {actionError}
          </div>
        )}

        <div className="space-y-6">
           {question.answers.map((answer) => (
             <div key={answer.id} className={`p-6 bg-white dark:bg-zinc-900/50 border rounded-2xl space-y-4 ${answer.isAccepted ? 'border-emerald-400 dark:border-emerald-600' : 'border-zinc-200 dark:border-zinc-800'}`}>
                <div className="flex items-center justify-between gap-3">
                   <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-sm truncate">
                        {displayName(answer.author)}
                      </span>
                      <span className="text-xs text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded shrink-0">Lvl {answer.author.level}</span>
                      {answer.isAccepted && (
                        <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded shrink-0">
                          <CheckCircle2 size={12} /> Solution
                        </span>
                      )}
                   </div>
                   <span className="text-xs text-zinc-400 shrink-0">{new Date(answer.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none text-zinc-700 dark:text-zinc-300 leading-relaxed break-words">
                   <ReactMarkdown>{answer.content}</ReactMarkdown>
                </div>
                {isQuestionAuthor && !hasAcceptedAnswer && answer.author.id !== currentUserId && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleAccept(answer.id)}
                      disabled={acceptingId !== null}
                      className="px-4 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-60"
                    >
                      {acceptingId === answer.id ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                      Marquer comme solution
                    </button>
                  </div>
                )}
             </div>
           ))}
        </div>

        {/* Reply Form */}
        <div className="mt-8 bg-zinc-50 dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800">
           <h4 className="font-bold text-sm mb-4">Votre réponse</h4>
           <form onSubmit={handlePostAnswer} className="space-y-4">
              <textarea
                aria-label="Votre réponse"
                className="w-full bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none h-32 resize-none"
                placeholder="Écrivez votre réponse ici. Le Markdown est supporté."
                value={newAnswer}
                onChange={e => setNewAnswer(e.target.value)}
                maxLength={ANSWER_MAX}
                required
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || !newAnswer.trim()}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-60"
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
