'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Shield, Circle, Loader2, Trash2, Zap,
  BookOpen, FileText, CreditCard, CheckCircle2, User, UserCheck, X,
  type LucideIcon
} from 'lucide-react';
import { TiltCard } from '@/components/TiltCard';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type AdminUser = { id: string; firstName: string; lastName: string; email: string; lastActive: string; level: number; xp: number; role: string; isActive: boolean; otpCode?: string; field?: { name: string, code: string }; academicLevel?: { name: string }; };
type Transaction = { id: string; userId: string; amount: number; tokens: number; packName: string; status: string; reference: string | null; createdAt: string; user: { firstName: string; lastName: string; email: string }; };

// Agrégats serveur de GET /api/admin/transactions?summary=1 (sur toutes les transactions, pas seulement la 1re page)
type TransactionSummary = { total: number; pending: number; completed: number; failed: number; revenue: number };

type ActiveTab = 'users' | 'transactions';
type TransactionFilter = 'ALL' | 'PENDING';
type Notice = { kind: 'success' | 'error'; text: string };
// Action en attente de confirmation (confirmation affichée dans la ligne concernée, jamais via confirm())
type PendingConfirm = { action: 'activate' | 'delete' | 'approve'; id: string };

// Les onglets « soon » n'ont pas encore de contenu : affichés mais désactivés.
const TABS: { id: string; label: string; icon: LucideIcon; soon?: boolean }[] = [
  { id: 'users', label: 'Étudiants', icon: Users },
  { id: 'transactions', label: 'Transactions', icon: CreditCard },
  { id: 'fields', label: 'Filières', icon: BookOpen, soon: true },
  { id: 'resources', label: 'Documents', icon: FileText, soon: true },
];

const TRANSACTION_FILTERS: { id: TransactionFilter; label: string }[] = [
  { id: 'ALL', label: 'Toutes' },
  { id: 'PENDING', label: 'En attente' },
];

const fadeUp = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } };
const stagger = (i: number) => ({ delay: i * 0.08 });
// Délai d'apparition des lignes plafonné : les pages chargées par « Charger plus » ne doivent pas attendre.
const rowDelay = (i: number) => ({ delay: Math.min(i, 10) * 0.04 });

/** Ajoute les nouveaux éléments à la suite, sans doublon (l'ordre « dernière activité » peut bouger entre deux pages). */
function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const known = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !known.has(item.id))];
}

/** Confirmation en ligne d'une action sensible : le bouton « Annuler » prend le focus (choix le plus sûr). */
function InlineConfirm({ label, message, confirmLabel, tone, onConfirm, onCancel }: {
  label: string;
  message: string;
  confirmLabel: string;
  tone: 'danger' | 'success';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);

  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-xs font-bold text-zinc-500">{message}</span>
      <button
        type="button"
        onClick={onConfirm}
        className={cn(
          "min-h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-colors",
          tone === 'danger' ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
        )}
      >
        {confirmLabel}
      </button>
      <button
        ref={cancelRef}
        type="button"
        onClick={onCancel}
        className="min-h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
      >
        Annuler
      </button>
    </div>
  );
}

function LoadMoreButton({ label, loading, onClick }: { label: string; loading: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={loading}
      onClick={onClick}
      className="min-h-10 px-6 rounded-xl text-xs font-black uppercase tracking-widest bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2"
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      Charger plus
    </button>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersCursor, setUsersCursor] = useState<string | null>(null);
  const [loadingMoreUsers, setLoadingMoreUsers] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsCursor, setTransactionsCursor] = useState<string | null>(null);
  const [transactionFilter, setTransactionFilter] = useState<TransactionFilter>('ALL');
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [loadingMoreTransactions, setLoadingMoreTransactions] = useState(false);
  const [summary, setSummary] = useState<TransactionSummary | null>(null);
  const [totalUsers, setTotalUsers] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [confirming, setConfirming] = useState<PendingConfirm | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Numéro de la dernière requête de transactions : une réponse plus ancienne est ignorée.
  const transactionsRequest = useRef(0);

  // Le proxy filtre /admin d'après le rôle du JWT ; l'API relit le rôle en base et fait foi.
  // Un 401/403 ici signifie session expirée ou rôle retiré : on quitte la console.
  const redirectIfUnauthorized = useCallback((res: Response) => {
    if (res.status === 401) {
      router.replace('/login');
      return true;
    }
    if (res.status === 403) {
      setDenied(true);
      router.replace('/');
      return true;
    }
    return false;
  }, [router]);

  // Sans curseur : première page (remplace la liste). Avec curseur : page suivante (ajoutée à la suite).
  const fetchUsers = useCallback(async (cursor?: string) => {
    try {
      const res = await fetch(cursor ? `/api/admin/users?cursor=${encodeURIComponent(cursor)}` : '/api/admin/users');
      if (redirectIfUnauthorized(res)) return;
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        setUsers((current) => (cursor ? mergeById(current, data.users) : data.users));
        setUsersCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null);
        setTotalUsers(typeof data.totalUsers === 'number' ? data.totalUsers : null);
      } else if (cursor) {
        setNotice({ kind: 'error', text: data?.error || 'Impossible de charger plus d\'étudiants.' });
      }
    } catch (err) {
      console.error(err);
      if (cursor) setNotice({ kind: 'error', text: 'Erreur réseau : impossible de charger plus d\'étudiants.' });
    }
  }, [redirectIfUnauthorized]);

  // Le filtre « En attente » est appliqué par l'API (?status=PENDING) ; la page suivante vient de l'en-tête X-Next-Cursor.
  const fetchTransactions = useCallback(async (filter: TransactionFilter, cursor?: string) => {
    const requestId = ++transactionsRequest.current;
    const query = new URLSearchParams();
    if (filter === 'PENDING') query.set('status', 'PENDING');
    if (cursor) query.set('cursor', cursor);
    const qs = query.toString();

    if (cursor) setLoadingMoreTransactions(true);
    else setTransactionsLoading(true);
    try {
      const res = await fetch(`/api/admin/transactions${qs ? `?${qs}` : ''}`);
      if (redirectIfUnauthorized(res)) return;
      const data = await res.json().catch(() => null);
      if (requestId !== transactionsRequest.current) return;
      if (res.ok) {
        // Tableau simple ou réponse paginée { transactions }
        const rows: Transaction[] = Array.isArray(data) ? data : data?.transactions ?? [];
        setTransactions((current) => (cursor ? mergeById(current, rows) : rows));
        setTransactionsCursor(res.headers.get('X-Next-Cursor'));
      } else {
        setNotice({ kind: 'error', text: data?.error || 'Impossible de charger les transactions.' });
      }
    } catch (err) {
      console.error(err);
      if (requestId === transactionsRequest.current) {
        setNotice({ kind: 'error', text: 'Erreur réseau : impossible de charger les transactions.' });
      }
    } finally {
      if (requestId === transactionsRequest.current) {
        setTransactionsLoading(false);
        setLoadingMoreTransactions(false);
      }
    }
  }, [redirectIfUnauthorized]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/transactions?summary=1');
      if (redirectIfUnauthorized(res)) return;
      if (res.ok) setSummary(await res.json());
    } catch (err) { console.error(err); }
  }, [redirectIfUnauthorized]);

  useEffect(() => {
    // Chargement initial : les setState des fetch ont lieu après l'await, pas de façon synchrone.
    Promise.all([fetchUsers(), fetchTransactions('ALL'), fetchSummary()]).then(() => setLoading(false));
    const interval = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(interval);
  }, [fetchUsers, fetchTransactions, fetchSummary]);

  const handleLoadMoreUsers = async () => {
    if (!usersCursor || loadingMoreUsers) return;
    setLoadingMoreUsers(true);
    await fetchUsers(usersCursor);
    setLoadingMoreUsers(false);
  };

  const handleLoadMoreTransactions = () => {
    if (!transactionsCursor || loadingMoreTransactions || transactionsLoading) return;
    void fetchTransactions(transactionFilter, transactionsCursor);
  };

  const handleFilterChange = (filter: TransactionFilter) => {
    if (filter === transactionFilter) return;
    setTransactionFilter(filter);
    setConfirming(null);
    void fetchTransactions(filter);
  };

  // Pour les actions (POST/DELETE) un 403 peut être une règle métier : seul le 401 déconnecte.
  const handleActionUnauthorized = (res: Response) => {
    if (res.status !== 401) return false;
    router.replace('/login');
    return true;
  };

  const handleDeleteUser = async (id: string, name: string) => {
    setConfirming(null);
    setNotice(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (handleActionUnauthorized(res)) return;
      if (res.ok) {
        setUsers((current) => current.filter((u) => u.id !== id));
        setTotalUsers((current) => (current === null ? null : Math.max(0, current - 1)));
        setNotice({ kind: 'success', text: `${name} a été supprimé.` });
      } else {
        const data = await res.json().catch(() => ({}));
        setNotice({ kind: 'error', text: data.error || 'La suppression a échoué.' });
      }
    } catch (err) {
      console.error(err);
      setNotice({ kind: 'error', text: 'Erreur réseau pendant la suppression.' });
    } finally {
      setBusyId(null);
    }
  };

  // Seul contournement quand le code OTP n'est pas livré à l'étudiant.
  const handleActivateUser = async (id: string, name: string) => {
    setConfirming(null);
    setNotice(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}/activate`, { method: 'POST' });
      if (handleActionUnauthorized(res)) return;
      if (res.ok) {
        setUsers((current) => current.map((u) => (u.id === id ? { ...u, isActive: true } : u)));
        setNotice({ kind: 'success', text: `Le compte de ${name} est activé.` });
      } else {
        const data = await res.json().catch(() => ({}));
        setNotice({ kind: 'error', text: data.error || "L'activation a échoué." });
      }
    } catch (err) {
      console.error(err);
      setNotice({ kind: 'error', text: "Erreur réseau pendant l'activation." });
    } finally {
      setBusyId(null);
    }
  };

  const handleApproveTransaction = async (id: string) => {
    setConfirming(null);
    setNotice(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/transactions/${encodeURIComponent(id)}/approve`, { method: 'POST' });
      if (handleActionUnauthorized(res)) return;
      if (res.ok) {
        // En vue « En attente », la transaction approuvée quitte la liste ; sinon son statut change.
        setTransactions((current) => (
          transactionFilter === 'PENDING'
            ? current.filter((t) => t.id !== id)
            : current.map((t) => (t.id === id ? { ...t, status: 'COMPLETED' } : t))
        ));
        setNotice({ kind: 'success', text: 'Transaction approuvée.' });
      } else {
        const data = await res.json().catch(() => ({}));
        setNotice({ kind: 'error', text: data.error || "L'approbation a échoué." });
        // 409 : la transaction a déjà été traitée ailleurs, la liste affichée est périmée.
        if (res.status === 409) void fetchTransactions(transactionFilter);
      }
      void fetchSummary();
    } catch (err) {
      console.error(err);
      setNotice({ kind: 'error', text: "Erreur réseau pendant l'approbation." });
    } finally {
      setBusyId(null);
    }
  };

  const isConfirming = (action: PendingConfirm['action'], id: string) =>
    confirming?.action === action && confirming.id === id;

  const isOnline = (lastActive: string) => {
    if (!lastActive) return false;
    return (currentTime - new Date(lastActive).getTime()) < 300000;
  };

  const STATS = [
    { label: "Chiffre d'Affaires", value: `${(summary?.revenue ?? 0).toLocaleString()} FCFA`, icon: CreditCard, color: 'emerald' },
    { label: 'Étudiants', value: totalUsers ?? users.length, icon: Users, color: 'blue' },
    { label: 'Paiements Attente', value: summary?.pending ?? 0, icon: Zap, color: 'amber' },
    { label: 'Ventes', value: summary?.completed ?? 0, icon: CreditCard, color: 'purple' },
  ] as const;

  const COLOR_CLASSES: Record<string, string> = {
    emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600',
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600',
    amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600',
  };

  if (denied) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-3 text-center">
        <Shield size={40} className="text-zinc-400" />
        <p className="text-sm font-bold text-zinc-500">Accès réservé aux administrateurs. Redirection...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-40">
        <Loader2 className="animate-spin text-blue-600" size={40} />
      </div>
    );
  }

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
        {TABS.map((tab) => (
          <motion.button
            key={tab.id}
            type="button"
            disabled={tab.soon}
            title={tab.soon ? 'Bientôt disponible' : undefined}
            whileHover={tab.soon ? undefined : { scale: 1.03 }} whileTap={tab.soon ? undefined : { scale: 0.97 }}
            onClick={() => { if (!tab.soon) { setActiveTab(tab.id as ActiveTab); setConfirming(null); } }}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === tab.id ? "bg-white dark:bg-zinc-800 text-blue-600 shadow-lg" : "text-zinc-500",
              tab.soon && "opacity-50 cursor-not-allowed"
            )}
          >
            <tab.icon size={14} /> {tab.label}
            {tab.soon && <span className="text-[9px] font-bold normal-case tracking-normal bg-zinc-200 dark:bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded-md">Bientôt</span>}
          </motion.button>
        ))}
      </motion.div>

      {/* Messages de succès / d'erreur des actions (role alert/status : annoncés par les lecteurs d'écran) */}
      <div className="px-2 sticky top-4 z-30 empty:hidden">
        {notice && (
          <div
            role={notice.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              "flex items-start justify-between gap-3 rounded-2xl border pl-4 pr-1 py-1 text-sm font-bold shadow-lg",
              notice.kind === 'success'
                ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"
            )}
          >
            <span className="py-2.5">{notice.text}</span>
            <button
              type="button"
              aria-label="Fermer le message"
              onClick={() => setNotice(null)}
              className="min-h-10 min-w-10 shrink-0 inline-flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
          className="px-2"
        >
          {activeTab === 'users' && (
            <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-zinc-50 dark:bg-zinc-950 text-[10px] font-black uppercase text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                    <tr><th className="px-8 py-5">Utilisateur</th><th className="px-8 py-5">Status</th><th className="px-8 py-5 text-right">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {users.map((u, i) => {
                      const fullName = `${u.firstName} ${u.lastName}`;
                      const busy = busyId === u.id;
                      return (
                        <motion.tr
                          key={u.id}
                          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={rowDelay(i)}
                          className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors"
                        >
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-500">{u.firstName?.[0]}{u.lastName?.[0]}</div>
                              <div><p className="text-sm font-bold">{fullName}</p><p className="text-[10px] text-zinc-500">{u.email}</p></div>
                            </div>
                          </td>
                          <td className="px-8 py-5">
                            <div className="flex flex-col items-start gap-1.5">
                              {isOnline(u.lastActive)
                                ? <span className="text-emerald-500 text-xs font-bold flex items-center gap-1.5"><Circle size={6} fill="currentColor" /> En ligne</span>
                                : <span className="text-zinc-400 text-xs font-medium">Hors ligne</span>
                              }
                              {!u.isActive && (
                                <span className="px-2.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-black uppercase">Non activé</span>
                              )}
                            </div>
                          </td>
                          <td className="px-8 py-5 text-right">
                            {isConfirming('activate', u.id) ? (
                              <InlineConfirm
                                label={`Confirmer l'activation du compte de ${fullName}`}
                                message="Activer ce compte sans code OTP ?"
                                confirmLabel="Activer"
                                tone="success"
                                onConfirm={() => handleActivateUser(u.id, fullName)}
                                onCancel={() => setConfirming(null)}
                              />
                            ) : isConfirming('delete', u.id) ? (
                              <InlineConfirm
                                label={`Confirmer la suppression de ${fullName}`}
                                message="Supprimer définitivement ce compte ?"
                                confirmLabel="Supprimer"
                                tone="danger"
                                onConfirm={() => handleDeleteUser(u.id, fullName)}
                                onCancel={() => setConfirming(null)}
                              />
                            ) : (
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                {!u.isActive && (
                                  <button
                                    type="button"
                                    aria-label={`Activer le compte de ${fullName}`}
                                    disabled={busy}
                                    onClick={() => { setNotice(null); setConfirming({ action: 'activate', id: u.id }); }}
                                    className="min-h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest transition-colors inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                                  >
                                    {busy ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />} Activer le compte
                                  </button>
                                )}
                                <motion.button
                                  type="button"
                                  aria-label={`Supprimer ${fullName}`}
                                  disabled={busy}
                                  whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                  onClick={() => { setNotice(null); setConfirming({ action: 'delete', id: u.id }); }}
                                  className="min-h-10 min-w-10 inline-flex items-center justify-center text-zinc-300 hover:text-red-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  <Trash2 size={18} />
                                </motion.button>
                              </div>
                            )}
                          </td>
                        </motion.tr>
                      );
                    })}
                    {users.length === 0 && (
                      <tr><td colSpan={3} className="px-8 py-20 text-center text-zinc-400 font-bold italic">Aucun utilisateur.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {(usersCursor || (totalUsers !== null && users.length > 0)) && (
                <div className="flex flex-col items-center gap-3 border-t border-zinc-100 dark:border-zinc-800 p-4">
                  {totalUsers !== null && (
                    <p className="text-xs text-zinc-500 font-medium">{users.length} sur {totalUsers} étudiants affichés</p>
                  )}
                  {usersCursor && (
                    <LoadMoreButton label="Charger plus d'étudiants" loading={loadingMoreUsers} onClick={handleLoadMoreUsers} />
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="space-y-4">
              <div role="group" aria-label="Filtrer les transactions" className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-2xl w-fit max-w-full overflow-x-auto">
                {TRANSACTION_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={transactionFilter === f.id}
                    onClick={() => handleFilterChange(f.id)}
                    className={cn(
                      "min-h-10 px-4 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap",
                      transactionFilter === f.id ? "bg-white dark:bg-zinc-800 text-blue-600 shadow" : "text-zinc-500"
                    )}
                  >
                    {f.label}{f.id === 'PENDING' && summary ? ` (${summary.pending})` : ''}
                  </button>
                ))}
              </div>

              <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left" aria-busy={transactionsLoading}>
                    <thead className="bg-zinc-50 dark:bg-zinc-950 text-[10px] font-black uppercase text-zinc-500 border-b border-zinc-200 dark:border-zinc-800">
                      <tr>
                        <th className="px-8 py-5">Étudiant</th>
                        <th className="px-8 py-5">Pack / Montant</th>
                        <th className="px-8 py-5">Status</th>
                        <th className="px-8 py-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {transactionsLoading ? (
                        <tr><td colSpan={4} className="px-8 py-20 text-center text-zinc-400"><Loader2 size={28} className="animate-spin mx-auto" aria-label="Chargement des transactions" /></td></tr>
                      ) : transactions.map((t, i) => {
                        const studentName = `${t.user.firstName} ${t.user.lastName}`;
                        const busy = busyId === t.id;
                        return (
                          <motion.tr
                            key={t.id}
                            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={rowDelay(i)}
                            className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors"
                          >
                            <td className="px-8 py-5">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><User size={20} /></div>
                                <div><p className="text-sm font-bold">{studentName}</p><p className="text-[10px] text-zinc-500">{new Date(t.createdAt).toLocaleString()}</p></div>
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
                                isConfirming('approve', t.id) ? (
                                  <InlineConfirm
                                    label={`Confirmer l'approbation du paiement de ${studentName}`}
                                    message="Valider ce paiement et créditer les jetons ?"
                                    confirmLabel="Valider"
                                    tone="success"
                                    onConfirm={() => handleApproveTransaction(t.id)}
                                    onCancel={() => setConfirming(null)}
                                  />
                                ) : (
                                  <motion.button
                                    type="button"
                                    aria-label={`Approuver le paiement de ${studentName}`}
                                    disabled={busy}
                                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                    onClick={() => { setNotice(null); setConfirming({ action: 'approve', id: t.id }); }}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white min-h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 ml-auto disabled:opacity-60 disabled:cursor-not-allowed"
                                  >
                                    {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Approuver
                                  </motion.button>
                                )
                              )}
                            </td>
                          </motion.tr>
                        );
                      })}
                      {!transactionsLoading && transactions.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-8 py-20 text-center text-zinc-400 font-bold italic">
                            {transactionFilter === 'PENDING' ? 'Aucune transaction en attente.' : 'Aucune transaction.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {transactionsCursor && !transactionsLoading && (
                  <div className="flex justify-center border-t border-zinc-100 dark:border-zinc-800 p-4">
                    <LoadMoreButton label="Charger plus de transactions" loading={loadingMoreTransactions} onClick={handleLoadMoreTransactions} />
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
