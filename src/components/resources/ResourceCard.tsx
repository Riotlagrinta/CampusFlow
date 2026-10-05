import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Video, Headphones, Download, Eye, Trash2, File } from 'lucide-react';

export type Resource = {
    id: string;
    title: string;
    type: string;
    url: string;
    subject: { name: string; code: string | null } | null;
    subjectName: string | null;
    fieldId: string | null;
    levelId: string | null;
    semester: number;
    size: string | null;
    createdAt: string;
    author: { firstName: string | null; lastName: string | null } | null;
    parentId: string | null;
};

interface ResourceCardProps {
    res: Resource;
    isAdmin: boolean;
    setPreviewFile: (res: Resource) => void;
    onDelete: (res: Resource) => void;
}

const getIcon = (type: string) => {
    switch (type) {
        case 'PDF': return <FileText size={24} />;
        case 'VIDEO': return <Video size={24} />;
        case 'AUDIO': return <Headphones size={24} />;
        default: return <File size={24} />;
    }
};

const getColorClass = (type: string) => {
    switch (type) {
        case 'PDF': return 'bg-red-50 border-red-100 text-red-500';
        case 'VIDEO': return 'bg-purple-50 border-purple-100 text-purple-500';
        case 'AUDIO': return 'bg-emerald-50 border-emerald-100 text-emerald-500';
        default: return 'bg-blue-50 border-blue-100 text-blue-500';
    }
};

// « OTHER » n'est plus un choix de l'interface : il désigne les documents Office et les images.
const getTypeLabel = (type: string) => {
    switch (type) {
        case 'PDF': return 'PDF';
        case 'VIDEO': return 'Vidéo';
        case 'AUDIO': return 'Audio';
        default: return 'Document';
    }
};

export const ResourceCard = ({ res, isAdmin, setPreviewFile, onDelete }: ResourceCardProps) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className={`shrink-0 w-64 md:w-auto md:min-w-[250px] bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-all group hover:border-blue-400`}
        >
            <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-2xl border ${getColorClass(res.type)}`}>
                    {getIcon(res.type)}
                </div>
                {isAdmin && (
                    <button
                        type="button"
                        aria-label={`Supprimer ${res.title}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(res);
                        }}
                        className="p-2 text-zinc-400 hover:text-red-500 rounded-xl md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 transition-all"
                    >
                        <Trash2 size={18} />
                    </button>
                )}
            </div>
            <h3 className="font-bold text-zinc-900 dark:text-zinc-100 line-clamp-2 min-h-[48px]">{res.title}</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 font-semibold flex items-center gap-2">
                <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-md">{getTypeLabel(res.type)}</span>
                {res.size && <span>{res.size}</span>}
            </p>

            <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setPreviewFile(res); }}
                    className="text-xs font-black uppercase tracking-tighter flex items-center gap-2 text-zinc-600 dark:text-zinc-300 hover:text-blue-600 transition-colors bg-zinc-50 dark:bg-zinc-800 px-3 py-2 rounded-xl"
                >
                    <Eye size={14} /> Aperçu
                </button>
                <a
                    href={res.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-xs font-black uppercase tracking-tighter flex items-center gap-2 text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-xl shadow-lg shadow-blue-500/20 transition-all"
                >
                    <Download size={14} /> Obtenir
                </a>
            </div>
        </motion.div>
    );
};
