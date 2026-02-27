'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Trophy, 
  Target, 
  Star, 
  Award, 
  Flame, 
  ShieldCheck,
  Code,
  BookOpen,
  Globe,
  Database,
  Flag,
  Loader2,
  Edit,
  Camera,
  Brain,
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useSound } from '@/hooks/useSound';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ICON_MAP: Record<string, React.ElementType> = {
  'Code': Code,
  'Globe': Globe,
  'Database': Database,
  'Flag': Flag,
  'Star': Star,
  'ShieldCheck': ShieldCheck,
  'Award': Award,
  'Brain': Brain,
  'Flame': Flame
};

type UserData = {
  firstName: string;
  lastName: string;
  bio: string | null;
  image: string | null;
  xp: number;
  level: number;
  streak: number;
  rank: number;
  aiBonusRequests: number;
  referralCode: string;
  averageScore: number;
  quizAttemptsCount: number;
  badges: { badge: { id: string; name: string; icon: string; slug: string; description: string } }[];
};

export default function ProfilePage() {
  const { play } = useSound();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const copyReferral = () => {
    if (!userData?.referralCode) return;
    const url = `${window.location.origin}/register?ref=${userData.referralCode}`;
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    play('xp');
    setTimeout(() => setIsCopied(false), 2000);
  };
  
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', bio: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user.email) {
      window.location.href = '/login';
      return;
    }

    // 1. Récupérer le classement global
    fetch('/api/leaderboard').then(res => res.json()).then(data => { if (!data.error) setLeaderboard(data); });

    // 2. Récupérer les transactions
    fetch('/api/user/transactions').then(res => res.json()).then(data => { if (!data.error) setTransactions(data); });

    // 3. Récupérer les stats
    fetch('/api/user/stats')
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setUserData({
            firstName: data.firstName,
            lastName: data.lastName,
            bio: data.bio,
            image: data.image,
            xp: data.xp,
            level: data.level,
            streak: data.streak,
            rank: data.rank,
            aiBonusRequests: data.aiBonusRequests || 0,
            referralCode: data.referralCode,
            averageScore: data.averageScore,
            quizAttemptsCount: data.quizAttemptsCount,
            badges: data.badges
          });
          setEditForm({ firstName: data.firstName || '', lastName: data.lastName || '', bio: data.bio || '' });
        }
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-600" size={40} /></div>;

  const xpCurrentLevel = userData ? userData.xp % 500 : 0;
  const progressPercent = (xpCurrentLevel / 500) * 100;

  return (
    <div className="max-w-6xl mx-auto space-y-8 md:space-y-12 pb-20 px-2 md:px-0">
      
      {/* Profile Header */}
      <div className="card-pro p-6 md:p-8 bg-zinc-900 text-white overflow-hidden relative">
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-6 md:gap-10">
          <div className="relative group">
             <div className="w-24 h-24 md:w-32 md:h-32 rounded-3xl bg-zinc-800 border border-white/10 flex items-center justify-center text-3xl md:text-4xl shadow-2xl overflow-hidden relative">
                {userData?.image ? <img src={userData.image} className="w-full h-full object-cover" /> : "👨‍💻"}
                <button onClick={() => setIsModalOpen(true)} className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera size={20} className="text-white" />
                </button>
             </div>
             <div className="absolute -bottom-2 -right-2 px-3 py-1 bg-blue-600 rounded-lg text-[10px] font-black uppercase">LVL {userData?.level || 1}</div>
          </div>
          
          <div className="space-y-3 text-center md:text-left flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">
              {userData?.firstName} {userData?.lastName}
            </h1>
            <p className="text-zinc-400 text-xs md:text-sm max-w-xl line-clamp-2 italic">{userData?.bio || "Aucune bio."}</p>
            <div className="flex flex-wrap gap-2 justify-center md:justify-start pt-1">
              <span className="px-2 py-0.5 bg-white/5 border border-white/10 text-zinc-400 rounded text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                <Brain size={10} className="text-blue-400" /> {userData?.aiBonusRequests} Jetons IA
              </span>
              <button 
                onClick={copyReferral}
                className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 hover:bg-emerald-500/20 transition-all"
              >
                <Target size={10} /> {isCopied ? 'Lien copié !' : `Parrainer (${userData?.referralCode})`}
              </button>
              <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                <Flame size={10} /> {userData?.streak || 0} Jours
              </span>
            </div>
          </div>

          <div className="w-full md:w-auto flex flex-col items-center md:items-end gap-1 pt-4 md:pt-0 border-t border-white/5 md:border-none">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">XP TOTALE</span>
            <div className="text-3xl md:text-4xl font-black tracking-tighter">{userData?.xp.toLocaleString()}</div>
            <div className="w-full md:w-48 h-1.5 bg-white/5 rounded-full overflow-hidden mt-2 relative">
              <motion.div initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} className="h-full bg-blue-600 absolute left-0 top-0" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 px-2 md:px-0">
        
        <div className="lg:col-span-2 space-y-10">
          {/* Stats */}
          <section className="space-y-4">
            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-[0.2em] ml-2">Analytiques</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: 'Quizz', value: userData?.quizAttemptsCount || 0, icon: BookOpen },
                { label: 'Score Moyen', value: `${userData?.averageScore || 0}%`, icon: Target },
                { label: 'Rang', value: `#${userData?.rank || '-'}`, icon: Trophy },
              ].map((stat, i) => (
                <div key={i} className="card-pro p-6 flex flex-col gap-4">
                  <stat.icon className="text-zinc-400" size={16} />
                  <div>
                    <h3 className="text-2xl font-bold">{stat.value}</h3>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase">{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Transactions */}
          <section className="space-y-4">
            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-[0.2em] ml-2">Historique des achats</h2>
            <div className="card-pro overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="px-6 py-4">Pack</th>
                      <th className="px-6 py-4">Montant</th>
                      <th className="px-6 py-4">Date</th>
                      <th className="px-6 py-4 text-right">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                    {transactions.map((t) => (
                      <tr key={t.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                        <td className="px-6 py-4 font-bold">{t.packName}</td>
                        <td className="px-6 py-4">{t.amount} FCFA</td>
                        <td className="px-6 py-4 text-zinc-500 text-xs">{new Date(t.createdAt).toLocaleDateString()}</td>
                        <td className="px-6 py-4 text-right">
                          <span className={cn(
                            "px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
                            t.status === 'COMPLETED' ? "bg-emerald-500/10 text-emerald-500" :
                            t.status === 'FAILED' ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-500"
                          )}>
                            {t.status === 'COMPLETED' ? 'Validé' : t.status === 'FAILED' ? 'Échoué' : 'En attente'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {transactions.length === 0 && (
                      <tr><td colSpan={4} className="px-6 py-10 text-center text-zinc-400 italic">Aucun achat effectué.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <section className="space-y-4">
            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-[0.2em] ml-2">Top Promotion</h2>
            <div className="card-pro overflow-hidden">
                {leaderboard.map((u, i) => (
                  <div key={u.id} className={cn("flex items-center gap-4 p-4", i === 0 && "bg-blue-50/30 dark:bg-blue-900/10")}>
                      <span className="text-xs font-black text-zinc-400">0{i+1}</span>
                      <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">{u.firstName} {u.lastName?.charAt(0)}.</p>
                          <p className="text-[10px] text-zinc-500">{u.xp.toLocaleString()} XP</p>
                      </div>
                      {i === 0 && <Trophy size={14} className="text-amber-500" />}
                  </div>
                ))}
            </div>
        </section>

      </div>
    </div>
  );
}
