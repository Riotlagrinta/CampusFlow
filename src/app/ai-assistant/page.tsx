"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Bot, User, Loader2, Copy, Check,
  PlusCircle, Paperclip, FileText, X,
  Menu, Settings, LogOut, Share2,
  MessageSquare, RefreshCw
} from 'lucide-react';
import { clsx } from 'clsx';
import ReactMarkdown, { type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useSession } from 'next-auth/react';
import { useSound } from '@/hooks/useSound';
import { usePdfResources, MAX_PDF_RESOURCES, type PdfResource } from '@/hooks/usePdfResources';
import Mermaid from '@/components/Mermaid';
import { isPaymentsEnabled } from '@/lib/payments';

// La coloration syntaxique est lourde : chargée uniquement quand une réponse contient du code.
const SyntaxHighlighter = dynamic(
  () => import('react-syntax-highlighter').then((mod) => mod.Prism),
  { ssr: false }
);

interface Message {
  role: 'user' | 'assistant';
  content: string;
  id?: string;
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
  content: "# Bienvenue sur l'Assistant DEFITECH\n\nJe suis votre compagnon d'étude. Posez-moi vos questions, joignez un cours ou demandez-moi de chercher sur le web.",
};

const MAX_INPUT_CHARS = 4000;
const HISTORY_SENT = 6;
const HISTORY_STORED = 100;
// Vercel refuse les corps de requête > 4,5 Mo : même limite que /api/chat (PDF joint au message).
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const PDF_SIGNATURE = '%PDF-';

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} Mo` : `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

/** Vrai si le fichier commence par `%PDF-` (le type MIME ou l'extension ne prouvent rien). */
async function looksLikePdf(file: File): Promise<boolean> {
  try {
    const head = new Uint8Array(await file.slice(0, PDF_SIGNATURE.length).arrayBuffer());
    return PDF_SIGNATURE.split('').every((ch, i) => head[i] === ch.charCodeAt(0));
  } catch {
    return false;
  }
}

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

function CopyButton({ text, label, size = 14, className }: { text: string; label: string; size?: number; className?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          /* presse-papiers indisponible */
        }
      }}
      className={className}
    >
      {copied ? <Check size={size} /> : <Copy size={size} />}
    </button>
  );
}

export default function AIAssistantPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const { play } = useSound();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [historyLoadedFor, setHistoryLoadedFor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [quotaInfo, setQuotaInfo] = useState<QuotaInfo | null>(null);
  const {
    resources,
    status: resourcesStatus,
    error: resourcesError,
    truncated: resourcesTruncated,
    load: loadResources,
  } = usePdfResources();
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  // PDF de l'appareil : gardé en mémoire (jamais stocké côté serveur) et renvoyé avec chaque message
  // tant qu'il est attaché à la conversation.
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showResourceList, setShowResourceList] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchQuota = useCallback(async () => {
    try {
      const res = await fetch('/api/user/ai-quota');
      if (res.ok) setQuotaInfo(await res.json());
    } catch (error) { console.error(error); }
  }, []);

  useEffect(() => {
    fetchQuota();

    // Responsive sidebar
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  }, [fetchQuota]);

  // Les PDF (dossiers compris) ne sont chargés qu'à l'ouverture du sélecteur.
  useEffect(() => {
    if (showResourceList) void loadResources();
  }, [showResourceList, loadResources]);

  // Historique par utilisateur : `ai_assistant_history:<userId>` (jamais partagé entre comptes).
  useEffect(() => {
    if (!userId) return;
    try {
      localStorage.removeItem('ai_assistant_history'); // ancienne clé commune à tous les comptes
    } catch {
      /* stockage indisponible */
    }
    setMessages(loadHistory(`ai_assistant_history:${userId}`) ?? [WELCOME_MESSAGE]);
    setHistoryLoadedFor(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId || historyLoadedFor !== userId) return;
    try {
      const toStore = messages.filter((m) => !m.isError).slice(-HISTORY_STORED);
      localStorage.setItem(`ai_assistant_history:${userId}`, JSON.stringify(toStore));
    } catch {
      /* quota de stockage dépassé ou stockage indisponible */
    }
  }, [messages, userId, historyLoadedFor]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleNewChat = () => {
    if (confirm('Nouvelle discussion ?')) {
      setMessages([{ role: 'assistant', content: '# Nouvelle Discussion\nComment puis-je vous aider ?' }]);
      setAttachedFile(null);
      setSelectedResource(null);
      setUploadError(null);
      play('send');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permet de re-sélectionner le même fichier
    if (!file) return;

    setUploadError(null);
    const isPdfName = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdfName) {
      setUploadError('Seuls les fichiers PDF sont acceptés.');
      return;
    }
    if (file.size === 0) {
      setUploadError('Ce fichier est vide.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`Fichier trop volumineux (${formatSize(file.size)}) : 4 Mo maximum.`);
      return;
    }
    if (!(await looksLikePdf(file))) {
      setUploadError("Ce fichier n'est pas un PDF valide.");
      return;
    }

    // Un seul document à la fois : le PDF de l'appareil remplace la ressource de la plateforme.
    setAttachedFile(file);
    setSelectedResource(null);
    play('xp');
  };

  const handleSend = async () => {
    const userMessage = input.trim();
    if (!userMessage || isLoading) return;

    // Historique envoyé : derniers échanges réels (ni message d'accueil, ni erreurs locales).
    const history = messages
      .filter((m) => !m.isError && m !== WELCOME_MESSAGE && !m.content.startsWith('# Nouvelle Discussion'))
      .slice(-HISTORY_SENT)
      .map(({ role, content }) => ({ role, content: content.slice(0, MAX_INPUT_CHARS) }));

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    play('send');

    try {
      let res: Response;
      if (attachedFile) {
        // Une seule requête : le PDF accompagne chaque message (texte extrait en mémoire côté serveur).
        const formData = new FormData();
        formData.append('message', userMessage);
        formData.append('history', JSON.stringify(history));
        formData.append('file', attachedFile, attachedFile.name);
        res = await fetch('/api/chat', { method: 'POST', body: formData });
      } else {
        res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userMessage,
            resourceId: selectedResource?.id,
            history
          }),
        });
      }
      const data = await res.json().catch(() => ({}));

      if (res.ok && typeof data.reply === 'string') {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
        setSelectedResource(null);
        play('xp');
      } else {
        const fallback = data.quotaExceeded
          ? (isPaymentsEnabled()
              ? "Votre quota IA du jour est épuisé. Rechargez des jetons bonus dans la [boutique](/shop) ou réessayez demain : le quota gratuit est renouvelé chaque jour."
              : "Votre quota IA du jour est épuisé. Réessayez demain : le quota gratuit est renouvelé chaque jour.")
          : res.status === 413
            ? 'Le fichier dépasse la taille maximale (4 Mo).'
            : 'Une erreur est survenue. Veuillez réessayer.';
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.quotaExceeded ? fallback : (data.error || fallback),
          isError: true,
        }]);
      }
      // PDF refusé par le serveur (trop gros, illisible) : inutile de le renvoyer à chaque message.
      if (attachedFile && !res.ok && (res.status === 413 || res.status === 422)) {
        setAttachedFile(null);
        setUploadError(
          typeof data.error === 'string'
            ? data.error
            : res.status === 413
              ? 'Le fichier dépasse la taille maximale (4 Mo).'
              : 'Ce PDF ne peut pas être utilisé.'
        );
      }
      fetchQuota();
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Erreur de connexion.', isError: true }]);
    } finally {
      setIsLoading(false);
    }
  };

  const quotaCapacity = quotaInfo ? Math.max(quotaInfo.limit + quotaInfo.bonus, 1) : 1;

  return (
    <div className="flex h-screen w-full bg-zinc-50 dark:bg-[#050505] text-zinc-900 dark:text-zinc-100 overflow-hidden fixed inset-0 z-50">

      {/* Sidebar - ChatGPT Style */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && (
          <motion.div
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className="w-72 h-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col z-50"
          >
            <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={handleNewChat}
                className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-all font-bold text-sm border border-zinc-200 dark:border-zinc-700"
              >
                <PlusCircle size={18} className="text-blue-600" />
                Nouvelle discussion
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <p className="text-[10px] font-black uppercase text-zinc-400 tracking-widest px-2 mb-4">Discussions récentes</p>
              <button type="button" className="w-full flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 transition-all text-left">
                <MessageSquare size={16} />
                <span className="text-xs font-bold truncate">Aide DEFITECH Actuelle</span>
              </button>
              {/* Other history items can be mapped here */}
            </div>

            <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
              <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-100 dark:border-zinc-800">
                <div className="flex justify-between text-[10px] font-black uppercase mb-2">
                  <span>Quota du jour</span>
                  <span className="text-blue-600">
                    {quotaInfo ? `${quotaInfo.remaining} restantes` : '...'}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{ width: `${quotaInfo ? Math.min(100, (quotaInfo.remaining / quotaCapacity) * 100) : 0}%` }}
                  />
                </div>
                {quotaInfo && quotaInfo.bonus > 0 && (
                  <p className="mt-2 text-[10px] text-zinc-400 font-medium">dont {quotaInfo.bonus} jeton{quotaInfo.bonus > 1 ? 's' : ''} bonus</p>
                )}
              </div>
              <button type="button" onClick={() => router.push('/')} className="w-full flex items-center gap-3 p-3 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all text-sm font-bold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                <LogOut size={18} /> Quitter l&apos;IA
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative">

        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-black/80 backdrop-blur-xl z-40">
          <div className="flex items-center gap-4">
            <button type="button" aria-label="Afficher ou masquer le menu" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500">
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg">
                <Bot size={18} />
              </div>
              <span className="font-black tracking-tight text-sm">DEFITECH AI{isPaymentsEnabled() && <span className="text-[10px] text-blue-600 ml-1 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 rounded-full">PRO</span>}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Partager" className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all"><Share2 size={18} /></button>
            <button type="button" aria-label="Paramètres" className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all"><Settings size={18} /></button>
          </div>
        </header>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar pt-6 pb-32">
          <div className="max-w-3xl mx-auto px-4 md:px-0 space-y-8">
            {messages.map((msg, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={clsx(
                "flex gap-4 md:gap-6 group",
                msg.role === 'user' ? "flex-row-reverse" : "flex-row"
              )}>
                <div className={clsx(
                  "w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg mt-1",
                  msg.role === 'user' ? "bg-zinc-200 dark:bg-zinc-800" : "bg-blue-600"
                )}>
                  {msg.role === 'user' ? <User size={18} className="text-zinc-600 dark:text-zinc-400" /> : <Bot size={18} className="text-white" />}
                </div>

                <div className={clsx(
                  "flex flex-col gap-2 max-w-[85%]",
                  msg.role === 'user' ? "items-end" : "items-start"
                )}>
                  <div className={clsx(
                    "prose dark:prose-invert max-w-none text-sm leading-relaxed",
                    msg.role === 'user'
                      ? "bg-zinc-100 dark:bg-zinc-800 p-4 md:p-5 rounded-2xl md:rounded-3xl"
                      : msg.isError
                        ? "py-3 px-4 rounded-2xl bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900/50"
                        : "py-2"
                  )}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        code({ className, children, node, ...props }: React.ComponentPropsWithoutRef<'code'> & ExtraProps) {
                          const match = /language-(\w+)/.exec(className || '');
                          const codeContent = String(children).replace(/\n$/, '');
                          if (match && match[1] === 'mermaid') return <Mermaid chart={codeContent} />;
                          return match ? (
                            <div className="relative my-6 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-2xl">
                              <div className="flex items-center justify-between px-4 py-2 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                                <span className="text-[10px] font-black uppercase text-zinc-500">{match[1]}</span>
                                <CopyButton text={codeContent} label="Copier le code" size={12} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all" />
                              </div>
                              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                              <SyntaxHighlighter style={vscDarkPlus as any} language={match[1]} PreTag="div" className="!m-0 !bg-zinc-950 !p-6 text-xs">
                                {codeContent}
                              </SyntaxHighlighter>
                            </div>
                          ) : (
                            <code className="bg-zinc-100 dark:bg-zinc-800 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-mono font-bold" {...props}>{children}</code>
                          );
                        },
                        a: ({ href, children }) => {
                          const external = !!href && /^https?:\/\//i.test(href);
                          return (
                            <a
                              href={href}
                              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                              className="underline underline-offset-2 text-blue-600 dark:text-blue-400"
                            >
                              {children}
                            </a>
                          );
                        },
                        h1: ({children}) => <h1 className="text-xl font-black mb-4 text-zinc-900 dark:text-white">{children}</h1>,
                        h2: ({children}) => <h2 className="text-lg font-bold mb-3 text-blue-600 dark:text-blue-400">{children}</h2>,
                        p: ({children}) => <p className="mb-4 last:mb-0">{children}</p>,
                        blockquote: ({children}) => <blockquote className="border-l-4 border-blue-500 bg-blue-50/50 dark:bg-blue-900/10 p-4 my-4 rounded-r-xl italic">{children}</blockquote>,
                      }}
                    >{msg.content}</ReactMarkdown>
                  </div>
                  {!msg.isError && (
                    <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity mt-1">
                      <CopyButton text={msg.content} label="Copier le message" className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-1" />
                      <button type="button" aria-label="Régénérer" className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-1"><RefreshCw size={14}/></button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            {isLoading && (
              <div className="flex gap-4 md:gap-6 items-start">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg"><Bot size={18} className="text-white" /></div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3 py-2">
                    <Loader2 size={18} className="animate-spin text-blue-600" />
                    <span className="text-xs font-black uppercase text-zinc-400 animate-pulse">L&apos;IA prépare votre réponse...</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input Floating Bar */}
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8 bg-gradient-to-t from-white via-white/90 to-transparent dark:from-[#050505] dark:via-[#050505]/90 z-30">
          <div className="max-w-3xl mx-auto relative">

            {/* Context Chips */}
            <div className="absolute bottom-full left-0 right-0 mb-4 flex flex-wrap gap-2">
              <AnimatePresence>
                {selectedResource && (
                  <motion.div
                    key="selected-resource"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                    className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-full text-[10px] font-black uppercase shadow-xl"
                  >
                    <FileText size={12} /> {selectedResource.title}
                    <button type="button" aria-label="Retirer le cours" onClick={() => setSelectedResource(null)} className="hover:bg-black/20 p-0.5 rounded-full"><X size={12}/></button>
                  </motion.div>
                )}
                {attachedFile && (
                  <motion.div
                    key="attached-file"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                    title="Ce PDF est envoyé avec chaque message tant qu'il n'est pas retiré."
                    className="flex items-center gap-2 bg-orange-600 text-white px-3 py-1.5 rounded-full text-[10px] font-black uppercase shadow-xl max-w-full"
                  >
                    <PlusCircle size={12} className="shrink-0" />
                    <span className="truncate">{attachedFile.name}</span>
                    <span className="shrink-0 opacity-80">{formatSize(attachedFile.size)}</span>
                    <button type="button" aria-label="Retirer le PDF" onClick={() => setAttachedFile(null)} className="hover:bg-black/20 p-0.5 rounded-full shrink-0"><X size={12}/></button>
                  </motion.div>
                )}
                {uploadError && (
                  <motion.div
                    key="upload-error"
                    role="alert"
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                    className="flex items-center gap-2 bg-red-600 text-white px-3 py-1.5 rounded-full text-[10px] font-bold shadow-xl"
                  >
                    {uploadError}
                    <button type="button" aria-label="Fermer l'erreur" onClick={() => setUploadError(null)} className="hover:bg-black/20 p-0.5 rounded-full"><X size={12}/></button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Resource Selector Popover */}
            {showResourceList && (
              <div className="absolute bottom-full left-0 mb-4 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-4 z-50">
                <p className="text-[10px] font-black uppercase text-zinc-400 tracking-widest mb-3">Joindre un cours</p>
                <div className="max-h-48 overflow-y-auto space-y-1" aria-live="polite">
                  {resourcesStatus === 'loading' && resources.length === 0 && (
                    <p className="flex items-center gap-2 text-[10px] text-zinc-500 p-2">
                      <Loader2 size={12} className="animate-spin" /> Chargement des documents...
                    </p>
                  )}
                  {resourcesStatus === 'error' && (
                    <div role="alert" className="p-2 space-y-1">
                      <p className="text-[10px] text-red-600 dark:text-red-400">{resourcesError}</p>
                      <button type="button" onClick={() => void loadResources(true)} className="text-[10px] font-bold text-blue-600 underline">Réessayer</button>
                    </div>
                  )}
                  {resources.map(res => (
                    <button type="button" key={res.id} onClick={() => { setSelectedResource(res); setAttachedFile(null); setShowResourceList(false); play('xp'); }} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all text-left group">
                      <FileText size={14} className="text-blue-500" />
                      <span className="text-[11px] font-bold truncate">{res.title}</span>
                    </button>
                  ))}
                  {resourcesStatus === 'ready' && resources.length === 0 && (
                    <p className="text-[10px] text-zinc-500 p-2">Aucun PDF disponible.</p>
                  )}
                  {resourcesTruncated && (
                    <p className="text-[10px] text-zinc-500 p-2">Liste limitée aux {MAX_PDF_RESOURCES} premiers documents.</p>
                  )}
                </div>
              </div>
            )}

            <div className="relative flex items-end gap-3 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-3xl p-2 pl-4 shadow-2xl focus-within:border-blue-500 transition-all">
              <button type="button" aria-label="Joindre un cours de la plateforme" onClick={() => setShowResourceList(!showResourceList)} className="p-3 text-zinc-400 hover:text-blue-600 transition-all"><Paperclip size={22} /></button>
              <button type="button" aria-label="Envoyer un PDF depuis mon appareil" onClick={() => fileInputRef.current?.click()} className="p-3 text-zinc-400 hover:text-orange-600 transition-all"><PlusCircle size={22} /></button>
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".pdf,application/pdf" className="hidden" aria-label="Choisir un fichier PDF" />

              <textarea
                rows={1}
                value={input}
                maxLength={MAX_INPUT_CHARS}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend(); }}}
                placeholder="Posez votre question à l'IA..."
                aria-label="Votre question"
                className="flex-1 bg-transparent border-none py-3 text-sm focus:outline-none resize-none max-h-32"
              />

              <button
                type="button"
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                aria-label="Envoyer"
                className={clsx(
                  "p-3 rounded-2xl transition-all",
                  input.trim() ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
                )}
              >
                <Send size={20} />
              </button>
            </div>
            <p className="text-[10px] text-center text-zinc-400 font-medium mt-3">
              DEFITECH AI peut faire des erreurs. Vérifiez les informations importantes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
