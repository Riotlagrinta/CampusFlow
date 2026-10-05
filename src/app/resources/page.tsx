'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Loader2,
  X,
  Trash2,
  Folder,
  ChevronRight,
  Upload,
  RefreshCw
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { upload } from '@vercel/blob/client';
import { useSound } from '@/hooks/useSound';
import { ResourceCard, type Resource } from '@/components/resources/ResourceCard';
import { getCurrentSemester } from '@/lib/semester';
import {
  ALLOWED_EXTENSIONS,
  MAX_FORM_FILE_BYTES,
  MAX_FORM_UPLOAD_LABEL,
  MAX_UPLOAD_LABEL,
  UPLOAD_FORMATS_LABEL,
  classifyFile,
  sanitizeFileName,
} from '@/lib/uploadValidation';

interface AcademicOption {
  id: string;
  name: string;
}

// Formats proposés par le sélecteur de fichiers (mêmes règles que le serveur).
const FILE_ACCEPT = ALLOWED_EXTENSIONS.map(ext => `.${ext}`).join(',');

type Notice = { kind: 'success' | 'error'; text: string };

async function readApiError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === 'string') return data.error;
  } catch {
    // corps non JSON : on retombe sur le statut
  }
  if (res.status === 413) return `Fichier trop volumineux pour l'envoi classique (${MAX_FORM_UPLOAD_LABEL} maximum).`;
  return `Erreur ${res.status}`;
}

export default function ResourcesPage() {
  const { play } = useSound();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  const [resources, setResources] = useState<Resource[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [currentSemester, setCurrentSemester] = useState<number>(() => getCurrentSemester());

  const [currentFolder, setCurrentFolder] = useState<Resource | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Resource[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFolderCreateOpen, setIsFolderCreateOpen] = useState(false);

  const [previewFile, setPreviewFile] = useState<Resource | null>(null);

  const [options, setOptions] = useState<{ fields: AcademicOption[], levels: AcademicOption[] }>({ fields: [], levels: [] });

  // Form States
  const [title, setTitle] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);

  const [newFolderName, setNewFolderName] = useState('');
  const [folderFieldId, setFolderFieldId] = useState('');
  const [folderLevelId, setFolderLevelId] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  // Évite qu'une réponse tardive d'un ancien dossier/semestre écrase la liste affichée
  const latestRequest = useRef(0);

  const fetchResources = useCallback(async (parentId: string | null, cursor?: string) => {
    const requestId = ++latestRequest.current;
    if (cursor) setLoadingMore(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams({ parentId: parentId ?? 'null', semester: String(currentSemester) });
      if (cursor) params.set('cursor', cursor);

      const res = await fetch(`/api/resources?${params}`, { cache: 'no-store' });
      if (requestId !== latestRequest.current) return;

      if (!res.ok) {
        setLoadError(await readApiError(res));
        if (!cursor) {
          setResources([]);
          setNextCursor(null);
        }
        return;
      }

      const data: unknown = await res.json();
      if (!Array.isArray(data)) {
        setLoadError('Réponse inattendue du serveur.');
        return;
      }

      setLoadError(null);
      setResources(prev => (cursor ? [...prev, ...(data as Resource[])] : (data as Resource[])));
      setNextCursor(res.headers.get('X-Next-Cursor'));
    } catch (err) {
      console.error("Erreur fetch:", err);
      if (requestId === latestRequest.current) setLoadError('Impossible de contacter le serveur.');
    } finally {
      if (requestId === latestRequest.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [currentSemester]);

  useEffect(() => {
    fetchResources(currentFolder?.id ?? null);
  }, [fetchResources, currentFolder?.id]);

  // Les listes filière/niveau ne servent qu'aux formulaires d'ajout (admin)
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/academic/options')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data && Array.isArray(data.fields) && Array.isArray(data.levels)) setOptions(data);
      })
      .catch(err => console.error("Erreur options:", err));
  }, [isAdmin]);

  const handleSelectSemester = (semester: number) => {
    if (semester === currentSemester) return;
    // Un dossier appartient à un semestre : on revient à la racine
    setCurrentFolder(null);
    setBreadcrumbs([]);
    setFieldId('');
    setLevelId('');
    setCurrentSemester(semester);
  };

  const handleEnterFolder = (folder: Resource) => {
    setCurrentFolder(folder);
    setBreadcrumbs([...breadcrumbs, folder]);
    setFieldId(folder.fieldId || '');
    setLevelId(folder.levelId || '');
  };

  const handleNavigateBreadcrumb = (index: number) => {
    if (index === -1) {
      setCurrentFolder(null);
      setBreadcrumbs([]);
      setFieldId('');
      setLevelId('');
      return;
    }
    const targetFolder = breadcrumbs[index];
    setCurrentFolder(targetFolder);
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    setFieldId(targetFolder.fieldId || '');
    setLevelId(targetFolder.levelId || '');
  };

  const handleDelete = async (resource: Resource) => {
    const message = resource.type === 'FOLDER' ? 'Supprimer ce dossier et tout son contenu ?' : 'Supprimer ce fichier ?';
    if (!confirm(message)) return;

    try {
      const res = await fetch(`/api/resources/${resource.id}`, { method: 'DELETE' });
      if (!res.ok) {
        setNotice({ kind: 'error', text: `Suppression impossible : ${await readApiError(res)}` });
        return;
      }
      setResources(prev => prev.filter(r => r.id !== resource.id));
    } catch (err) {
      console.error("Erreur suppression:", err);
      setNotice({ kind: 'error', text: 'Suppression impossible : serveur injoignable.' });
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!files || files.length === 0) {
      setNotice({ kind: 'error', text: 'Veuillez sélectionner au moins un fichier.' });
      return;
    }

    // Dans un dossier, filière et niveau sont hérités du dossier (côté serveur)
    if (!currentFolder && (!fieldId || !levelId)) {
      setNotice({ kind: 'error', text: 'Veuillez sélectionner une filière et un niveau.' });
      return;
    }

    setUploading(true);
    setNotice(null);
    let successCount = 0;
    const failures: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const currentFile = files[i];

        // Mêmes règles que le serveur : format autorisé, taille, type cohérent avec l'extension.
        const checked = classifyFile(currentFile);
        if (!checked.ok) {
          failures.push(`${currentFile.name} : ${checked.error}.`);
          continue;
        }

        const fileTitle = files.length > 1 ? currentFile.name : (title || currentFile.name);
        const common = {
          title: fileTitle,
          type: checked.resourceType,
          fieldId: currentFolder ? currentFolder.fieldId : fieldId,
          levelId: currentFolder ? currentFolder.levelId : levelId,
          parentId: currentFolder?.id ?? null,
          semester: currentFolder ? currentFolder.semester : currentSemester,
        };

        try {
          // TENTATIVE 1 : UPLOAD DIRECT (BLOB), sans limite de taille côté Vercel
          let blobUrl: string | null = null;
          try {
            const newBlob = await upload(`resources/${crypto.randomUUID()}-${sanitizeFileName(currentFile.name)}`, currentFile, {
              access: 'public',
              handleUploadUrl: '/api/upload',
              // Type MIME canonique : accepté par le jeton quel que soit celui annoncé par le navigateur
              contentType: checked.mime,
            });
            blobUrl = newBlob.url;
          } catch (blobError) {
            console.warn("Echec Upload Direct, passage en mode Secours (FormData)", blobError);
          }

          let res: Response;
          if (blobUrl) {
            // ENREGISTREMENT EN BASE : corps JSON (une seule sérialisation)
            res = await fetch('/api/resources', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...common,
                url: blobUrl,
                size: `${(currentFile.size / (1024 * 1024)).toFixed(2)} MB`,
              }),
            });
          } else if (currentFile.size <= MAX_FORM_FILE_BYTES) {
            // TENTATIVE 2 : FALLBACK CLASSIQUE (Vercel limite le corps à 4,5 Mo)
            const formData = new FormData();
            formData.append('file', currentFile);
            formData.append('title', common.title);
            formData.append('type', common.type);
            formData.append('semester', String(common.semester));
            if (common.fieldId) formData.append('fieldId', common.fieldId);
            if (common.levelId) formData.append('levelId', common.levelId);
            if (common.parentId) formData.append('parentId', common.parentId);
            res = await fetch('/api/resources', { method: 'POST', body: formData });
          } else {
            failures.push(
              `${currentFile.name} : l'envoi direct a échoué et le fichier dépasse ${MAX_FORM_UPLOAD_LABEL}, limite de l'envoi de secours. Réessayez dans un instant.`
            );
            continue;
          }

          if (res.ok) successCount++;
          else failures.push(`${currentFile.name} : ${await readApiError(res)}`);
        } catch (fileError) {
          console.error("Erreur upload:", fileError);
          failures.push(`${currentFile.name} : serveur injoignable.`);
        }
      }

      if (successCount > 0) {
        play('success');
        setIsModalOpen(false);
        setTitle('');
        setFiles(null);
        fetchResources(currentFolder?.id ?? null);
      }

      if (failures.length > 0) {
        setNotice({
          kind: 'error',
          text: `${successCount} ressource(s) ajoutée(s), ${failures.length} échec(s) — ${failures.join(' ')}`,
        });
      } else if (successCount > 0) {
        setNotice({ kind: 'success', text: `${successCount} ressource(s) ajoutée(s) avec succès !` });
      }
    } finally {
      setUploading(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !folderFieldId || !folderLevelId) {
      setNotice({ kind: 'error', text: 'Tous les champs sont requis pour le dossier.' });
      return;
    }

    setCreatingFolder(true);
    try {
      const res = await fetch('/api/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newFolderName,
          type: 'FOLDER',
          fieldId: folderFieldId,
          levelId: folderLevelId,
          semester: currentSemester,
          parentId: currentFolder?.id ?? null,
        }),
      });
      if (res.ok) {
        play('success');
        setIsFolderCreateOpen(false);
        setNewFolderName('');
        fetchResources(currentFolder?.id ?? null);
      } else {
        setNotice({ kind: 'error', text: `Impossible de créer le dossier : ${await readApiError(res)}` });
      }
    } catch (err) {
      console.error(err);
      setNotice({ kind: 'error', text: 'Impossible de créer le dossier : serveur injoignable.' });
    } finally {
      setCreatingFolder(false);
    }
  };

  const folders = resources.filter(r => r.type === 'FOLDER');
  const otherFiles = resources.filter(r => r.type !== 'FOLDER' && r.type !== 'PDF');
  const pdfFiles = resources.filter(r => r.type === 'PDF');

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20 px-2 md:px-0 text-zinc-900 dark:text-zinc-100">
      {/* Ambient blob */}
      <motion.div className="fixed top-20 right-20 w-80 h-80 bg-amber-500/5 rounded-full blur-[120px] -z-10 pointer-events-none"
        animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 8, repeat: Infinity }} />

      <div className="flex flex-col gap-4 px-2">
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
        >
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Ressources</h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium">Gestion et organisation des cours.</p>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700">
              {[1, 2].map(s => (
                <motion.button key={s} type="button" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                  onClick={() => handleSelectSemester(s)}
                  aria-pressed={currentSemester === s}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${currentSemester === s ? 'bg-white dark:bg-zinc-900 text-blue-600 shadow-sm' : 'text-zinc-500'}`}
                >S{s}</motion.button>
              ))}
            </div>
            <motion.button type="button" whileHover={{ rotate: 180 }} transition={{ duration: 0.4 }}
              onClick={() => fetchResources(currentFolder?.id ?? null)}
              aria-label="Actualiser la liste"
              className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition-all border border-zinc-200 dark:border-zinc-700"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </motion.button>
            {isAdmin && (
              <>
                <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => setIsFolderCreateOpen(true)}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl font-bold border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                >
                  <Folder size={18} className="text-amber-500" /> <span>Dossier</span>
                </motion.button>
                <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={() => setIsModalOpen(true)}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 transition-all"
                >
                  <Upload size={18} /> <span>Importer ici</span>
                </motion.button>
              </>
            )}
          </div>
        </motion.div>

        <nav aria-label="Fil d'Ariane" className="flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400 overflow-x-auto no-scrollbar py-2 border-b border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => handleNavigateBreadcrumb(-1)}
            className={`flex items-center gap-1 hover:text-blue-600 transition-colors ${!currentFolder ? 'font-black text-zinc-900 dark:text-white' : 'font-medium'}`}
          >
            <Folder size={14} className={!currentFolder ? 'text-amber-500' : ''} /> Accueil
          </button>
          {breadcrumbs.map((folder, index) => (
            <div key={folder.id} className="flex items-center gap-1 shrink-0 font-medium">
              <ChevronRight size={14} className="text-zinc-300 dark:text-zinc-600" />
              <button
                type="button"
                onClick={() => handleNavigateBreadcrumb(index)}
                className={`hover:text-blue-600 transition-colors ${index === breadcrumbs.length - 1 ? 'font-black text-zinc-900 dark:text-white' : ''}`}
              >
                {folder.title}
              </button>
            </div>
          ))}
        </nav>
      </div>

      {notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`mx-2 flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-medium ${notice.kind === 'error'
            ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300'
            : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300'}`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Fermer le message" className="shrink-0 opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="animate-spin text-blue-600" size={40} />
          <p className="text-zinc-500 animate-pulse font-bold">Synchronisation...</p>
        </div>
      ) : loadError ? (
        <div role="alert" className="mx-2 text-center py-20 text-zinc-500 border-2 border-dashed border-red-200 dark:border-red-900/40 rounded-[2rem] space-y-4">
          <p className="text-lg font-bold">Impossible de charger les ressources.</p>
          <p className="text-sm">{loadError}</p>
          <button
            type="button"
            onClick={() => fetchResources(currentFolder?.id ?? null)}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold"
          >
            Réessayer
          </button>
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
          {folders.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold px-2 text-zinc-900 dark:text-white flex items-center justify-between">
                <span>Dossiers</span>
                <span className="text-sm font-medium text-amber-500 bg-amber-50 dark:bg-amber-500/10 px-3 py-1 rounded-full">{folders.length}</span>
              </h2>
              <div className="flex gap-4 overflow-x-auto pb-4 px-2 no-scrollbar snap-x">
                {folders.map(res => (
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
                        <button
                          type="button"
                          aria-label={`Supprimer le dossier ${res.title}`}
                          onClick={(e) => { e.stopPropagation(); handleDelete(res); }}
                          className="p-2 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md text-zinc-400 hover:text-red-500 rounded-xl md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 transition-all"
                        >
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
          {otherFiles.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold px-2 text-zinc-900 dark:text-white flex items-center gap-2">Découvertes</h2>
              <div className="flex gap-4 overflow-x-auto pb-4 px-2 no-scrollbar snap-x">
                {otherFiles.map((res) => (
                  <ResourceCard key={res.id} res={res} isAdmin={isAdmin} setPreviewFile={setPreviewFile} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          )}

          {/* Section PDF (Cours) */}
          {pdfFiles.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold px-2 text-zinc-900 dark:text-white flex items-center gap-2">Supports de Cours</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 px-2">
                {pdfFiles.map((res) => (
                  <ResourceCard key={res.id} res={res} isAdmin={isAdmin} setPreviewFile={setPreviewFile} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          )}

          {nextCursor && (
            <div className="flex justify-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => fetchResources(currentFolder?.id ?? null, nextCursor)}
                className="px-6 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl text-sm font-bold border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {loadingMore && <Loader2 size={16} className="animate-spin" />}
                {loadingMore ? 'Chargement...' : 'Charger plus'}
              </button>
            </div>
          )}

        </div>
      )}

      {/* Upload Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div role="dialog" aria-modal="true" aria-labelledby="upload-title" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl border border-zinc-200 dark:border-zinc-800 relative">
              <button type="button" onClick={() => setIsModalOpen(false)} aria-label="Fermer" className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-white transition-colors"><X /></button>
              <h3 id="upload-title" className="text-2xl font-bold mb-2 text-zinc-900 dark:text-white text-center">Importer</h3>
              <p className="text-sm text-zinc-500 mb-8 text-center">Destination : <span className="text-blue-600 font-bold">{currentFolder ? currentFolder.title : 'Racine'}</span></p>

              <form onSubmit={handleUpload} className="space-y-5">
                {!currentFolder && (
                  <div className="grid grid-cols-2 gap-4">
                    <select required aria-label="Filière" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-2xl text-sm font-bold text-zinc-900 dark:text-white" value={fieldId} onChange={e => setFieldId(e.target.value)}>
                      <option value="">Filière...</option>
                      {options.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    <select required aria-label="Niveau" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-2xl text-sm font-bold text-zinc-900 dark:text-white" value={levelId} onChange={e => setLevelId(e.target.value)}>
                      <option value="">Niveau...</option>
                      {options.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="space-y-1">
                  <label htmlFor="upload-files" className="text-[10px] font-black uppercase text-zinc-400 px-1">Fichier(s)</label>
                  <input id="upload-files" type="file" required multiple accept={FILE_ACCEPT} aria-describedby="upload-files-hint" onChange={e => { setFiles(e.target.files); if (e.target.files?.length === 1) setTitle(e.target.files[0].name.replace(/\.[^/.]+$/, "")) }} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3 rounded-2xl text-xs font-medium text-zinc-500 cursor-pointer" />
                  <p id="upload-files-hint" className="text-[11px] text-zinc-400 px-1">{UPLOAD_FORMATS_LABEL} — {MAX_UPLOAD_LABEL} maximum par fichier.</p>
                </div>
                <div className="space-y-1">
                  <label htmlFor="upload-title-input" className="text-[10px] font-black uppercase text-zinc-400 px-1">Titre (Auto si vide)</label>
                  <input id="upload-title-input" type="text" placeholder="Ex: TP Algo" maxLength={200} value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl text-sm font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
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
          <div role="dialog" aria-modal="true" aria-labelledby="folder-title" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl border border-zinc-200 dark:border-zinc-800 relative">
              <button type="button" onClick={() => setIsFolderCreateOpen(false)} aria-label="Fermer" className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-white transition-colors"><X /></button>
              <h3 id="folder-title" className="text-2xl font-bold mb-8 text-zinc-900 dark:text-white text-center">Nouveau Dossier</h3>
              <form onSubmit={handleCreateFolder} className="space-y-5">
                <input type="text" required aria-label="Nom du dossier" placeholder="Nom du dossier" maxLength={200} value={newFolderName} onChange={e => setNewFolderName(e.target.value)} className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl text-sm font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
                <div className="grid grid-cols-2 gap-4">
                  <select required aria-label="Filière" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-2xl text-sm font-bold text-zinc-900 dark:text-white" value={folderFieldId} onChange={e => setFolderFieldId(e.target.value)}>
                    <option value="">Filière...</option>
                    {options.fields.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <select required aria-label="Niveau" className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-2xl text-sm font-bold text-zinc-900 dark:text-white" value={folderLevelId} onChange={e => setFolderLevelId(e.target.value)}>
                    <option value="">Niveau...</option>
                    {options.levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setIsFolderCreateOpen(false)} className="flex-1 p-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-2xl font-black uppercase tracking-widest text-xs">Annuler</button>
                  <button type="submit" disabled={creatingFolder} className="flex-1 p-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg hover:bg-blue-700 disabled:opacity-50">
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
          <div role="dialog" aria-modal="true" aria-label={`Aperçu de ${previewFile.title}`} className="fixed inset-0 z-[110] flex items-center justify-center p-2 md:p-10 bg-zinc-950/95 backdrop-blur-xl">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="relative w-full h-full bg-white dark:bg-zinc-900 rounded-[2rem] overflow-hidden flex flex-col shadow-2xl border border-zinc-200 dark:border-zinc-800">
              <div className="p-4 border-b flex justify-between items-center bg-white dark:bg-zinc-900">
                <div className="flex items-center gap-3">
                  <FileText size={20} className="text-blue-600" />
                  <h3 className="font-bold text-zinc-900 dark:text-white truncate">{previewFile.title}</h3>
                </div>
                <button type="button" onClick={() => setPreviewFile(null)} aria-label="Fermer l'aperçu" className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-full transition-all">
                  <X size={24} />
                </button>
              </div>
              <iframe src={`${previewFile.url}#toolbar=0`} title={`Aperçu de ${previewFile.title}`} className="flex-1 border-none" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
