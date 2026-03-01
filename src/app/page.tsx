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
import { cn } from "@/lib/utils";

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
            { icon: Brain, title: "Quizz Dynamiques (Bientôt)", desc: "Entraînez-vous avec des tests génitaux par l'IA. Fonctionnalité en cours de développement." },
            { icon: Award, title: "Gamification", desc: "Gagnez de l'XP, débloquez des badges et gravissez les échelons du classement." }
          ].map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              className={cn("card-pro p-6 md:p-8 space-y-4 text-center group relative", i === 1 && "opacity-80")}
            >
              {i === 1 && (
                <div className="absolute top-4 right-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 text-[8px] font-black uppercase px-2 py-1 rounded-full border border-zinc-200 dark:border-zinc-700">À venir</div>
              )}
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
              {[1, 2, 3, 4, 5].map(i => (
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
      <motion.div
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-4"
      >
        <div className="flex items-center gap-2 text-[10px] md:text-sm font-medium">
          <span className="text-zinc-400">Dashboard</span>
          <span className="text-zinc-300 dark:text-zinc-700">/</span>
          <span className="text-zinc-900 dark:text-zinc-100">Vue d&apos;ensemble</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded">Système Synchrone</span>
        </div>
      </motion.div>

      {/* Hero Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4">
        <motion.div
          initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
          className="md:col-span-2 space-y-2"
        >
          <h1 className="text-2xl md:text-5xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 leading-tight">
            Bienvenue, <span className="text-blue-600 font-black">{session.user?.name?.split(' ')[0] || 'Étudiant'}</span>.
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm md:text-lg font-medium">
            Voici l&apos;état de votre progression académique aujourd&apos;hui.
          </p>
        </motion.div>
      </div>

      {/* Glassmorphism Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 px-4">
        {data?.stats.map((stat: any, i: number) => {
          const Icon = ICON_MAP[stat.icon] || Activity;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }}
              className="glass-card p-4 md:p-6 space-y-2 md:space-y-3"
            >
              <div className="flex items-center justify-between text-zinc-400">
                <Icon size={14} className="md:w-[20px] md:h-[20px] text-blue-600" />
                <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-blue-500/70">{stat.trend}</span>
              </div>
              <div>
                <p className="text-[9px] md:text-[10px] font-black text-zinc-500 uppercase tracking-tighter mb-1">{stat.label}</p>
                <h3 className="text-base md:text-3xl font-black tracking-tighter">{stat.value}</h3>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 px-4">

        {/* Main Feed */}
        <div className="lg:col-span-2 space-y-8">
          <section className="space-y-4">
            <h2 className="text-[10px] md:text-sm font-black text-zinc-400 uppercase tracking-[0.3em]">Activités Récentes</h2>
            <div className="space-y-3">
              {data?.activities.length > 0 ? data.activities.map((item: any, i: number) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  className="glass-card p-4 flex items-center justify-between group cursor-pointer gap-4"
                >
                  <div className="flex items-center gap-4 overflow-hidden">
                    <div className="w-1.5 h-10 rounded-full bg-blue-600/20 group-hover:bg-blue-600 transition-colors shrink-0" />
                    <div className="overflow-hidden">
                      <h4 className="text-xs md:text-sm font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-blue-600 transition-colors truncate">{item.title}</h4>
                      <p className="text-[9px] font-medium text-zinc-500 mt-1 uppercase tracking-wider">{item.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="hidden md:inline text-[9px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded">{item.status}</span>
                    <ArrowRight size={14} className="text-zinc-300 dark:text-zinc-700 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors" />
                  </div>
                </motion.div>
              )) : (
                <div className="p-16 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-900 rounded-[2rem] text-zinc-400 text-xs md:text-sm font-medium">
                  Aucune activité récente pour le moment.
                </div>
              )}
            </div>
          </section>

          {/* AI Hero Widget */}
          <motion.section
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6 md:p-10 bg-gradient-to-br from-zinc-900 to-zinc-800 dark:from-zinc-950 dark:to-zinc-900 text-white overflow-hidden relative rounded-[2.5rem]"
          >
            <div className="relative z-10 space-y-6">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-full text-[10px] font-black uppercase tracking-widest">
                  <Sparkles size={12} /> Recommandation IA
                </div>
                <h3 className="text-xl md:text-3xl font-black tracking-tighter leading-tight">Optimisez votre <br /> temps de révision.</h3>
                <p className="text-zinc-400 text-xs md:text-sm max-w-sm font-medium">L&apos;IA a analysé vos derniers scores et suggère de revoir le module d&apos;algorithmique.</p>
              </div>
              <button className="flex items-center gap-2 text-xs md:text-sm font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors">
                Détails assistant <ArrowUpRight size={18} />
              </button>
            </div>
            <div className="absolute right-[-10%] top-[-10%] w-64 h-64 bg-blue-600/10 blur-[80px] pointer-events-none rounded-full" />
            <Bot className="absolute right-10 bottom-10 opacity-10" size={120} />
          </motion.section>
        </div>

        {/* Sidebar Style Widgets */}
        <div className="space-y-8">
          {/* Subscription Widget */}
          <motion.section
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            <h2 className="text-[10px] md:text-sm font-black text-zinc-400 uppercase tracking-[0.3em]">Abonnement</h2>
            <div className={cn(
              "glass-card p-6 rounded-[2rem] border-2 transition-all duration-500",
              data?.role === "ADMIN" ? "border-purple-500/20 bg-purple-500/5" :
                data?.isSubscribed ? "border-emerald-500/20 bg-emerald-500/5" : "border-blue-500/20 bg-blue-500/5"
            )}>
              <div className="flex items-center gap-4 mb-4">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center border",
                  data?.role === "ADMIN" ? "bg-purple-500/10 border-purple-500/20 text-purple-600" :
                    data?.isSubscribed ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600" : "bg-blue-500/10 border-blue-500/20 text-blue-600"
                )}>
                  <Shield size={24} />
                </div>
                <div>
                  <h4 className="text-sm font-black uppercase tracking-tight">
                    {data?.role === "ADMIN" ? 'Status VIP / Admin' : data?.isSubscribed ? 'Status Premium' : 'Status Gratuit'}
                  </h4>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                    {data?.role === "ADMIN" ? 'Accès Illimité (Dieu)' : data?.isSubscribed ? 'Accès Illimité' : 'Accès Limité'}
                  </p>
                </div>
              </div>

              {data?.role === "ADMIN" ? (
                <div className="py-2">
                  <p className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest italic text-center">
                    👑 Vous avez les pleins pouvoirs
                  </p>
                </div>
              ) : data?.isSubscribed ? (
                <div className="space-y-4">
                  <div className="h-1.5 w-full bg-emerald-100 dark:bg-emerald-900/30 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: '65%' }} className="h-full bg-emerald-500" />
                  </div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex justify-between">
                    <span>Expire le</span>
                    <span className="text-zinc-900 dark:text-zinc-100">{new Date(data.subscriptionExpiresAt).toLocaleDateString()}</span>
                  </p>
                </div>
              ) : (
                <Link href="/subscribe" className="w-full py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-[1.03] transition-transform">
                  Passer au pro <Zap size={14} fill="currentColor" />
                </Link>
              )}
            </div>
          </motion.section>

          <section className="space-y-4">
            <h2 className="text-[10px] md:text-sm font-black text-zinc-400 uppercase tracking-[0.3em]">Prochain cours</h2>
            <div className="glass-card p-6 rounded-[2rem]">
              {data?.nextCourse ? (
                <>
                  <div className="flex justify-between items-start mb-6">
                    <div className="w-10 h-10 bg-white dark:bg-zinc-800 rounded-2xl flex items-center justify-center border border-zinc-100 dark:border-zinc-700 shadow-sm">
                      <Calendar size={20} className="text-blue-600" />
                    </div>
                    <span className="text-[10px] font-black text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-full uppercase tracking-widest">Aujourd&apos;hui</span>
                  </div>
                  <h4 className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50 truncate">{data.nextCourse.title}</h4>
                  <p className="text-xs text-zinc-500 font-medium mt-1 uppercase tracking-wider">{data.nextCourse.time} • M. {data.nextCourse.teacher}</p>
                  <div className="mt-8 flex gap-2">
                    <button className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                      Détails
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-6 space-y-2">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Pas de cours prévu</p>
                  <p className="text-[9px] text-zinc-500 font-medium underline">Consulter l&apos;emploi du temps complet</p>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-[10px] md:text-sm font-black text-zinc-400 uppercase tracking-[0.3em]">Usage IA</h2>
            <div className="glass-card p-6 rounded-[2rem]">
              <p className="text-[10px] font-black text-zinc-500 mb-6 uppercase tracking-widest">Utilisation des jetons (7 derniers jours)</p>
              <div className="h-24 md:h-32 flex items-end gap-2 md:gap-3">
                {[20, 30, 45, 10, 65, 30, 55].map((h, i) => (
                  <div key={i} className="flex-1 bg-zinc-50 dark:bg-zinc-900 rounded-t-lg relative group">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${h}%` }}
                      className={`w-full rounded-t-lg transition-all duration-500 ${i === 6 ? 'bg-gradient-to-t from-blue-700 to-blue-400' : 'bg-zinc-200 dark:bg-zinc-800 group-hover:bg-blue-400/50'}`}
                    />
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 text-white px-2 py-0.5 rounded text-[8px] font-bold">
                      {h}%
                    </div>
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
