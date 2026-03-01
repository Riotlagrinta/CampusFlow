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
  Trash2,
  Folder,
  ChevronRight,
  Upload,
  RefreshCw
} from 'lucide-react';
import { upload } from '@vercel/blob/client';
import { useSound } from '@/hooks/useSound';
import { ResourceCard } from '@/components/resources/ResourceCard';

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
  const [currentSemester, setCurrentSemester] = useState<number>(2); // Par défaut S2 car on est au semestre 2

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
    fetchResources(currentFolder?.id || null);
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      setIsAdmin(user.role === 'ADMIN');
    }
    fetch('/api/academic/options').then(res => res.json()).then(data => setOptions(data));
  }, [currentSemester]);

  const fetchResources = async (parentId: string | null) => {
    setLoading(true);
    try {
      const pid = parentId === 'null' || !parentId ? 'null' : parentId;
      const res = await fetch(`/api/resources?t=${Date.now()}&parentId=${pid}&semester=${currentSemester}`);
      if (res.ok) {
        const data = await res.json();
        setResources(data);
      }
    } catch (err) {
      console.error("Erreur fetch:", err);
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
    console.log("Tentative d'importation...");

    if (inputType === 'FILE' && (!files || files.length === 0)) {
      alert("Veuillez sélectionner au moins un fichier.");
      return;
    }

    if (!fieldId || !levelId) {
      alert("Veuillez sélectionner une filière et un niveau.");
      return;
    }

    setUploading(true);
    let successCount = 0;
    let failCount = 0;

    try {
      if (inputType === 'FILE' && files && files.length > 0) {
        // --- TRAITEMENT DES FICHIERS ---
        for (let i = 0; i < files.length; i++) {
          const currentFile = files[i];
          const fileTitle = files.length > 1 ? currentFile.name : (title || currentFile.name);

          let finalPayload: any = null;
          let isJson = false;

          try {
            // TENTATIVE 1 : UPLOAD DIRECT (BLOB)
            console.log(`Upload direct vers Vercel Blob (${i + 1}/${files.length})...`);
            const newBlob = await upload(currentFile.name, currentFile, {
              access: 'public',
              handleUploadUrl: '/api/upload',
            });

            finalPayload = {
              title: fileTitle,
              type: type,
              url: newBlob.url,
              size: `${(currentFile.size / (1024 * 1024)).toFixed(2)} MB`,
              fieldId: fieldId,
              levelId: levelId,
              parentId: currentFolder?.id || null,
            };
            isJson = true;

          } catch (blobError) {
            console.warn("Echec Upload Direct, passage en mode Secours (FormData)", blobError);
            // TENTATIVE 2 : FALLBACK CLASSIQUE
            const formData = new FormData();
            formData.append('file', currentFile);
            formData.append('title', fileTitle);
            formData.append('type', type);
            formData.append('fieldId', fieldId);
            formData.append('levelId', levelId);
            if (currentFolder) formData.append('parentId', currentFolder.id);

            finalPayload = formData;
            isJson = false;
          }

          // ENREGISTREMENT EN BASE DE DONNÉES
          const res = await fetch('/api/resources', {
            method: 'POST',
            headers: isJson ? { 'Content-Type': 'application/json' } : undefined,
            body: isJson ? JSON.stringify(finalPayload) : finalPayload
          });

          if (res.ok) successCount++;
          else failCount++;
        }

      } else {
        // --- TRAITEMENT LIEN EXTERNE ---
        const payload = {
          title: title || "Lien externe",
          type: type,
          externalUrl: externalUrl,
          fieldId: fieldId,
          levelId: levelId,
          parentId: currentFolder?.id || null,
        };

        const res = await fetch('/api/resources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) successCount++;
        else failCount++;
      }

      if (successCount > 0) {
        play('success');
        alert(`${successCount} ressource(s) ajoutée(s) avec succès !`);
        setIsModalOpen(false);
        setTitle('');
        setFiles(null);
        setExternalUrl('');
        fetchResources(currentFolder?.id || null);
      } else if (failCount > 0) {
        alert("Certains éléments n'ont pas pu être ajoutés.");
      }

    } catch (error: any) {
      console.error("Erreur critique upload:", error);
      alert(`Erreur technique : ${error.message || "Impossible de contacter le serveur"}`);
    } finally {
      setUploading(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName || !folderFieldId || !folderLevelId) {
      alert("Tous les champs sont requis pour le dossier.");
      return;
    }

    setCreatingFolder(true);
    try {
      const formData = new FormData();
      formData.append('title', newFolderName);
      formData.append('type', 'FOLDER');
      formData.append('fieldId', folderFieldId);
      formData.append('levelId', folderLevelId);
      formData.append('semester', currentSemester.toString());
      if (currentFolder) formData.append('parentId', currentFolder.id);

      const res = await fetch('/api/resources', { method: 'POST', body: formData });
      if (res.ok) {
        play('success');
        setIsFolderCreateOpen(false);
        setNewFolderName('');
        fetchResources(currentFolder?.id || null);
      } else {
        alert("Impossible de créer le dossier.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCreatingFolder(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20 px-2 md:px-0 text-zinc-900 dark:text-zinc-100">
      <div className="flex flex-col gap-4 px-2">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Ressources</h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">Gestion et organisation des cours.</p>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700">
              <button
                onClick={() => setCurrentSemester(1)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${currentSemester === 1 ? 'bg-white dark:bg-zinc-900 text-blue-600 shadow-sm' : 'text-zinc-500'}`}
              >
                S1
              </button>
              <button
                onClick={() => setCurrentSemester(2)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${currentSemester === 2 ? 'bg-white dark:bg-zinc-900 text-blue-600 shadow-sm' : 'text-zinc-500'}`}
              >
                S2
              </button>
            </div>
            <button
              onClick={() => fetchResources(currentFolder?.id || null)}
              className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition-all border border-zinc-200 dark:border-zinc-700"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            {isAdmin && (
              <>
                <button
                  onClick={() => setIsFolderCreateOpen(true)}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl font-bold border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                >
                  <Folder size={18} className="text-amber-500" /> <span>Dossier</span>
                </button>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all"
                >
                  <Upload size={18} /> <span>Importer ici</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400 overflow-x-auto no-scrollbar py-2 border-b border-zinc-100 dark:border-zinc-800">
          <button
            onClick={() => handleNavigateBreadcrumb(-1)}
            className={`flex items-center gap-1 hover:text-blue-600 transition-colors ${!currentFolder ? 'font-black text-zinc-900 dark:text-white' : 'font-medium'}`}
          >
            <Folder size={14} className={!currentFolder ? 'text-amber-500' : ''} /> Accueil
          </button>
          {breadcrumbs.map((folder, index) => (
            <div key={folder.id} className="flex items-center gap-1 shrink-0 font-medium">
              <ChevronRight size={14} className="text-zinc-300 dark:text-zinc-600" />
              <button
                onClick={() => handleNavigateBreadcrumb(index)}
                className={`hover:text-blue-600 transition-colors ${index === breadcrumbs.length - 1 ? 'font-black text-zinc-900 dark:text-white' : ''}`}
              >
                {folder.title}
              </button>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="animate-spin text-blue-600" size={40} />
          <p className="text-zinc-500 animate-pulse font-bold">Synchronisation...</p>
        </div>
      ) : resources.length === 0 ? (
        <div className="mx-2 text-center py-24 text-zinc-400 dark:text-zinc-500 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-[2rem] bg-zinc-50/50 dark:bg-zinc-900/20">
          <Folder size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-lg font-bold">Ce dossier est vide.</p>
          {isAdmin && <p className="text-sm">Cliquez sur &quot;Importer&quot; pour ajouter un fichier.</p>}
        </div>
      ) : (
        <div className="space-y-12 pb-10">

          {/* Section Dossiers */}
          {resources.filter(r => r.type === 'FOLDER').length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold px-2 text-zinc-900 dark:text-white flex items-center justify-between">
                <span>Dossiers</span>
                <span className="text-sm font-medium text-amber-500 bg-amber-50 dark:bg-amber-500/10 px-3 py-1 rounded-full">{resources.filter(r => r.type === 'FOLDER').length}</span>
              </h2>
              <div className="flex gap-4 overflow-x-auto pb-4 px-2 no-scrollbar snap-x">
                {resources.filter(r => r.type === 'FOLDER').map(res => (
                  <motion.div
                    key={res.id}
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    onClick={() => handleEnterFolder(res)}
                    className="shrink-0 w-64 snap-center bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-500/20 dark:to-amber-500/5 p-5 rounded-[2rem] border border-amber-200/50 dark:border-amber-500/20 cursor-pointer hover:shadow-xl hover:shadow-amber-500/10 transition-all group relative overflow-hidden"
                  >
                    <div className="absolute -right-6 -bottom-6 opacity-10 group-hover:scale-110 transition-transform duration-500">
                      <Folder size={120} className="text-amber-500" />
                    </div>
                    <div className="flex items-start justify-between mb-8 relative z-10">
                      <div className="p-3 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md rounded-2xl text-amber-600 dark:text-amber-400">
                        <Folder size={28} className="fill-amber-500/20" />
                      </div>
                      {isAdmin && (
                        <button onClick={(e) => { e.stopPropagation(); if (confirm('Supprimer ce dossier et tout son contenu ?')) fetch(`/api/resources/${res.id}`, { method: 'DELETE' }).then(() => fetchResources(currentFolder?.id || null)); }} className="p-2 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md text-zinc-400 hover:text-red-500 rounded-xl opacity-0 group-hover:opacity-100 transition-all">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    <h3 className="font-bold text-lg text-amber-900 dark:text-amber-100 truncate relative z-10">{res.title}</h3>
                    <p className="text-xs text-amber-700/70 dark:text-amber-400/70 mt-1 font-medium relative z-10 flex items-center gap-1">
                      <ChevronRight size={14} /> Explorer
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Section Fichiers (Sauf PDF Principaux) */}
          {resources.filter(r => r.type !== 'FOLDER' && r.type !== 'PDF').length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold px-2 text-zinc-900 dark:text-white flex items-center gap-2">Découvertes</h2>
              <div className="flex gap-4 overflow-x-auto pb-4 px-2 no-scrollbar snap-x">
                {resources.filter(r => r.type !== 'FOLDER' && r.type !== 'PDF').map((res) => (
                  <ResourceCard key={res.id} res={res} isAdmin={isAdmin} setPreviewFile={setPreviewFile} currentFolder={currentFolder} fetchResources={fetchResources} />
                ))}
              </div>
            </div>
          )}

          {/* Section PDF (Cours) */}
          {resources.filter(r => r.type === 'PDF').length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold px-2 text-zinc-900 dark:text-white flex items-center gap-2">Supports de Cours</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 px-2">
                {resources.filter(r => r.type === 'PDF').map((res) => (
                  <ResourceCard key={res.id} res={res} isAdmin={isAdmin} setPreviewFile={setPreviewFile} currentFolder={currentFolder} fetchResources={fetchResources} />
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* Upload Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl border border-zinc-200 dark:border-zinc-800 relative">
              <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-white transition-colors"><X /></button>
              <h3 className="text-2xl font-bold mb-2 text-zinc-900 dark:text-white text-center">Importer</h3>
              <p className="text-sm text-zinc-500 mb-8 text-center">Destination : <span className="text-blue-600 font-bold">{currentFolder ? currentFolder.title : 'Racine'}</span></p>

              <form onSubmit={handleUpload} className="space-y-5">
                {!currentFolder && (
                  <div className="grid grid-cols-2 gap-4">
                    <select required className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-2xl text-sm font-bold text-zinc-900 dark:text-white" value={fieldId} onChange={e => setFieldId(e.target.value)}>
                      <option value="">Filière...</option>
                      {options.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <select required className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-2xl text-sm font-bold text-zinc-900 dark:text-white" value={levelId} onChange={e => setLevelId(e.target.value)}>
                      <option value="">Niveau...</option>
                      {options.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-zinc-400 px-1">Fichier(s)</label>
                  <input type="file" required multiple onChange={e => { setFiles(e.target.files); if (e.target.files?.length === 1) setTitle(e.target.files[0].name.replace(/\.[^/.]+$/, "")) }} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3 rounded-2xl text-xs font-medium text-zinc-500 cursor-pointer" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-zinc-400 px-1">Titre (Auto si vide)</label>
                  <input type="text" placeholder="Ex: TP Algo" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl text-sm font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 p-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-2xl font-black uppercase tracking-widest text-xs">Annuler</button>
                  <button type="submit" disabled={uploading} className="flex-1 p-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-blue-700 disabled:opacity-50">
                    {uploading ? 'Envoi...' : 'Confirmer'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isFolderCreateOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl border border-zinc-200 dark:border-zinc-800 relative">
              <button onClick={() => setIsFolderCreateOpen(false)} className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-white transition-colors"><X /></button>
              <h3 className="text-2xl font-bold mb-8 text-zinc-900 dark:text-white text-center">Nouveau Dossier</h3>
              <form onSubmit={handleCreateFolder} className="space-y-5">
                <input type="text" required placeholder="Nom du dossier" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl text-sm font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
                <div className="grid grid-cols-2 gap-4">
                  <select required className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-2xl text-sm font-bold text-zinc-900 dark:text-white" value={folderFieldId} onChange={e => setFolderFieldId(e.target.value)}>
                    <option value="">Filière...</option>
                    {options.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <select required className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-2xl text-sm font-bold text-zinc-900 dark:text-white" value={folderLevelId} onChange={e => setFolderLevelId(e.target.value)}>
                    <option value="">Niveau...</option>
                    {options.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setIsFolderCreateOpen(false)} className="flex-1 p-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-2xl font-black uppercase tracking-widest text-xs">Annuler</button>
                  <button type="submit" disabled={creatingFolder} className="flex-1 p-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-blue-700">
                    {creatingFolder ? 'Création...' : 'Créer'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewFile && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-2 md:p-10 bg-zinc-950/95 backdrop-blur-xl">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="relative w-full h-full bg-white dark:bg-zinc-900 rounded-[2rem] overflow-hidden flex flex-col shadow-2xl border border-zinc-200 dark:border-zinc-800">
              <div className="p-4 border-b flex justify-between items-center bg-white dark:bg-zinc-900">
                <div className="flex items-center gap-3">
                  <FileText size={20} className="text-blue-600" />
                  <h3 className="font-bold text-zinc-900 dark:text-white truncate">{previewFile.title}</h3>
                </div>
                <button onClick={() => setPreviewFile(null)} className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full transition-all">
                  <X size={24} />
                </button>
              </div>
              <iframe src={`${previewFile.url}#toolbar=0`} className="flex-1 border-none" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}