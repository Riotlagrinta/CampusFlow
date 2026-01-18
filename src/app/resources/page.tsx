'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, 
  Video, 
  Headphones, 
  Plus, 
  Download, 
  Loader2,
  File,
  Eye,
  X,
  Sparkles,
  Trash2,
  Bot
} from 'lucide-react';
import { useSound } from '@/hooks/useSound';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Resource = {
  id: string;
  title: string;
  type: string; // "PDF", "VIDEO", "AUDIO", "OTHER"
  url: string;
  subject: string | null;
  size: string | null;
  createdAt: string;
  author: { firstName: string; lastName: string };
};

export default function ResourcesPage() {
  const { play } = useSound();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<Resource | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [explainingId, setExplainingId] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [options, setOptions] = useState<{ fields: any[], levels: any[] }>({ fields: [], levels: [] });

  // Form State
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [type, setType] = useState('PDF');
  const [fieldId, setFieldId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchResources();
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setIsAdmin(user.role === 'ADMIN');

    fetch('/api/academic/options')
      .then(res => res.json())
      .then(data => setOptions(data));
  }, []);

  const handleGenerateQuiz = async (resourceId: string) => {
    setGeneratingId(resourceId);
    try {
      const res = await fetch(`/api/resources/${resourceId}/generate-quiz`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        play('success');
        window.location.href = '/quiz'; // Rediriger vers la page des quizz
      } else {
        alert(data.error || "Erreur lors de la génération");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGeneratingId(null);
    }
  };

  const handleExplain = async (resourceId: string) => {
    setExplainingId(resourceId);
    try {
      const res = await fetch(`/api/resources/${resourceId}/explain`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // Plus besoin d'email
      });
      const data = await res.json();
      if (res.ok) {
        setExplanation(data.explanation);
        play('success');
      } else {
        alert(data.error || "Erreur lors de l'explication");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setExplainingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Voulez-vous vraiment supprimer ce document ? Cela supprimera aussi les quizz associés.')) return;
    
    try {
      const res = await fetch(`/api/resources/${id}`, { method: 'DELETE' });
      if (res.ok) {
        play('success');
        fetchResources();
      } else {
        const data = await res.json();
        alert(data.error || 'Erreur lors de la suppression');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchResources = async () => {
    try {
      const res = await fetch('/api/resources');
      if (res.ok) {
        const data = await res.json();
        setResources(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    formData.append('type', type);
    formData.append('subject', subject);
    formData.append('fieldId', fieldId);
    formData.append('levelId', levelId);

    try {
      const res = await fetch('/api/resources', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        await fetchResources();
        setIsModalOpen(false);
        // Reset form
        setTitle('');
        setSubject('');
        setType('PDF');
        setFile(null);
      } else {
        alert("Erreur lors de l'upload");
      }
    } catch (error) {
      console.error(error);
      alert("Erreur serveur");
    } finally {
      setUploading(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'PDF': return <FileText size={24} className="text-red-500" />;
      case 'VIDEO': return <Video size={24} className="text-blue-500" />;
      case 'AUDIO': return <Headphones size={24} className="text-purple-500" />;
      default: return <File size={24} className="text-gray-500" />;
    }
  };

  const filteredResources = filterType === 'ALL' 
    ? resources 
    : resources.filter(r => r.type === filterType);

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Ressources Pédagogiques</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-2">
            Cours, tutoriels vidéos et podcasts audios partagés par la communauté.
          </p>
        </div>
        {isAdmin && (
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/20 transition-all"
          >
            <Plus size={18} />
            <span>Ajouter un fichier</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {['ALL', 'PDF', 'VIDEO', 'AUDIO'].map((ft) => (
          <button
            key={ft}
            onClick={() => setFilterType(ft)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
              filterType === ft 
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' 
                : 'bg-white dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'
            }`}
          >
            {ft === 'ALL' ? 'Tout voir' : ft}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>
      ) : filteredResources.length === 0 ? (
        <div className="text-center py-20 text-zinc-400 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
           <p>Aucune ressource trouvée.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredResources.map((res) => (
            <motion.div 
              key={res.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ y: -5 }}
              className="group bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:shadow-xl transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-100 dark:border-zinc-800 group-hover:scale-110 transition-transform">
                  {getIcon(res.type)}
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <button 
                      onClick={() => handleDelete(res.id)}
                      className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  <span className="text-[10px] font-bold uppercase text-zinc-400 tracking-widest bg-zinc-50 dark:bg-zinc-950 px-2 py-1 rounded">
                    {res.type}
                  </span>
                </div>
              </div>
              
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-2 line-clamp-1">{res.title}</h3>
              <p className="text-xs text-zinc-500 mb-4">{res.subject || 'Général'} • {res.size || 'Unknown'}</p>
              
              <div className="flex items-center justify-between mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setPreviewFile(res)}
                    className="flex items-center gap-2 text-xs font-bold text-zinc-900 dark:text-zinc-100 hover:text-blue-600 transition-colors"
                  >
                    <Eye size={14} /> Aperçu
                  </button>
                  <a 
                    href={res.url} 
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-500 transition-colors"
                  >
                    <Download size={14} /> Télécharger
                  </a>
                </div>
                {res.type === 'PDF' && (
                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={() => handleExplain(res.id)}
                      disabled={explainingId === res.id}
                      className="p-2 bg-blue-500/10 hover:bg-blue-500 text-blue-600 hover:text-white rounded-lg transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-tighter"
                    >
                      {explainingId === res.id ? <Loader2 size={12} className="animate-spin" /> : <Bot size={12} />}
                      {explainingId === res.id ? 'Analyse...' : 'Expliquer avec IA'}
                    </button>
                    <button 
                      onClick={() => handleGenerateQuiz(res.id)}
                      disabled={generatingId === res.id}
                      className="p-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-600 hover:text-white rounded-lg transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-tighter"
                    >
                      {generatingId === res.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      {generatingId === res.id ? 'Génération...' : 'Créer Quiz IA'}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* AI Explanation Modal */}
      <AnimatePresence>
        {explanation && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setExplanation(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-2xl max-h-[80vh] bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-zinc-200 dark:border-zinc-800"
            >
              <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-xl">
                    <Bot size={24} />
                  </div>
                  <h3 className="text-xl font-bold">Explication Professeur IA</h3>
                </div>
                <button onClick={() => setExplanation(null)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 prose dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {explanation}
                </ReactMarkdown>
              </div>
              <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-100 dark:border-zinc-800 text-center">
                <button 
                  onClick={() => setExplanation(null)}
                  className="px-6 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-bold text-sm"
                >
                  J&apos;ai compris
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* File Preview Modal */}
      <AnimatePresence>
        {previewFile && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-10">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setPreviewFile(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="relative w-full h-full max-w-6xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Toolbar */}
              <div className="p-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-zinc-900">
                 <div className="flex items-center gap-3">
                    <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded-lg">
                       {getIcon(previewFile.type)}
                    </div>
                    <div>
                       <h3 className="font-bold text-sm">{previewFile.title}</h3>
                       <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">{previewFile.type} • {previewFile.size}</p>
                    </div>
                 </div>
                 <button 
                   onClick={() => setPreviewFile(null)}
                   className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                 >
                   <X size={20} />
                 </button>
              </div>

              {/* Viewer Content */}
              <div className="flex-1 bg-zinc-50 dark:bg-black overflow-hidden flex items-center justify-center">
                 {previewFile.type === 'PDF' && (
                   <iframe 
                     src={`${previewFile.url}#toolbar=0`} 
                     className="w-full h-full border-none"
                     title={previewFile.title}
                   />
                 )}
                 {previewFile.type === 'VIDEO' && (
                   <video 
                     controls 
                     autoPlay
                     className="max-w-full max-h-full shadow-2xl"
                   >
                     <source src={previewFile.url} type="video/mp4" />
                     Votre navigateur ne supporte pas la lecture de cette vidéo.
                   </video>
                 )}
                 {previewFile.type === 'AUDIO' && (
                   <div className="flex flex-col items-center gap-8 p-12 bg-white dark:bg-zinc-900 rounded-[3rem] shadow-2xl border border-zinc-200 dark:border-zinc-800">
                      <div className="w-48 h-48 bg-purple-100 dark:bg-purple-900/30 rounded-[2.5rem] flex items-center justify-center text-purple-600">
                         <Headphones size={80} />
                      </div>
                      <audio controls className="w-80">
                        <source src={previewFile.url} type="audio/mpeg" />
                        Votre navigateur ne supporte pas la lecture de cet audio.
                      </audio>
                   </div>
                 )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Upload Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-6 border border-zinc-200 dark:border-zinc-800"
            >
              <h3 className="text-xl font-bold mb-4">Ajouter un document</h3>
              <form onSubmit={handleUpload} className="space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase text-zinc-500">Titre</label>
                  <input 
                    type="text" 
                    required
                    className="w-full mt-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex: Cours Java Chap 1"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold uppercase text-zinc-500">Matière</label>
                    <input 
                      type="text" 
                      className="w-full mt-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Ex: Java"
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-zinc-500">Type</label>
                    <select 
                      className="w-full mt-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                      value={type}
                      onChange={e => setType(e.target.value)}
                    >
                      <option value="PDF">Document (PDF)</option>
                      <option value="VIDEO">Vidéo (MP4)</option>
                      <option value="AUDIO">Audio (MP3)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold uppercase text-zinc-500">Filière</label>
                    <select 
                      required
                      className="w-full mt-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      value={fieldId}
                      onChange={e => setFieldId(e.target.value)}
                    >
                      <option value="">Choisir...</option>
                      {options.fields.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-zinc-500">Niveau</label>
                    <select 
                      required
                      className="w-full mt-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      value={levelId}
                      onChange={e => setLevelId(e.target.value)}
                    >
                      <option value="">Choisir...</option>
                      {options.levels.map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                   <label className="text-xs font-bold uppercase text-zinc-500">Fichier</label>
                   <input 
                     type="file" 
                     required
                     accept={type === 'PDF' ? '.pdf' : type === 'VIDEO' ? 'video/*' : 'audio/*'}
                     onChange={handleFileChange}
                     className="w-full mt-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm"
                   />
                </div>

                <div className="flex gap-3 pt-4">
                   <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl font-bold text-zinc-600 dark:text-zinc-300">Annuler</button>
                   <button 
                     type="submit" 
                     disabled={uploading} 
                     className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                   >
                     {uploading && <Loader2 className="animate-spin" size={16} />} 
                     {uploading ? 'Upload...' : 'Ajouter'}
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
