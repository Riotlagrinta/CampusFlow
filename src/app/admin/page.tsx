'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Shield, Circle, Loader2, Activity, Mail, Trash2, Zap,
  BookOpen, GraduationCap, Plus, Save, X, BarChart3, FileText,
  CreditCard, CheckCircle2, AlertCircle, User
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TiltCard } from '@/components/TiltCard';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type AdminUser = { id: string; firstName: string; lastName: string; email: string; lastActive: string; level: number; xp: number; role: string; isActive: boolean; otpCode?: string; field?: { name: string, code: string }; academicLevel?: { name: string }; };
type Transaction = { id: string; userId: string; amount: number; tokens: number; packName: string; status: string; reference: string | null; createdAt: string; user: { firstName: string; lastName: string; email: string }; };
type Field = { id: string; name: string; code: string; _count: { users: number } };
type Level = { id: string; name: string; _count: { users: number } };
type Resource = { id: string; title: string; type: string; url: string; createdAt: string; subject: { name: string; code: string | null } | null; author: { firstName: string; lastName: string }; };
type Subject = { id: string; name: string; code: string | null; field: { name: string }; level: { name: string }; _count: { resources: number } };

interface DashboardChartData {
  name: string;
  tokens: number;
}

const fadeUp = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } };
const stagger = (i: number) => ({ delay: i * 0.08 });

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'users' | 'fields' | 'levels' | 'subjects' | 'resources' | 'transactions'>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users);
        setTotalRevenue(data.totalRevenue || 0);
      }
    } catch (err) { console.error(err); }
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/transactions');
      const data = await res.json();
      if (res.ok) setTransactions(data);
    } catch (err) { console.error(err); }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchUsers(), fetchTransactions()]);
    setLoading(false);
  }, [fetchUsers, fetchTransactions]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleDeleteUser = async (id: string, name: string) => {
    if (!confirm(`ATTENTION : Voulez-vous vraiment supprimer ${name} ?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      if (res.ok) { alert('Utilisateur supprimé.'); fetchUsers(); }
      else { const data = await res.json(); alert(`Erreur: ${data.error}`); }
    } catch (err) { console.error(err); alert('Erreur lors de la suppression.'); }
  };

  const handleApproveTransaction = async (id: string) => {
    if (!confirm('Valider ce paiement et créditer les jetons ?')) return;
    try {
      const res = await fetch(`/api/admin/transactions/${id}/approve`, { method: 'POST' });
      if (res.ok) { alert('Transaction approuvée !'); fetchTransactions(); }
    } catch (err) { console.error(err); }
  };

  const isOnline = (lastActive: string) => {
    if (!lastActive) return false;
    return (currentTime - new Date(lastActive).getTime()) < 300000;
  };

  const STATS = [
    { label: "Chiffre d'Affaires", value: `${totalRevenue.toLocaleString()} FCFA`, icon: CreditCard, color: 'emerald' },
    { label: 'Étudiants', value: users.length, icon: Users, color: 'blue' },
    { label: 'Paiements Attente', value: transactions.filter(t => t.status === 'PENDING').length, icon: Zap, color: 'amber' },
    { label: 'Ventes', value: transactions.filter(t => t.status === 'COMPLETED').length, icon: CreditCard, color: 'purple' },
  ] as const;

  const COLOR_CLASSES: Record<string, string> = {
    emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600',
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600',
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 px-4 md:px-0 text-zinc-900 dark:text-zinc-100">

      {/* Header */}
      <motion.div {...fadeUp} className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div className="flex items-center gap-4">
          <motion.div
            whileHover={{ rotate: 10, scale: 1.1 }}
            className="p-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl shadow-xl"
          >
            <Shield size={24} />
          </motion.div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Console Admin</h1>
            <p className="text-zinc-500 text-sm">Gestion globale DEFITECH</p>
          </div>
        </div>
        <motion.div
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-[10px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 rounded-full uppercase tracking-widest self-start md:self-auto"
        >
          ● Live
        </motion.div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-2">
        {STATS.map((s, i) => (
          <motion.div key={i} {...fadeUp} transition={stagger(i)}>
            <TiltCard className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-4 cursor-default">
              <motion.div whileHover={{ rotate: 15 }} className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", COLOR_CLASSES[s.color])}>
                <s.icon size={24} />
              </motion.div>
              <div>
                <p className="text-[10px] font-black uppercase text-zinc-400">{s.label}</p>
                <motion.h3
                  className="text-xl font-bold"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + i * 0.1 }}
                >
                  {s.value}
                </motion.h3>
              </div>
            </TiltCard>
          </motion.div>
        ))}
      </div>

      {/* Tabs */}
      <motion.div {...fadeUp} transition={{ delay: 0.3 }} className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-2xl w-fit ml-2 overflow-x-auto">
        {[
          { id: 'users', label: 'Étudiants', icon: Users },
          { id: 'transactions', label: 'Transactions', icon: CreditCard },
          { id: 'fields', label: 'Filières', icon: BookOpen },
          { id: 'resources', label: 'Documents', icon: FileText },
        ].map((tab) => (
          <motion.button
            key={tab.id}
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === tab.id ? "bg-white dark:bg-zinc-800 text-blue-600 shadow-lg" : "text-zinc-500"
            )}
          >
            <tab.icon size={14} /> {tab.label}
          </motion.button>
        ))}
      </motion.div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
          className="px-2"
        >
          {activeTab === 'users' && (
            <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-zinc-50 dark:bg-zinc-950 text-[10px] font-black uppercase text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                  <tr><th className="px-8 py-5">Utilisateur</th><th className="px-8 py-5">Status</th><th className="px-8 py-5 text-right">Actions</th></tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {users.map((u, i) => (
                    <motion.tr
                      key={u.id}
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors"
                    >
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-500">{u.firstName?.[0]}{u.lastName?.[0]}</div>
                          <div><p className="text-sm font-bold">{u.firstName} {u.lastName}</p><p className="text-[10px] text-zinc-500">{u.email}</p></div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        {isOnline(u.lastActive)
                          ? <span className="text-emerald-500 text-xs font-bold flex items-center gap-1.5"><Circle size={6} fill="currentColor" /> En ligne</span>
                          : <span className="text-zinc-400 text-xs font-medium">Hors ligne</span>
                        }
                      </td>
                      <td className="px-8 py-5 text-right">
                        <motion.button
                          whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                          onClick={() => handleDeleteUser(u.id, `${u.firstName} ${u.lastName}`)}
                          className="p-2 text-zinc-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={18} />
                        </motion.button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-zinc-50 dark:bg-zinc-950 text-[10px] font-black uppercase text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <th className="px-8 py-5">Étudiant</th>
                    <th className="px-8 py-5">Pack / Montant</th>
                    <th className="px-8 py-5">Status</th>
                    <th className="px-8 py-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {transactions.map((t, i) => (
                    <motion.tr
                      key={t.id}
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                      className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors"
                    >
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><User size={20} /></div>
                          <div><p className="text-sm font-bold">{t.user.firstName} {t.user.lastName}</p><p className="text-[10px] text-zinc-500">{new Date(t.createdAt).toLocaleString()}</p></div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <p className="text-sm font-bold">{t.packName}</p>
                        <p className="text-xs text-blue-600 font-black">{t.amount} FCFA • {t.tokens} Jetons</p>
                      </td>
                      <td className="px-8 py-5">
                        {t.status === 'COMPLETED'
                          ? <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase">Payé</span>
                          : t.status === 'FAILED'
                          ? <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-[10px] font-black uppercase">Échoué</span>
                          : <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-black uppercase animate-pulse">En attente</span>
                        }
                      </td>
                      <td className="px-8 py-5 text-right">
                        {t.status === 'PENDING' && (
                          <motion.button
                            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                            onClick={() => handleApproveTransaction(t.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 ml-auto"
                          >
                            <CheckCircle2 size={14} /> Approuver
                          </motion.button>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr><td colSpan={4} className="px-8 py-20 text-center text-zinc-400 font-bold italic">Aucune transaction.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
