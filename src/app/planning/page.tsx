'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  User,
  Plus,
  Trash2,
  Loader2,
  Edit2,
  X
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useSound } from '@/hooks/useSound';
import { getCurrentSemester } from '@/lib/semester';

// --- Types ---

type Course = {
  time: string;
  subject: string;
  credits?: string | null;
  teacher?: string | null;
  type?: string | null;
  isPersonal?: boolean;
  id?: string;
};

type DaySchedule = {
  day: string;
  courses: Course[];
};

type PersonalEvent = {
  id: string;
  day: string;
  time: string;
  subjectName: string | null;
  subject?: { name: string } | null;
  credits?: string | null;
  teacher?: string | null;
  type: string | null;
  isAcademic: boolean;
  fieldId?: string | null;
  levelId?: string | null;
  semester: number;
  createdAt: string;
};

type Notice = { kind: 'success' | 'error'; text: string };

// --- Constants ---

const DAYS_ORDER = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const PAGE_SIZE = 50;
const MAX_PAGES = 20; // garde-fou : 1000 créneaux maximum chargés

const EMPTY_EVENT = { day: 'Lundi', time: '', subject: '', type: 'Personnel', fieldId: '', levelId: '' };

async function readApiError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string') return data.error;
  } catch {
    // corps non JSON : on retombe sur le statut
  }
  return `Erreur ${res.status}`;
}

// --- Components ---

export default function PlanningPage() {
  const { play } = useSound();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState<'academic' | 'personal' | 'combined'>('combined');
  const [personalEvents, setPersonalEvents] = useState<PersonalEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [currentSemester, setCurrentSemester] = useState<number>(() => getCurrentSemester()); // semestre en cours par défaut
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [options, setOptions] = useState<{ fields: { id: string; name: string }[], levels: { id: string; name: string }[] }>({ fields: [], levels: [] });
  const [optionsLoaded, setOptionsLoaded] = useState(false);

  // Admin Filters
  const [filterFieldId, setFilterFieldId] = useState('');
  const [filterLevelId, setFilterLevelId] = useState('');

  // Form State
  const [newEvent, setNewEvent] = useState(EMPTY_EVENT);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Évite qu'une réponse tardive (ancien semestre/filtre) écrase la liste affichée
  const latestRequest = useRef(0);

  // Récupérer le semestre sauvegardé
  useEffect(() => {
    try {
      const savedSemester = parseInt(localStorage.getItem('planning_semester') || '', 10);
      if (savedSemester >= 1 && savedSemester <= 12) setCurrentSemester(savedSemester);
    } catch {
      // stockage indisponible : on garde le semestre par défaut
    }
    setPrefsLoaded(true);
  }, []);

  // Admin : on charge les options, puis on sélectionne par défaut la première classe
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/academic/options')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data && Array.isArray(data.fields) && Array.isArray(data.levels)) {
          setOptions(data);
          setFilterFieldId(prev => prev || data.fields[0]?.id || '');
          setFilterLevelId(prev => prev || data.levels[0]?.id || '');
        }
      })
      .catch(err => console.error('Erreur options:', err))
      .finally(() => setOptionsLoaded(true));
  }, [isAdmin]);

  const fetchPersonalEvents = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setIsLoading(true);
    setLoadError(null);

    try {
      const all: PersonalEvent[] = [];
      let cursor: string | null = null;

      // L'API est paginée (50 par page) : on suit les pages pour afficher toute la semaine
      for (let page = 0; page < MAX_PAGES; page++) {
        const params = new URLSearchParams({ semester: String(currentSemester), limit: String(PAGE_SIZE) });
        if (isAdmin && filterFieldId && filterLevelId) {
          params.set('fieldId', filterFieldId);
          params.set('levelId', filterLevelId);
        }
        if (cursor) params.set('cursor', cursor);

        const res: Response = await fetch(`/api/planning/personal?${params}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(await readApiError(res));

        const data: unknown = await res.json();
        if (!Array.isArray(data)) throw new Error('Réponse inattendue du serveur.');
        all.push(...(data as PersonalEvent[]));

        cursor = res.headers.get('X-Next-Cursor');
        if (!cursor) break;
      }

      if (requestId === latestRequest.current) setPersonalEvents(all);
    } catch (error) {
      console.error("Failed to fetch personal events", error);
      if (requestId === latestRequest.current) {
        setPersonalEvents([]);
        setLoadError(error instanceof Error ? error.message : 'Impossible de charger le planning.');
      }
    } finally {
      if (requestId === latestRequest.current) setIsLoading(false);
    }
  }, [currentSemester, filterFieldId, filterLevelId, isAdmin]);

  // Recharge quand le semestre ou les filtres changent
  const ready = prefsLoaded && (!isAdmin || optionsLoaded);
  useEffect(() => {
    if (ready) fetchPersonalEvents();
  }, [ready, fetchPersonalEvents]);

  const handleSelectSemester = (semester: number) => {
    setCurrentSemester(semester);
    try {
      localStorage.setItem('planning_semester', String(semester));
    } catch {
      // stockage indisponible : sans conséquence
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormError(null);
    setNewEvent(EMPTY_EVENT);
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.time || !newEvent.subject) return;

    setIsSubmitting(true);
    setFormError(null);
    try {
      const method = editingId ? 'PUT' : 'POST';
      const body = editingId ? { ...newEvent, id: editingId, semester: currentSemester } : { ...newEvent, semester: currentSemester };

      const res = await fetch('/api/planning/personal', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        closeModal();
        play('success');
        await fetchPersonalEvents();
      } else {
        setFormError(await readApiError(res));
      }
    } catch (error) {
      console.error("Error saving event", error);
      setFormError('Impossible de contacter le serveur.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (event: Course) => {
    // Retrouver l'événement original pour avoir toutes les infos (fieldId, levelId)
    const originalEvent = personalEvents.find(e => e.id === event.id);
    if (!originalEvent) return;

    setEditingId(originalEvent.id);
    setFormError(null);
    setNewEvent({
      day: originalEvent.day,
      time: originalEvent.time,
      subject: originalEvent.subjectName || originalEvent.subject?.name || '',
      type: originalEvent.isAcademic ? 'Académique' : 'Personnel',
      fieldId: originalEvent.fieldId || '',
      levelId: originalEvent.levelId || ''
    });
    setIsModalOpen(true);
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm('Voulez-vous supprimer ce créneau ?')) return;

    try {
      const res = await fetch(`/api/planning/personal?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        play('success');
        setPersonalEvents(prev => prev.filter(ev => ev.id !== id));
      } else {
        setNotice({ kind: 'error', text: `Suppression impossible : ${await readApiError(res)}` });
      }
    } catch (error) {
      console.error("Failed to delete event", error);
      setNotice({ kind: 'error', text: 'Suppression impossible : serveur injoignable.' });
    }
  };

  const handleCloneSemester = async () => {
    if (!isAdmin || !filterFieldId || !filterLevelId) {
      setNotice({ kind: 'error', text: 'Veuillez sélectionner une filière et un niveau.' });
      return;
    }

    const targetSemester = currentSemester === 1 ? 2 : 1;
    if (!confirm(`Voulez-vous copier ce planning (S${currentSemester}) vers le S${targetSemester} ? Cela écrasera le planning existant du S${targetSemester}.`)) {
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/planning/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldId: filterFieldId,
          levelId: filterLevelId,
          sourceSemester: currentSemester,
          targetSemester
        }),
      });

      if (res.ok) {
        play('success');
        setNotice({ kind: 'success', text: `Planning copié avec succès vers le S${targetSemester} !` });
      } else {
        setNotice({ kind: 'error', text: `Erreur : ${await readApiError(res)}` });
      }
    } catch (error) {
      console.error("Failed to clone semester", error);
      setNotice({ kind: 'error', text: 'Copie impossible : serveur injoignable.' });
    } finally {
      setIsLoading(false);
    }
  };

  // --- Logic to Merge Schedules ---

  const getDaySchedule = (day: string): Course[] => {
    // Filtrer les événements de la DB pour ce jour
    const dbEvents = personalEvents
      .filter(e => e.day === day)
      .map(e => ({
        id: e.id,
        time: e.time,
        subject: e.subject?.name || e.subjectName || 'Matière inconnue',
        type: e.type,
        teacher: e.teacher,
        credits: e.credits,
        isPersonal: !e.isAcademic
      }));

    return dbEvents.sort((a, b) => a.time.localeCompare(b.time));
  };

  const displaySchedule: DaySchedule[] = DAYS_ORDER.map(day => ({
    day,
    courses: getDaySchedule(day).filter(c => {
      if (activeTab === 'combined') return true;
      if (activeTab === 'personal') return c.isPersonal;
      if (activeTab === 'academic') return !c.isPersonal;
      return true;
    })
  }));

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">

      {/* Ambient blob */}
      <motion.div className="fixed top-20 right-10 w-80 h-80 bg-blue-500/5 rounded-full blur-[120px] -z-10 pointer-events-none"
        animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 9, repeat: Infinity }} />

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Planning Hebdomadaire</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2">
            Gérez votre temps entre les cours officiels et votre travail personnel.
          </p>

          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2 mt-4 p-2 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30 w-fit">
              <span className="text-[10px] font-black uppercase text-blue-600 px-2">Vue Admin :</span>
              <select
                aria-label="Filière affichée"
                value={filterFieldId}
                onChange={(e) => setFilterFieldId(e.target.value)}
                className="bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-800 rounded-lg px-2 py-1 text-xs font-bold"
              >
                <option value="">Toutes filières</option>
                {options.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <select
                aria-label="Niveau affiché"
                value={filterLevelId}
                onChange={(e) => setFilterLevelId(e.target.value)}
                className="bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-800 rounded-lg px-2 py-1 text-xs font-bold"
              >
                <option value="">Tous niveaux</option>
                {options.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3">
          <div className="flex bg-white dark:bg-zinc-900 p-1.5 rounded-2xl border-2 border-zinc-100 dark:border-zinc-800 shadow-sm">
            <button
              type="button"
              onClick={() => handleSelectSemester(1)}
              aria-pressed={currentSemester === 1}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${currentSemester === 1 ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
            >
              S1
              {currentSemester === 1 && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
            </button>
            <button
              type="button"
              onClick={() => handleSelectSemester(2)}
              aria-pressed={currentSemester === 2}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${currentSemester === 2 ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
            >
              S2
              {currentSemester === 2 && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
            </button>
          </div>

          <div className="bg-white dark:bg-zinc-900 p-1.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex">
            {(['academic', 'combined', 'personal'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                aria-pressed={activeTab === tab}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === tab
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                  }`}
              >
                {tab === 'academic' ? 'Académique' : tab === 'personal' ? 'Personnel' : 'Combiné'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 outline-none">
            {isAdmin && filterFieldId && filterLevelId && (
              <button
                type="button"
                onClick={handleCloneSemester}
                title="Cloner vers l'autre semestre"
                aria-label="Cloner vers l'autre semestre"
                className="flex items-center justify-center w-12 h-12 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all shadow-sm"
              >
                <div className="flex flex-col items-center">
                  <Plus size={16} className="rotate-45 -mb-2" />
                  <Plus size={16} />
                </div>
              </button>
            )}
            <motion.button type="button" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
              onClick={() => setIsModalOpen(true)}
              aria-label="Ajouter un créneau"
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/25 transition-all"
            >
              <Plus size={20} />
              <span className="hidden sm:inline">Ajouter</span>
            </motion.button>
          </div>
        </motion.div>
      </motion.div>

      {notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-medium ${notice.kind === 'error'
            ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300'
            : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300'}`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Fermer le message" className="shrink-0 opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
            <Loader2 size={40} className="text-blue-600" />
          </motion.div>
        </div>
      ) : loadError ? (
        <div role="alert" className="text-center py-20 text-zinc-500 border-2 border-dashed border-red-200 dark:border-red-900/40 rounded-2xl space-y-4">
          <p className="text-lg font-bold">Impossible de charger le planning.</p>
          <p className="text-sm">{loadError}</p>
          <button
            type="button"
            onClick={() => fetchPersonalEvents()}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold"
          >
            Réessayer
          </button>
        </div>
      ) : (
        /* Schedule Grid */
        <div className="grid grid-cols-1 gap-8">
          {displaySchedule.map((daySchedule) => (
            <motion.div
              key={daySchedule.day}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold text-zinc-400 uppercase tracking-tight w-32">{daySchedule.day}</h2>
                <div className="h-px bg-zinc-200 dark:bg-zinc-800 flex-1" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {daySchedule.courses.map((course, idx) => (
                  <div
                    key={course.id ?? idx}
                    className={`relative overflow-hidden group p-6 rounded-2xl border transition-all hover:shadow-md ${course.isPersonal
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-800/30'
                      : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                      }`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${course.isPersonal
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
                        : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                        }`}>
                        {course.time}
                      </div>
                      <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 focus-within:opacity-100 transition-all">
                        {(course.isPersonal || isAdmin) && course.id && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleEditClick(course)}
                              aria-label={`Modifier ${course.subject}`}
                              className="p-1.5 text-zinc-400 hover:text-blue-500 transition-all"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEvent(course.id!)}
                              aria-label={`Supprimer ${course.subject}`}
                              className="p-1.5 text-zinc-400 hover:text-red-500 transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-1 line-clamp-2">
                      {course.subject}
                    </h3>

                    <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 mt-3">
                      {course.isPersonal ? <User size={14} /> : <BookOpen size={14} />}
                      <span>{course.teacher || (course.isPersonal ? 'Auto-formation' : 'Enseignant non précisé')}</span>
                      {course.credits && course.credits !== '-' && (
                        <>
                          <span className="w-1 h-1 bg-zinc-300 rounded-full" />
                          <span className="text-xs font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{course.credits}</span>
                        </>
                      )}
                    </div>

                    {course.isPersonal && (
                      <div className="absolute right-0 top-0 h-full w-1 bg-emerald-500" />
                    )}
                  </div>
                ))}

                {daySchedule.courses.length === 0 && (
                  <div className="col-span-full py-8 text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                    <p className="text-zinc-400 text-sm">Aucun événement prévu pour ce jour.</p>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add Event Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div role="dialog" aria-modal="true" aria-labelledby="planning-modal-title" className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
            >
              <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
                <h3 id="planning-modal-title" className="text-xl font-bold">{editingId ? 'Modifier le créneau' : 'Ajouter un créneau personnel'}</h3>
                <p className="text-sm text-zinc-500 mt-1">
                  {editingId ? 'Mettez à jour vos informations de cours ou de révision.' : 'Organisez vos révisions et temps libre.'}
                </p>
              </div>

              <form onSubmit={handleAddEvent} className="p-6 space-y-4">
                {formError && (
                  <p role="alert" className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300">
                    {formError}
                  </p>
                )}

                <div className="space-y-2">
                  <label htmlFor="planning-day" className="text-xs font-bold uppercase text-zinc-500">Jour</label>
                  <select
                    id="planning-day"
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    value={newEvent.day}
                    onChange={(e) => setNewEvent({ ...newEvent, day: e.target.value })}
                  >
                    {DAYS_ORDER.map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="planning-time" className="text-xs font-bold uppercase text-zinc-500">Créneau Horaire</label>
                  <input
                    id="planning-time"
                    type="text"
                    placeholder="Ex: 18h00 - 20h00"
                    required
                    maxLength={50}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    value={newEvent.time}
                    onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="planning-subject" className="text-xs font-bold uppercase text-zinc-500">Activité / Matière</label>
                  <input
                    id="planning-subject"
                    type="text"
                    placeholder="Ex: Révision Java, Sport..."
                    required
                    maxLength={120}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    value={newEvent.subject}
                    onChange={(e) => setNewEvent({ ...newEvent, subject: e.target.value })}
                  />
                </div>

                {isAdmin && (
                  <div className="space-y-4">
                    {/* Le type d'un créneau existant ne peut pas être modifié */}
                    {!editingId && (
                      <div className="space-y-2">
                        <label htmlFor="planning-type" className="text-xs font-bold uppercase text-zinc-500">Type de créneau</label>
                        <select
                          id="planning-type"
                          className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                          value={newEvent.type}
                          onChange={(e) => setNewEvent({ ...newEvent, type: e.target.value })}
                        >
                          <option value="Personnel">Personnel (Privé)</option>
                          <option value="Académique">Académique (Public - Par classe)</option>
                        </select>
                      </div>
                    )}

                    {newEvent.type === 'Académique' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label htmlFor="planning-field" className="text-xs font-bold uppercase text-zinc-500">Filière cible</label>
                          <select
                            id="planning-field"
                            required
                            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            value={newEvent.fieldId}
                            onChange={(e) => setNewEvent({ ...newEvent, fieldId: e.target.value })}
                          >
                            <option value="">Choisir...</option>
                            {options.fields.map(f => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="planning-level" className="text-xs font-bold uppercase text-zinc-500">Niveau cible</label>
                          <select
                            id="planning-level"
                            required
                            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            value={newEvent.levelId}
                            onChange={(e) => setNewEvent({ ...newEvent, levelId: e.target.value })}
                          >
                            <option value="">Choisir...</option>
                            {options.levels.map(l => (
                              <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 px-4 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                    {isSubmitting ? 'Enregistrement...' : editingId ? 'Enregistrer' : 'Confirmer'}
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
