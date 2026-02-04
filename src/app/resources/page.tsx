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
  Bot,
  ExternalLink,
  Folder,
  ChevronRight,
  Upload
} from 'lucide-react';
import { useSound } from '@/hooks/useSound';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Resource = {
  id: string;
  title: string;
  type: string; // "PDF", "VIDEO", "AUDIO", "FOLDER", "OTHER"
  url: string;
  subject: { name: string; code: string | null } | null;
  subjectName: string | null;
  fieldId: string | null;
  levelId: string | null;
  size: string | null;
  createdAt: string;
  author: { firstName: string; lastName: string };
  parentId: string | null;
};

export default function ResourcesPage() {
  const { play } = useSound();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Folder Navigation State
  const [currentFolder, setCurrentFolder] = useState<Resource | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Resource[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false); // Upload Modal
  const [isFolderCreateOpen, setIsFolderCreateOpen] = useState(false); // Create Folder Modal
  
  const [previewFile, setPreviewFile] = useState<Resource | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [explainingId, setExplainingId] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Folder Selection State (for Drive/Quiz)
  const [folderFiles, setFolderFiles] = useState<any[]>([]);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ id: string, type: 'EXPLAIN' | 'QUIZ' } | null>(null);

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
  const [uploadProgress, setUploadProgress] = useState(''); 
  
  // New Folder Form State
  const [newFolderName, setNewFolderName] = useState('');
  const [folderFieldId, setFolderFieldId] = useState('');
  const [folderLevelId, setFolderLevelId] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Ad Reward State
  const [showAdModal, setShowAdModal] = useState(false);
  const [watchingAd, setWatchingAd] = useState(false);

  useEffect(() => {
    fetchResources(null); // Load root
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

  const fetchResources = async (parentId: string | null) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/resources?t=${Date.now()}&parentId=${parentId || 'null'}`);
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

  const handleEnterFolder = (folder: Resource) => {
    setCurrentFolder(folder);
    setBreadcrumbs([...breadcrumbs, folder]);
    setFilterType('ALL'); 
    
    // Auto-fill context
    setFieldId(folder.fieldId || '');
    setLevelId(folder.levelId || '');
    setSubjectName(folder.subjectName || '');
    
    fetchResources(folder.id);
  };

  const handleNavigateBreadcrumb = (index: number) => {
    if (index === -1) {
        setCurrentFolder(null);
        setBreadcrumbs([]);
        setFieldId('');
        setLevelId('');
        setSubjectName('');
        fetchResources(null);
        return;
    }
    const targetFolder = breadcrumbs[index];
    const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setCurrentFolder(targetFolder);
    setBreadcrumbs(newBreadcrumbs);
    
    setFieldId(targetFolder.fieldId || '');
    setLevelId(targetFolder.levelId || '');
    setSubjectName(targetFolder.subjectName || '');
    
    fetchResources(targetFolder.id);
  };

  const handleOpenUploadInFolder = (e: React.MouseEvent, folder: Resource) => {
    e.stopPropagation();
    setCurrentFolder(folder);
    setBreadcrumbs([...breadcrumbs, folder]);
    setFieldId(folder.fieldId || '');
    setLevelId(folder.levelId || '');
    setSubjectName(folder.subjectName || '');
    setIsModalOpen(true);
    fetchResources(folder.id);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName || !folderFieldId || !folderLevelId) return;

    setCreatingFolder(true);
    const formData = new FormData();
    formData.append('title', newFolderName);
    formData.append('type', 'FOLDER');
    formData.append('fieldId', folderFieldId);
    formData.append('levelId', folderLevelId);
    
    if (currentFolder) formData.append('parentId', currentFolder.id);

    try {
        const res = await fetch('/api/resources', { method: 'POST', body: formData });
        if (res.ok) {
            play('success');
            setNewFolderName('');
            setIsFolderCreateOpen(false);
            fetchResources(currentFolder?.id || null);
        }
    } catch (e) {
        console.error(e);
    } finally {
        setCreatingFolder(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputType === 'FILE' && (!files || files.length === 0)) return;
    if (inputType === 'LINK' && !externalUrl) return;
    
    setUploading(true);
    let successCount = 0;
    
    try {
      if (inputType === 'LINK') {
          const formData = new FormData();
          formData.append('externalUrl', externalUrl);
          formData.append('title', title);
          formData.append('type', type);
          formData.append('subjectName', subjectName);
          formData.append('fieldId', fieldId);
          formData.append('levelId', levelId);
          if (currentFolder) formData.append('parentId', currentFolder.id);

          const res = await fetch('/api/resources', { method: 'POST', body: formData });
          if (res.ok) successCount = 1;
      } else {
          const totalFiles = files!.length;
          for (let i = 0; i < totalFiles; i++) {
            const file = files![i];
            setUploadProgress(`${i + 1}/${totalFiles}`);
            const formData = new FormData();
            formData.append('file', file);
            formData.append('title', totalFiles > 1 ? file.name.replace(/\.[^/.]+$/, "") : title);
            
            let fileType = type;
            if (totalFiles > 1) {
                if (file.name.toLowerCase().endsWith('.pdf')) fileType = 'PDF';
                else if (file.name.match(/\.(mp4|mov|avi)$/i)) fileType = 'VIDEO';
                else if (file.name.match(/\.(mp3|wav)$/i)) fileType = 'AUDIO';
            }
            formData.append('type', fileType);
            formData.append('subjectName', subjectName);
            formData.append('fieldId', fieldId);
            formData.append('levelId', levelId);
            if (currentFolder) formData.append('parentId', currentFolder.id);

            const res = await fetch('/api/resources', { method: 'POST', body: formData });
            if (res.ok) successCount++;
          }
      }

      await fetchResources(currentFolder?.id || null);
      setIsModalOpen(false);
      setTitle('');
      setFiles(null);
      setExternalUrl('');
      play('success');
    } catch (error) {
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'FOLDER': return <Folder size={24} className="text-amber-500 fill-amber-500/20" />;
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
      <div className="flex flex-col gap-4 px-2">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Ressources Pédagogiques</h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm md:text-base">
                Organisez et accédez à vos cours en toute simplicité.
            </p>
            </div>
            {isAdmin && (
            <div className="flex items-center gap-2 w-full md:w-auto">
                <button 
                    onClick={() => setIsFolderCreateOpen(true)}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-xl font-bold transition-all"
                >
                    <Folder size={18} />
                    <span>Nouveau Dossier</span>
                </button>
                <button 
                    onClick={() => setIsModalOpen(true)}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/20 transition-all"
                >
                    <Upload size={18} />
                    <span>Importer ici</span>
                </button>
            </div>
            )}
        </div>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-sm text-zinc-500 overflow-x-auto no-scrollbar py-2">
            <button 
                onClick={() => handleNavigateBreadcrumb(-1)}
                className={`flex items-center gap-1 hover:text-blue-600 transition-colors ${breadcrumbs.length === 0 ? 'font-bold text-zinc-900 dark:text-white' : ''}`}
            >
                <Folder size={14} />
                Accueil
            </button>
            {breadcrumbs.map((folder, index) => (
                <div key={folder.id} className="flex items-center gap-1 shrink-0">
                    <ChevronRight size={14} className="text-zinc-300" />
                    <button 
                        onClick={() => handleNavigateBreadcrumb(index)}
                        className={`hover:text-blue-600 transition-colors max-w-[150px] truncate ${index === breadcrumbs.length - 1 ? 'font-bold text-zinc-900 dark:text-white' : ''}`}
                    >
                        {folder.title}
                    </button>
                </div>
            ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>
      ) : filteredResources.length === 0 ? (
        <div className="mx-2 text-center py-20 text-zinc-400 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
           <p>Ce dossier est vide.</p>
           {isAdmin && (
             <button onClick={() => setIsModalOpen(true)} className="mt-4 text-blue-600 font-bold hover:underline">Importer le premier fichier</button>
           )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 px-2">
          {filteredResources.map((res) => (
            <motion.div 
              key={res.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => res.type === 'FOLDER' ? handleEnterFolder(res) : null}
              className={`group relative bg-white dark:bg-zinc-900 p-5 md:p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-all ${res.type === 'FOLDER' ? 'cursor-pointer hover:border-blue-300 dark:hover:border-blue-800 hover:shadow-md' : ''}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-2.5 rounded-xl border ${res.type === 'FOLDER' ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/20' : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-100 dark:border-zinc-800'}`}>
                  {getIcon(res.type)}
                </div>
                <div className="flex items-center gap-1">
                  {isAdmin && res.type === 'FOLDER' && (
                    <button 
                      onClick={(e) => handleOpenUploadInFolder(e, res)}
                      className="p-1.5 text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                      title="Importer directement dans ce dossier"
                    >
                      <Plus size={14} />
                    </button>
                  )}
                  {isAdmin && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); if(confirm('Supprimer ?')) fetch(`/api/resources/${res.id}`, {method:'DELETE'}).then(()=>fetchResources(currentFolder?.id||null)); }}
                      className="p-1.5 text-zinc-400 hover:text-red-500 rounded-lg transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              
              <h3 className="text-base md:text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-1 line-clamp-1">{res.title}</h3>
              <p className="text-[10px] md:text-xs text-zinc-500 mb-4 truncate">
                 {res.type === 'FOLDER' ? 'Dossier' : `${res.subject?.name || res.subjectName || 'Général'} • ${res.size}`}
              </p>
              
              {res.type !== 'FOLDER' && (
              <div className="flex flex-col gap-3 mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setPreviewFile(res); }}
                      className="flex items-center gap-1.5 text-xs font-bold text-zinc-900 dark:text-zinc-100 hover:text-blue-600 transition-colors"
                    >
                      <Eye size={14} /> <span>Aperçu</span>
                    </button>
                    <a 
                      href={res.url} 
                      target="_blank"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-500 transition-colors"
                    >
                      <Download size={14} /> <span>Télécharger</span>
                    </a>
                  </div>
                </div>
              </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Modals are simplified now */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-2xl">
                <h3 className="text-xl font-bold mb-2">Importer un document</h3>
                <p className="text-xs text-zinc-500 mb-6 italic">Destination : {currentFolder ? `Dossier "${currentFolder.title}"` : 'Racine'}</p>
                
                <form onSubmit={handleUpload} className="space-y-4">
                    {/* Auto-filled context visible but minimal */}
                    {currentFolder && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/20 mb-4">
                            <p className="text-[10px] font-black uppercase text-blue-600 mb-1">Contexte hérité</p>
                            <p className="text-xs font-bold text-zinc-600 dark:text-zinc-300">
                                {options.fields.find(f=>f.id===fieldId)?.name} • {options.levels.find(l=>l.id===levelId)?.name}
                            </p>
                        </div>
                    )}

                    {!currentFolder && (
                        <div className="grid grid-cols-2 gap-4">
                            <select required className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm" value={fieldId} onChange={e=>setFieldId(e.target.value)}>
                                <option value="">Filière...</option>
                                {options.fields.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                            <select required className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm" value={levelId} onChange={e=>setLevelId(e.target.value)}>
                                <option value="">Niveau...</option>
                                {options.levels.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-bold uppercase text-zinc-500">Fichier(s)</label>
                        <input type="file" required multiple onChange={e=>{setFiles(e.target.files); if(e.target.files?.length===1) setTitle(e.target.files[0].name.replace(/\.[^/.]+$/, ""))}} className="w-full mt-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm" />
                    </div>

                    {!files || files.length <= 1 && (
                        <input type="text" placeholder="Titre (optionnel)" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm" value={title} onChange={e=>setTitle(e.target.value)} />
                    )}

                    <div className="flex gap-3 pt-4">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl font-bold">Annuler</button>
                        <button type="submit" disabled={uploading} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                            {uploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                            {uploading ? 'Importation...' : 'Importer'}
                        </button>
                    </div>
                </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isFolderCreateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsFolderCreateOpen(false)} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-2xl">
                <h3 className="text-xl font-bold mb-4">Nouveau Dossier</h3>
                <form onSubmit={handleCreateFolder} className="space-y-4">
                    <input type="text" required autoFocus className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm" placeholder="Nom du dossier" value={newFolderName} onChange={e=>setNewFolderName(e.target.value)} />
                    <div className="grid grid-cols-2 gap-4">
                        <select required className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm" value={folderFieldId} onChange={e=>setFolderFieldId(e.target.value)}>
                            <option value="">Filière...</option>
                            {options.fields.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                        <select required className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm" value={folderLevelId} onChange={e=>setFolderLevelId(e.target.value)}>
                            <option value="">Niveau...</option>
                            {options.levels.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    </div>
                    <div className="flex gap-3 pt-4">
                        <button type="button" onClick={() => setIsFolderCreateOpen(false)} className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl font-bold">Annuler</button>
                        <button type="submit" disabled={creatingFolder} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                            {creatingFolder ? <Loader2 className="animate-spin" size={16} /> : <Folder size={16} />}
                            Créer
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
