'use client';

import React, { useState, useRef, useEffect } from 'react';

import { motion, AnimatePresence } from 'framer-motion';

import { Sparkles, Send, X, Bot, User, Loader2, Maximize2, Minimize2, Copy, Youtube, Info, PlusCircle, Paperclip, FileText } from 'lucide-react';

import { clsx } from 'clsx';

import ReactMarkdown from 'react-markdown';

import remarkGfm from 'remark-gfm';

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';

import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { useSound } from '@/hooks/useSound';

import Mermaid from './Mermaid';



interface Message {

  role: 'user' | 'assistant';

  content: string;

}

interface Resource {
  id: string;
  title: string;
  type: string;
}

export default function AIChat() {

  const { play } = useSound();

  const [isOpen, setIsOpen] = useState(false);

  const [isMaximized, setIsMaximized] = useState(false);

  const [input, setInput] = useState('');

  const [messages, setMessages] = useState<Message[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [showResourceList, setShowResourceList] = useState(false);



  const handleNewChat = () => {
    if (confirm('Démarrer une nouvelle discussion ?')) {
      const initialMessage: Message[] = [
        { role: 'assistant', content: 'Bonjour. Je suis l\'assistant pédagogique de DEFITECH. Comment puis-je vous accompagner dans vos travaux de Génie Logiciel aujourd\'hui ?' }
      ];
      setMessages(initialMessage);
      localStorage.setItem('ai_chat_history', JSON.stringify(initialMessage));
      play('send');
    }
  };

  useEffect(() => {
      // Charger l'historique au démarrage

      const savedMessages = localStorage.getItem('ai_chat_history');

      if (savedMessages) {

        setMessages(JSON.parse(savedMessages));

      } else {

        setMessages([

          { role: 'assistant', content: 'Bonjour. Je suis l\'assistant pédagogique de DEFITECH. Comment puis-je vous accompagner dans vos travaux de Génie Logiciel aujourd\'hui ?' }

        ]);

      }

    }, []);

  

    useEffect(() => {

      // Sauvegarder l'historique quand les messages changent

      if (messages.length > 0) {

        localStorage.setItem('ai_chat_history', JSON.stringify(messages));

      }

    }, [messages]);

  const [quotaInfo, setQuotaInfo] = useState<{ remaining: number; total: number; bonus: number } | null>(null);

  const [showAdModal, setShowAdModal] = useState(false);

  const [watchingAd, setWatchingAd] = useState(false);
  const [adTimer, setAdTimer] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (watchingAd && adTimer > 0) {
      interval = setInterval(() => {
        setAdTimer((prev) => prev - 1);
      }, 1000);
    } else if (adTimer === 0 && watchingAd) {
      handleAdComplete();
    }
    return () => clearInterval(interval);
  }, [watchingAd, adTimer]);

  const handleAdComplete = async () => {
    try {
      const res = await fetch('/api/user/ad-reward', { method: 'POST' });
      if (res.ok) {
        await fetchQuota();
        setShowAdModal(false);
        setWatchingAd(false);
        play('success');
      }
    } catch (e) {
      console.error(e);
      setWatchingAd(false);
    }
  };

  const handleWatchAd = () => {
    const adUrl = 'https://otieu.com/4/10485395'; 
    setWatchingAd(true);
    setAdTimer(30);
    window.open(adUrl, '_blank');
  };

  const scrollRef = useRef<HTMLDivElement>(null);



  useEffect(() => {

    if (scrollRef.current) {

      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;

    }

  }, [messages, isLoading]);



    useEffect(() => {



      if (isOpen) {



        fetchQuota();



        fetchResources();



      }



    }, [isOpen]);



  



    const fetchResources = async () => {



      try {



        const res = await fetch('/api/resources');



        if (res.ok) {



          const data = await res.json();



          setResources(data.filter((r: Resource) => r.type === 'PDF'));



        }



      } catch (err) {



        console.error(err);



      }



    };



  



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
        body: JSON.stringify({ 
          message: userMessage,
          resourceId: selectedResource?.id 
        }),
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



  const handleBuyPack = async (packId: string) => {



      setIsLoading(true);



      try {



        const res = await fetch('/api/payment/create', {



          method: 'POST',



          headers: { 'Content-Type': 'application/json' },



          body: JSON.stringify({ packId }),



        });



        const data = await res.json();



        if (data.url) {



          window.location.href = data.url; // Rediriger vers FedaPay



        }



      } catch (err) {



        console.error(err);



        alert('Erreur lors de la création du paiement');



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
          : "bottom-4 right-4 md:bottom-6 md:right-6"
      )}
      style={isMaximized ? { 
        left: 'calc(var(--sidebar-width, 0px) + (window.innerWidth < 1024 ? 8px : 20px))' 
      } : {}}
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
                  onClick={handleNewChat}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-zinc-400 hover:text-white"
                  title="Nouvelle conversation"
                >
                  <PlusCircle size={18} />
                </button>
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
                      : "bg-white dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700/50"
                  )}>
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) {
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
                                {...props}
                              >
                                {codeContent}
                              </SyntaxHighlighter>
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="p-1.5 bg-white/10 hover:bg-white/20 rounded text-zinc-400 transition-colors">
                                  <Copy size={14} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <code className="bg-zinc-100 dark:bg-zinc-700 px-1.5 py-0.5 rounded text-blue-600 dark:text-blue-400 font-mono text-[10px] font-bold" {...props}>
                              {children}
                            </code>
                          );
                        },
                        ul: ({ children }) => <ul className="list-disc ml-4 space-y-2 my-4 text-inherit">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal ml-4 space-y-2 my-4 text-inherit">{children}</ol>,
                        p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
                        strong: ({children}) => <strong className="font-bold text-blue-200 dark:text-blue-300">{children}</strong>,
                        h1: ({children}) => <h1 className="text-lg font-black mb-3 text-white">{children}</h1>,
                        h2: ({children}) => <h2 className="text-md font-bold mb-2 text-blue-200">{children}</h2>,
                        blockquote: ({children}) => (
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
              {selectedResource && (
                <div className="absolute bottom-[calc(100%+0.5rem)] left-6 right-6 flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-lg animate-in fade-in slide-in-from-bottom-1">
                  <FileText size={12} />
                  <span className="truncate flex-1">{selectedResource.title}</span>
                  <button onClick={() => setSelectedResource(null)} className="hover:bg-white/20 p-0.5 rounded transition-colors">
                    <X size={12} />
                  </button>
                </div>
              )}

              {showResourceList && (
                <div className="absolute bottom-full left-4 right-4 mb-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl p-3 max-h-48 overflow-y-auto z-10 animate-in fade-in zoom-in-95">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-2 px-1">Joindre un document</p>
                  <div className="space-y-1">
                    {resources.map(res => (
                      <button
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
                    {resources.length === 0 && <p className="text-[10px] text-zinc-500 p-2">Aucun PDF disponible.</p>}
                  </div>
                </div>
              )}

              <div className="relative flex items-center gap-2">
                <button 
                  onClick={() => setShowResourceList(!showResourceList)}
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
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder={selectedResource ? "Question sur le PDF..." : "Posez votre question technique..."}
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
              <h3 className="text-xl font-bold">Plus de jetons IA ?</h3>
              <p className="text-zinc-500 text-sm">Votre quota gratuit est épuisé. Choisissez une option pour continuer :</p>
              
              <div className="space-y-4">
                {watchingAd ? (
                  <div className="py-4 space-y-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-700">
                    <div className="relative w-16 h-16 mx-auto">
                      <svg className="w-full h-full rotate-[-90deg]">
                        <circle cx="32" cy="32" r="30" className="stroke-zinc-200 dark:stroke-zinc-700 fill-none" strokeWidth="4" />
                        <circle cx="32" cy="32" r="30" className="stroke-blue-500 fill-none transition-all duration-1000" strokeWidth="4" strokeDasharray="188.5" strokeDashoffset={188.5 - (188.5 * adTimer) / 30} />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center font-bold text-lg">
                        {adTimer}
                      </div>
                    </div>
                    <p className="text-[9px] font-black text-blue-500 uppercase tracking-[0.2em] animate-pulse">Publicité obligatoire en cours...</p>
                  </div>
                ) : (
                  <button 
                    onClick={handleWatchAd}
                    className="w-full py-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.02] transition-all shadow-xl"
                  >
                    <Youtube size={18} />
                    Regarder la pub (+{quotaInfo?.bonus || 2} jetons)
                  </button>
                )}

                {!watchingAd && (
                  <>
                    <div className="relative py-2">
                       <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-100 dark:border-zinc-800"></div></div>
                       <div className="relative flex justify-center text-[10px] uppercase font-black text-zinc-400"><span className="bg-white dark:bg-zinc-900 px-2">À venir</span></div>
                    </div>

                    <div className="p-4 bg-blue-500/5 border border-dashed border-blue-500/20 rounded-2xl space-y-2">
                       <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Pass Premium</p>
                       <p className="text-[10px] text-zinc-500 leading-relaxed">
                         Bientôt : Achetez des jetons illimités via T-Money & Flooz. 
                       </p>
                    </div>

                    <button 
                      onClick={() => setShowAdModal(false)}
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
