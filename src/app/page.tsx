'use client';

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { motion, useScroll, useTransform, useInView, useReducedMotion } from 'framer-motion';
import {
  Zap,
  BookOpen,
  Activity,
  ArrowRight,
  Calendar,
  Award,
  Loader2,
  Shield,
  Sparkles,
  Bot,
  Brain,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { TiltCard } from '@/components/TiltCard';
import { isPremium } from '@/lib/subscription';
import { isPaymentsEnabled } from '@/lib/payments';

// Scène three.js : chunk séparé (three + drei), chargé uniquement si la landing l'affiche vraiment.
const Scene3D = dynamic(() => import('@/components/Scene3D'), {
  ssr: false,
  loading: () => <SceneFallback className="w-full h-[420px] md:h-[520px]" />,
});

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
  subscriptionExpiresAt: string | null;
  /** Calculés à la réception des données (pas pendant le rendu). */
  premiumActive: boolean;
  daysLeft: number;
}

// Forme tolérante : l'API peut renvoyer `limit` (contrat) ou `total` (ancienne forme).
interface QuotaData {
  used?: number;
  limit?: number;
  total?: number;
  bonus?: number;
  remaining?: number;
}

const ICON_MAP: Record<string, LucideIcon> = {
  Activity,
  BookOpen,
  Zap,
  Award
};

// Media query réactive, sûre pour l'hydratation (valeur serveur fixe, puis valeur réelle du navigateur).
function useMediaQuery(query: string, serverValue = false) {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

// Animated counter hook
function useCountUp(target: number, inView: boolean, instant: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (instant) {
      const id = requestAnimationFrame(() => setCount(target));
      return () => cancelAnimationFrame(id);
    }
    let frame = 0;
    let start = 0;
    const duration = 1200;
    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      setCount(Math.floor(progress * target));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [inView, target, instant]);
  return count;
}

function StatCounter({ label, value, suffix, inView }: { label: string; value: number; suffix: string; inView: boolean }) {
  const reduceMotion = useReducedMotion();
  const count = useCountUp(value, inView, !!reduceMotion);
  return (
    <div className="card-pro p-6 text-center space-y-1">
      <p className="text-3xl font-black text-blue-600">{count}{suffix}</p>
      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{label}</p>
    </div>
  );
}

// Visuel de remplacement de la scène 3D : mobiles, mouvement réduit, chargement.
function SceneFallback({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-48 w-48 rounded-full bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 opacity-80 blur-sm md:h-72 md:w-72" />
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: Bot, title: "Professeur IA", desc: "Posez vos questions à l'IA et obtenez des explications pédagogiques basées sur vos cours.", color: "blue" },
  { icon: Brain, title: "Quizz Dynamiques", desc: "Entraînez-vous avec des quiz par matière, dont certains générés par l'IA à partir de vos cours.", color: "purple" },
  { icon: Award, title: "Gamification", desc: "Gagnez de l'XP, débloquez des badges et gravissez les échelons du classement.", color: "amber" }
];

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-500/10 border-blue-500/20 text-blue-600',
  purple: 'bg-purple-500/10 border-purple-500/20 text-purple-600',
  amber: 'bg-amber-500/10 border-amber-500/20 text-amber-600',
};

function LoadingScreen() {
  return (
    <div role="status" className="flex flex-col items-center justify-center py-40 gap-4">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
      >
        <Loader2 className="text-blue-600" size={40} aria-hidden="true" />
      </motion.div>
      <motion.p
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
        className="text-xs font-bold text-zinc-500 uppercase tracking-widest"
      >
        Chargement...
      </motion.p>
    </div>
  );
}

// --- LANDING PAGE (visiteurs non connectés) ---
function Landing() {
  const heroRef = useRef(null);
  const statsRef = useRef(null);
  const statsInView = useInView(statsRef, { once: true });
  const reduceMotion = useReducedMotion();
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 400], [0, -80]);
  const heroOpacity = useTransform(scrollY, [0, 300], [1, 0.3]);

  // Scène 3D réservée aux écrans larges et aux visiteurs qui n'ont pas demandé moins de mouvement.
  const isWide = useMediaQuery('(min-width: 768px)');
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const show3D = isWide && !prefersReducedMotion;

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
        <motion.div style={reduceMotion ? undefined : { y: heroY, opacity: heroOpacity }} className="flex-1 space-y-8 z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-600 rounded-full text-xs font-black uppercase tracking-widest"
          >
            <motion.span animate={{ rotate: [0, 15, -15, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 1 }}>
              <Sparkles size={14} aria-hidden="true" />
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
                Se connecter <ArrowRight size={18} aria-hidden="true" />
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
          className="flex-1 flex items-center justify-center w-full"
        >
          {show3D ? (
            <Scene3D className="w-full h-[420px] md:h-[520px]" />
          ) : (
            <SceneFallback className="w-full h-56 md:h-[520px]" />
          )}
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
        ].map((s) => (
          <StatCounter key={s.label} label={s.label} value={s.value} suffix={s.suffix} inView={statsInView} />
        ))}
      </motion.section>

      {/* Features Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ delay: i * 0.12, type: 'spring', stiffness: 80 }}
          >
            <TiltCard className="card-pro p-6 md:p-8 space-y-4 text-center relative cursor-default h-full">
              <motion.div
                whileHover={{ scale: 1.15, rotate: 5 }}
                className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mx-auto border", COLOR_MAP[f.color])}
                style={{ transform: 'translateZ(20px)' }}
              >
                <f.icon size={26} aria-hidden="true" />
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
          <div className="flex justify-center -space-x-4" aria-hidden="true">
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

// --- DASHBOARD (utilisateur connecté) ---
function Dashboard({ firstName }: { firstName: string }) {
  const paymentsEnabled = isPaymentsEnabled();
  const [data, setData] = useState<DashboardData | null>(null);
  const [quota, setQuota] = useState<QuotaData | null>(null);
  const [quotaFailed, setQuotaFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch('/api/user/dashboard-stats', { signal: controller.signal });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json || json.error) throw new Error('dashboard-stats');

        const expiresAt: string | null = json.subscriptionExpiresAt ?? null;
        const expires = expiresAt ? new Date(expiresAt) : null;
        const premiumActive = isPremium({ isSubscribed: !!json.isSubscribed, subscriptionExpiresAt: expires });
        const daysLeft = expires ? Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 86_400_000)) : 0;

        setData({ ...json, stats: json.stats ?? [], activities: json.activities ?? [], subscriptionExpiresAt: expiresAt, premiumActive, daysLeft });
        setFailed(false);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    (async () => {
      try {
        const res = await fetch('/api/user/ai-quota', { signal: controller.signal });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json || json.error) throw new Error('ai-quota');
        setQuota(json);
        setQuotaFailed(false);
      } catch {
        if (!controller.signal.aborted) setQuotaFailed(true);
      }
    })();

    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => {
    setLoading(true);
    setFailed(false);
    setQuotaFailed(false);
    setAttempt((value) => value + 1);
  }, []);

  if (loading) return <LoadingScreen />;

  const quotaCapacity = quota ? (quota.limit !== undefined ? quota.limit + (quota.bonus ?? 0) : quota.total) : undefined;
  const quotaUsed = quota?.used ?? 0;
  const quotaRemaining = quota ? (quota.remaining ?? (quotaCapacity !== undefined ? Math.max(0, quotaCapacity - quotaUsed) : undefined)) : undefined;
  const quotaPercent = quotaCapacity && quotaRemaining !== undefined ? Math.min(100, Math.round((quotaRemaining / quotaCapacity) * 100)) : 0;

  return (
    <div className="max-w-6xl mx-auto space-y-8 md:space-y-12 py-4 px-2 md:px-0">

      <motion.div
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-4"
      >
        <div className="flex items-center gap-2 text-[10px] md:text-sm font-medium">
          <span className="text-zinc-500">Dashboard</span>
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

      {failed && (
        <div role="alert" className="mx-4 flex flex-col gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium">Impossible de charger vos statistiques pour le moment.</p>
          <button
            type="button"
            onClick={retry}
            className="min-h-10 rounded-xl bg-red-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white hover:bg-red-700"
          >
            Réessayer
          </button>
        </div>
      )}

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
              {firstName}.
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
              key={stat.label}
              initial={{ opacity: 0, scale: 0.85, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: i * 0.1, type: 'spring', stiffness: 120 }}
            >
              <TiltCard className="glass-card p-4 md:p-6 space-y-2 md:space-y-3 cursor-default">
                <div className="flex items-center justify-between text-zinc-400">
                  <motion.div whileHover={{ scale: 1.2, rotate: 10 }}>
                    <Icon size={14} aria-hidden="true" className="md:w-[20px] md:h-[20px] text-blue-600" />
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
            <h2 className="text-[10px] md:text-sm font-black text-zinc-500 uppercase tracking-[0.3em]">Activités Récentes</h2>
            <div className="space-y-3">
              {data && data.activities.length > 0 ? data.activities.map((item, i) => (
                <motion.div
                  key={`${item.title}-${i}`}
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06, type: 'spring', stiffness: 100 }}
                  whileHover={{ x: 4 }}
                  className="glass-card p-4 flex items-center justify-between group gap-4"
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
                    <span className="hidden md:inline text-[9px] font-black text-zinc-500 uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded">{item.status}</span>
                  </div>
                </motion.div>
              )) : (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="p-16 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-900 rounded-[2rem] text-zinc-500 text-xs md:text-sm font-medium"
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
                  <Sparkles size={12} aria-hidden="true" /> Assistant IA
                </div>
                <h3 className="text-xl md:text-3xl font-black tracking-tighter leading-tight">
                  Optimisez votre <br /> temps de révision.
                </h3>
                <p className="text-zinc-400 text-xs md:text-sm max-w-sm font-medium">
                  Posez vos questions à l&apos;assistant, demandez un résumé de cours ou un exercice d&apos;entraînement.
                </p>
              </div>
              <Link
                href="/ai-assistant"
                className="inline-flex min-h-10 items-center gap-2 text-xs md:text-sm font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors"
              >
                Ouvrir l&apos;assistant <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
            <motion.div
              aria-hidden="true"
              animate={{ rotate: [0, 5, -5, 0], opacity: [0.08, 0.13, 0.08] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Bot className="absolute right-10 bottom-10" size={120} />
            </motion.div>
          </motion.section>
        </div>

        {/* Sidebar Widgets */}
        <div className="space-y-8">
          {/* Bloc abonnement / Premium : masqué tant que les paiements sont désactivés (freemium). */}
          {data && paymentsEnabled && (
            <motion.section
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
              className="space-y-4"
            >
              <h2 className="text-[10px] md:text-sm font-black text-zinc-500 uppercase tracking-[0.3em]">Abonnement</h2>
              <div className={cn(
                "glass-card p-6 rounded-[2rem] border-2 transition-all duration-500",
                data.role === "ADMIN" ? "border-purple-500/20 bg-purple-500/5" :
                  data.premiumActive ? "border-emerald-500/20 bg-emerald-500/5" : "border-blue-500/20 bg-blue-500/5"
              )}>
                <div className="flex items-center gap-4 mb-4">
                  <motion.div
                    whileHover={{ rotate: 15 }}
                    className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center border",
                      data.role === "ADMIN" ? "bg-purple-500/10 border-purple-500/20 text-purple-600" :
                        data.premiumActive ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600" : "bg-blue-500/10 border-blue-500/20 text-blue-600"
                    )}
                  >
                    <Shield size={24} aria-hidden="true" />
                  </motion.div>
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-tight">
                      {data.role === "ADMIN" ? 'Status VIP / Admin' : data.premiumActive ? 'Status Premium' : 'Status Gratuit'}
                    </h4>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                      {data.role === "ADMIN" ? 'Accès Illimité (Dieu)' : data.premiumActive ? 'Accès Illimité' : 'Accès Limité'}
                    </p>
                  </div>
                </div>

                {data.role === "ADMIN" ? (
                  <div className="py-2">
                    <p className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest italic text-center">
                      👑 Vous avez les pleins pouvoirs
                    </p>
                  </div>
                ) : data.premiumActive && data.subscriptionExpiresAt ? (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex justify-between">
                      <span>Expire le</span>
                      <span className="text-zinc-900 dark:text-zinc-100">{new Date(data.subscriptionExpiresAt).toLocaleDateString('fr-FR')}</span>
                    </p>
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest flex justify-between">
                      <span>Jours restants</span>
                      <span>{data.daysLeft}</span>
                    </p>
                  </div>
                ) : (
                  <Link href="/subscribe">
                    <motion.span
                      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      className="w-full min-h-11 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer"
                    >
                      Passer au pro <Zap size={14} fill="currentColor" aria-hidden="true" />
                    </motion.span>
                  </Link>
                )}
              </div>
            </motion.section>
          )}

          <motion.section
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
            className="space-y-4"
          >
            <h2 className="text-[10px] md:text-sm font-black text-zinc-500 uppercase tracking-[0.3em]">Prochain cours</h2>
            <div className="glass-card p-6 rounded-[2rem]">
              {data?.nextCourse ? (
                <>
                  <div className="flex justify-between items-start mb-6">
                    <motion.div whileHover={{ rotate: 10 }} className="w-10 h-10 bg-white dark:bg-zinc-800 rounded-2xl flex items-center justify-center border border-zinc-100 dark:border-zinc-700 shadow-sm">
                      <Calendar size={20} aria-hidden="true" className="text-blue-600" />
                    </motion.div>
                    <span className="text-[10px] font-black text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-full uppercase tracking-widest">Aujourd&apos;hui</span>
                  </div>
                  <h4 className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50 truncate">{data.nextCourse.title}</h4>
                  <p className="text-xs text-zinc-500 font-medium mt-1 uppercase tracking-wider">{data.nextCourse.time} • M. {data.nextCourse.teacher}</p>
                  <div className="mt-8">
                    <Link
                      href="/planning"
                      className="flex w-full min-h-11 items-center justify-center py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                    >
                      Voir le planning
                    </Link>
                  </div>
                </>
              ) : (
                <div className="text-center py-6 space-y-2">
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Pas de cours prévu</p>
                  <Link href="/planning" className="inline-block min-h-6 text-[10px] text-zinc-500 font-medium underline hover:text-blue-600">
                    Consulter l&apos;emploi du temps complet
                  </Link>
                </div>
              )}
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
            className="space-y-4"
          >
            <h2 className="text-[10px] md:text-sm font-black text-zinc-500 uppercase tracking-[0.3em]">Usage IA</h2>
            <div className="glass-card p-6 rounded-[2rem] space-y-4">
              {quota && quotaCapacity !== undefined && quotaRemaining !== undefined ? (
                <>
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Requêtes IA restantes aujourd&apos;hui</p>
                  <div className="flex items-end justify-between">
                    <p className="text-3xl font-black tracking-tighter">
                      {quotaRemaining}
                      <span className="text-base font-bold text-zinc-500"> / {quotaCapacity}</span>
                    </p>
                    {!!quota.bonus && quota.bonus > 0 && (
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">dont {quota.bonus} bonus</span>
                    )}
                  </div>
                  <div
                    role="progressbar"
                    aria-label="Requêtes IA restantes"
                    aria-valuemin={0}
                    aria-valuemax={quotaCapacity}
                    aria-valuenow={quotaRemaining}
                    className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                  >
                    <motion.div
                      initial={{ width: 0 }} animate={{ width: `${quotaPercent}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className={cn("h-full", quotaRemaining <= 2 ? "bg-amber-500" : "bg-blue-600")}
                    />
                  </div>
                  {quotaRemaining <= 2 && (
                    paymentsEnabled ? (
                      <Link href="/shop" className="inline-block min-h-6 text-[10px] font-black uppercase tracking-widest text-blue-600 underline">
                        Obtenir des requêtes supplémentaires
                      </Link>
                    ) : (
                      <p className="text-[10px] font-bold text-zinc-500 leading-relaxed">
                        Votre quota est renouvelé chaque jour. Gagnez des jetons bonus avec la publicité récompensée de l&apos;assistant ou en parrainant un camarade.
                      </p>
                    )
                  )}
                </>
              ) : (
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  {quotaFailed || quota ? 'Quota indisponible pour le moment.' : 'Chargement du quota...'}
                </p>
              )}
            </div>
          </motion.section>
        </div>

      </div>
    </div>
  );
}

export default function Home() {
  const { data: session, status } = useSession();

  if (status === 'loading') return <LoadingScreen />;
  if (!session) return <Landing />;

  return <Dashboard firstName={session.user?.name?.split(' ')[0] || 'Étudiant'} />;
}
