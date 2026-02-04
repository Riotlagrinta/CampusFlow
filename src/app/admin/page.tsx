'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Shield, Circle, Loader2, Activity, Mail, Trash2, Zap,
  BookOpen, GraduationCap, Plus, Save, X, BarChart3, FileText,
  CreditCard, CheckCircle2, AlertCircle, User
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type AdminUser = { id: string; firstName: string; lastName: string; email: string; lastActive: string; level: number; xp: number; role: string; isActive: boolean; otpCode?: string; field?: { name: string, code: string }; academicLevel?: { name: string }; };
type Transaction = { id: string; userId: string; amount: number; tokens: number; packName: string; status: string; reference: string | null; createdAt: string; user: { firstName: string; lastName: string; email: string }; };
type Field = { id: string; name: string; code: string; _count: { users: number } };
type Level = { id: string; name: string; _count: { users: number } };
type Resource = { id: string; title: string; type: string; url: string; createdAt: string; subject: { name: string; code: string | null } | null; author: { firstName: string; lastName: string }; };
type Subject = { id: string; name: string; code: string | null; field: { name: string }; level: { name: string }; _count: { resources: number } };

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'users' | 'fields' | 'levels' | 'subjects' | 'resources' | 'transactions'>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchUsers(), fetchFields(), fetchLevels(), fetchSubjects(), fetchResources(), fetchTransactions()]);
    setLoading(false);
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (res.ok) { setUsers(data.users); setTotalTokens(data.totalTokensToday); setChartData(data.chartData); }
    } catch (err) { console.error(err); }
  };

  const fetchTransactions = async () => {
    try {
      const res = await fetch('/api/admin/transactions');
      const data = await res.json();
      if (res.ok) setTransactions(data);
    } catch (err) { console.error(err); }
  };

  const handleApproveTransaction = async (id: string) => {
    if (!confirm('Voulez-vous valider ce paiement et créditer les jetons ?')) return;
    try {
      const res = await fetch(`/api/admin/transactions/${id}/approve`, { method: 'POST' });
      if (res.ok) {
        alert('Transaction approuvée ! L\'étudiant a reçu ses jetons.');
        fetchTransactions();
      }
    } catch (err) { console.error(err); }
  };

  // --- Mock Functions pour la démo ---
  const fetchResources = async () => { try { const res = await fetch('/api/resources'); if (res.ok) setResources(await res.json()); } catch (e) {} };
  const fetchFields = async () => { try { const res = await fetch('/api/admin/academic/fields'); if (res.ok) setFields(await res.json()); } catch (e) {} };
  const fetchLevels = async () => { try { const res = await fetch('/api/admin/academic/levels'); if (res.ok) setLevels(await res.json()); } catch (e) {} };
  const fetchSubjects = async () => { try { const res = await fetch('/api/admin/academic/subjects'); if (res.ok) setSubjects(await res.json()); } catch (e) {} };

  const isOnline = (lastActive: string) => (Date.now() - new Date(lastActive).getTime()) < 120000;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 px-4 md:px-0 text-zinc-900 dark:text-zinc-100">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl shadow-xl"><Shield size={24} /></div>
          <div>
             <h1 className="text-2xl md:text-3xl font-black tracking-tight">Console Admin</h1>
             <p className="text-zinc-500 text-sm">Gestion globale DEFITECH</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-2">
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-4">
           <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-2xl flex items-center justify-center"><Activity size={24}/></div>
           <div><p className="text-[10px] font-black uppercase text-zinc-400">Live</p><h3 className="text-xl font-bold">{users.filter(u=>isOnline(u.lastActive)).length}</h3></div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-4">
           <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-2xl flex items-center justify-center"><Users size={24}/></div>
           <div><p className="text-[10px] font-black uppercase text-zinc-400">Étudiants</p><h3 className="text-xl font-bold">{users.length}</h3></div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-4">
           <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-2xl flex items-center justify-center"><Zap size={24}/></div>
           <div><p className="text-[10px] font-black uppercase text-zinc-400">Paiements Attente</p><h3 className="text-xl font-bold text-amber-600">{transactions.filter(t=>t.status==='PENDING').length}</h3></div>
        </div>
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 flex items-center gap-4">
           <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 text-purple-600 rounded-2xl flex items-center justify-center"><CreditCard size={24}/></div>
           <div><p className="text-[10px] font-black uppercase text-zinc-400">Ventes</p><h3 className="text-xl font-bold">{transactions.filter(t=>t.status==='COMPLETED').length}</h3></div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-2xl w-fit ml-2">
        {[ 
          { id: 'users', label: 'Étudiants', icon: Users },
          { id: 'transactions', label: 'Transactions', icon: CreditCard },
          { id: 'fields', label: 'Filières', icon: BookOpen },
          { id: 'resources', label: 'Documents', icon: FileText },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={cn("flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all", activeTab === tab.id ? "bg-white dark:bg-zinc-800 text-blue-600 shadow-lg" : "text-zinc-500")}>
            <tab.icon size={14} /> {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="px-2">
        {activeTab === 'users' && (
          <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
            <table className="w-full text-left">
              <thead className="bg-zinc-50 dark:bg-zinc-950 text-[10px] font-black uppercase text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                <tr><th className="px-8 py-5">Utilisateur</th><th className="px-8 py-5">Status</th><th className="px-8 py-5 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-500">{u.firstName?.[0]}{u.lastName?.[0]}</div>
                        <div><p className="text-sm font-bold">{u.firstName} {u.lastName}</p><p className="text-[10px] text-zinc-500">{u.email}</p></div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      {isOnline(u.lastActive) ? <span className="text-emerald-500 text-xs font-bold flex items-center gap-1.5"><Circle size={6} fill="currentColor"/> En ligne</span> : <span className="text-zinc-400 text-xs font-medium">Hors ligne</span>}
                    </td>
                    <td className="px-8 py-5 text-right"><button className="p-2 text-zinc-300 hover:text-red-500 transition-colors"><Trash2 size={18}/></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="space-y-4">
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
                  {transactions.map(t => (
                    <tr key={t.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><User size={20}/></div>
                          <div><p className="text-sm font-bold">{t.user.firstName} {t.user.lastName}</p><p className="text-[10px] text-zinc-500">{new Date(t.createdAt).toLocaleString()}</p></div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <p className="text-sm font-bold">{t.packName}</p>
                        <p className="text-xs text-blue-600 font-black">{t.amount} FCFA • {t.tokens} Jetons</p>
                      </td>
                      <td className="px-8 py-5">
                        {t.status === 'COMPLETED' ? (
                          <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase">Payé</span>
                        ) : t.status === 'FAILED' ? (
                          <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-[10px] font-black uppercase">Échoué</span>
                        ) : (
                          <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-black uppercase animate-pulse">En attente</span>
                        )}
                      </td>
                      <td className="px-8 py-5 text-right">
                        {t.status === 'PENDING' && (
                          <button 
                            onClick={() => handleApproveTransaction(t.id)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 ml-auto"
                          >
                            <CheckCircle2 size={14}/> Approuver
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr><td colSpan={4} className="px-8 py-20 text-center text-zinc-400 font-bold italic">Aucune transaction enregistrée.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
