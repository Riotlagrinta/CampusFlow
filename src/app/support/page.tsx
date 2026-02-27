"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  LifeBuoy, 
  MessageCircle, 
  Send, 
  AlertTriangle, 
  Lightbulb, 
  HelpCircle,
  Loader2,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { useSound } from '@/hooks/useSound';

export default function SupportPage() {
  const { play } = useSound();
  const [type, setType] = useState('BUG');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/support/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content })
      });

      if (res.ok) {
        setSuccess(true);
        play('success');
        setContent('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openWhatsApp = () => {
    const message = "Bonjour ! J'ai un problème avec la plateforme DefiTech Hub.";
    window.open(`https://wa.me/22871796050?text=${encodeURIComponent(message)}`, '_blank');
  };

  if (success) {
    return (
      <div className="max-w-2xl mx-auto py-20 px-4 text-center space-y-6">
        <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 size={40} />
        </div>
        <h1 className="text-3xl font-black">Message envoyé !</h1>
        <p className="text-zinc-500 font-medium">Merci pour votre retour. Notre équipe technique va analyser votre demande dans les plus brefs délais.</p>
        <button 
          onClick={() => setSuccess(false)}
          className="px-8 py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl"
        >
          Envoyer un autre message
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-20 px-4 pt-10">
      
      <div className="space-y-1 text-center">
        <h1 className="text-4xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">Besoin d&apos;aide ?</h1>
        <p className="text-zinc-500 font-medium italic">Signalez un bug ou proposez une amélioration.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Left: Quick Contact */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800 shadow-sm space-y-6">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center text-blue-600">
              <MessageCircle size={24} />
            </div>
            <h3 className="text-xl font-bold">Support Direct</h3>
            <p className="text-sm text-zinc-500 leading-relaxed font-medium">
              Pour une assistance immédiate, discutez directement avec notre équipe sur WhatsApp.
            </p>
            <button 
              onClick={openWhatsApp}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              <MessageCircle size={16} /> Discuter sur WhatsApp
            </button>
          </div>

          <div className="p-6 bg-blue-600 rounded-[2rem] text-white space-y-4">
             <h4 className="font-bold flex items-center gap-2 italic"><HelpCircle size={18} /> Aide Rapide</h4>
             <p className="text-xs text-blue-100 leading-relaxed">
               Si vous avez perdu vos accès, contactez l'administration de DEFITECH avec votre carte d'étudiant.
             </p>
          </div>
        </div>

        {/* Right: Feedback Form */}
        <div className="md:col-span-2">
          <div className="bg-white dark:bg-zinc-900 p-8 md:p-10 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-8">
              
              <div className="space-y-4">
                <label className="text-xs font-black uppercase text-zinc-400 tracking-widest ml-1">Type de demande</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: 'BUG', label: 'Bug', icon: AlertTriangle, color: 'text-red-500' },
                    { id: 'FEATURE', label: 'Idée', icon: Lightbulb, color: 'text-amber-500' },
                    { id: 'OTHER', label: 'Autre', icon: HelpCircle, color: 'text-zinc-500' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setType(item.id)}
                      className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${type === item.id ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-900/20' : 'border-zinc-50 dark:border-zinc-800'}`}
                    >
                      <item.icon size={20} className={item.color} />
                      <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase text-zinc-400 tracking-widest ml-1">Description détaillée</label>
                <textarea 
                  required
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Décrivez votre problème ou votre idée ici..."
                  className="w-full bg-zinc-50 dark:bg-black border border-zinc-100 dark:border-zinc-800 rounded-2xl p-6 text-sm min-h-[200px] outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none"
                />
              </div>

              <button 
                type="submit"
                disabled={loading || !content.trim()}
                className="w-full py-5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 shadow-xl hover:opacity-90 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <><Send size={20} /> Envoyer le rapport</>}
              </button>

            </form>
          </div>
        </div>

      </div>
    </div>
  );
}
