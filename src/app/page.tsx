'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Zap, 
  Clock, 
  BookOpen, 
  ArrowUpRight,
  Activity,
  ArrowRight,
  Calendar,
  Award,
  Loader2,
  Shield,
  MessageSquare,
  Sparkles,
  Bot,
  Brain
} from 'lucide-react';
import Link from 'next/link';
import { useSession } from "next-auth/react";

const ICON_MAP: Record<string, any> = {
  Activity,
  BookOpen,
  Zap,
  Award
};

export default function Home() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.user?.email) {
      fetchDashboardData();
    } else if (status !== 'loading') {
      setLoading(false);
    }
  }, [session, status]);

  const fetchDashboardData = async () => {
    try {
      const res = await fetch('/api/user/dashboard-stats');
      const json = await res.json();
      if (!json.error) setData(json);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading' || (loading && session)) {
    return <div className="flex justify-center py-40"><Loader2 className="animate-spin text-zinc-500" size={40} /></div>;
  }

  // --- RENDU LANDING PAGE (Non connecté) ---
  if (!session) {
    return (
      <div className="max-w-6xl mx-auto space-y-32 py-20 px-4">
        {/* Hero Section */}
        <section className="text-center space-y-8 relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-blue-500/20 blur-[120px] -z-10" />
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-600 rounded-full text-xs font-black uppercase tracking-widest"
          >
            <Sparkles size={14} /> La nouvelle ère de l&apos;apprentissage
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="text-4xl md:text-8xl font-black tracking-tighter text-zinc-900 dark:text-white leading-tight"
          >
            DefiTech <br />
            <span className="text-blue-600">Student Hub.</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="text-base md:text-lg text-zinc-500 max-w-2xl mx-auto leading-relaxed px-4"
          >
            La plateforme tout-en-un pour les étudiants de DEFITECH. 
            Centralisez vos cours, testez vos connaissances avec l&apos;IA et dominez le classement.
          </motion.p>
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="flex flex-col md:flex-row justify-center gap-4 pt-4 px-6"
          >
            <Link href="/login" className="w-full md:w-auto px-8 py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-bold hover:scale-105 transition-transform shadow-xl shadow-zinc-500/20 flex items-center justify-center gap-2 text-sm md:text-base">
              Se connecter <ArrowRight size={18} />
            </Link>
            <Link href="/register" className="w-full md:w-auto px-8 py-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-sm md:text-base flex justify-center">
              Créer un compte
            </Link>
          </motion.div>
        </section>

        {/* Features Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4">
          {[
            { icon: Bot, title: "Professeur IA", desc: "Posez vos questions à l'IA et obtenez des explications pédagogiques basées sur vos cours." },
            { icon: Brain, title: "Quizz Dynamiques", desc: "L'IA génère des quizz à partir de vos PDF pour un entraînement ultra-efficace." },
            { icon: Award, title: "Gamification", desc: "Gagnez de l'XP, débloquez des badges et gravissez les échelons du classement." }
          ].map((f, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              className="card-pro p-6 md:p-8 space-y-4 text-center group"
            >
              <div className="w-12 h-12 md:w-14 md:h-14 bg-zinc-50 dark:bg-zinc-900 rounded-2xl flex items-center justify-center mx-auto border border-zinc-100 dark:border-zinc-800 group-hover:scale-110 transition-transform">
                <f.icon className="text-blue-600" size={24} />
              </div>
              <h3 className="text-lg md:text-xl font-bold">{f.title}</h3>
              <p className="text-xs md:text-sm text-zinc-500 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </section>

        {/* Community Proof */}
        <section className="mx-4 md:mx-0 card-pro p-8 md:p-12 bg-blue-600 text-white text-center space-y-6 overflow-hidden relative">
           <div className="relative z-10">
              <h2 className="text-2xl md:text-3xl font-black">Rejoignez vos camarades</h2>
              <p className="text-blue-100 text-sm md:text-base">Plus de 20 étudiants déjà actifs sur la plateforme.</p>
              <div className="pt-8 flex justify-center -space-x-4">
                 {[1,2,3,4,5].map(i => (
                   <div key={i} className="w-10 h-10 md:w-12 md:h-12 rounded-full border-4 border-blue-600 bg-zinc-800 flex items-center justify-center font-bold text-[10px] md:text-xs">
                      {String.fromCharCode(64 + i)}
                   </div>
                 ))}
              </div>
           </div>
           <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 blur-[80px] -rotate-45 translate-x-32" />
        </section>
      </div>
    );
  }

  // --- RENDU DASHBOARD (Connecté) ---
  return (
    <div className="max-w-6xl mx-auto space-y-8 md:space-y-12 py-4 px-2 md:px-0">
      
      {/* Top Navigation / Breadcrumbs Style */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-2 text-[10px] md:text-sm font-medium">
          <span className="text-zinc-400">Dashboard</span>
          <span className="text-zinc-300 dark:text-zinc-700">/</span>
          <span className="text-zinc-900 dark:text-zinc-100">Vue d&apos;ensemble</span>
        </div>
        <div className="flex items-center gap-4">
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded">Système Synchrone</span>
        </div>
      </div>

      {/* Hero Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4">
        <div className="md:col-span-2 space-y-2">
            <h1 className="text-2xl md:text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Bienvenue, {session.user?.name?.split(' ')[0] || 'Étudiant'}.
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm md:text-lg">
              Voici l&apos;état de votre progression académique.
            </p>
        </div>
      </div>

      {/* Stats Cards - Réelles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 px-4">
        {data?.stats.map((stat: any, i: number) => {
          const Icon = ICON_MAP[stat.icon] || Activity;
          return (
            <div key={i} className="card-pro p-4 md:p-6 space-y-2 md:space-y-3">
              <div className="flex items-center justify-between text-zinc-400">
                  <Icon size={14} className="md:w-[18px] md:h-[18px]" />
                  <span className="text-[8px] md:text-[10px] font-bold uppercase tracking-wider text-blue-500">{stat.trend}</span>
              </div>
              <div>
                  <p className="text-[9px] md:text-xs font-medium text-zinc-500 uppercase tracking-tight">{stat.label}</p>
                  <h3 className="text-base md:text-2xl font-bold tracking-tight">{stat.value}</h3>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 px-4">
        
        {/* Main Feed */}
        <div className="lg:col-span-2 space-y-8">
          <section className="space-y-4">
            <h2 className="text-[10px] md:text-sm font-bold text-zinc-400 uppercase tracking-[0.2em]">Activités Récentes</h2>
            <div className="space-y-3">
              {data?.activities.length > 0 ? data.activities.map((item: any, i: number) => (
                <div key={i} className="card-pro p-4 flex items-center justify-between group cursor-pointer gap-4">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                    <div className="overflow-hidden">
                        <h4 className="text-xs md:text-sm font-semibold text-zinc-800 dark:text-zinc-200 group-hover:text-blue-600 transition-colors truncate">{item.title}</h4>
                        <p className="text-[9px] text-zinc-500 mt-0.5">{item.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="hidden md:inline text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{item.status}</span>
                    <ArrowRight size={14} className="text-zinc-300 dark:text-zinc-700 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors" />
                  </div>
                </div>
              )) : (
                <div className="p-10 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-900 rounded-3xl text-zinc-400 text-xs md:text-sm">
                   Aucune activité récente.
                </div>
              )}
            </div>
          </section>

          <section className="card-pro p-6 md:p-8 bg-zinc-900 dark:bg-zinc-950 text-white overflow-hidden relative">
            <div className="relative z-10 space-y-4 md:space-y-6">
                <div className="space-y-2">
                    <h3 className="text-lg md:text-xl font-bold tracking-tight">Analyse IA</h3>
                    <p className="text-zinc-400 text-xs md:text-sm max-w-md">L&apos;IA analyse vos performances pour vous proposer des recommandations.</p>
                </div>
                <button className="flex items-center gap-2 text-xs md:text-sm font-bold text-blue-400 hover:text-blue-300 transition-colors">
                    Détails assistant <ArrowUpRight size={16} />
                </button>
            </div>
            <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-blue-600/10 to-transparent pointer-events-none" />
          </section>
        </div>

        {/* Sidebar Style Widgets */}
        <div className="space-y-8">
            <section className="space-y-4">
                <h2 className="text-[10px] md:text-sm font-bold text-zinc-400 uppercase tracking-[0.2em]">Prochain cours</h2>
                <div className="card-pro p-6 bg-zinc-50 dark:bg-zinc-900/50 border-blue-500/20">
                    {data?.nextCourse ? (
                      <>
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-8 h-8 md:w-10 md:h-10 bg-white dark:bg-zinc-800 rounded-lg flex items-center justify-center border border-zinc-200 dark:border-zinc-700">
                                <Calendar size={16} className="text-blue-600" />
                            </div>
                            <span className="text-[10px] font-bold text-blue-600 uppercase">Aujourd&apos;hui</span>
                        </div>
                        <h4 className="text-sm md:text-base font-bold text-zinc-900 dark:text-zinc-50 truncate">{data.nextCourse.title}</h4>
                        <p className="text-xs text-zinc-500 mt-1">{data.nextCourse.time} • {data.nextCourse.teacher}</p>
                        <div className="mt-6 flex gap-2">
                            <button className="flex-1 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md text-[10px] md:text-xs font-bold transition-opacity hover:opacity-90">
                                Voir détails
                            </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-[10px] md:text-xs text-zinc-500 text-center py-4">Pas de cours prévu.</p>
                    )}
                </div>
            </section>

            <section className="space-y-4">
                <h2 className="text-[10px] md:text-sm font-bold text-zinc-400 uppercase tracking-[0.2em]">Usage IA</h2>
                <div className="card-pro p-6">
                    <p className="text-[10px] md:text-xs text-zinc-500 mb-4">Utilisation des ressources IA.</p>
                    <div className="h-24 md:h-32 flex items-end gap-1.5 md:gap-2">
                        {[20, 30, 45, 10, 65, 30, 55].map((h, i) => (
                            <div key={i} className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-t-sm relative group">
                                <motion.div 
                                    initial={{ height: 0 }}
                                    animate={{ height: `${h}%` }}
                                    className={`w-full rounded-t-sm transition-colors ${i === 6 ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-700 group-hover:bg-blue-500/50'}`}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>

      </div>
    </div>
  );
}
