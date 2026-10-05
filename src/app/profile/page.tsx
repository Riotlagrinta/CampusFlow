'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion, useInView } from 'framer-motion';
import { Trophy, Target, Flame, BookOpen, Loader2, Camera, Brain } from 'lucide-react';
import { cn, fadeUp } from '@/lib/utils';
import { useSound } from '@/hooks/useSound';
import { TiltCard } from '@/components/TiltCard';
import { isPaymentsEnabled } from '@/lib/payments';
import { useRef } from 'react';

type UserData = {
  firstName: string; lastName: string; bio: string | null; image: string | null;
  xp: number; level: number; streak: number; rank: number | null; aiBonusRequests: number;
  referralCode: string; averageScore: number; quizAttemptsCount: number;
  badges: { badge: { id: string; name: string; icon: string; slug: string; description: string } }[];
};
interface LeaderboardUser { id: string; firstName: string; lastName: string; xp: number; }
interface Transaction { id: string; packName: string; amount: number; createdAt: string; status: string; }

export default function ProfilePage() {
  const router = useRouter();
  const { status } = useSession();
  const { play } = useSound();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const statsRef = useRef(null);
  const statsInView = useInView(statsRef, { once: true });

  const fetchProfileData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [lbRes, txRes, statsRes] = await Promise.all([
        fetch('/api/leaderboard'),
        // Historique des achats : inutile (et masqué) tant que les paiements sont désactivés.
        isPaymentsEnabled() ? fetch('/api/user/transactions') : Promise.resolve(null),
        fetch('/api/user/stats'),
      ]);

      // Le profil est indispensable ; classement et achats sont secondaires.
      if (!statsRes.ok) throw new Error(`stats ${statsRes.status}`);
      const data = await statsRes.json();
      setUserData({
        firstName: data.firstName, lastName: data.lastName, bio: data.bio, image: data.image,
        xp: data.xp, level: data.level, streak: data.streak, rank: data.rank,
        aiBonusRequests: data.aiBonusRequests || 0, referralCode: data.referralCode,
        averageScore: data.averageScore, quizAttemptsCount: data.quizAttemptsCount, badges: data.badges
      });

      const lbData = lbRes.ok ? await lbRes.json().catch(() => null) : null;
      setLeaderboard(Array.isArray(lbData) ? lbData : []);
      const txData = txRes?.ok ? await txRes.json().catch(() => null) : null;
      setTransactions(Array.isArray(txData) ? txData : []);
    } catch (error) {
      console.error('Erreur chargement profil:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Garde d'accès : la session NextAuth fait foi (plus de localStorage.user).
  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated') fetchProfileData();
  }, [status, router, fetchProfileData]);

  const copyReferral = () => {
    if (!userData?.referralCode) return;
    navigator.clipboard.writeText(`${window.location.origin}/register?ref=${userData.referralCode}`);
    setIsCopied(true); play('xp');
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (loading || status === 'loading') return (
    <div className="flex justify-center py-20">
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
        <Loader2 className="text-blue-600" size={40} />
      </motion.div>
    </div>
  );

  if (loadError || !userData) return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <p className="text-sm text-zinc-500">Impossible de charger votre profil.</p>
      <button type="button" onClick={fetchProfileData}
        className="px-4 py-2 bg-zinc-900 dark:bg-blue-600 text-white rounded-xl text-sm font-bold hover:opacity-90 transition-all">
        Réessayer
      </button>
    </div>
  );

  const xpCurrentLevel = userData ? userData.xp % 500 : 0;
  const progressPercent = (xpCurrentLevel / 500) * 100;

  return (
    <div className="max-w-6xl mx-auto space-y-8 md:space-y-12 pb-20 px-2 md:px-0 overflow-x-hidden">

      {/* Ambient blobs */}
      <motion.div className="fixed top-10 right-20 w-96 h-96 bg-blue-500/5 rounded-full blur-[150px] -z-10 pointer-events-none"
        animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 8, repeat: Infinity }} />

      {/* Profile Header */}
      <motion.div {...fadeUp()} className="card-pro p-6 md:p-8 bg-zinc-900 text-white overflow-hidden relative rounded-[2rem]">
        <motion.div
          className="absolute top-0 right-0 w-80 h-80 bg-blue-600/10 blur-[80px] pointer-events-none"
          animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 6, repeat: Infinity }}
        />
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-6 md:gap-10">
          <motion.div whileHover={{ scale: 1.05 }} className="relative group cursor-pointer">
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl bg-zinc-800 border border-white/10 flex items-center justify-center text-3xl md:text-4xl shadow-2xl overflow-hidden relative">
              {userData?.image ? <Image src={userData.image} alt="Profile" width={128} height={128} className="w-full h-full object-cover" /> : "👨‍💻"}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera size={20} className="text-white" />
              </div>
            </div>
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.4, type: 'spring' }}
              className="absolute -bottom-2 -right-2 px-3 py-1 bg-blue-600 rounded-lg text-[10px] font-black uppercase"
            >
              LVL {userData?.level || 1}
            </motion.div>
          </motion.div>

          <div className="space-y-3 text-center md:text-left flex-1 min-w-0">
            <motion.h1 {...fadeUp(0.1)} className="text-2xl md:text-3xl font-bold tracking-tight truncate">
              {userData?.firstName} {userData?.lastName}
            </motion.h1>
            <p className="text-zinc-400 text-xs md:text-sm max-w-xl line-clamp-2 italic">{userData?.bio || "Aucune bio."}</p>
            <div className="flex flex-wrap gap-2 justify-center md:justify-start pt-1">
              {[
                { label: `${userData?.aiBonusRequests} Jetons IA`, color: 'blue', icon: <Brain size={10} className="text-blue-400" /> },
              ].map((b, i) => (
                <motion.span key={i} whileHover={{ scale: 1.05 }}
                  className="px-2 py-0.5 bg-white/5 border border-white/10 text-zinc-400 rounded text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                  {b.icon} {b.label}
                </motion.span>
              ))}
              <motion.button whileHover={{ scale: 1.05 }} onClick={copyReferral}
                className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 hover:bg-emerald-500/20 transition-all">
                <Target size={10} /> {isCopied ? 'Lien copié !' : `Parrainer (${userData?.referralCode})`}
              </motion.button>
              <motion.button whileHover={{ scale: 1.05 }}
                className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                <Flame size={10} /> {userData?.streak || 0} Jours
              </motion.button>
            </div>
          </div>

          <div className="w-full md:w-auto flex flex-col items-center md:items-end gap-1 pt-4 md:pt-0 border-t border-white/5 md:border-none">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">XP TOTALE</span>
            <motion.div
              className="text-3xl md:text-4xl font-black tracking-tighter"
              initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, type: 'spring' }}
            >
              {userData?.xp.toLocaleString()}
            </motion.div>
            <div className="w-full md:w-48 h-1.5 bg-white/5 rounded-full overflow-hidden mt-2">
              <motion.div initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} transition={{ duration: 1.2, ease: 'easeOut', delay: 0.5 }} className="h-full bg-blue-600" />
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 px-2 md:px-0">
        <div className="lg:col-span-2 space-y-10">

          {/* Stats */}
          <section className="space-y-4" ref={statsRef}>
            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-[0.2em] ml-2">Analytiques</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: 'Quizz', value: userData?.quizAttemptsCount || 0, icon: BookOpen },
                { label: 'Score Moyen', value: `${userData?.averageScore || 0}%`, icon: Target },
                { label: 'Rang', value: userData?.rank != null ? `#${userData.rank}` : '–', icon: Trophy },
              ].map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  animate={statsInView ? { opacity: 1, y: 0, scale: 1 } : {}}
                  transition={{ delay: i * 0.1, type: 'spring', stiffness: 100 }}
                >
                  <TiltCard className="card-pro p-6 flex flex-col gap-4 cursor-default">
                    <motion.div whileHover={{ rotate: 10 }}>
                      <stat.icon className="text-zinc-400" size={16} />
                    </motion.div>
                    <div>
                      <h3 className="text-2xl font-bold">{stat.value}</h3>
                      <p className="text-[10px] font-bold text-zinc-500 uppercase">{stat.label}</p>
                    </div>
                  </TiltCard>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Transactions : section masquée tant que les paiements sont désactivés (freemium). */}
          {isPaymentsEnabled() && (
          <motion.section {...fadeUp(0.3)} className="space-y-4">
            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-[0.2em] ml-2">Historique des achats</h2>
            <div className="card-pro overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 font-bold uppercase text-[10px]">
                    <tr><th className="px-6 py-4">Pack</th><th className="px-6 py-4">Montant</th><th className="px-6 py-4">Date</th><th className="px-6 py-4 text-right">Statut</th></tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                    {transactions.map((t, i) => (
                      <motion.tr key={t.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                        className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                        <td className="px-6 py-4 font-bold">{t.packName}</td>
                        <td className="px-6 py-4">{t.amount} FCFA</td>
                        <td className="px-6 py-4 text-zinc-500 text-xs">{new Date(t.createdAt).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-right">
                          <span className={cn("px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
                            t.status === 'COMPLETED' ? "bg-emerald-500/10 text-emerald-500" :
                            t.status === 'FAILED' ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-500"
                          )}>
                            {t.status === 'COMPLETED' ? 'Validé' : t.status === 'FAILED' ? 'Échoué' : 'En attente'}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                    {transactions.length === 0 && (
                      <tr><td colSpan={4} className="px-6 py-10 text-center text-zinc-400 italic">Aucun achat effectué.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.section>
          )}
        </div>

        {/* Leaderboard */}
        <motion.section {...fadeUp(0.2)} className="space-y-4">
          <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-[0.2em] ml-2">Top Promotion</h2>
          <div className="card-pro overflow-hidden">
            {leaderboard.map((u, i) => (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                whileHover={{ x: 4 }}
                className={cn("flex items-center gap-4 p-4 transition-colors", i === 0 && "bg-blue-50/30 dark:bg-blue-900/10")}
              >
                <span className="text-xs font-black text-zinc-400">0{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{u.firstName} {u.lastName?.charAt(0)}.</p>
                  <p className="text-[10px] text-zinc-500">{u.xp.toLocaleString()} XP</p>
                </div>
                {i === 0 && <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity, delay: 1 }}><Trophy size={14} className="text-amber-500" /></motion.div>}
              </motion.div>
            ))}
          </div>
        </motion.section>
      </div>
    </div>
  );
}
