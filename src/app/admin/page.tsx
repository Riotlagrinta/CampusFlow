'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Shield, Circle, Loader2, Activity, Mail, Trash2, Zap } from 'lucide-react';

type AdminUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  lastActive: string;
  level: number;
  xp: number;
  role: string;
  field?: { name: string, code: string };
  academicLevel?: { name: string };
  badges: { badge: { name: string; icon: string } }[];
};

export default function AdminDashboard() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 10000); // Rafraîchir toutes le 10s
    return () => clearInterval(interval);
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users);
        setTotalTokens(data.totalTokensToday);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Voulez-vous vraiment supprimer cet utilisateur ? Cette action est irréversible et supprimera toutes ses données.')) return;

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setUsers(prev => prev.filter(u => u.id !== userId));
      } else {
        const data = await res.json();
        alert(data.error || 'Erreur lors de la suppression');
      }
    } catch (err) {
      console.error(err);
      alert('Erreur réseau');
    }
  };

  const isOnline = (lastActive: string) => {
    const last = new Date(lastActive).getTime();
    const now = Date.now();
    return (now - last) < 120000; // En ligne si actif il y a moins de 2 minutes
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl shadow-xl">
           <Shield size={32} />
        </div>
        <div>
           <h1 className="text-3xl font-black">Console Administrateur</h1>
           <p className="text-zinc-500">Suivi des utilisateurs en temps réel.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-pro p-6 flex items-center gap-4">
           <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 rounded-full flex items-center justify-center">
              <Activity size={24} />
           </div>
           <div>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">En ligne</p>
              <h3 className="text-2xl font-bold">{users.filter(u => isOnline(u.lastActive)).length}</h3>
           </div>
        </div>
        <div className="card-pro p-6 flex items-center gap-4">
           <div className="w-12 h-12 bg-blue-100 dark:bg-blue-950/30 text-blue-600 rounded-full flex items-center justify-center">
              <Users size={24} />
           </div>
           <div>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Total Étudiants</p>
              <h3 className="text-2xl font-bold">{users.length}</h3>
           </div>
        </div>
        <div className="card-pro p-6 flex flex-col gap-2">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-100 dark:bg-amber-950/30 text-amber-600 rounded-full flex items-center justify-center">
                 <Zap size={24} />
              </div>
              <div className="flex-1">
                 <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Consommation IA (Tokens)</p>
                 <div className="flex items-end gap-2">
                    <h3 className="text-2xl font-bold">{totalTokens.toLocaleString()}</h3>
                    <span className="text-[10px] text-zinc-400 mb-1">/ 100,000</span>
                 </div>
              </div>
           </div>
           <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mt-2">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (totalTokens / 100000) * 100)}%` }}
                className={`h-full ${totalTokens > 80000 ? 'bg-red-500' : 'bg-amber-500'}`}
              />
           </div>
        </div>
      </div>

      <div className="card-pro overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-zinc-50 dark:bg-zinc-950 text-[10px] font-black uppercase text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
            <tr>
              <th className="px-6 py-4">Utilisateur</th>
              <th className="px-6 py-4">Classe (Filière / Niveau)</th>
              <th className="px-6 py-4">Progression</th>
              <th className="px-6 py-4">Badges</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-500">
                      {u.firstName?.[0]}{u.lastName?.[0]}
                    </div>
                    <div>
                      <p className="text-sm font-bold flex items-center gap-2">
                        {u.firstName} {u.lastName}
                        {u.role === 'ADMIN' && <Shield size={10} className="text-blue-500" />}
                      </p>
                      <p className="text-[10px] text-zinc-500">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="space-y-1">
                    <p className="text-xs font-bold">{u.field?.name || 'Non défini'}</p>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{u.academicLevel?.name || '-'}</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="space-y-1">
                    <p className="text-xs font-bold">LVL {u.level}</p>
                    <p className="text-[10px] text-zinc-500">{u.xp.toLocaleString()} XP</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex -space-x-2">
                    {u.badges.map((b, i) => (
                      <div key={i} title={b.badge.name} className="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-[10px]">
                        {b.badge.icon.length > 2 ? '🏅' : b.badge.icon}
                      </div>
                    ))}
                    {u.badges.length === 0 && <span className="text-[10px] text-zinc-400">Aucun</span>}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Circle size={8} fill={isOnline(u.lastActive) ? "#10b981" : "#d1d5db"} className={isOnline(u.lastActive) ? "text-emerald-500 animate-pulse" : "text-zinc-300"} />
                    <span className="text-xs font-medium">{isOnline(u.lastActive) ? 'En ligne' : 'Hors ligne'}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-xs text-zinc-500 font-medium">
                  {new Date(u.lastActive).toLocaleTimeString()}
                </td>
                <td className="px-6 py-4 text-right">
                  {u.role !== 'ADMIN' && (
                    <button 
                      onClick={() => handleDeleteUser(u.id)}
                      className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                      title="Supprimer l'utilisateur"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
