"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, Bot, User, Loader2, Copy, Bookmark, Share2, Terminal, Youtube, Info } from 'lucide-react';
import { clsx } from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useSound } from '@/hooks/useSound';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AIAssistantPage() {
  const { play } = useSound();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: '# Bienvenue sur l\'Assistant Académique DEFITECH\n\nJe suis là pour vous aider dans vos projets de **Génie Logiciel**, vos révisions ou vos questions techniques.\n\n*Comment puis-je vous aider aujourd\'hui ?*' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<{ remaining: number; total: number; bonus: number } | null>(null);
  const [showAdModal, setShowAdModal] = useState(false);
  const [watchingAd, setWatchingAd] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    fetchQuota();
  }, []);

  const fetchQuota = async () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user.email) return;

    try {
      const res = await fetch(`/api/user/ai-quota?email=${user.email}`);
      if (res.ok) {
        const data = await res.json();
        setQuotaInfo(data);
      }
    } catch (error) {
      console.error("Failed to fetch quota:", error);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    setInput('');
    play('send');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });
      const data = await res.json();
      if (data.quotaExceeded) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
        setShowAdModal(true);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
        play('xp');
      }
      fetchQuota();
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Une erreur est survenue lors de la communication avec le modèle." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWatchAd = async () => {
    setWatchingAd(true);
    // Simulation de pub (5 secondes) 
    await new Promise(resolve => setTimeout(resolve, 5000)); 

    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const res = await fetch('/api/user/ai-quota/grant-bonus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      if (res.ok) {
        play('success');
        setShowAdModal(false);
        fetchQuota(); // Rafraîchir le quota
      } else {
        alert("Erreur lors de l'obtention du bonus.");
      }
    } catch (error) {
      console.error("Erreur pub:", error);
      alert("Erreur lors de l'obtention du bonus.");
    } finally {
      setWatchingAd(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] max-w-5xl mx-auto bg-white dark:bg-zinc-900/50 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden">
      {/* Top Bar */}
      <div className="px-8 py-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-zinc-900 dark:bg-white rounded-2xl flex items-center justify-center shadow-xl">
            <Terminal size={24} className="text-white dark:text-zinc-900" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">AI ASSISTANT</h1>
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-[0.3em]">Mode Étude Profond</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
            {quotaInfo && (
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-medium uppercase tracking-widest px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                <Info size={10} /> {quotaInfo.remaining}/{quotaInfo.total} IA
              </div>
            )}
            <button className="p-2.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all">
                <Bookmark size={20} />
            </button>
            <button className="p-2.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all">
                <Share2 size={20} />
            </button>
        </div>
      </div>

      {/* Chat Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-8 py-10 space-y-10 scroll-smooth"
      >
        {messages.map((msg, i) => (
          <motion.div 
            key={i} 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={clsx(
              "flex gap-6 items-start",
              msg.role === 'user' ? "flex-row-reverse" : "flex-row"
            )}
          >
            <div className={clsx(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg",
              msg.role === 'user' ? "bg-zinc-100 dark:bg-zinc-800" : "bg-blue-600"
            )}>
              {msg.role === 'user' ? <User size={20} className="text-zinc-500" /> : <Bot size={20} className="text-white" />}
            </div>
            
            <div className={clsx(
              "flex flex-col gap-2 max-w-[85%]",
              msg.role === 'user' ? "items-end text-right" : "items-start"
            )}>
              <div className={clsx(
                "p-6 rounded-[2rem] text-sm leading-relaxed shadow-sm",
                msg.role === 'user' 
                  ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-tr-none" 
                  : "bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700/50 text-zinc-800 dark:text-zinc-100 rounded-tl-none"
              )}>
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) {
                      const match = /language-(\w+)/.exec(className || '');
                      return match ? (
                        <div className="relative group my-6">
                          <div className="absolute top-0 left-0 right-0 h-8 bg-zinc-800 rounded-t-xl flex items-center px-4 justify-between border-b border-white/5">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{match[1]}</span>
                            <button className="text-zinc-500 hover:text-white transition-colors"><Copy size={12}/></button>
                          </div>
                          <SyntaxHighlighter
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            style={vscDarkPlus as any}
                            language={match[1]}
                            PreTag="div"
                            className="rounded-b-xl !bg-zinc-950 !p-6 !pt-12 text-xs border-x border-b border-white/5 shadow-2xl"
                            {...props}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        </div>
                      ) : (
                        <code className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-mono font-bold" {...props}>
                          {children}
                        </code>
                      );
                    },
                    h1: ({children}) => <h1 className="text-2xl font-black mb-4 tracking-tight">{children}</h1>,
                    h2: ({children}) => <h2 className="text-xl font-bold mb-3">{children}</h2>,
                    p: ({children}) => <p className="mb-4 last:mb-0 opacity-90">{children}</p>,
                    ul: ({children}) => <ul className="list-disc ml-4 space-y-2 mb-4">{children}</ul>,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
                {msg.role === 'assistant' ? 'Assistant Académique' : 'Vous'} • {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </span>
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <div className="flex gap-6 items-start">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
                <Bot size={20} className="text-white" />
            </div>
            <div className="bg-white dark:bg-zinc-800 p-6 rounded-[2rem] rounded-tl-none border border-zinc-100 dark:border-zinc-700/50 shadow-sm flex items-center gap-3">
              <Loader2 size={20} className="animate-spin text-blue-600" />
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">L&apos;IA réfléchit...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input Section */}
      <div className="px-8 py-8 bg-zinc-50/50 dark:bg-zinc-950/30 border-t border-zinc-100 dark:border-zinc-800">
        <div className="relative max-w-4xl mx-auto flex items-center gap-4">
          <div className="flex-1 relative">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Posez votre question sur le Java, SQL, ou le Web..."
              className="w-full bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 rounded-3xl px-8 py-5 pr-16 text-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-xl dark:shadow-none placeholder:text-zinc-400 font-medium"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                 <kbd className="hidden md:inline-flex h-6 items-center gap-1 rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-1.5 font-mono text-[10px] font-medium text-zinc-500 opacity-100">
                    <span className="text-xs">↵</span> Enter
                </kbd>
            </div>
          </div>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSend}
            disabled={isLoading}
            className="w-16 h-16 bg-zinc-900 dark:bg-blue-600 hover:bg-black dark:hover:bg-blue-700 text-white rounded-2xl flex items-center justify-center shadow-2xl transition-all disabled:opacity-50"
          >
            <Send size={24} />
          </motion.button>
        </div>
        <p className="text-center mt-4 text-[10px] font-bold text-zinc-400 uppercase tracking-[0.2em]">
            Base de connaissance DEFITECH Génie Logiciel 2026
        </p>
      </div>

      <AnimatePresence>
        {showAdModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-6 text-center space-y-6"
            >
              <Youtube size={48} className="mx-auto text-red-500" />
              <h3 className="text-xl font-bold">Quota IA journalier atteint !</h3>
              <p className="text-zinc-500 text-sm">Regardez une courte publicité pour obtenir {quotaInfo?.bonus || 5} requêtes supplémentaires.</p>
              
              {/* --- DÉBUT INTÉGRATION PUB RÉMUNÉRATRICE (POST-DÉPLOIEMENT) --- */}
              {/* 
                Ici, vous inséreriez le code pour charger et afficher une publicité réelle 
                fournie par une régie (ex: Google AdSense, AdMob, etc.).

                Étapes typiques :
                1. Initialiser le SDK publicitaire (souvent dans layout.tsx ou page.tsx).
                2. Charger une publicité (vidéo récompensée, interstitielle) ici.
                3. Attendre la confirmation que la pub a été visionnée ou ignorée.
                4. Appeler handleWatchAd() UNIQUEMENT si la pub a été visionnée avec succès.

                Exemple (conceptuel, dépend de la régie) :
                <YourAdSdkComponent 
                  adUnitId="ca-app-pub-XXX" 
                  onAdWatched={handleWatchAd} 
                  onAdFailed={() => alert("La pub n'a pas pu être chargée. Réessayez.")}
                />
              */}
              {/* --- FIN INTÉGRATION PUB RÉMUNÉRATRICE --- */}

              <button 
                onClick={handleWatchAd} 
                disabled={watchingAd}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold flex items-center justify-center gap-2"
              >
                {watchingAd && <Loader2 className="animate-spin" size={20} />}
                {watchingAd ? 'Chargement de la pub...' : 'Regarder la publicité'}
              </button>
              <button 
                onClick={() => setShowAdModal(false)}
                className="w-full py-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Non merci, attendre demain
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
