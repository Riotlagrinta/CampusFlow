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
  Save,
  X,
  Brain
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useSound } from '@/hooks/useSound';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Map des icônes disponibles pour les badges (basé sur le nom stocké en DB)
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
  averageScore: number;
  quizAttemptsCount: number;
  badges: { badge: { id: string; name: string; icon: string; slug: string; description: string } }[];
};

// Badges statiques pour l'affichage "à débloquer" si on veut montrer tout le catalogue
// Pour simplifier, on affichera ce qu'on reçoit de l'API + placeholder
const ALL_BADGES_MOCK = [
  { slug: 'algo-master', name: 'Algorithm Master', icon: 'Code' },
  { slug: 'web-architect', name: 'Web Architect', icon: 'Globe' },
  { slug: 'database-pro', name: 'Database Pro', icon: 'Database' },
  { slug: 'first-step', name: 'Premiers Pas', icon: 'Flag' },
];

export default function ProfilePage() {
  const { play } = useSound();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // États du formulaire
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', bio: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user.email) {
      window.location.href = '/login';
      return;
    }

    // 1. Récupérer le classement global (Sidebar)
    fetch('/api/leaderboard')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setLeaderboard(data);
      });

    // 2. Récupérer toutes les données utilisateur (Profil + Analytiques + Classement perso)
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
            averageScore: data.averageScore,
            quizAttemptsCount: data.quizAttemptsCount,
            badges: data.badges
          });
          setEditForm({ 
            firstName: data.firstName || '', 
            lastName: data.lastName || '', 
            bio: data.bio || '' 
          });
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append('firstName', editForm.firstName);
    formData.append('lastName', editForm.lastName);
    formData.append('bio', editForm.bio);
    if (selectedFile) formData.append('image', selectedFile);

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        body: formData,
      });

      if (res.ok) {
        const result = await res.json();
        setUserData(prev => ({ ...prev!, ...result.user }));
        setIsModalOpen(false);
        play('success');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };


  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;
  }

  // Calcul du % vers le prochain niveau (Level * 500 XP requis)
  // XP actuel = userData.xp.
  // XP debut niveau actuel = (userData.level - 1) * 500
  // XP fin niveau actuel = userData.level * 500
  const xpForNextLevel = 500;
  const xpCurrentLevel = userData ? userData.xp % 500 : 0;
  const progressPercent = (xpCurrentLevel / xpForNextLevel) * 100;

  return (
    <div className="max-w-6xl mx-auto space-y-8 md:space-y-12 pb-20 px-2 md:px-0">
      {/* Profile Header Pro */}
      <div className="card-pro p-6 md:p-8 bg-zinc-900 dark:bg-zinc-950 text-white overflow-hidden relative">
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-6 md:gap-10">
          <div className="relative group">
             <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl bg-zinc-800 border border-white/10 flex items-center justify-center text-3xl md:text-4xl shadow-2xl overflow-hidden relative">
                {userData?.image ? (
                  <img src={userData.image} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  "👨‍💻"
                )}
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <Camera size={20} className="text-white" />
                </button>
             </div>
             <div className="absolute -bottom-2 -right-2 md:-bottom-3 md:-right-3 px-2 py-0.5 md:px-3 md:py-1 bg-blue-600 rounded-lg text-[8px] md:text-[10px] font-black tracking-widest uppercase">
                LVL {userData?.level || 1}
             </div>
          </div>
          
          <div className="space-y-3 text-center md:text-left flex-1 min-w-0">
            <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 justify-center md:justify-start">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate px-4 md:px-0">
                  {userData ? `${userData.firstName} ${userData.lastName}` : 'Étudiant'}
                </h1>
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="hidden md:flex p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <Edit size={16} className="text-zinc-400" />
                </button>
            </div>
            <p className="text-zinc-400 text-xs md:text-sm max-w-xl line-clamp-2 italic px-4 md:px-0">
              {userData?.bio || "Aucune bio renseignée."}
            </p>
            <div className="flex flex-wrap gap-2 justify-center md:justify-start pt-1">
              <span className="px-2 py-0.5 bg-white/5 border border-white/10 text-zinc-400 rounded text-[8px] md:text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                <ShieldCheck size={10} /> Étudiant
              </span>
              <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded text-[8px] md:text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                <Flame size={10} /> {userData?.streak || 0} Days Streak
              </span>
            </div>
          </div>

          <div className="w-full md:w-auto flex flex-col items-center md:items-end gap-1 md:gap-2 pt-4 md:pt-0 border-t border-white/5 md:border-none">
            <span className="text-[8px] md:text-[10px] font-bold text-zinc-500 uppercase tracking-widest">XP TOTALE</span>
            <div className="text-3xl md:text-4xl font-black tracking-tighter">{userData?.xp.toLocaleString()}</div>
            <div className="w-full md:w-48 h-1 bg-white/5 rounded-full overflow-hidden mt-1 md:mt-2 relative">
              <motion.div 
                initial={{ width: 0 }} 
                animate={{ width: `${progressPercent}%` }} 
                className="h-full bg-blue-600 absolute left-0 top-0" 
              />
            </div>
            <span className="text-[8px] md:text-[10px] text-zinc-600">Suivant : {500 - xpCurrentLevel} XP</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 px-2 md:px-0">
        
        {/* Statistics Grid */}
        <div className="lg:col-span-2 space-y-10">
          <section className="space-y-4">
            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-[0.2em] ml-2">Analytiques</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
              {[
                { label: 'Quizz', value: userData?.quizAttemptsCount || 0, icon: BookOpen },
                { label: 'GPA', value: ((userData?.averageScore || 0) / 25).toFixed(1), icon: Target },
                { label: 'Rang', value: `#${userData?.rank || '-'}`, icon: Trophy },
              ].map((stat, i) => (
                <div key={i} className="card-pro p-4 md:p-6 flex flex-col gap-3 md:gap-4">
                  <stat.icon className="text-zinc-400" size={16} />
                  <div>
                    <h3 className="text-xl md:text-2xl font-bold tracking-tight">{stat.value}</h3>
                    <p className="text-[9px] md:text-[10px] font-bold text-zinc-500 uppercase tracking-tight">{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

      {/* Badges Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between ml-2 mr-2">
           <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-[0.2em]">Badges</h2>
           <span className="text-[9px] font-bold text-zinc-500 uppercase px-2 py-0.5 bg-zinc-100 dark:bg-zinc-900 rounded-full">
             {userData?.badges.length || 0} Obtenus
           </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {userData?.badges.map((userBadge, i) => {
            const badge = userBadge.badge;
            const Icon = ICON_MAP[badge.icon] || Award;
            return (
              <motion.div 
                key={i}
                whileHover={{ y: -3 }}
                className="card-pro p-4 md:p-6 flex flex-col items-center text-center gap-3 md:gap-4 bg-white dark:bg-zinc-900"
              >
                <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center text-blue-600 shadow-inner">
                   <Icon size={24} className="md:w-8 md:h-8" />
                </div>
                <div className="min-w-0 w-full">
                  <h4 className="text-[11px] md:text-sm font-bold text-zinc-900 dark:text-zinc-50 truncate">{badge.name}</h4>
                  <p className="text-[8px] md:text-[10px] text-zinc-500 mt-0.5 line-clamp-1">{badge.description}</p>
                </div>
              </motion.div>
            );
          })}
          {userData?.badges.length === 0 && (
            <div className="col-span-full py-10 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-900 rounded-2xl text-zinc-400 text-xs">
               Aucun badge pour le moment.
            </div>
          )}
        </div>
      </section>
        </div>

        {/* Leaderboard Section */}
        <section className="space-y-4">
            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-[0.2em] ml-2">Top Promotion</h2>
            <div className="card-pro overflow-hidden mx-2 md:mx-0">
                <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
                    {leaderboard.map((u, i) => {
                        const isMe = userData?.firstName === u.firstName && userData?.lastName === u.lastName;
                        return (
                          <div key={u.id} className={cn(
                              "flex items-center gap-3 md:gap-4 p-3 md:p-4 transition-colors",
                              isMe && "bg-blue-50/50 dark:bg-blue-900/20"
                          )}>
                              <span className={cn(
                                "text-[9px] md:text-[10px] font-black w-4 text-center",
                                i === 0 ? "text-amber-500" : i === 1 ? "text-zinc-400" : i === 2 ? "text-amber-700" : "text-zinc-400"
                              )}>0{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                                    {u.firstName} {u.lastName?.charAt(0)}.
                                  </p>
                                  <p className="text-[9px] text-zinc-500">{u.xp.toLocaleString()} XP</p>
                              </div>
                              {isMe && <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />}
                          </div>
                        );
                    })}
                </div>
            </div>
        </section>

      </div>
    </div>
  );
}
