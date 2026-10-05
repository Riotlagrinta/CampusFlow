'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, X, Bot, User, Loader2, Maximize2, Minimize2, Copy, Check, Youtube, Info, PlusCircle, Paperclip, FileText } from 'lucide-react';
import { clsx } from 'clsx';
import ReactMarkdown, { type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useSound } from '@/hooks/useSound';
import { useSession } from 'next-auth/react';
import { usePdfResources, MAX_PDF_RESOURCES, type PdfResource } from '@/hooks/usePdfResources';
import Mermaid from './Mermaid';
import { isPaymentsEnabled } from '@/lib/payments';

// La coloration syntaxique est lourde : chargée uniquement quand une réponse contient du code.
const SyntaxHighlighter = dynamic(
  () => import('react-syntax-highlighter').then((mod) => mod.Prism),
  { ssr: false }
);

interface Message {
  role: 'user' | 'assistant';
  content: string;
  /** Message d'erreur local : jamais sauvegardé ni renvoyé au serveur comme historique. */
  isError?: boolean;
}

type Resource = PdfResource;

interface QuotaInfo {
  used: number;
  limit: number;
  bonus: number;
  remaining: number;
}

const WELCOME_MESSAGE: Message = {
  role: 'assistant',
  content: "Bonjour. Je suis l'assistant pédagogique de DEFITECH. Comment puis-je vous accompagner dans vos travaux aujourd'hui ?",
};

const MAX_INPUT_CHARS = 4000;
const HISTORY_SENT = 6;
const HISTORY_STORED = 100;
const AD_DURATION_S = 30;

// Message de quota épuisé quand les paiements sont désactivés (freemium) : jamais de renvoi vers la boutique.
const QUOTA_EXHAUSTED_FREE_MESSAGE =
  "Votre quota IA du jour est épuisé. Il est renouvelé chaque jour : réessayez demain, ou gagnez des jetons bonus avec la publicité récompensée ou le parrainage.";

function loadHistory(key: string): Message[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.filter(
      (m): m is Message =>
        !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
    );
    return valid.length > 0 ? valid : null;
  } catch {
    return null;
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      aria-label="Copier le code"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          /* presse-papiers indisponible */
        }
      }}
      className="p-1.5 bg-white/10 hover:bg-white/20 rounded text-zinc-400 transition-colors"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

export default function AIChat() {
  const { data: session } = useSession();
  const paymentsEnabled = isPaymentsEnabled();
  const userId = session?.user?.id;
  const { play } = useSound();
  const [isOpen, setIsOpen] = useState(false);

  const [isMaximized, setIsMaximized] = useState(false);

  const [input, setInput] = useState('');

  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [historyLoadedFor, setHistoryLoadedFor] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const {
    resources,
    status: resourcesStatus,
    error: resourcesError,
    truncated: resourcesTruncated,
    load: loadResources,
  } = usePdfResources();
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [showResourceList, setShowResourceList] = useState(false);

  const [quotaInfo, setQuotaInfo] = useState<QuotaInfo | null>(null);
  const [showAdModal, setShowAdModal] = useState(false);
  const [watchingAd, setWatchingAd] = useState(false);
  const [adTimer, setAdTimer] = useState(0);
  const [adError, setAdError] = useState<string | null>(null);
  const rewardInFlight = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Historique par utilisateur : `ai_chat_history:<userId>` (jamais partagé entre comptes).
  useEffect(() => {
    if (!userId) return;
    try {
      localStorage.removeItem('ai_chat_history'); // ancienne clé commune à tous les comptes
    } catch {
      /* stockage indisponible */
    }
    setMessages(loadHistory(`ai_chat_history:${userId}`) ?? [WELCOME_MESSAGE]);
    setHistoryLoadedFor(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId || historyLoadedFor !== userId) return;
    try {
      const toStore = messages.filter((m) => !m.isError).slice(-HISTORY_STORED);
      localStorage.setItem(`ai_chat_history:${userId}`, JSON.stringify(toStore));
    } catch {
      /* quota de stockage dépassé ou stockage indisponible */
    }
  }, [messages, userId, historyLoadedFor]);

  const handleNewChat = () => {
    if (confirm('Démarrer une nouvelle discussion ?')) {
      setMessages([WELCOME_MESSAGE]);
      play('send');
    }
  };

  const fetchQuota = useCallback(async () => {
    try {
      const res = await fetch('/api/user/ai-quota');
      if (res.ok) {
        setQuotaInfo(await res.json());
      }
    } catch (error) {
      console.error('Failed to fetch quota:', error);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchQuota();
  }, [isOpen, fetchQuota]);

  // Les PDF (dossiers compris) ne sont chargés qu'à l'ouverture du sélecteur.
  useEffect(() => {
    if (isOpen && showResourceList) void loadResources();
  }, [isOpen, showResourceList, loadResources]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // --- Pub-récompense : le serveur plafonne (5/jour) et espace (30 s) les récompenses ---
  const handleAdComplete = useCallback(async () => {
    if (rewardInFlight.current) return;
    rewardInFlight.current = true;
    try {
      const res = await fetch('/api/user/ad-reward', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await fetchQuota();
        setShowAdModal(false);
        play('success');
      } else {
        setAdError(data.error || "La récompense n'a pas pu être créditée. Réessayez plus tard.");
      }
    } catch (e) {
      console.error(e);
      setAdError('Erreur de connexion. Réessayez dans un instant.');
    } finally {
      rewardInFlight.current = false;
      setWatchingAd(false); // la modale ne reste jamais bloquée sur le compte à rebours
    }
  }, [fetchQuota, play]);

  useEffect(() => {
    if (!watchingAd) return;
    if (adTimer <= 0) {
      void handleAdComplete();
      return;
    }
    const timer = setTimeout(() => setAdTimer((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [watchingAd, adTimer, handleAdComplete]);

  const handleWatchAd = () => {
    const adUrl = 'https://otieu.com/4/10485395';
    setAdError(null);
    setWatchingAd(true);
    setAdTimer(AD_DURATION_S);
    window.open(adUrl, '_blank', 'noopener,noreferrer');
  };

  const handleSend = async () => {
    const userMessage = input.trim();
    if (!userMessage || isLoading) return;

    // Historique envoyé : derniers échanges réels (ni message d'accueil, ni erreurs locales).
    const history = messages
      .filter((m) => !m.isError && m !== WELCOME_MESSAGE)
      .slice(-HISTORY_SENT)
      .map(({ role, content }) => ({ role, content: content.slice(0, MAX_INPUT_CHARS) }));

    setInput('');
    play('send');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          resourceId: selectedResource?.id,
          history,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && typeof data.reply === 'string') {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
        setSelectedResource(null);
        play('xp'); // Petit son quand l'IA répond (car on gagne de l'XP)
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content:
              data.quotaExceeded && !isPaymentsEnabled()
                ? QUOTA_EXHAUSTED_FREE_MESSAGE
                : data.error || 'Une erreur est survenue. Veuillez réessayer.',
            isError: true,
          },
        ]);
        if (data.quotaExceeded) setShowAdModal(true);
      }

      fetchQuota();
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Une erreur de communication est survenue. Veuillez réessayer.', isError: true },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={clsx(
        "fixed z-40 transition-all duration-500 ease-in-out",
        isMaximized
          ? "inset-2 md:inset-4 lg:right-8 lg:inset-y-8"
          : "bottom-24 right-4 md:bottom-6 md:right-6"
      )}
      // --sidebar-width est défini dans globals.css (0 sur mobile) : le mode agrandi ne recouvre pas la sidebar.
      style={isMaximized ? { left: 'calc(var(--sidebar-width, 0px) + 0.5rem)' } : {}}
    >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className={clsx(
              "glass flex flex-col shadow-2xl border-zinc-200 dark:border-zinc-800 overflow-hidden",
              isMaximized ? "w-full h-full rounded-3xl" : "w-[380px] md:w-[450px] h-[600px] rounded-2xl mb-4"
            )}>
            {/* Header Professionnel */}
            <div className="p-4 bg-zinc-900 dark:bg-zinc-950 text-white flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <Bot size={22} />
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-tight">Assistant Académique</h3>
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-medium uppercase tracking-widest">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    Propulsé par Groq
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {quotaInfo && (
                  <div
                    className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-medium uppercase tracking-widest px-2 py-1 rounded-full bg-white/5 border border-white/10"
                    title={`${quotaInfo.remaining} requête(s) IA restante(s) aujourd'hui, dont ${quotaInfo.bonus} jeton(s) bonus`}
                  >
                    <Info size={10} /> {quotaInfo.remaining} restantes
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white"
                  title="Nouvelle conversation"
                  aria-label="Nouvelle conversation"
                >
                  <PlusCircle size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsMaximized(!isMaximized)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white"
                  aria-label={isMaximized ? 'Réduire' : 'Agrandir'}
                >
                  {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white"
                  aria-label="Fermer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Zone de Messages avec Markdown */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-6 bg-zinc-50/50 dark:bg-zinc-900/30"
            >
              {messages.map((msg, i) => (
                <div key={i} className={clsx("flex gap-4", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                  <div className={clsx(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm",
                    msg.role === 'user' ? "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700" : "bg-blue-600 text-white"
                  )}>
                    {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                  </div>
                  <div className={clsx(
                    "max-w-[92%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm transition-all",
                    msg.role === 'user'
                      ? "bg-blue-600 text-white"
                      : msg.isError
                        ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/50"
                        : "bg-white dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700/50"
                  )}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        code({ className, children, node, ...props }: React.ComponentPropsWithoutRef<'code'> & ExtraProps) {
                          const match = /language-(\w+)/.exec(className || '');
                          const codeContent = String(children).replace(/\n$/, '');

                          if (match && match[1] === 'mermaid') {
                            return <Mermaid chart={codeContent} />;
                          }

                          return match ? (
                            <div className="relative group my-4">
                              <SyntaxHighlighter
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                style={vscDarkPlus as any}
                                language={match[1]}
                                PreTag="div"
                                className="rounded-xl !bg-zinc-950 !p-4 border border-white/5"
                              >
                                {codeContent}
                              </SyntaxHighlighter>
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                <CopyButton text={codeContent} />
                              </div>
                            </div>
                          ) : (
                            <code className="bg-zinc-100 dark:bg-zinc-700 px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-400 font-mono text-[10px] font-bold" {...props}>
                              {children}
                            </code>
                          );
                        },
                        a: ({ href, children }) => {
                          const external = !!href && /^https?:\/\//i.test(href);
                          return (
                            <a
                              href={href}
                              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                              className="underline underline-offset-2 text-blue-500 hover:text-blue-400"
                            >
                              {children}
                            </a>
                          );
                        },
                        ul: ({ children }) => <ul className="list-disc ml-4 space-y-2 my-4 text-inherit">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal ml-4 space-y-2 my-4 text-inherit">{children}</ol>,
                        p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
                        strong: ({ children }) => <strong className="font-bold text-blue-200 dark:text-blue-300">{children}</strong>,
                        h1: ({ children }) => <h1 className="text-lg font-black mb-3 text-white">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-md font-bold mb-2 text-blue-200">{children}</h2>,
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-2 border-blue-400 bg-white/5 p-3 my-3 rounded-r-lg italic text-xs">
                            {children}
                          </blockquote>
                        ),
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                    <Bot size={16} />
                  </div>
                  <div className="bg-white dark:bg-zinc-800/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-700/50 flex items-center gap-2">
                    <Loader2 size={18} className="animate-spin text-blue-500" />
                    <span className="text-xs text-zinc-400 font-medium italic">Analyse en cours...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input Professionnel */}
            <div className="p-6 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 relative">
              <AnimatePresence>
                {selectedResource && (
                  <motion.div
                    key="selected-resource"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="absolute bottom-[calc(100%+0.5rem)] left-6 right-6 flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-lg"
                  >
                    <FileText size={12} />
                    <span className="truncate flex-1">{selectedResource.title}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedResource(null)}
                      className="hover:bg-white/20 p-0.5 rounded transition-colors"
                      aria-label="Retirer le document"
                    >
                      <X size={12} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {showResourceList && (
                  <motion.div
                    key="resource-list"
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    className="absolute bottom-full left-4 right-4 mb-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl p-3 max-h-48 overflow-y-auto z-10"
                  >
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-2 px-1">Joindre un document</p>
                    <div className="space-y-1" aria-live="polite">
                      {resourcesStatus === 'loading' && resources.length === 0 && (
                        <p className="flex items-center gap-2 text-[10px] text-zinc-500 p-2">
                          <Loader2 size={12} className="animate-spin" /> Chargement des documents...
                        </p>
                      )}
                      {resourcesStatus === 'error' && (
                        <div role="alert" className="p-2 space-y-1">
                          <p className="text-[10px] text-red-600 dark:text-red-400">{resourcesError}</p>
                          <button
                            type="button"
                            onClick={() => void loadResources(true)}
                            className="text-[10px] font-bold text-blue-600 underline"
                          >
                            Réessayer
                          </button>
                        </div>
                      )}
                      {resources.map(res => (
                        <button
                          type="button"
                          key={res.id}
                          onClick={() => {
                            setSelectedResource(res);
                            setShowResourceList(false);
                            play('xp');
                          }}
                          className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all text-left group"
                        >
                          <FileText size={14} className="text-blue-500" />
                          <span className="text-[11px] font-bold truncate">{res.title}</span>
                        </button>
                      ))}
                      {resourcesStatus === 'ready' && resources.length === 0 && (
                        <p className="text-[10px] text-zinc-500 p-2">Aucun PDF disponible.</p>
                      )}
                      {resourcesTruncated && (
                        <p className="text-[10px] text-zinc-500 p-2">
                          Liste limitée aux {MAX_PDF_RESOURCES} premiers documents.
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowResourceList(!showResourceList)}
                  aria-label="Joindre un document"
                  className={clsx(
                    "p-3 rounded-xl transition-all border",
                    selectedResource
                      ? "bg-blue-600 text-white border-blue-600 shadow-blue-500/20 shadow-lg"
                      : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-400"
                  )}
                >
                  <Paperclip size={18} />
                </button>
                <input
                  type="text"
                  value={input}
                  maxLength={MAX_INPUT_CHARS}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && handleSend()}
                  placeholder={selectedResource ? "Question sur le PDF..." : "Posez votre question technique..."}
                  aria-label="Votre question"
                  className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner transition-all"
                />
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSend}
                  disabled={isLoading}
                  aria-label="Envoyer"
                  className="p-3.5 bg-zinc-900 dark:bg-blue-600 hover:bg-black dark:hover:bg-blue-700 text-white rounded-2xl transition-all disabled:opacity-50 shadow-xl"
                >
                  <Send size={20} />
                </motion.button>
              </div>
              <p className="mt-3 text-[10px] text-center text-zinc-400 font-medium">
                Vérifiez les réponses critiques. L&apos;IA peut faire des erreurs.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        whileHover={{ scale: 1.05, rotate: 5 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Fermer l'assistant IA" : "Ouvrir l'assistant IA"}
        className={clsx(
          "w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-300",
          isOpen ? "bg-zinc-900 text-white" : "bg-blue-600 text-white"
        )}>
        {isOpen ? <X size={28} /> : <Sparkles size={28} />}
      </motion.button>

      <AnimatePresence>
        {showAdModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Plus de jetons IA"
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-6 text-center space-y-6"
            >
              <Youtube size={48} className="mx-auto text-red-500" />
              <h3 className="text-xl font-bold">Plus de jetons IA ?</h3>
              <p className="text-zinc-500 text-sm">
                {paymentsEnabled
                  ? 'Votre quota IA du jour est épuisé. Choisissez une option pour continuer :'
                  : 'Votre quota IA du jour est épuisé. Il est renouvelé chaque jour ; vous pouvez aussi gagner des jetons bonus en regardant une publicité :'}
              </p>

              <div className="space-y-4">
                {watchingAd ? (
                  <div className="py-4 space-y-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                    <div className="relative w-16 h-16 mx-auto">
                      <svg className="w-full h-full rotate-[-90deg]">
                        <circle cx="32" cy="32" r="30" className="stroke-zinc-200 dark:stroke-zinc-700 fill-none" strokeWidth="4" />
                        <circle cx="32" cy="32" r="30" className="stroke-blue-500 fill-none transition-all duration-1000" strokeWidth="4" strokeDasharray="188.5" strokeDashoffset={188.5 - (188.5 * adTimer) / AD_DURATION_S} />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center font-bold text-lg">
                        {adTimer}
                      </div>
                    </div>
                    <p className="text-[9px] font-black text-blue-500 uppercase tracking-[0.2em] animate-pulse">Publicité en cours...</p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleWatchAd}
                    className="w-full py-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.02] transition-all shadow-xl"
                  >
                    <Youtube size={18} />
                    Regarder la pub (+2 jetons)
                  </button>
                )}

                {adError && (
                  <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl p-3">
                    {adError}
                  </p>
                )}

                {!watchingAd && (
                  <>
                    {/* Offre d'achat de jetons : masquée tant que les paiements sont désactivés (freemium). */}
                    {paymentsEnabled && (
                      <>
                        <div className="relative py-2">
                          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-100 dark:border-zinc-800"></div></div>
                          <div className="relative flex justify-center text-[10px] uppercase font-black text-zinc-400"><span className="bg-white dark:bg-zinc-900 px-2">ou</span></div>
                        </div>

                        <div className="p-4 bg-blue-500/5 border border-dashed border-blue-500/20 rounded-2xl space-y-3">
                          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Boutique</p>
                          <p className="text-[10px] text-zinc-500 leading-relaxed">
                            Achetez des jetons IA avec T-Money ou Flooz.
                          </p>
                          <Link
                            href="/shop"
                            onClick={() => setShowAdModal(false)}
                            className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors"
                          >
                            Voir les offres
                          </Link>
                        </div>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => { setShowAdModal(false); setAdError(null); }}
                      className="text-xs font-bold text-zinc-400 hover:text-zinc-600 underline"
                    >
                      Plus tard
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
