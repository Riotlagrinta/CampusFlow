"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, Bot, User, Loader2, Copy, Bookmark, Share2, Terminal, Youtube, Info, PlusCircle, Paperclip, FileText, X } from 'lucide-react';
import { clsx } from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useSound } from '@/hooks/useSound';
import Mermaid from '@/components/Mermaid';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Resource {
  id: string;
  title: string;
  type: string;
}

export default function AIAssistantPage() {
  const { play } = useSound();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<{ remaining: number; total: number; bonus: number } | null>(null);
  const [showAdModal, setShowAdModal] = useState(false);
  const [watchingAd, setWatchingAd] = useState(false);
  const [adTimer, setAdTimer] = useState(0);
  const [resources, setResources] = useState<Resource[]>([]); // Added back
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [attachedLink, setAttachedLink] = useState<string | null>(null);
  const [tempFile, setTempFile] = useState<{ name: string; path: string } | null>(null); // New State
  const [isUploading, setIsUploading] = useState(false); // New State
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [tempLink, setTempLink] = useState('');
  const [showResourceList, setShowResourceList] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); // New Ref

  useEffect(() => {
    // Nettoyage automatique si trop d'erreurs détectées (optionnel mais prudent)
    const savedMessages = localStorage.getItem('ai_assistant_history');
    if (savedMessages && savedMessages.includes('Syntax error in text')) {
        console.warn("Historique corrompu détecté, nettoyage...");
        localStorage.removeItem('ai_assistant_history');
        window.location.reload();
        return;
    }

    if (savedMessages) {
      setMessages(JSON.parse(savedMessages));
    } else {
      setMessages([
        { role: 'assistant', content: '# Bienvenue sur l\'Assistant Académique DEFITECH\n\nJe suis là pour vous aider dans vos projets de **Génie Logiciel**, vos révisions ou vos questions techniques.\n\n*Comment puis-je vous aider aujourd\'hui ?*' }
      ]);
    }
    fetchResources();
    fetchQuota();
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('ai_assistant_history', JSON.stringify(messages));
    }
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

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

  const handleAdComplete = async () => {
    try {
      const res = await fetch('/api/user/ad-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setShowAdModal(false);
        setWatchingAd(false);
        play('xp');
        fetchQuota(); 
      }
    } catch (err) {
      console.error(err);
      setWatchingAd(false);
    }
  };

  const handleWatchAd = () => {
    const adUrl = 'https://otieu.com/4/10485395'; 
    setWatchingAd(true);
    setAdTimer(30);
    window.open(adUrl, '_blank');
  };

  const handleNewChat = () => {
    if (confirm('Voulez-vous commencer une nouvelle conversation ? L\'historique actuel sera effacé.')) {
      const initialMessage: Message[] = [
        { role: 'assistant', content: '# Bienvenue sur l\'Assistant Académique DEFITECH\n\nJe suis là pour vous aider dans vos projets de **Génie Logiciel**, vos révisions ou vos questions techniques.\n\n*Comment puis-je vous aider aujourd\'hui ?*' }
      ];
      setMessages(initialMessage);
      localStorage.setItem('ai_assistant_history', JSON.stringify(initialMessage));
      play('send');
    }
  };

  const handleAddLink = () => {
    if (tempLink) {
       setAttachedLink(tempLink);
       setTempLink('');
       setShowLinkInput(false);
       setSelectedResource(null);
       setTempFile(null); // Clear others
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
        alert("Seuls les fichiers PDF sont supportés pour l'analyse.");
        return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/chat/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setTempFile({ name: file.name, path: data.tempPath });
        setAttachedLink(null);
        setSelectedResource(null);
        play('xp');
      } else {
        alert(data.error || "Erreur d'upload");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    const currentLink = attachedLink;
    const currentResource = selectedResource;
    const currentTempFile = tempFile;

    setInput('');
    // On garde l'affichage de l'attachement pendant l'envoi, mais on pourra le reset après
    
    play('send');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userMessage,
          resourceId: currentResource?.id,
          externalLink: currentLink,
          tempFilePath: currentTempFile?.path
        }),
      });
      const data = await res.json();
      
      // Reset attachments after successful send or error
      setAttachedLink(null);
      setSelectedResource(null);
      setTempFile(null);

      if (data.quotaExceeded) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
        setShowAdModal(true);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
        play('xp');
      }
      fetchQuota();
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Une erreur est survenue." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] w-full bg-white dark:bg-zinc-900/50 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden transition-all">
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
            <button onClick={handleNewChat} className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-xl transition-all text-xs font-bold uppercase tracking-widest border border-zinc-200 dark:border-zinc-700">
                <PlusCircle size={16} /> Nouveau
            </button>
            <button className="p-2.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"><Bookmark size={20} /></button>
            <button className="p-2.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all"><Share2 size={20} /></button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-10 space-y-10 scroll-smooth">
        {messages.map((msg, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={clsx(
            "flex gap-6 items-start",
            msg.role === 'user' ? "flex-row-reverse" : "flex-row"
          )}>
            <div className={clsx(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg",
              msg.role === 'user' ? "bg-zinc-100 dark:bg-zinc-800" : "bg-blue-600"
            )}>
              {msg.role === 'user' ? <User size={20} className="text-zinc-500" /> : <Bot size={20} className="text-white" />}
            </div>
            
            <div className={clsx(
              "flex flex-col gap-2 max-w-[92%]",
              msg.role === 'user' ? "items-end text-right" : "items-start"
            )}>
              <div className={clsx(
                "p-6 rounded-[2rem] text-sm leading-relaxed shadow-sm transition-all",
                msg.role === 'user' 
                  ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-tr-none" 
                  : "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/50 text-zinc-900 dark:text-zinc-100 rounded-tl-none"
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
                        <div className="relative group my-6">
                          <div className="absolute top-0 left-0 right-0 h-8 bg-zinc-800 rounded-t-xl flex items-center px-4 justify-between border-b border-white/5">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{match[1]}</span>
                            <button className="text-zinc-500 hover:text-white transition-colors"><Copy size={12}/></button>
                          </div>
                          <SyntaxHighlighter
                            style={vscDarkPlus as any}
                            language={match[1]}
                            PreTag="div"
                            className="rounded-b-xl !bg-zinc-950 !p-6 !pt-12 text-xs border-x border-b border-white/5 shadow-2xl"
                            {...props}
                          >
                            {codeContent}
                          </SyntaxHighlighter>
                        </div>
                      ) : (
                        <code className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-mono font-bold" {...props}>
                          {children}
                        </code>
                      );
                    },
                    h1: ({children}) => <h1 className="text-2xl font-black mb-6 tracking-tight bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent">{children}</h1>,
                    h2: ({children}) => <h2 className="text-xl font-bold mb-4 text-blue-600 dark:text-blue-400 flex items-center gap-2"><span className="w-1.5 h-6 bg-blue-600 rounded-full inline-block" /> {children}</h2>,
                    p: ({children}) => <p className="mb-4 last:mb-0 leading-relaxed text-zinc-700 dark:text-zinc-300">{children}</p>,
                    strong: ({children}) => <strong className="font-black text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1 rounded">{children}</strong>,
                    blockquote: ({children}) => (
                      <blockquote className="border-l-4 border-blue-500 bg-blue-50/50 dark:bg-blue-900/10 p-4 my-6 rounded-r-xl italic text-zinc-600 dark:text-zinc-400">
                        {children}
                      </blockquote>
                    ),
                    ul: ({children}) => <ul className="list-disc ml-6 space-y-3 mb-6 text-zinc-700 dark:text-zinc-300">{children}</ul>,
                    ol: ({children}) => <ol className="list-decimal ml-6 space-y-3 mb-6 text-zinc-700 dark:text-zinc-300">{children}</ol>,
                  }}
                >{msg.content}</ReactMarkdown>
              </div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
                {msg.role === 'assistant' ? 'Assistant Académique' : 'Vous'} • {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </span>
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <div className="flex gap-6 items-start">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg"><Bot size={20} className="text-white" /></div>
            <div className="bg-white dark:bg-zinc-800 p-6 rounded-[2rem] rounded-tl-none border border-zinc-100 dark:border-zinc-700/50 shadow-sm flex items-center gap-3">
              <Loader2 size={20} className="animate-spin text-blue-600" /><span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">L'IA réfléchit...</span>
            </div>
          </div>
        )}
      </div>

      <div className="px-8 py-8 bg-zinc-50/50 dark:bg-zinc-950/30 border-t border-zinc-100 dark:border-zinc-800 relative">
        {selectedResource && (
          <div className="max-w-4xl mx-auto mb-4 flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold animate-in fade-in slide-in-from-bottom-2">
            <FileText size={14} /><span className="truncate">Document joint : {selectedResource.title}</span>
            <button onClick={() => setSelectedResource(null)} className="ml-auto hover:bg-white/20 p-1 rounded-lg transition-colors"><X size={14} /></button>
          </div>
        )}
        {tempFile && (
           <div className="max-w-4xl mx-auto mb-4 flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded-xl text-xs font-bold animate-in fade-in slide-in-from-bottom-2">
             <FileText size={14} /><span className="truncate">Fichier local : {tempFile.name}</span>
             <button onClick={() => setTempFile(null)} className="ml-auto hover:bg-white/20 p-1 rounded-lg transition-colors"><X size={14} /></button>
           </div>
        )}
        {attachedLink && (
           <div className="max-w-4xl mx-auto mb-4 flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold animate-in fade-in slide-in-from-bottom-2">
             <div className="flex items-center gap-2 truncate">
               <Share2 size={14} />
               <span>Lien Drive : {attachedLink}</span>
             </div>
             <button onClick={() => setAttachedLink(null)} className="ml-auto hover:bg-white/20 p-1 rounded-lg transition-colors"><X size={14} /></button>
           </div>
        )}

        {/* Link Input Popover */}
        {showLinkInput && (
           <div className="absolute bottom-full left-20 mb-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-4 w-96 z-20 animate-in fade-in zoom-in-95">
             <h4 className="text-xs font-bold uppercase text-zinc-400 mb-2">Ajouter un lien Google Drive (PDF Public)</h4>
             <input 
               autoFocus
               type="text" 
               value={tempLink}
               onChange={(e) => setTempLink(e.target.value)}
               placeholder="https://drive.google.com/..." 
               className="w-full bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl px-3 py-2 text-sm mb-2 focus:ring-2 focus:ring-blue-500"
             />
             <div className="flex gap-2">
               <button onClick={() => setShowLinkInput(false)} className="flex-1 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-xs font-bold">Annuler</button>
               <button onClick={handleAddLink} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold">Ajouter</button>
             </div>
           </div>
        )}

        {showResourceList && (
          <div className="absolute bottom-full left-8 right-8 mb-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-4 max-h-60 overflow-y-auto z-10 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between mb-3 px-2"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Vos ressources PDF</p><button onClick={() => setShowResourceList(false)}><X size={14}/></button></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {resources.map(res => (
                <button key={res.id} onClick={() => { setSelectedResource(res); setAttachedLink(null); setTempFile(null); setShowResourceList(false); play('xp'); }} className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all text-left group">
                  <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-lg flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors"><FileText size={16} /></div>
                  <span className="text-xs font-bold truncate">{res.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="relative w-full max-w-6xl mx-auto flex items-center gap-4">
          <div className="flex-1 relative flex items-center gap-4">
            <button 
              onClick={() => setShowResourceList(!showResourceList)} 
              title="Ajouter un fichier existant"
              className={clsx("p-4 rounded-2xl transition-all border-2", (selectedResource || attachedLink || tempFile) ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border-transparent" : "bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 text-zinc-400") }
            >
              <Paperclip size={24} />
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()} 
              title="Uploader un fichier (PDF)"
              disabled={isUploading}
              className={clsx("p-4 rounded-2xl transition-all border-2 bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 text-zinc-400 hover:text-orange-600") }
            >
               {isUploading ? <Loader2 size={24} className="animate-spin" /> : <PlusCircle size={24} />}
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf" className="hidden" />
            
            <button 
              onClick={() => setShowLinkInput(!showLinkInput)} 
              title="Ajouter un lien Drive"
              className={clsx("p-4 rounded-2xl transition-all border-2 bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 text-zinc-400 hover:text-blue-600") }
            >
               <Share2 size={24} />
            </button>
            <div className="flex-1 relative">
              <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder={selectedResource || attachedLink || tempFile ? "Posez une question sur ce document..." : "Posez votre question..."} className="w-full bg-white dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 rounded-3xl px-8 py-5 text-sm focus:outline-none focus:border-blue-500 shadow-xl" />
            </div>
          </div>
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleSend} disabled={isLoading || isUploading} className="w-16 h-16 bg-zinc-900 dark:bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-2xl disabled:opacity-50"><Send size={24} /></motion.button>
        </div>
      </div>

      <AnimatePresence>
        {showAdModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-6 text-center space-y-6">
              <Youtube size={48} className="mx-auto text-red-500" /><h3 className="text-xl font-bold">Quota IA journalier atteint !</h3><p className="text-zinc-500 text-sm">Regardez une courte publicité pour obtenir {quotaInfo?.bonus || 5} requêtes supplémentaires.</p>
              <div className="py-4">
                {watchingAd ? (
                  <div className="space-y-4">
                    <div className="relative w-24 h-24 mx-auto">
                      <svg className="w-full h-full rotate-[-90deg]"><circle cx="48" cy="48" r="45" className="stroke-zinc-100 dark:stroke-zinc-800 fill-none" strokeWidth="6" /><circle cx="48" cy="48" r="45" className="stroke-red-500 fill-none transition-all duration-1000" strokeWidth="6" strokeDasharray="283" strokeDashoffset={283 - (283 * adTimer) / 30} /></svg>
                      <div className="absolute inset-0 flex items-center justify-center font-black text-2xl">{adTimer}s</div>
                    </div>
                    <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest animate-pulse">Visionnage obligatoire...</p>
                  </div>
                ) : (
                  <button onClick={handleWatchAd} className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-lg shadow-red-500/20 transition-all">Regarder la publicité</button>
                )}
              </div>
              {!watchingAd && <button onClick={() => setShowAdModal(false)} className="w-full py-2 text-zinc-500 hover:text-zinc-900 text-sm font-medium">Plus tard</button>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}