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

  // Calcul du % vers le prochain niveau (Level * 200 XP requis)
  // XP actuel = userData.xp.
  // XP debut niveau actuel = (userData.level - 1) * 200
  // XP fin niveau actuel = userData.level * 200
  const xpForNextLevel = 200;
  const xpCurrentLevel = userData ? userData.xp % 200 : 0;
  const progressPercent = (xpCurrentLevel / xpForNextLevel) * 100;

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-20">
      {/* Profile Header Pro */}
      <div className="card-pro p-8 bg-zinc-900 dark:bg-zinc-950 text-white overflow-hidden relative">
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
          <div className="relative group">
             <div className="w-32 h-32 rounded-2xl bg-zinc-800 border border-white/10 flex items-center justify-center text-4xl shadow-2xl overflow-hidden relative">
                {userData?.image ? (
                  <img src={userData.image} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  "👨‍💻"
                )}
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <Camera size={24} className="text-white" />
                </button>
             </div>
             <div className="absolute -bottom-3 -right-3 px-3 py-1 bg-blue-600 rounded-lg text-[10px] font-black tracking-widest uppercase">
                LVL {userData?.level || 1}
             </div>
          </div>
          
          <div className="space-y-4 text-center md:text-left flex-1">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
                <h1 className="text-3xl font-bold tracking-tight">
                  {userData ? `${userData.firstName} ${userData.lastName}` : 'Étudiant'}
                </h1>
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors self-center md:self-auto"
                >
                  <Edit size={16} className="text-zinc-400" />
                </button>
            </div>
            <p className="text-zinc-400 text-sm max-w-xl line-clamp-2 italic">
              {userData?.bio || "Aucune bio renseignée."}
            </p>
            <div className="flex flex-wrap gap-2 justify-center md:justify-start pt-2">
              <span className="px-3 py-1 bg-white/5 border border-white/10 text-zinc-400 rounded text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                <ShieldCheck size={12} /> Étudiant
              </span>
              <span className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                <Flame size={12} /> {userData?.streak || 0} Days Streak
              </span>
            </div>
          </div>

          <div className="md:ml-auto flex flex-col items-end gap-2">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">XP TOTALE</span>
            <div className="text-4xl font-black tracking-tighter">{userData?.xp.toLocaleString()}</div>
            <div className="w-48 h-1.5 bg-white/5 rounded-full overflow-hidden mt-2 relative">
              <motion.div 
                initial={{ width: 0 }} 
                animate={{ width: `${progressPercent}%` }} 
                className="h-full bg-blue-600 absolute left-0 top-0" 
              />
            </div>
            <span className="text-[10px] text-zinc-600">Prochain niveau dans {200 - xpCurrentLevel} XP</span>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
            >
              <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                <h3 className="text-xl font-bold">Modifier le Profil</h3>
                <button onClick={() => setIsModalOpen(false)}><X size={20} /></button>
              </div>
              
              <form onSubmit={handleUpdateProfile} className="p-6 space-y-4">
                <div className="flex justify-center mb-6">
                   <label className="relative cursor-pointer group">
                      <div className="w-24 h-24 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border-2 border-dashed border-zinc-300 dark:border-zinc-700 flex items-center justify-center overflow-hidden">
                         {selectedFile ? (
                           <img src={URL.createObjectURL(selectedFile)} alt="Preview" className="w-full h-full object-cover" />
                         ) : userData?.image ? (
                           <img src={userData.image} alt="Profile" className="w-full h-full object-cover" />
                         ) : (
                           <Camera size={32} className="text-zinc-400" />
                         )}
                      </div>
                      <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*"
                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      />
                   </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Prénom</label>
                    <input 
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      value={editForm.firstName}
                      onChange={e => setEditForm({...editForm, firstName: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500">Nom</label>
                    <input 
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      value={editForm.lastName}
                      onChange={e => setEditForm({...editForm, lastName: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-zinc-500">Bio</label>
                  <textarea 
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none"
                    placeholder="Parlez-nous de vous..."
                    value={editForm.bio}
                    onChange={e => setEditForm({...editForm, bio: e.target.value})}
                  />
                </div>

                <div className="pt-4">
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                    Enregistrer les modifications
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Statistics Grid */}
        <div className="lg:col-span-2 space-y-8">
          <section className="space-y-6">
            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-[0.2em]">Analytiques Académiques</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Quizz Validés', value: userData?.quizAttemptsCount || 0, icon: BookOpen },
                { label: 'GPA Score', value: ((userData?.averageScore || 0) / 25).toFixed(1), icon: Target },
                { label: 'Classement', value: `#${userData?.rank || '-'}`, icon: Trophy },
              ].map((stat, i) => (
                <div key={i} className="card-pro p-6 flex flex-col gap-4">
                  <stat.icon className="text-zinc-400" size={20} />
                  <div>
                    <h3 className="text-2xl font-bold tracking-tight">{stat.value}</h3>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

      {/* Badges Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
           <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-[0.2em]">Badges & Certifications</h2>
           <span className="text-[10px] font-bold text-zinc-500 uppercase px-3 py-1 bg-zinc-100 dark:bg-zinc-900 rounded-full">
             {userData?.badges.length || 0} Obtenus
           </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {userData?.badges.map((userBadge, i) => {
            const badge = userBadge.badge;
            const Icon = ICON_MAP[badge.icon] || Award;
            return (
              <motion.div 
                key={i}
                whileHover={{ y: -5 }}
                className="card-pro p-6 flex flex-col items-center text-center gap-4 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
              >
                <div className="w-16 h-16 rounded-2xl bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center text-blue-600 shadow-inner">
                   <Icon size={32} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">{badge.name}</h4>
                  <p className="text-[10px] text-zinc-500 mt-1">{badge.description}</p>
                </div>
              </motion.div>
            );
          })}
          {userData?.badges.length === 0 && (
            <div className="col-span-full py-12 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-900 rounded-[2rem] text-zinc-400 text-sm">
               Aucun badge pour le moment. Complétez des quizz pour en gagner !
            </div>
          )}
        </div>
      </section>
        </div>

        {/* Leaderboard Section Dynamique */}
        <section className="space-y-6">
            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-[0.2em]">Top Promotion</h2>
            <div className="card-pro overflow-hidden">
                <div className="divide-y divide-zinc-100 dark:divide-zinc-900">
                    {leaderboard.map((u, i) => {
                        const isMe = userData?.firstName === u.firstName && userData?.lastName === u.lastName;
                        return (
                          <div key={u.id} className={cn(
                              "flex items-center gap-4 p-4 transition-colors",
                              isMe && "bg-blue-50/50 dark:bg-blue-900/20"
                          )}>
                              <span className={cn(
                                "text-[10px] font-black w-4 text-center",
                                i === 0 ? "text-amber-500" : i === 1 ? "text-zinc-400" : i === 2 ? "text-amber-700" : "text-zinc-400"
                              )}>0{i + 1}</span>
                              <div className="flex-1 overflow-hidden">
                                  <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                                    {u.firstName} {u.lastName?.charAt(0)}.
                                  </p>
                                  <p className="text-[10px] text-zinc-500">{u.xp.toLocaleString()} XP</p>
                              </div>
                              {isMe && <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />}
                          </div>
                        );
                    })}
                    {leaderboard.length === 0 && (
                      <p className="p-8 text-center text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Calcul en cours...</p>
                    )}
                </div>
            </div>
        </section>

      </div>
    </div>
  );
}
