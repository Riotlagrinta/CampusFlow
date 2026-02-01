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
  const [subjects, setSubjects] = useState<any[]>([]);

  // Form State
  const [title, setTitle] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [type, setType] = useState('PDF');
  const [fieldId, setFieldId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [inputType, setInputType] = useState<'FILE' | 'LINK'>('FILE');
  const [externalUrl, setExternalUrl] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(''); // Ex: "3/10"
  
  // Ad Reward State
  const [showAdModal, setShowAdModal] = useState(false);
  const [watchingAd, setWatchingAd] = useState(false);

  useEffect(() => {
    fetchResources();
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setIsAdmin(user.role === 'ADMIN');

    fetch('/api/academic/options')
      .then(res => res.json())
      .then(data => setOptions(data));
  }, []);

  useEffect(() => {
    if (fieldId && levelId) {
      fetch(`/api/admin/academic/subjects?fieldId=${fieldId}&levelId=${levelId}`)
        .then(res => res.json())
        .then(data => setSubjects(data));
    } else {
      setSubjects([]);
    }
  }, [fieldId, levelId]);

  const handleWatchAd = async () => {
    const adUrl = 'https://otieu.com/4/10485395'; 
    setWatchingAd(true);
    window.open(adUrl, '_blank');

    setTimeout(async () => {
      try {
        const res = await fetch('/api/user/ad-reward', { method: 'POST' });
        if (res.ok) {
          play('success');
          setShowAdModal(false);
          alert("Récompense validée ! Vous pouvez maintenant générer un nouveau quiz.");
        }
      } catch (e) {
        console.error("Erreur pub:", e);
      } finally {
        setWatchingAd(false);
      }
    }, 30000);
  };

  const handleGenerateQuiz = async (resourceId: string) => {
    setGeneratingId(resourceId);
    try {
      const res = await fetch(`/api/resources/${resourceId}/generate-quiz`, { method: 'POST' });
      const data = await res.json();
      
      if (res.status === 429 || data.quotaExceeded) {
        setShowAdModal(true);
        return;
      }

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
      
      if (res.status === 429 || data.quotaExceeded) {
        setShowAdModal(true);
        return;
      }

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
    if (e.target.files && e.target.files.length > 0) {
      setFiles(e.target.files);
      // Si un seul fichier, on pré-remplit le titre
      if (e.target.files.length === 1) {
        setTitle(e.target.files[0].name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (inputType === 'FILE' && (!files || files.length === 0)) return;
    if (inputType === 'LINK' && !externalUrl) return;
    if (!title && (inputType === 'LINK' || (files && files.length === 1))) {
        alert("Le titre est requis.");
        return;
    }

    setUploading(true);
    let successCount = 0;
    
    try {
      if (inputType === 'LINK') {
          // Mode LIEN UNIQUE
          const formData = new FormData();
          formData.append('externalUrl', externalUrl);
          formData.append('title', title);
          formData.append('type', type);
          formData.append('subjectName', subjectName);
          formData.append('fieldId', fieldId);
          formData.append('levelId', levelId);

          const res = await fetch('/api/resources', { method: 'POST', body: formData });
          if (res.ok) successCount = 1;
      } else {
          // Mode FICHIERS MULTIPLES
          const totalFiles = files!.length;
          for (let i = 0; i < totalFiles; i++) {
            const file = files![i];
            setUploadProgress(`${i + 1}/${totalFiles}`);
            
            const formData = new FormData();
            formData.append('file', file);
            
            // Auto-detection ou usage des champs
            const fileTitle = totalFiles > 1 ? file.name.replace(/\.[^/.]+$/, "") : title;
            
            // Auto-detection du type basé sur l'extension si multiple
            let fileType = type;
            if (totalFiles > 1) {
                if (file.name.toLowerCase().endsWith('.pdf')) fileType = 'PDF';
                else if (file.name.match(/\.(mp4|mov|avi)$/i)) fileType = 'VIDEO';
                else if (file.name.match(/\.(mp3|wav)$/i)) fileType = 'AUDIO';
            }

            formData.append('title', fileTitle);
            formData.append('type', fileType);
            formData.append('subjectName', subjectName);
            formData.append('fieldId', fieldId);
            formData.append('levelId', levelId);

            const res = await fetch('/api/resources', {
              method: 'POST',
              body: formData,
            });

            if (res.ok) successCount++;
          }
      }

      await fetchResources();
      setIsModalOpen(false);
      // Reset form
      setTitle('');
      setSubjectName('');
      setType('PDF');
      setFiles(null);
      setExternalUrl('');
      setUploadProgress('');
      
      if (inputType === 'LINK' && successCount === 1) play('success');
      else if (inputType === 'FILE' && files && successCount === files.length) play('success');
      else alert("Importation terminée.");

    } catch (error) {
      console.error(error);
      alert("Erreur serveur lors de l'upload");
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
    <div className="max-w-6xl mx-auto space-y-8 pb-20 px-2 md:px-0">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 px-2">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Ressources Pédagogiques</h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm md:text-base">
            Cours, tutoriels vidéos et podcasts partagés.
          </p>
        </div>
        {isAdmin && (
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/20 transition-all"
          >
            <Plus size={18} />
            <span>Ajouter un fichier</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar px-2">
        {['ALL', 'PDF', 'VIDEO', 'AUDIO'].map((ft) => (
          <button
            key={ft}
            onClick={() => setFilterType(ft)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              filterType === ft 
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900' 
                : 'bg-white dark:bg-zinc-900 text-zinc-500 border border-zinc-100 dark:border-zinc-800'
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
        <div className="mx-2 text-center py-20 text-zinc-400 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
           <p>Aucune ressource trouvée.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 px-2">
          {filteredResources.map((res) => (
            <motion.div 
              key={res.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="group bg-white dark:bg-zinc-900 p-5 md:p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  {getIcon(res.type)}
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <button 
                      onClick={() => handleDelete(res.id)}
                      className="p-1.5 text-zinc-400 hover:text-red-500 rounded-lg transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <span className="text-[10px] font-black uppercase text-zinc-400 tracking-widest bg-zinc-50 dark:bg-zinc-950 px-2 py-1 rounded">
                    {res.type}
                  </span>
                </div>
              </div>
              
              <h3 className="text-base md:text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-1 line-clamp-1">{res.title}</h3>
              <p className="text-[10px] md:text-xs text-zinc-500 mb-4">{res.subject || 'Général'} • {res.size || 'Unknown'}</p>
              
              <div className="flex flex-col gap-3 mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setPreviewFile(res)}
                      className="flex items-center gap-1.5 text-xs font-bold text-zinc-900 dark:text-zinc-100 hover:text-blue-600 transition-colors"
                    >
                      <Eye size={14} /> <span className="hidden sm:inline">Aperçu</span>
                    </button>
                    <a 
                      href={res.url} 
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-500 transition-colors"
                    >
                      <Download size={14} /> <span className="hidden sm:inline">Télécharger</span>
                    </a>
                  </div>
                </div>
                
                {res.type === 'PDF' && (
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => handleExplain(res.id)}
                      disabled={explainingId === res.id}
                      className="py-2 bg-blue-500/10 text-blue-600 rounded-lg transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-tighter"
                    >
                      {explainingId === res.id ? <Loader2 size={12} className="animate-spin" /> : <Bot size={12} />}
                      IA : Expliquer
                    </button>
                    <button 
                      onClick={() => handleGenerateQuiz(res.id)}
                      disabled={generatingId === res.id}
                      className="py-2 bg-emerald-500/10 text-emerald-600 rounded-lg transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-tighter"
                    >
                      {generatingId === res.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      IA : Quiz
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
                            
                            {/* Tabs */}
                            <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl mb-4">
                                <button 
                                  type="button"
                                  onClick={() => setInputType('FILE')}
                                  className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all ${inputType === 'FILE' ? 'bg-white dark:bg-zinc-700 shadow-sm text-blue-600' : 'text-zinc-500'}`}
                                >
                                  Fichier (Upload)
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => setInputType('LINK')}
                                  className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all ${inputType === 'LINK' ? 'bg-white dark:bg-zinc-700 shadow-sm text-blue-600' : 'text-zinc-500'}`}
                                >
                                  Lien (Drive/Web)
                                </button>
                            </div>
              
                            <form onSubmit={handleUpload} className="space-y-4">
                              {/* Title Input - Always visible for Link, or single file */}
                              {(inputType === 'LINK' || (!files || files.length <= 1)) && (
                                <div>
                                  <label className="text-xs font-bold uppercase text-zinc-500">Titre</label>
                                  <input 
                                    type="text" 
                                    required={inputType === 'LINK' || (!files || files.length <= 1)}
                                    className="w-full mt-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder={inputType === 'LINK' ? "Ex: Dossier Complet Algèbre (Google Drive)" : "Ex: Cours Java Chap 1"}
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                  />
                                </div>
                              )}
                              
                              {inputType === 'LINK' && (
                                <div>
                                  <label className="text-xs font-bold uppercase text-zinc-500">Lien du cours (Google Drive, Mega, YouTube...)</label>
                                  <input 
                                    type="url" 
                                    required
                                    className="w-full mt-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-blue-600 font-medium"
                                    placeholder="https://drive.google.com/..."
                                    value={externalUrl}
                                    onChange={e => setExternalUrl(e.target.value)}
                                  />
                                </div>
                              )}
              
                              <div className="grid grid-cols-2 gap-4">                  <div>
                    <label className="text-xs font-bold uppercase text-zinc-500">Matière</label>
                    <input 
                      type="text"
                      list="subjects-list"
                      required
                      className="w-full mt-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="Ex: Algorithmique"
                      value={subjectName}
                      onChange={e => setSubjectName(e.target.value)}
                      disabled={!fieldId || !levelId}
                    />
                    <datalist id="subjects-list">
                      {subjects.map(s => (
                        <option key={s.id} value={s.name} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-zinc-500">Type (Défaut)</label>
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
                
                                {inputType === 'FILE' && (
                                  <div>
                                     <label className="text-xs font-bold uppercase text-zinc-500">
                                       Fichiers {files && files.length > 0 && <span className="text-blue-600">({files.length} sélectionnés)</span>}
                                     </label>
                                     <div className="mt-1 relative">
                                       <input 
                                         type="file" 
                                         required
                                         multiple
                                         onChange={handleFileChange}
                                         className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                       />
                                     </div>
                                     {files && files.length > 1 && (
                                       <p className="text-[10px] text-zinc-400 mt-2">
                                         * Les titres seront générés automatiquement à partir des noms de fichiers.
                                         <br/>
                                         * Les types (PDF/VIDEO) seront détectés par l'extension.
                                       </p>
                                     )}
                                  </div>
                                )}
                
                                <div className="flex gap-3 pt-4">
                                   <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl font-bold text-zinc-600 dark:text-zinc-300">Annuler</button>
                                   <button 
                                     type="submit" 
                                     disabled={uploading} 
                                     className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                                   >
                                     {uploading && <Loader2 className="animate-spin" size={16} />} 
                                     {uploading 
                                        ? `Importation ${uploadProgress}...` 
                                        : (inputType === 'FILE' && files && files.length > 1 
                                            ? `Importer ${files.length} fichiers` 
                                            : 'Ajouter')
                                     }
                                   </button>
                                </div>              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Ad Reward Modal */}
      <AnimatePresence>
        {showAdModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-6 text-center space-y-6"
            >
              <div className="w-16 h-16 mx-auto bg-red-100 dark:bg-red-900/20 text-red-600 rounded-full flex items-center justify-center">
                <Video size={32} />
              </div>
              <div>
                <h3 className="text-xl font-bold">Quota Quizz Atteint</h3>
                <p className="text-zinc-500 text-sm mt-2">Vous avez atteint votre limite de génération de quizz pour aujourd'hui.</p>
              </div>
              
              <button 
                onClick={handleWatchAd}
                disabled={watchingAd}
                className="w-full py-3.5 bg-blue-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
              >
                {watchingAd ? <Loader2 className="animate-spin" size={16} /> : <Video size={16} />}
                {watchingAd ? 'Publicité en cours...' : 'Regarder une pub (+2 Quizz)'}
              </button>

              <button 
                onClick={() => setShowAdModal(false)}
                className="text-xs font-bold text-zinc-400 hover:text-zinc-600 underline"
              >
                Annuler
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
