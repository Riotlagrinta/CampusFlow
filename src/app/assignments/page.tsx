"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, 
  Clock, 
  FileText, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  ChevronRight,
  BookOpen
} from 'lucide-react';
import { useSound } from '@/hooks/useSound';

type Assignment = {
  id: string;
  title: string;
  content: string;
  dueDate: string;
  semester: number;
  subject?: { name: string, code: string | null };
};

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSemester, setCurrentSemester] = useState(2);

  useEffect(() => {
    fetchAssignments();
  }, [currentSemester]);

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/assignments?semester=${currentSemester}`);
      const data = await res.json();
      setAssignments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getRemainingDays = (date: string) => {
    const diff = new Date(date).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-20 px-4 pt-10">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-2">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
            <FileText className="text-emerald-600" /> Devoirs & Projets
          </h1>
          <p className="text-zinc-500 font-medium text-sm">Gérez vos échéances académiques en un coup d&apos;œil.</p>
        </div>

        <div className="flex bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <button onClick={() => setCurrentSemester(1)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${currentSemester === 1 ? 'bg-white dark:bg-zinc-800 text-emerald-600 shadow-sm' : 'text-zinc-500'}`}>S1</button>
            <button onClick={() => setCurrentSemester(2)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${currentSemester === 2 ? 'bg-white dark:bg-zinc-800 text-emerald-600 shadow-sm' : 'text-zinc-500'}`}>S2</button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-emerald-600" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {assignments.map((item) => {
            const daysLeft = getRemainingDays(item.dueDate);
            const isUrgent = daysLeft <= 2 && daysLeft >= 0;
            const isLate = daysLeft < 0;

            return (
              <motion.div 
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-white dark:bg-zinc-900 rounded-[2rem] p-6 border-2 shadow-sm relative overflow-hidden ${isUrgent ? 'border-amber-500 bg-amber-50/10' : isLate ? 'border-red-500 bg-red-50/10' : 'border-zinc-100 dark:border-zinc-800'}`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2 px-3 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-[10px] font-black uppercase text-zinc-500">
                    <BookOpen size={12} /> {item.subject?.name || 'Matière'}
                  </div>
                  {isLate ? (
                    <span className="text-[10px] font-black uppercase text-red-600 flex items-center gap-1"><AlertCircle size={12} /> Terminé</span>
                  ) : (
                    <span className={`text-[10px] font-black uppercase flex items-center gap-1 ${isUrgent ? 'text-amber-600' : 'text-emerald-600'}`}>
                      <Clock size={12} /> {daysLeft === 0 ? "Aujourd'hui" : `${daysLeft} jours restants`}
                    </span>
                  )}
                </div>

                <h3 className="text-xl font-black mb-3">{item.title}</h3>
                <p className="text-sm text-zinc-500 line-clamp-3 mb-6 font-medium leading-relaxed">{item.content}</p>

                <div className="flex items-center justify-between pt-4 border-t border-zinc-50 dark:border-zinc-800">
                   <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400">
                      <Calendar size={12} /> Échéance : {new Date(item.dueDate).toLocaleDateString()}
                   </div>
                   <button className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl hover:bg-zinc-200 transition-all">
                      <ChevronRight size={18} />
                   </button>
                </div>
              </motion.div>
            );
          })}

          {assignments.length === 0 && (
            <div className="col-span-full py-32 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-900 rounded-[3rem]">
               <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-500/20" />
               <p className="text-zinc-400 font-medium italic">Aucun devoir prévu pour ce semestre.<br/>Profitez-en pour réviser !</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
