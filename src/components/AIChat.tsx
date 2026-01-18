'use client';

import React, { useState, useRef, useEffect } from 'react';

import { motion, AnimatePresence } from 'framer-motion';

import { Sparkles, Send, X, Bot, User, Loader2, Maximize2, Minimize2, Copy, Youtube, Info } from 'lucide-react';

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



export default function AIChat() {

  const { play } = useSound();

  const [isOpen, setIsOpen] = useState(false);

  const [isMaximized, setIsMaximized] = useState(false);

  const [input, setInput] = useState('');

  const [messages, setMessages] = useState<Message[]>([

    { role: 'assistant', content: 'Bonjour. Je suis l\'assistant pédagogique de DEFITECH. Comment puis-je vous accompagner dans vos travaux de Génie Logiciel aujourd\'hui ?' }

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

    if (isOpen) {

      fetchQuota();

    }

  }, [isOpen]);



  const fetchQuota = async () => {
    try {
      const res = await fetch('/api/user/ai-quota');
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

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await response.json();

      if (data.quotaExceeded) {

        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);

        setShowAdModal(true);

      } else {

        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);

        play('xp'); // Petit son quand l'IA répond (car on gagne de l'XP)

      }

      fetchQuota();

    } catch {

      setMessages(prev => [...prev, { role: 'assistant', content: "Une erreur de communication est survenue. Veuillez réessayer." }]);

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
    <div className={clsx(
      "fixed z-50 transition-all duration-500 ease-in-out",
      isMaximized ? "inset-4 md:inset-10" : "bottom-6 right-6"
    )}>
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
                    Propulsé par Gemma 3
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {quotaInfo && (
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-medium uppercase tracking-widest px-2 py-1 rounded-full bg-white/5 border border-white/10">
                    <Info size={10} /> {quotaInfo.remaining}/{quotaInfo.total} IA
                  </div>
                )}
                <button 
                  onClick={() => setIsMaximized(!isMaximized)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white"
                >
                  {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                </button>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Zone de Messages avec Markdown */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 space-y-6 bg-white dark:bg-zinc-900/30"
            >
              {messages.map((msg, i) => (
                <div key={i} className={clsx("flex gap-4", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                  <div className={clsx(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm",
                    msg.role === 'user' ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400" : "bg-blue-600 text-white"
                  )}>
                    {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                  </div>
                  <div className={clsx(
                    "max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed",
                    msg.role === 'user' 
                      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200" 
                      : "bg-white dark:bg-zinc-800/50 text-zinc-800 dark:text-zinc-100 border border-zinc-100 dark:border-zinc-700/50 shadow-sm"
                  )}>
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) {
                          const match = /language-(\w+)/.exec(className || '');
                          return match ? (
                            <div className="relative group my-4">
                              <SyntaxHighlighter
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                style={vscDarkPlus as any}
                                language={match[1]}
                                PreTag="div"
                                className="rounded-xl !bg-zinc-950 !p-4 border border-white/5"
                                {...props}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="p-1.5 bg-white/10 hover:bg-white/20 rounded text-zinc-400 transition-colors">
                                  <Copy size={14} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <code className="bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-400 font-mono text-xs" {...props}>
                              {children}
                            </code>
                          );
                        },
                        ul: ({ children }) => <ul className="list-disc ml-4 space-y-2 my-2">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal ml-4 space-y-2 my-2">{children}</ol>,
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>
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
            <div className="p-6 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800">
              <div className="relative flex items-center gap-2">
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Posez votre question technique..."
                  className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner transition-all"
                />
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSend}
                  disabled={isLoading}
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
        whileHover={{ scale: 1.05, rotate: 5 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
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
