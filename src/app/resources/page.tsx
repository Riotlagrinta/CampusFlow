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
  Upload,
  RefreshCw
} from 'lucide-react';
import { useSound } from '@/hooks/useSound';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Resource = {
  id: string;
  title: string;
  type: string; 
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
  
  const [currentFolder, setCurrentFolder] = useState<Resource | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Resource[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFolderCreateOpen, setIsFolderCreateOpen] = useState(false);
  
  const [previewFile, setPreviewFile] = useState<Resource | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [options, setOptions] = useState<{ fields: any[], levels: any[] }>({ fields: [], levels: [] });

  // Form States
  const [title, setTitle] = useState('');
  const [type, setType] = useState('PDF');
  const [fieldId, setFieldId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [inputType, setInputType] = useState<'FILE' | 'LINK'>('FILE');
  const [externalUrl, setExternalUrl] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  
  const [newFolderName, setNewFolderName] = useState('');
  const [folderFieldId, setFolderFieldId] = useState('');
  const [folderLevelId, setFolderLevelId] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  useEffect(() => {
    fetchResources(null);
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setIsAdmin(user.role === 'ADMIN');
    fetch('/api/academic/options').then(res => res.json()).then(data => setOptions(data));
  }, []);

  const fetchResources = async (parentId: string | null) => {
    setLoading(true);
    try {
      const pid = parentId === 'null' || !parentId ? 'null' : parentId;
      const res = await fetch(`/api/resources?t=${Date.now()}&parentId=${pid}`);
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
    setFieldId(folder.fieldId || '');
    setLevelId(folder.levelId || '');
    fetchResources(folder.id);
  };

  const handleNavigateBreadcrumb = (index: number) => {
    if (index === -1) {
        setCurrentFolder(null);
        setBreadcrumbs([]);
        setFieldId('');
        setLevelId('');
        fetchResources(null);
        return;
    }
    const targetFolder = breadcrumbs[index];
    const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setCurrentFolder(targetFolder);
    setBreadcrumbs(newBreadcrumbs);
    setFieldId(targetFolder.fieldId || '');
    setLevelId(targetFolder.levelId || '');
    fetchResources(targetFolder.id);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputType === 'FILE' && (!files || files.length === 0)) return;
    setUploading(true);
    
    try {
      const total = inputType === 'FILE' ? files!.length : 1;
      let success = 0;

      for (let i = 0; i < total; i++) {
        const formData = new FormData();
        if (inputType === 'FILE') formData.append('file', files![i]);
        else formData.append('externalUrl', externalUrl);

        formData.append('title', total > 1 ? files![i].name : title);
        formData.append('type', type);
        formData.append('fieldId', fieldId);
        formData.append('levelId', levelId);
        if (currentFolder) formData.append('parentId', currentFolder.id);

        const res = await fetch('/api/resources', { method: 'POST', body: formData });
        if (res.ok) success++;
      }

      if (success > 0) {
        play('success');
        alert(`${success} élément(s) importé(s) avec succès !`);
        setIsModalOpen(false);
        setTitle('');
        setFiles(null);
        fetchResources(currentFolder?.id || null);
      }
    } catch (error) {
      alert("Erreur lors de l'importation");
    } finally {
      setUploading(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingFolder(true);
    try {
        const formData = new FormData();
        formData.append('title', newFolderName);
        formData.append('type', 'FOLDER');
        formData.append('fieldId', folderFieldId);
        formData.append('levelId', folderLevelId);
        if (currentFolder) formData.append('parentId', currentFolder.id);

        const res = await fetch('/api/resources', { method: 'POST', body: formData });
        if (res.ok) {
            play('success');
            setIsFolderCreateOpen(false);
            setNewFolderName('');
            fetchResources(currentFolder?.id || null);
        }
    } catch (e) {
        console.error(e);
    } finally {
        setCreatingFolder(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20 px-2 md:px-0">
      <div className="flex flex-col gap-4 px-2">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-1">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Ressources</h1>
                <p className="text-zinc-500 text-sm">Organisez vos documents par dossiers.</p>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
                <button onClick={() => fetchResources(currentFolder?.id || null)} className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl hover:bg-zinc-200 transition-all">
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                </button>
                {isAdmin && (
                    <>
                        <button onClick={() => setIsFolderCreateOpen(true)} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl font-bold">
                            <Folder size={18} /> <span>Dossier</span>
                        </button>
                        <button onClick={() => setIsModalOpen(true)} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg">
                            <Upload size={18} /> <span>Importer ici</span>
                        </button>
                    </>
                )}
            </div>
        </div>

        <div className="flex items-center gap-1 text-sm text-zinc-500 overflow-x-auto no-scrollbar py-2">
            <button onClick={() => handleNavigateBreadcrumb(-1)} className={`flex items-center gap-1 ${!currentFolder ? 'font-bold text-zinc-900 dark:text-white' : ''}`}>
                <Folder size={14} /> Accueil
            </button>
            {breadcrumbs.map((folder, index) => (
                <div key={folder.id} className="flex items-center gap-1 shrink-0">
                    <ChevronRight size={14} />
                    <button onClick={() => handleNavigateBreadcrumb(index)} className={index === breadcrumbs.length - 1 ? 'font-bold text-zinc-900 dark:text-white' : ''}>
                        {folder.title}
                    </button>
                </div>
            ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-blue-600"><Loader2 className="animate-spin" size={40} /></div>
      ) : resources.length === 0 ? (
        <div className="mx-2 text-center py-20 text-zinc-400 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
           <p>Ce dossier est vide.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 px-2">
          {resources.map((res) => (
            <motion.div 
              key={res.id} 
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              onClick={() => res.type === 'FOLDER' ? handleEnterFolder(res) : null}
              className={`bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-all ${res.type === 'FOLDER' ? 'cursor-pointer hover:border-blue-400' : ''}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-2.5 rounded-xl ${res.type === 'FOLDER' ? 'bg-amber-50 text-amber-500' : 'bg-zinc-50 text-blue-500'}`}>
                  {res.type === 'FOLDER' ? <Folder /> : <FileText />}
                </div>
                {isAdmin && (
                    <button onClick={(e) => { e.stopPropagation(); if(confirm('Supprimer ?')) fetch(`/api/resources/${res.id}`, {method:'DELETE'}).then(()=>fetchResources(currentFolder?.id||null)); }} className="text-zinc-400 hover:text-red-500">
                        <Trash2 size={16} />
                    </button>
                )}
              </div>
              <h3 className="font-bold truncate">{res.title}</h3>
              <p className="text-xs text-zinc-500 mt-1">{res.type === 'FOLDER' ? 'Dossier' : res.size}</p>
              
              {res.type !== 'FOLDER' && (
                <div className="mt-4 pt-4 border-t border-zinc-100 flex gap-4">
                    <button onClick={(e) => { e.stopPropagation(); setPreviewFile(res); }} className="text-xs font-bold flex items-center gap-1 hover:text-blue-600"><Eye size={14}/> Aperçu</button>
                    <a href={res.url} target="_blank" onClick={e=>e.stopPropagation()} className="text-xs font-bold flex items-center gap-1 text-blue-600"><Download size={14}/> Télécharger</a>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white dark:bg-zinc-900 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                <h3 className="text-xl font-bold mb-4">Importer un document</h3>
                <form onSubmit={handleUpload} className="space-y-4">
                    {!currentFolder && (
                        <div className="grid grid-cols-2 gap-4">
                            <select required className="w-full bg-zinc-50 p-3 rounded-xl text-sm" value={fieldId} onChange={e=>setFieldId(e.target.value)}>
                                <option value="">Filière...</option>
                                {options.fields.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                            <select required className="w-full bg-zinc-50 p-3 rounded-xl text-sm" value={levelId} onChange={e=>setLevelId(e.target.value)}>
                                <option value="">Niveau...</option>
                                {options.levels.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                        </div>
                    )}
                    <input type="file" required multiple onChange={e=>setFiles(e.target.files)} className="w-full bg-zinc-50 p-3 rounded-xl text-sm" />
                    <input type="text" placeholder="Titre (optionnel)" value={title} onChange={e=>setTitle(e.target.value)} className="w-full bg-zinc-50 p-3 rounded-xl text-sm" />
                    <div className="flex gap-3">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 p-3 bg-zinc-100 rounded-xl font-bold">Annuler</button>
                        <button type="submit" disabled={uploading} className="flex-1 p-3 bg-blue-600 text-white rounded-xl font-bold">
                            {uploading ? 'Chargement...' : 'Importer'}
                        </button>
                    </div>
                </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isFolderCreateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="bg-white dark:bg-zinc-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                <h3 className="text-xl font-bold mb-4">Nouveau Dossier</h3>
                <form onSubmit={handleCreateFolder} className="space-y-4">
                    <input type="text" required placeholder="Nom du dossier" value={newFolderName} onChange={e=>setNewFolderName(e.target.value)} className="w-full bg-zinc-50 p-3 rounded-xl text-sm" />
                    <div className="grid grid-cols-2 gap-4">
                        <select required className="w-full bg-zinc-50 p-3 rounded-xl text-sm" value={folderFieldId} onChange={e=>setFolderFieldId(e.target.value)}>
                            <option value="">Filière...</option>
                            {options.fields.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                        <select required className="w-full bg-zinc-50 p-3 rounded-xl text-sm" value={folderLevelId} onChange={e=>setFolderLevelId(e.target.value)}>
                            <option value="">Niveau...</option>
                            {options.levels.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    </div>
                    <div className="flex gap-3">
                        <button type="button" onClick={() => setIsFolderCreateOpen(false)} className="flex-1 p-3 bg-zinc-100 rounded-xl font-bold">Annuler</button>
                        <button type="submit" disabled={creatingFolder} className="flex-1 p-3 bg-blue-600 text-white rounded-xl font-bold">Créer</button>
                    </div>
                </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Preview Modal simplified */}
      <AnimatePresence>
        {previewFile && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-10 bg-black/90">
            <div className="relative w-full h-full bg-white dark:bg-zinc-900 rounded-3xl overflow-hidden flex flex-col">
              <div className="p-4 border-b flex justify-between items-center">
                <h3 className="font-bold">{previewFile.title}</h3>
                <button onClick={() => setPreviewFile(null)} className="p-2 bg-zinc-100 rounded-full"><X/></button>
              </div>
              <iframe src={previewFile.url} className="flex-1 border-none" />
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}