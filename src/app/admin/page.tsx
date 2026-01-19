'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Shield, Circle, Loader2, Activity, Mail, Trash2, Zap,
  BookOpen, GraduationCap, Plus, Save, X, BarChart3
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type AdminUser = {  id: string;
  firstName: string;
  lastName: string;
  email: string;
  lastActive: string;
  level: number;
  xp: number;
  role: string;
  isActive: boolean;
  otpCode?: string;
  field?: { name: string, code: string };
  academicLevel?: { name: string };
  badges: { badge: { name: string; icon: string } }[];
};

type Field = { id: string; name: string; code: string; description: string | null; _count: { users: number } };
type Level = { id: string; name: string; _count: { users: number } };

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'users' | 'fields' | 'levels'>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);

  const handleActivateUser = async (userId: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/activate`, { method: 'POST' });
      if (res.ok) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, isActive: true, otpCode: undefined } : u));
      }
    } catch (err) { console.error(err); }
  };

  const [fields, setFields] = useState<Field[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newField, setNewField] = useState({ name: '', code: '', description: '' });
  const [newLevel, setNewLevel] = useState({ name: '' });

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      if (activeTab === 'users') fetchUsers();
    }, 10000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchUsers(), fetchFields(), fetchLevels()]);
    setLoading(false);
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users);
        setTotalTokens(data.totalTokensToday);
        setChartData(data.chartData);
      }
    } catch (err) { console.error(err); }
  };

  const fetchFields = async () => {
    try {
      const res = await fetch('/api/admin/academic/fields');
      const data = await res.json();
      if (res.ok) setFields(data);
    } catch (err) { console.error(err); }
  };

  const fetchLevels = async () => {
    try {
      const res = await fetch('/api/admin/academic/levels');
      const data = await res.json();
      if (res.ok) setLevels(data);
    } catch (err) { console.error(err); }
  };

  const handleAddField = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/academic/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newField),
      });
      if (res.ok) {
        fetchFields();
        setIsModalOpen(false);
        setNewField({ name: '', code: '', description: '' });
      }
    } catch (err) { console.error(err); }
  };

  const handleAddLevel = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/academic/levels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLevel),
      });
      if (res.ok) {
        fetchLevels();
        setIsModalOpen(false);
        setNewLevel({ name: '' });
      }
    } catch (err) { console.error(err); }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Voulez-vous vraiment supprimer cet utilisateur ?')) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      if (res.ok) setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) { console.error(err); }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!confirm('Voulez-vous vraiment supprimer cette filière ? Attention : Cela supprimera les emplois du temps associés.')) return;
    try {
      const res = await fetch(`/api/admin/academic/fields/${fieldId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setFields(prev => prev.filter(f => f.id !== fieldId));
      } else {
        alert(data.error || "Impossible de supprimer");
      }
    } catch (err) { console.error(err); }
  };

  const isOnline = (lastActive: string) => {
    const last = new Date(lastActive).getTime();
    const now = Date.now();
    return (now - last) < 120000;
  };

  if (loading && users.length === 0) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-600" /></div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 px-4 md:px-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl shadow-xl">
             <Shield size={24} className="md:w-8 md:h-8" />
          </div>
          <div>
             <h1 className="text-2xl md:text-3xl font-black tracking-tight">Console Admin</h1>
             <p className="text-zinc-500 text-sm italic">Gestion institutionnelle de DEFITECH</p>
          </div>
        </div>
        
        {activeTab !== 'users' && (
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg transition-all"
          >
            <Plus size={18} />
            <span>{activeTab === 'fields' ? 'Ajouter une Filière' : 'Ajouter un Niveau'}</span>
          </button>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 px-2">
        <div className="card-pro p-6 flex items-center gap-4 bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30">
           <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-2xl flex items-center justify-center">
              <Activity size={24} />
           </div>
           <div>
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em]">Live</p>
              <h3 className="text-2xl font-bold">{users.filter(u => isOnline(u.lastActive)).length} en ligne</h3>
           </div>
        </div>
        <div className="card-pro p-6 flex items-center gap-4">
           <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-2xl flex items-center justify-center">
              <Users size={24} />
           </div>
           <div>
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Population</p>
              <h3 className="text-2xl font-bold">{users.length} Étudiants</h3>
           </div>
        </div>
        <div className="card-pro p-6 flex flex-col gap-2">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-amber-100 dark:bg-amber-950/30 text-amber-600 rounded-full flex items-center justify-center">
                 <Zap size={24} />
              </div>
              <div className="flex-1">
                 <p className="text-[10px] font-black text-amber-600 uppercase tracking-[0.2em]">IA Global (Tokens)</p>
                 <div className="flex items-end gap-2">
                    <h3 className="text-2xl font-bold">{totalTokens.toLocaleString()}</h3>
                    <span className="text-[10px] text-zinc-400 mb-1">/ 100k</span>
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

      {/* Analytics Chart */}
      <div className="card-pro p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 text-blue-600 rounded-lg">
            <BarChart3 size={20} />
          </div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500">Activité IA (7 derniers jours)</h3>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} stroke="#94a3b8" />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold' }} stroke="#94a3b8" />
              <Tooltip 
                cursor={{ fill: '#f8fafc' }} 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} 
              />
              <Bar dataKey="tokens" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl w-fit ml-2">
        {[
          { id: 'users', label: 'Étudiants', icon: Users },
          { id: 'fields', label: 'Filières', icon: BookOpen },
          { id: 'levels', label: 'Niveaux', icon: GraduationCap },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
              activeTab === tab.id 
                ? "bg-white dark:bg-zinc-800 text-blue-600 shadow-sm" 
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-6 px-2">
        {activeTab === 'users' && (
          <div className="space-y-4">
            {/* Desktop Table */}
            <div className="hidden lg:block card-pro overflow-hidden border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left">
                <thead className="bg-zinc-50 dark:bg-zinc-950 text-[10px] font-black uppercase text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="px-6 py-4">Utilisateur</th>
                    <th className="px-6 py-4">Classe</th>
                    <th className="px-6 py-4">Progression</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Validation</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900/50">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-900/80 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                            {u.firstName?.[0]}{u.lastName?.[0]}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                              {u.firstName} {u.lastName}
                              {u.role === 'ADMIN' && <Shield size={10} className="text-blue-500" />}
                            </p>
                            <p className="text-[10px] text-zinc-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{u.field?.name || 'N/A'}</p>
                        <p className="text-[10px] text-zinc-500">{u.academicLevel?.name || '-'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold">LVL {u.level}</p>
                        <p className="text-[10px] text-zinc-500">{u.xp.toLocaleString()} XP</p>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium">
                        {isOnline(u.lastActive) ? (
                          <span className="text-emerald-500 flex items-center gap-1.5"><Circle size={6} fill="currentColor" /> En ligne</span>
                        ) : (
                          <span className="text-zinc-400 flex items-center gap-1.5"><Circle size={6} fill="currentColor" /> Hors ligne</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {u.isActive ? (
                          <span className="px-2 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 rounded text-[10px] font-black uppercase">Actif</span>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            <span className="px-2 py-1 bg-amber-50 dark:bg-amber-500/10 text-amber-600 rounded text-[10px] font-black uppercase w-fit">Code: {u.otpCode}</span>
                            <button 
                              onClick={() => handleActivateUser(u.id)}
                              className="text-[9px] font-bold text-blue-600 hover:underline text-left"
                            >
                              Activer manuellement
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {u.role !== 'ADMIN' && (
                          <button onClick={() => handleDeleteUser(u.id)} className="p-2 text-zinc-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden space-y-3">
              {users.map((u) => (
                <div key={u.id} className="card-pro p-4 space-y-3 relative">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-zinc-500">{u.firstName?.[0]}{u.lastName?.[0]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{u.firstName} {u.lastName}</p>
                      <p className="text-[10px] text-zinc-500 truncate">{u.field?.code} • {u.academicLevel?.name}</p>
                    </div>
                    {isOnline(u.lastActive) && <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                  </div>
                  {u.role !== 'ADMIN' && (
                    <button onClick={() => handleDeleteUser(u.id)} className="absolute top-2 right-2 p-2 text-zinc-300"><Trash2 size={14} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'fields' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {fields.map((f) => (
              <div key={f.id} className="card-pro p-6 space-y-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                <div className="flex justify-between items-start">
                  <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-xl flex items-center justify-center font-black text-xs border border-blue-100 dark:border-blue-800/30">
                    {f.code}
                  </div>
                  <span className="text-[10px] font-black bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-1 rounded uppercase tracking-widest border border-zinc-200 dark:border-zinc-700">
                    {f._count.users} Étudiants
                  </span>
                </div>
                <div>
                  <div className="flex justify-between items-start">
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100">{f.name}</h3>
                    <button onClick={() => handleDeleteField(f.id)} className="text-zinc-400 hover:text-red-500 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1 line-clamp-2 italic">{f.description || 'Pas de description.'}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'levels' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {levels.map((l) => (
              <div key={l.id} className="card-pro p-6 flex items-center justify-between group">
                <div>
                  <h3 className="font-bold text-zinc-900 dark:text-zinc-100">{l.name}</h3>
                  <p className="text-[10px] text-zinc-500">{l._count.users} Inscrits</p>
                </div>
                <GraduationCap size={20} className="text-zinc-200 group-hover:text-blue-500 transition-colors" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Creation Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
              <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                <h3 className="text-xl font-bold">Ajouter {activeTab === 'fields' ? 'une Filière' : 'un Niveau'}</h3>
                <button onClick={() => setIsModalOpen(false)}><X size={20} /></button>
              </div>
              
              <form onSubmit={activeTab === 'fields' ? handleAddField : handleAddLevel} className="p-6 space-y-4">
                {activeTab === 'fields' ? (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500 ml-1">Nom complet</label>
                      <input required className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="ex: Génie Logiciel" value={newField.name} onChange={e => setNewField({...newField, name: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500 ml-1">Code court</label>
                      <input required className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="ex: GL" value={newField.code} onChange={e => setNewField({...newField, code: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-zinc-500 ml-1">Description</label>
                      <textarea className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none" placeholder="Description de la filière..." value={newField.description} onChange={e => setNewField({...newField, description: e.target.value})} />
                    </div>
                  </>
                ) : (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-zinc-500 ml-1">Nom du niveau</label>
                    <input required className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="ex: Licence 1" value={newLevel.name} onChange={e => setNewLevel({...newLevel, name: e.target.value})} />
                  </div>
                )}

                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl font-bold text-xs text-zinc-600 dark:text-zinc-300">Annuler</button>
                  <button type="submit" className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                    <Save size={14} /> Confirmer
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}