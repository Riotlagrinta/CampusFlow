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
import { useSound } from '@/hooks/useSound';

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
    const userStr = localStorage.getItem('user');
    if (userStr) {
        const user = JSON.parse(userStr);
        setIsAdmin(user.role === 'ADMIN');
    }
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
      const total = inputType === 'FILE' ? files!.length : 1;

      for (let i = 0; i < total; i++) {
        const formData = new FormData();
        if (inputType === 'FILE') {
            formData.append('file', files![i]);
            formData.append('title', total > 1 ? files![i].name : (title || files![i].name));
        } else {
            formData.append('externalUrl', externalUrl);
            formData.append('title', title || "Lien externe");
        }

        formData.append('type', type);
        formData.append('fieldId', fieldId);
        formData.append('levelId', levelId);
        if (currentFolder) formData.append('parentId', currentFolder.id);

        console.log(`Envoi du fichier ${i+1}/${total}...`);
        const res = await fetch('/api/resources', { method: 'POST', body: formData });
        
        if (res.ok) {
            successCount++;
        } else {
            failCount++;
            let errorMessage = `Erreur ${res.status}: ${res.statusText}`;
            try {
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    const errorData = await res.json();
                    errorMessage = errorData.error || errorMessage;
                } else {
                    const text = await res.text();
                    console.error("Erreur non-JSON reçue:", text);
                    errorMessage += " (Réponse serveur invalide)";
                }
            } catch (e) {
                console.error("Erreur lecture réponse:", e);
            }
            alert(`Échec de l'envoi : ${errorMessage}`);
        }
      }

      if (successCount > 0) {
        play('success');
        alert(`${successCount} élément(s) ajouté(s) !`);
        setIsModalOpen(false);
        setTitle('');
        setFiles(null);
        setExternalUrl('');
        fetchResources(currentFolder?.id || null);
      } else if (failCount > 0) {
        alert("L'importation a échoué. Vérifiez la console pour plus de détails.");
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
           {isAdmin && <p className="text-sm">Cliquez sur "Importer" pour ajouter un fichier.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 px-2 pb-10">
          {resources.map((res) => (
            <motion.div 
              key={res.id} 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              onClick={() => res.type === 'FOLDER' ? handleEnterFolder(res) : null}
              className={`bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-all group ${res.type === 'FOLDER' ? 'cursor-pointer hover:border-amber-400' : 'hover:border-blue-400'}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-2xl border ${res.type === 'FOLDER' ? 'bg-amber-50 border-amber-100 text-amber-500' : 'bg-blue-50 border-blue-100 text-blue-500'}`}>
                  {res.type === 'FOLDER' ? <Folder size={24} /> : <FileText size={24} />}
                </div>
                {isAdmin && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); if(confirm('Supprimer ?')) fetch(`/api/resources/${res.id}`, {method:'DELETE'}).then(()=>fetchResources(currentFolder?.id||null)); }} 
                        className="p-2 text-zinc-400 hover:text-red-500 rounded-xl"
                    >
                        <Trash2 size={18} />
                    </button>
                )}
              </div>
              <h3 className="font-bold text-zinc-900 dark:text-zinc-100 truncate">{res.title}</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 font-semibold">
                {res.type === 'FOLDER' ? 'DOSSIER' : `${res.size || 'Fichier'}`}
              </p>
              
              {res.type !== 'FOLDER' && (
                <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                    <button 
                        onClick={(e) => { e.stopPropagation(); setPreviewFile(res); }} 
                        className="text-xs font-black uppercase tracking-tighter flex items-center gap-2 text-zinc-600 dark:text-zinc-300 hover:text-blue-600 transition-colors bg-zinc-50 dark:bg-zinc-800 px-3 py-2 rounded-lg"
                    >
                        <Eye size={14}/> Aperçu
                    </button>
                    <a 
                        href={res.url} 
                        target="_blank" 
                        onClick={e=>e.stopPropagation()} 
                        className="text-xs font-black uppercase tracking-tighter flex items-center gap-2 text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg transition-all"
                    >
                        <Download size={14}/> Télécharger
                    </a>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl border border-zinc-200 dark:border-zinc-800 relative">
                <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-white transition-colors"><X/></button>
                <h3 className="text-2xl font-bold mb-2 text-zinc-900 dark:text-white text-center">Importer</h3>
                <p className="text-sm text-zinc-500 mb-8 text-center">Destination : <span className="text-blue-600 font-bold">{currentFolder ? currentFolder.title : 'Racine'}</span></p>
                
                <form onSubmit={handleUpload} className="space-y-5">
                    {!currentFolder && (
                        <div className="grid grid-cols-2 gap-4">
                            <select required className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-2xl text-sm font-bold text-zinc-900 dark:text-white" value={fieldId} onChange={e=>setFieldId(e.target.value)}>
                                <option value="">Filière...</option>
                                {options.fields.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                            <select required className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-2xl text-sm font-bold text-zinc-900 dark:text-white" value={levelId} onChange={e=>setLevelId(e.target.value)}>
                                <option value="">Niveau...</option>
                                {options.levels.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-zinc-400 px-1">Fichier(s)</label>
                        <input type="file" required multiple onChange={e=>{setFiles(e.target.files); if(e.target.files?.length===1) setTitle(e.target.files[0].name.replace(/\.[^/.]+$/, ""))}} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3 rounded-2xl text-xs font-medium text-zinc-500 cursor-pointer" />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-zinc-400 px-1">Titre (Auto si vide)</label>
                        <input type="text" placeholder="Ex: TP Algo" value={title} onChange={e=>setTitle(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl text-sm font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
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
                <button onClick={() => setIsFolderCreateOpen(false)} className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-white transition-colors"><X/></button>
                <h3 className="text-2xl font-bold mb-8 text-zinc-900 dark:text-white text-center">Nouveau Dossier</h3>
                <form onSubmit={handleCreateFolder} className="space-y-5">
                    <input type="text" required placeholder="Nom du dossier" value={newFolderName} onChange={e=>setNewFolderName(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl text-sm font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
                    <div className="grid grid-cols-2 gap-4">
                        <select required className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-2xl text-sm font-bold text-zinc-900 dark:text-white" value={folderFieldId} onChange={e=>setFolderFieldId(e.target.value)}>
                            <option value="">Filière...</option>
                            {options.fields.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                        <select required className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-2xl text-sm font-bold text-zinc-900 dark:text-white" value={folderLevelId} onChange={e=>setFolderLevelId(e.target.value)}>
                            <option value="">Niveau...</option>
                            {options.levels.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
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
                    <FileText size={20} className="text-blue-600"/>
                    <h3 className="font-bold text-zinc-900 dark:text-white truncate">{previewFile.title}</h3>
                </div>
                <button onClick={() => setPreviewFile(null)} className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full transition-all">
                    <X size={24}/>
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