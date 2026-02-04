"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, Send, Bot, User, Loader2, Copy, 
  PlusCircle, Paperclip, FileText, X, 
  Menu, History, Settings, LogOut, Share2, 
  Trash2, MessageSquare, ExternalLink, RefreshCw
} from 'lucide-react';
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
  id?: string;
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const [quotaInfo, setQuotaInfo] = useState<{ remaining: number; total: number; bonus: number } | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [tempFile, setTempFile] = useState<{ name: string; path: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showResourceList, setShowResourceList] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedMessages = localStorage.getItem('ai_assistant_history');
    if (savedMessages) {
      setMessages(JSON.parse(savedMessages));
    } else {
      setMessages([
        { role: 'assistant', content: '# Bienvenue sur l\'Assistant DEFITECH\n\nJe suis votre compagnon d\'étude. Posez-moi vos questions, joignez un cours ou demandez-moi de chercher sur le web.' }
      ]);
    }
    fetchResources();
    fetchQuota();

    // Responsive sidebar
    if (window.innerWidth < 768) setIsSidebarOpen(false);
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

  const fetchResources = async () => {
    try {
      const res = await fetch('/api/resources');
      if (res.ok) {
        const data = await res.json();
        setResources(data.filter((r: Resource) => r.type === 'PDF'));
      }
    } catch (err) { console.error(err); }
  };

  const fetchQuota = async () => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user.email) return;
    try {
      const res = await fetch(`/api/user/ai-quota?email=${user.email}`);
      if (res.ok) setQuotaInfo(await res.json());
    } catch (error) { console.error(error); }
  };

  const handleNewChat = () => {
    if (confirm('Nouvelle discussion ?')) {
      const initial = [{ role: 'assistant' as const, content: '# Nouvelle Discussion\nComment puis-je vous aider ?' }];
      setMessages(initial);
      localStorage.setItem('ai_assistant_history', JSON.stringify(initial));
      play('send');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/chat/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setTempFile({ name: file.name, path: data.tempPath });
        play('xp');
      }
    } catch (err) { console.error(err); } finally { setIsUploading(false); }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);
    play('send');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          resourceId: selectedResource?.id,
          tempFilePath: tempFile?.path,
          history
        }),
      });
      const data = await res.json();
      
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      setSelectedResource(null);
      setTempFile(null);
      fetchQuota();
      play('xp');
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Erreur de connexion." }]);
    } finally {
      setIsLoading(false);
    }
  };

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
                onClick={handleNewChat}
                className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-all font-bold text-sm border border-zinc-200 dark:border-zinc-700"
              >
                <PlusCircle size={18} className="text-blue-600" />
                Nouvelle discussion
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <p className="text-[10px] font-black uppercase text-zinc-400 tracking-widest px-2 mb-4">Discussions récentes</p>
              <button className="w-full flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 transition-all text-left">
                <MessageSquare size={16} />
                <span className="text-xs font-bold truncate">Aide DEFITECH Actuelle</span>
              </button>
              {/* Other history items can be mapped here */}
            </div>

            <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
              <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-100 dark:border-zinc-800">
                <div className="flex justify-between text-[10px] font-black uppercase mb-2">
                  <span>Quota Quotidien</span>
                  <span className="text-blue-600">{quotaInfo?.remaining || 0} / {quotaInfo?.total || 10}</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600" style={{ width: `${((quotaInfo?.remaining || 0) / (quotaInfo?.total || 10)) * 100}%` }} />
                </div>
              </div>
              <button onClick={() => window.location.href = '/'} className="w-full flex items-center gap-3 p-3 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all text-sm font-bold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                <LogOut size={18} /> Quitter l\'IA
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
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500">
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg">
                <Bot size={18} />
              </div>
              <span className="font-black tracking-tight text-sm">DEFITECH AI <span className="text-[10px] text-blue-600 ml-1 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 rounded-full">PRO</span></span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all"><Share2 size={18} /></button>
            <button className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all"><Settings size={18} /></button>
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
                      : "py-2"
                  )}>
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ className, children, ...props }: any) {
                          const match = /language-(\w+)/.exec(className || '');
                          const codeContent = String(children).replace(/\n$/, '');
                          if (match && match[1] === 'mermaid') return <Mermaid chart={codeContent} />;
                          return match ? (
                            <div className="relative my-6 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-2xl">
                              <div className="flex items-center justify-between px-4 py-2 bg-zinc-100 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                                <span className="text-[10px] font-black uppercase text-zinc-500">{match[1]}</span>
                                <button className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all"><Copy size={12}/></button>
                              </div>
                              <SyntaxHighlighter style={vscDarkPlus as any} language={match[1]} PreTag="div" className="!m-0 !bg-zinc-950 !p-6 text-xs">
                                {codeContent}
                              </SyntaxHighlighter>
                            </div>
                          ) : (
                            <code className="bg-zinc-100 dark:bg-zinc-800 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-mono font-bold" {...props}>{children}</code>
                          );
                        },
                        h1: ({children}) => <h1 className="text-xl font-black mb-4 text-zinc-900 dark:text-white">{children}</h1>,
                        h2: ({children}) => <h2 className="text-lg font-bold mb-3 text-blue-600 dark:text-blue-400">{children}</h2>,
                        p: ({children}) => <p className="mb-4 last:mb-0">{children}</p>,
                        blockquote: ({children}) => <blockquote className="border-l-4 border-blue-500 bg-blue-50/50 dark:bg-blue-900/10 p-4 my-4 rounded-r-xl italic">{children}</blockquote>,
                      }}
                    >{msg.content}</ReactMarkdown>
                  </div>
                  <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                    <button className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-1"><Copy size={14}/></button>
                    <button className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-1"><RefreshCw size={14}/></button>
                  </div>
                </div>
              </motion.div>
            ))}
            {isLoading && (
              <div className="flex gap-4 md:gap-6 items-start">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg"><Bot size={18} className="text-white" /></div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-3 py-2">
                    <Loader2 size={18} className="animate-spin text-blue-600" />
                    <span className="text-xs font-black uppercase text-zinc-400 animate-pulse">L'IA prépare votre réponse...</span>
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
              {selectedResource && (
                <div className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-full text-[10px] font-black uppercase shadow-xl animate-in slide-in-from-bottom-2">
                  <FileText size={12} /> {selectedResource.title}
                  <button onClick={() => setSelectedResource(null)} className="hover:bg-black/20 p-0.5 rounded-full"><X size={12}/></button>
                </div>
              )}
              {tempFile && (
                <div className="flex items-center gap-2 bg-orange-600 text-white px-3 py-1.5 rounded-full text-[10px] font-black uppercase shadow-xl animate-in slide-in-from-bottom-2">
                  <PlusCircle size={12} /> {tempFile.name}
                  <button onClick={() => setTempFile(null)} className="hover:bg-black/20 p-0.5 rounded-full"><X size={12}/></button>
                </div>
              )}
            </div>

            {/* Resource Selector Popover */}
            {showResourceList && (
              <div className="absolute bottom-full left-0 mb-4 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl p-4 z-50">
                <p className="text-[10px] font-black uppercase text-zinc-400 tracking-widest mb-3">Joindre un cours</p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {resources.map(res => (
                    <button key={res.id} onClick={() => { setSelectedResource(res); setShowResourceList(false); play('xp'); }} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all text-left group">
                      <FileText size={14} className="text-blue-500" />
                      <span className="text-[11px] font-bold truncate">{res.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="relative flex items-end gap-3 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-3xl p-2 pl-4 shadow-2xl focus-within:border-blue-500 transition-all">
              <button onClick={() => setShowResourceList(!showResourceList)} className="p-3 text-zinc-400 hover:text-blue-600 transition-all"><Paperclip size={22} /></button>
              <button onClick={() => fileInputRef.current?.click()} className="p-3 text-zinc-400 hover:text-orange-600 transition-all"><PlusCircle size={22} /></button>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".pdf" className="hidden" />
              
              <textarea 
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                placeholder="Posez votre question à l\'IA..."
                className="flex-1 bg-transparent border-none py-3 text-sm focus:outline-none resize-none max-h-32"
              />
              
              <button 
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
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
