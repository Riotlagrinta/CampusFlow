'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, useScroll, useTransform, useSpring, useMotionValue, useInView } from 'framer-motion';
import {
  Zap,
  BookOpen,
  ArrowUpRight,
  Activity,
  ArrowRight,
  Calendar,
  Award,
  Loader2,
  Shield,
  Sparkles,
  Bot,
  Brain
} from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { LucideIcon } from 'lucide-react';

const Scene3D = dynamic(() => import('@/components/Scene3D'), { ssr: false });

interface DashboardStat {
  label: string;
  value: string | number;
  icon: string;
  trend: string;
}

interface ActivityItem {
  title: string;
  date: string;
  status: string;
}

interface NextCourse {
  title: string;
  time: string;
  teacher: string;
}

interface DashboardData {
  stats: DashboardStat[];
  activities: ActivityItem[];
  nextCourse: NextCourse | null;
  role: string;
  isSubscribed: boolean;
  subscriptionExpiresAt: string;
}

const ICON_MAP: Record<string, LucideIcon> = {
  Activity,
  BookOpen,
  Zap,
  Award
};

// Animated counter hook
function useCountUp(target: number, inView: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const duration = 1200;
    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      setCount(Math.floor(progress * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, target]);
  return count;
}

// 3D tilt card
function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [8, -8]), { stiffness: 200, damping: 25 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-8, 8]), { stiffness: 200, damping: 25 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { x.set(0); y.set(0); }}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function StatCounter({ label, value, suffix, inView }: { label: string; value: number; suffix: string; inView: boolean }) {
  const count = useCountUp(value, inView);
  return (
    <div className="card-pro p-6 text-center space-y-1">
      <p className="text-3xl font-black text-blue-600">{count}{suffix}</p>
      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{label}</p>
    </div>
  );
}

const FEATURES = [
  { icon: Bot, title: "Professeur IA", desc: "Posez vos questions à l'IA et obtenez des explications pédagogiques basées sur vos cours.", color: "blue" },
  { icon: Brain, title: "Quizz Dynamiques", desc: "Entraînez-vous avec des tests générés par l'IA. Fonctionnalité en cours de développement.", color: "purple", soon: true },
  { icon: Award, title: "Gamification", desc: "Gagnez de l'XP, débloquez des badges et gravissez les échelons du classement.", color: "amber" }
];

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-500/10 border-blue-500/20 text-blue-600',
  purple: 'bg-purple-500/10 border-purple-500/20 text-purple-600',
  amber: 'bg-amber-500/10 border-amber-500/20 text-amber-600',
};

export default function Home() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const heroRef = useRef(null);
  const statsRef = useRef(null);
  const statsInView = useInView(statsRef, { once: true });
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 400], [0, -80]);
  const heroOpacity = useTransform(scrollY, [0, 300], [1, 0.3]);

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
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        >
          <Loader2 className="text-blue-600" size={40} />
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="text-xs font-bold text-zinc-400 uppercase tracking-widest"
        >
          Chargement...
        </motion.p>
      </div>
    );
  }

  // --- LANDING PAGE ---
  if (!session) {
    return (
      <div className="max-w-6xl mx-auto space-y-32 py-20 px-4 overflow-x-hidden">

        {/* Hero */}
        <section className="relative min-h-[80vh] flex flex-col md:flex-row items-center gap-10" ref={heroRef}>
          {/* Ambient blobs */}
          <motion.div
            className="absolute top-0 left-1/4 w-80 h-80 bg-blue-600/15 rounded-full blur-[120px] -z-10"
            animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute bottom-0 right-1/4 w-64 h-64 bg-purple-600/10 rounded-full blur-[100px] -z-10"
            animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          />

          {/* Text side */}
          <motion.div style={{ y: heroY, opacity: heroOpacity }} className="flex-1 space-y-8 z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-600 rounded-full text-xs font-black uppercase tracking-widest"
            >
              <motion.span animate={{ rotate: [0, 15, -15, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 1 }}>
                <Sparkles size={14} />
              </motion.span>
              La nouvelle ère de l&apos;apprentissage
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, type: 'spring', stiffness: 80 }}
              className="text-5xl md:text-8xl font-black tracking-tighter text-zinc-900 dark:text-white leading-[0.9]"
            >
              DefiTech <br />
              <span className="relative inline-block">
                <span className="text-blue-600">Student Hub.</span>
                <motion.span
                  className="absolute -bottom-2 left-0 h-1 bg-blue-600 rounded-full"
                  initial={{ width: 0 }} animate={{ width: '100%' }}
                  transition={{ delay: 0.8, duration: 0.8, ease: 'easeOut' }}
                />
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="text-base md:text-lg text-zinc-500 max-w-xl leading-relaxed"
            >
              La plateforme tout-en-un pour les étudiants de DEFITECH.
              Centralisez vos cours, testez vos connaissances avec l&apos;IA et dominez le classement.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <Link href="/login">
                <motion.span
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-bold shadow-xl shadow-zinc-500/20 text-sm cursor-pointer"
                >
                  Se connecter <ArrowRight size={18} />
                </motion.span>
              </Link>
              <Link href="/register">
                <motion.span
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-sm cursor-pointer"
                >
                  Créer un compte
                </motion.span>
              </Link>
            </motion.div>
          </motion.div>

          {/* 3D Scene side */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 1, ease: 'easeOut' }}
            className="flex-1 flex items-center justify-center"
          >
            <Scene3D className="w-full h-[420px] md:h-[520px]" />
          </motion.div>
        </section>

        {/* Stats bar */}
        <motion.section
          ref={statsRef}
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid grid-cols-3 gap-4"
        >
          {[
            { label: 'Étudiants actifs', value: 20, suffix: '+' },
            { label: 'Ressources disponibles', value: 150, suffix: '+' },
            { label: 'Questions IA répondues', value: 1200, suffix: '+' },
          ].map((s, i) => (
            <StatCounter key={i} label={s.label} value={s.value} suffix={s.suffix} inView={statsInView} />
          ))}
        </motion.section>

        {/* Features Grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.12, type: 'spring', stiffness: 80 }}
            >
              <TiltCard className={cn("card-pro p-6 md:p-8 space-y-4 text-center relative cursor-default h-full", f.soon && "opacity-75")}>
                {f.soon && (
                  <div className="absolute top-4 right-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 text-[8px] font-black uppercase px-2 py-1 rounded-full border border-zinc-200 dark:border-zinc-700">À venir</div>
                )}
                <motion.div
                  whileHover={{ scale: 1.15, rotate: 5 }}
                  className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mx-auto border", COLOR_MAP[f.color])}
                  style={{ transform: 'translateZ(20px)' }}
                >
                  <f.icon size={26} />
                </motion.div>
                <h3 className="text-lg md:text-xl font-bold" style={{ transform: 'translateZ(10px)' }}>{f.title}</h3>
                <p className="text-xs md:text-sm text-zinc-500 leading-relaxed">{f.desc}</p>
              </TiltCard>
            </motion.div>
          ))}
        </section>

        {/* Community Proof */}
        <motion.section
          initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="card-pro p-8 md:p-12 bg-blue-600 text-white text-center space-y-6 overflow-hidden relative rounded-[2rem]"
        >
          <motion.div
            className="absolute top-0 right-0 w-72 h-72 bg-white/10 blur-[80px] -rotate-45 translate-x-32"
            animate={{ rotate: [-45, -35, -45], scale: [1, 1.1, 1] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="relative z-10 space-y-6">
            <motion.h2
              initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }}
              className="text-2xl md:text-3xl font-black"
            >
              Rejoignez vos camarades
            </motion.h2>
            <p className="text-blue-100 text-sm md:text-base">Plus de 20 étudiants déjà actifs sur la plateforme.</p>
            <div className="flex justify-center -space-x-4">
              {[1, 2, 3, 4, 5].map(i => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  whileHover={{ y: -6, zIndex: 10 }}
                  className="w-10 h-10 md:w-12 md:h-12 rounded-full border-4 border-blue-600 bg-zinc-800 flex items-center justify-center font-bold text-[10px] md:text-xs relative"
                >
                  {String.fromCharCode(64 + i)}
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>
      </div>
    );
  }

  // --- DASHBOARD (Connecté) ---
  return (
    <div className="max-w-6xl mx-auto space-y-8 md:space-y-12 py-4 px-2 md:px-0">

      <motion.div
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-4"
      >
        <div className="flex items-center gap-2 text-[10px] md:text-sm font-medium">
          <span className="text-zinc-400">Dashboard</span>
          <span className="text-zinc-300 dark:text-zinc-700">/</span>
          <span className="text-zinc-900 dark:text-zinc-100">Vue d&apos;ensemble</span>
        </div>
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
          className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded self-start md:self-auto"
        >
          Système Synchrone
        </motion.span>
      </motion.div>

      {/* Hero greeting */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 px-4">
        <motion.div
          initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
          className="md:col-span-2 space-y-2"
        >
          <h1 className="text-2xl md:text-5xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 leading-tight">
            Bienvenue,{' '}
            <motion.span
              className="text-blue-600 font-black inline-block"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 120 }}
            >
              {session.user?.name?.split(' ')[0] || 'Étudiant'}.
            </motion.span>
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm md:text-lg font-medium">
            Voici l&apos;état de votre progression académique aujourd&apos;hui.
          </p>
        </motion.div>
      </div>

      {/* Stats Cards with 3D tilt */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 px-4">
        {data?.stats.map((stat, i) => {
          const Icon = ICON_MAP[stat.icon] || Activity;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.85, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: i * 0.1, type: 'spring', stiffness: 120 }}
            >
              <TiltCard className="glass-card p-4 md:p-6 space-y-2 md:space-y-3 cursor-default">
                <div className="flex items-center justify-between text-zinc-400">
                  <motion.div whileHover={{ scale: 1.2, rotate: 10 }}>
                    <Icon size={14} className="md:w-[20px] md:h-[20px] text-blue-600" />
                  </motion.div>
                  <span className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-blue-500/70">{stat.trend}</span>
                </div>
                <div>
                  <p className="text-[9px] md:text-[10px] font-black text-zinc-500 uppercase tracking-tighter mb-1">{stat.label}</p>
                  <motion.h3
                    className="text-base md:text-3xl font-black tracking-tighter"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 + i * 0.1 }}
                  >
                    {stat.value}
                  </motion.h3>
                </div>
              </TiltCard>
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
              {data && data.activities.length > 0 ? data.activities.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06, type: 'spring', stiffness: 100 }}
                  whileHover={{ x: 4 }}
                  className="glass-card p-4 flex items-center justify-between group cursor-pointer gap-4"
                >
                  <div className="flex items-center gap-4 overflow-hidden">
                    <motion.div
                      className="w-1.5 h-10 rounded-full bg-blue-600/20 shrink-0"
                      whileHover={{ backgroundColor: '#2563eb' }}
                    />
                    <div className="overflow-hidden">
                      <h4 className="text-xs md:text-sm font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-blue-600 transition-colors truncate">{item.title}</h4>
                      <p className="text-[9px] font-medium text-zinc-500 mt-1 uppercase tracking-wider">{item.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="hidden md:inline text-[9px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded">{item.status}</span>
                    <motion.div whileHover={{ x: 3 }}>
                      <ArrowRight size={14} className="text-zinc-300 dark:text-zinc-700 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors" />
                    </motion.div>
                  </div>
                </motion.div>
              )) : (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="p-16 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-900 rounded-[2rem] text-zinc-400 text-xs md:text-sm font-medium"
                >
                  Aucune activité récente pour le moment.
                </motion.div>
              )}
            </div>
          </section>

          {/* AI Hero Widget */}
          <motion.section
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            whileHover={{ scale: 1.01 }}
            className="glass-card p-6 md:p-10 bg-gradient-to-br from-zinc-900 to-zinc-800 dark:from-zinc-950 dark:to-zinc-900 text-white overflow-hidden relative rounded-[2.5rem]"
          >
            <motion.div
              className="absolute right-[-10%] top-[-10%] w-64 h-64 bg-blue-600/10 blur-[80px] pointer-events-none rounded-full"
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div className="relative z-10 space-y-6">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded-full text-[10px] font-black uppercase tracking-widest">
                  <Sparkles size={12} /> Recommandation IA
                </div>
                <h3 className="text-xl md:text-3xl font-black tracking-tighter leading-tight">
                  Optimisez votre <br /> temps de révision.
                </h3>
                <p className="text-zinc-400 text-xs md:text-sm max-w-sm font-medium">
                  L&apos;IA a analysé vos derniers scores et suggère de revoir le module d&apos;algorithmique.
                </p>
              </div>
              <motion.button
                whileHover={{ x: 4 }}
                className="flex items-center gap-2 text-xs md:text-sm font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors"
              >
                Détails assistant <ArrowUpRight size={18} />
              </motion.button>
            </div>
            <motion.div
              animate={{ rotate: [0, 5, -5, 0], opacity: [0.08, 0.13, 0.08] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Bot className="absolute right-10 bottom-10" size={120} />
            </motion.div>
          </motion.section>
        </div>

        {/* Sidebar Widgets */}
        <div className="space-y-8">
          <motion.section
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
            className="space-y-4"
          >
            <h2 className="text-[10px] md:text-sm font-black text-zinc-400 uppercase tracking-[0.3em]">Abonnement</h2>
            <div className={cn(
              "glass-card p-6 rounded-[2rem] border-2 transition-all duration-500",
              data?.role === "ADMIN" ? "border-purple-500/20 bg-purple-500/5" :
                data?.isSubscribed ? "border-emerald-500/20 bg-emerald-500/5" : "border-blue-500/20 bg-blue-500/5"
            )}>
              <div className="flex items-center gap-4 mb-4">
                <motion.div
                  whileHover={{ rotate: 15 }}
                  className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center border",
                    data?.role === "ADMIN" ? "bg-purple-500/10 border-purple-500/20 text-purple-600" :
                      data?.isSubscribed ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600" : "bg-blue-500/10 border-blue-500/20 text-blue-600"
                  )}
                >
                  <Shield size={24} />
                </motion.div>
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
                    <motion.div initial={{ width: 0 }} animate={{ width: '65%' }} transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }} className="h-full bg-emerald-500" />
                  </div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex justify-between">
                    <span>Expire le</span>
                    <span className="text-zinc-900 dark:text-zinc-100">{new Date(data.subscriptionExpiresAt).toLocaleDateString()}</span>
                  </p>
                </div>
              ) : (
                <Link href="/subscribe">
                  <motion.span
                    whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    className="w-full py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer"
                  >
                    Passer au pro <Zap size={14} fill="currentColor" />
                  </motion.span>
                </Link>
              )}
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
            className="space-y-4"
          >
            <h2 className="text-[10px] md:text-sm font-black text-zinc-400 uppercase tracking-[0.3em]">Prochain cours</h2>
            <div className="glass-card p-6 rounded-[2rem]">
              {data?.nextCourse ? (
                <>
                  <div className="flex justify-between items-start mb-6">
                    <motion.div whileHover={{ rotate: 10 }} className="w-10 h-10 bg-white dark:bg-zinc-800 rounded-2xl flex items-center justify-center border border-zinc-100 dark:border-zinc-700 shadow-sm">
                      <Calendar size={20} className="text-blue-600" />
                    </motion.div>
                    <span className="text-[10px] font-black text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-full uppercase tracking-widest">Aujourd&apos;hui</span>
                  </div>
                  <h4 className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50 truncate">{data.nextCourse.title}</h4>
                  <p className="text-xs text-zinc-500 font-medium mt-1 uppercase tracking-wider">{data.nextCourse.time} • M. {data.nextCourse.teacher}</p>
                  <div className="mt-8">
                    <motion.button
                      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      className="w-full py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                    >
                      Détails
                    </motion.button>
                  </div>
                </>
              ) : (
                <div className="text-center py-6 space-y-2">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Pas de cours prévu</p>
                  <p className="text-[9px] text-zinc-500 font-medium underline">Consulter l&apos;emploi du temps complet</p>
                </div>
              )}
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
            className="space-y-4"
          >
            <h2 className="text-[10px] md:text-sm font-black text-zinc-400 uppercase tracking-[0.3em]">Usage IA</h2>
            <div className="glass-card p-6 rounded-[2rem]">
              <p className="text-[10px] font-black text-zinc-500 mb-6 uppercase tracking-widest">Utilisation (7 derniers jours)</p>
              <div className="h-24 md:h-32 flex items-end gap-2 md:gap-3">
                {[20, 30, 45, 10, 65, 30, 55].map((h, i) => (
                  <div key={i} className="flex-1 bg-zinc-50 dark:bg-zinc-900 rounded-t-lg relative group">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${h}%` }}
                      transition={{ delay: 0.5 + i * 0.07, duration: 0.6, ease: 'easeOut' }}
                      className={`w-full rounded-t-lg ${i === 6 ? 'bg-gradient-to-t from-blue-700 to-blue-400' : 'bg-zinc-200 dark:bg-zinc-800 group-hover:bg-blue-400/50 transition-colors'}`}
                    />
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 text-white px-2 py-0.5 rounded text-[8px] font-bold">
                      {h}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>
        </div>

      </div>
    </div>
  );
}
