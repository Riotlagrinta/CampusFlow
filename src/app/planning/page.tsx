'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BookOpen, 
  User, 
  Plus, 
  Trash2, 
  Loader2, 
  Edit2
} from 'lucide-react';
import { useSound } from '@/hooks/useSound';

// --- Types ---

type Course = {
  time: string;
  subject: string;
  credits?: string;
  teacher?: string;
  type?: string;
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
  subjectName: string;
  subject?: { name: string };
  type: string;
  isAcademic: boolean;
  createdAt: string;
};

// --- Constants ---

const DAYS_ORDER = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

// --- Components ---

export default function PlanningPage() {
  const { play } = useSound();
  const [activeTab, setActiveTab] = useState<'academic' | 'personal' | 'combined'>('combined');
  const [personalEvents, setPersonalEvents] = useState<PersonalEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [options, setOptions] = useState<{ fields: any[], levels: any[] }>({ fields: [], levels: [] });
  
  // Admin Filters
  const [filterFieldId, setFilterFieldId] = useState('');
  const [filterLevelId, setFilterLevelId] = useState('');

  // Form State
  const [newEvent, setNewEvent] = useState({
    day: 'Lundi',
    time: '',
    subject: '',
    type: 'Personnel',
    fieldId: '',
    levelId: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initial Data Load
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setIsAdmin(user.role === 'ADMIN');
    
    // Si Admin, on charge les options d'abord, puis les events
    if (user.role === 'ADMIN') {
      fetch('/api/academic/options')
        .then(res => res.json())
        .then(data => {
            setOptions(data);
            fetchPersonalEvents(data.fields?.[0]?.id, data.levels?.[0]?.id); // Charge par défaut le premier
        });
    } else {
        fetchPersonalEvents();
    }
  }, []);

  // Recharge quand les filtres changent (manuellement)
  useEffect(() => {
    if (isAdmin && filterFieldId && filterLevelId) {
        fetchPersonalEvents(filterFieldId, filterLevelId);
    }
  }, [filterFieldId, filterLevelId]);

  const fetchPersonalEvents = async (fId?: string, lId?: string) => {
    setIsLoading(true);
    try {
      let url = '/api/planning/personal';
      if (fId && lId) {
        url += `?fieldId=${fId}&levelId=${lId}`;
        // Mettre à jour l'état local si ce n'est pas déjà fait (pour l'UI)
        if (fId !== filterFieldId) setFilterFieldId(fId);
        if (lId !== filterLevelId) setFilterLevelId(lId);
      }
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setPersonalEvents(data);
      }
    } catch (error) {
      console.error("Failed to fetch personal events", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEvent.time || !newEvent.subject) return;

    setIsSubmitting(true);
    try {
      const method = editingId ? 'PUT' : 'POST';
      const body = editingId ? { ...newEvent, id: editingId } : newEvent;

      const res = await fetch('/api/planning/personal', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        await fetchPersonalEvents(filterFieldId, filterLevelId);
        setIsModalOpen(false);
        setEditingId(null);
        setNewEvent({ day: 'Lundi', time: '', subject: '', type: 'Personnel', fieldId: '', levelId: '' });
        play('success');
      }
    } catch (error) {
      console.error("Error saving event", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (event: any) => {
    // Retrouver l'événement original pour avoir toutes les infos (fieldId, levelId)
    const originalEvent = personalEvents.find(e => e.id === event.id);
    if (!originalEvent) return;

    setEditingId(originalEvent.id);
    setNewEvent({
      day: originalEvent.day,
      time: originalEvent.time,
      subject: originalEvent.subjectName,
      type: originalEvent.isAcademic ? 'Académique' : 'Personnel',
      fieldId: (originalEvent as any).fieldId || '',
      levelId: (originalEvent as any).levelId || ''
    });
    setIsModalOpen(true);
  };

  const handleDeleteEvent = async (id: string) => {
    if (!confirm('Voulez-vous supprimer ce créneau ?')) return;

    try {
      const res = await fetch(`/api/planning/personal?id=${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        play('success');
        fetchPersonalEvents();
      }
    } catch (error) {
      console.error("Failed to delete event", error);
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
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Planning Hebdomadaire</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2">
            Gérez votre temps entre les cours officiels et votre travail personnel.
          </p>
          
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2 mt-4 p-2 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30 w-fit">
               <span className="text-[10px] font-black uppercase text-blue-600 px-2">Vue Admin :</span>
               <select 
                 value={filterFieldId} 
                 onChange={(e) => setFilterFieldId(e.target.value)}
                 className="bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-800 rounded-lg px-2 py-1 text-xs font-bold"
               >
                  <option value="">Toutes filières</option>
                  {options.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
               </select>
               <select 
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
        
        <div className="flex items-center gap-3">
          <div className="bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 flex">
             {(['academic', 'combined', 'personal'] as const).map((tab) => (
               <button
                 key={tab}
                 onClick={() => setActiveTab(tab)}
                 className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                   activeTab === tab 
                     ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' 
                     : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                 }`}
               >
                 {tab === 'academic' ? 'Académique' : tab === 'personal' ? 'Personnel' : 'Combiné'}
               </button>
             ))}
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/20 transition-all"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Ajouter</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={40} className="animate-spin text-blue-600" />
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
                  key={idx} 
                  className={`relative overflow-hidden group p-6 rounded-2xl border transition-all hover:shadow-md ${
                    course.isPersonal 
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-800/30' 
                      : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
                      course.isPersonal 
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400' 
                        : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                    }`}>
                      {course.time}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      {(course.isPersonal || isAdmin) && course.id && (
                        <>
                          <button 
                            onClick={() => handleEditClick(course)}
                            className="p-1.5 text-zinc-400 hover:text-blue-500 transition-all"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button 
                            onClick={() => handleDeleteEvent(course.id!)}
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
                     <span>{course.teacher || 'Auto-formation'}</span>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsModalOpen(false);
                setEditingId(null);
                setNewEvent({ day: 'Lundi', time: '', subject: '', type: 'Personnel', fieldId: '', levelId: '' });
              }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
            >
              <div className="p-6 border-b border-zinc-100 dark:border-zinc-800">
                <h3 className="text-xl font-bold">{editingId ? 'Modifier le créneau' : 'Ajouter un créneau personnel'}</h3>
                <p className="text-sm text-zinc-500 mt-1">
                  {editingId ? 'Mettez à jour vos informations de cours ou de révision.' : 'Organisez vos révisions et temps libre.'}
                </p>
              </div>
              
              <form onSubmit={handleAddEvent} className="p-6 space-y-4">
                <div className="space-y-2">
                   <label className="text-xs font-bold uppercase text-zinc-500">Jour</label>
                   <select 
                     className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                     value={newEvent.day}
                     onChange={(e) => setNewEvent({...newEvent, day: e.target.value})}
                   >
                      {DAYS_ORDER.map(day => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                   </select>
                </div>

                <div className="space-y-2">
                   <label className="text-xs font-bold uppercase text-zinc-500">Créneau Horaire</label>
                   <input 
                     type="text" 
                     placeholder="Ex: 18h00 - 20h00"
                     required
                     className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                     value={newEvent.time}
                     onChange={(e) => setNewEvent({...newEvent, time: e.target.value})}
                   />
                </div>

                <div className="space-y-2">
                   <label className="text-xs font-bold uppercase text-zinc-500">Activité / Matière</label>
                   <input 
                     type="text" 
                     placeholder="Ex: Révision Java, Sport..."
                     required
                     className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                     value={newEvent.subject}
                     onChange={(e) => setNewEvent({...newEvent, subject: e.target.value})}
                   />
                </div>

                {isAdmin && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                       <label className="text-xs font-bold uppercase text-zinc-500">Type de créneau</label>
                       <select 
                         className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                         value={newEvent.type}
                         onChange={(e) => setNewEvent({...newEvent, type: e.target.value})}
                       >
                          <option value="Personnel">Personnel (Privé)</option>
                          <option value="Académique">Académique (Public - Par classe)</option>
                       </select>
                    </div>

                    {newEvent.type === 'Académique' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase text-zinc-500">Filière cible</label>
                          <select 
                            required
                            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            value={newEvent.fieldId}
                            onChange={(e) => setNewEvent({...newEvent, fieldId: e.target.value})}
                          >
                            <option value="">Choisir...</option>
                            {options.fields.map(f => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold uppercase text-zinc-500">Niveau cible</label>
                          <select 
                            required
                            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            value={newEvent.levelId}
                            onChange={(e) => setNewEvent({...newEvent, levelId: e.target.value})}
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
                    onClick={() => {
                      setIsModalOpen(false);
                      setEditingId(null);
                      setNewEvent({ day: 'Lundi', time: '', subject: '', type: 'Personnel', fieldId: '', levelId: '' });
                    }}
                    className="flex-1 px-4 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
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