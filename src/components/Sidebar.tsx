'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Calendar,
  BookOpen,
  MessageSquare,
  Bot,
  User as UserIcon,
  Menu,
  X,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  LogOut,
  Brain,
  ShoppingCart,
  Layers,
  FileText,
  LifeBuoy,
  Sparkles as SparklesIcon,
  type LucideIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession, signOut as nextSignOut } from "next-auth/react";
import { cn } from '@/lib/utils';
import { isPaymentsEnabled } from '@/lib/payments';

interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
  /** Visible seulement quand les paiements sont activés (src/lib/payments.ts). */
  paymentsOnly?: boolean;
}

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Vue d\'ensemble', href: '/' },
  { icon: FileText, label: 'Devoirs', href: '/assignments' },
  { icon: Calendar, label: 'Planning', href: '/planning' },
  { icon: ShieldCheck, label: 'Profil Académique', href: '/profile' },
  { icon: Brain, label: 'Quizz', href: '/quiz' },
  { icon: MessageSquare, label: 'Forum', href: '/forum' },
  { icon: Bot, label: 'AI Assistant', href: '/ai-assistant' },
  { icon: Layers, label: 'Flashcards IA (BETA)', href: '/flashcards' },
  { icon: ShoppingCart, label: 'Boutique IA', href: '/shop', paymentsOnly: true },
  { icon: LifeBuoy, label: 'Support & Bug', href: '/support' },
  { icon: SparklesIcon, label: 'Le Développeur', href: '/about' },
  { icon: BookOpen, label: 'Ressources', href: '/resources' },
];

function isRouteActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Efface les données locales liées au compte (historiques de chat IA `ai_*`, clés `user*`)
// pour qu'elles ne soient pas visibles par la personne suivante sur le même appareil.
function purgeAccountStorage() {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    try {
      const storage = window[name];
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && (key.startsWith('ai_') || key.startsWith('user'))) keys.push(key);
      }
      keys.forEach((key) => storage.removeItem(key));
    } catch {
      // Stockage indisponible (navigation privée, politique du navigateur) : rien à purger.
    }
  }
}

// Supprime aussi les caches du navigateur (Cache Storage du service worker) : ils peuvent contenir
// des réponses propres au compte. Lancé sans attente et entièrement protégé : cette purge ne doit
// jamais bloquer ni retarder la déconnexion.
function purgeBrowserCaches() {
  try {
    if (typeof caches === 'undefined') return;
    void caches
      .keys()
      .then((names) => Promise.all(names.map((name) => caches.delete(name))))
      .catch(() => {});
  } catch {
    // Cache Storage indisponible (contexte non sécurisé, politique du navigateur) : rien à purger.
  }
}

export default function Sidebar() {
  const { data: session } = useSession();
  // Deux états indépendants, sans lecture de `window` : le rendu serveur et le premier rendu
  // client sont identiques. L'adaptation mobile/desktop est faite en CSS (classes `lg:`).
  const [collapsed, setCollapsed] = useState(false); // desktop : barre réduite à ses icônes
  const [mobileOpen, setMobileOpen] = useState(false); // mobile : tiroir ouvert
  const [loggingOut, setLoggingOut] = useState(false);
  const { setTheme, resolvedTheme } = useTheme();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const userName = session?.user?.name || 'Étudiant';
  const isAdmin = session?.user?.role === 'ADMIN';

  const pathname = usePathname();

  // Publie l'état réduit pour que la marge du contenu suive (voir --sidebar-width dans globals.css).
  useEffect(() => {
    const root = document.documentElement;
    if (collapsed) root.dataset.sidebar = 'collapsed';
    else delete root.dataset.sidebar;
    return () => {
      delete root.dataset.sidebar;
    };
  }, [collapsed]);

  // Tiroir mobile : focus sur « Fermer » à l'ouverture, Échap pour refermer.
  useEffect(() => {
    if (!mobileOpen) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  const handleLinkClick = () => setMobileOpen(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    purgeAccountStorage();
    purgeBrowserCaches();
    try {
      await nextSignOut({ callbackUrl: '/login' });
    } catch {
      setLoggingOut(false);
    }
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  // Libellés masqués uniquement quand la barre est réduite ET sur desktop (le tiroir mobile reste détaillé).
  const hideWhenCollapsed = collapsed && 'lg:hidden';

  return (
    <>
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <button
        ref={menuButtonRef}
        type="button"
        className="fixed top-4 left-4 z-40 flex h-11 w-11 items-center justify-center bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg lg:hidden text-zinc-600 dark:text-zinc-400"
        onClick={() => setMobileOpen(true)}
        aria-label="Ouvrir le menu"
        aria-expanded={mobileOpen}
        aria-controls="sidebar-navigation"
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      <aside
        id="sidebar-navigation"
        aria-label="Barre latérale"
        className={cn(
          "fixed top-0 left-0 h-dvh w-[260px] bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-900 z-50 flex flex-col shadow-xl lg:shadow-none",
          "transition-[width,transform,visibility] duration-300 ease-out",
          // Mobile fermé : hors écran ET retiré de l'ordre de tabulation (invisible) ; toujours visible sur desktop.
          mobileOpen ? "translate-x-0" : "-translate-x-full invisible lg:visible lg:translate-x-0",
          collapsed && "lg:w-[72px] lg:items-center"
        )}
      >
        <div className={cn("h-16 flex items-center justify-between px-5 mb-6 w-full", collapsed && "lg:justify-center lg:px-0")}>
          <Link
            href="/"
            onClick={handleLinkClick}
            aria-label="DefiTech Student Hub, accueil"
            className="flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden shadow-lg relative">
              <Image src="/logo.svg" alt="" fill sizes="36px" className="object-cover" />
            </div>
            <span className={cn("font-bold text-sm text-zinc-900 dark:text-zinc-50 uppercase tracking-[0.1em]", hideWhenCollapsed)}>Student Hub</span>
          </Link>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fermer le menu"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 lg:hidden"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Navigation principale" className="flex-1 w-full px-3 space-y-1 overflow-y-auto no-scrollbar">
          <p className={cn("px-3 mb-2 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest", hideWhenCollapsed)}>Navigation</p>

          {isAdmin && (
            <Link
              href="/admin"
              onClick={handleLinkClick}
              aria-label="Console Admin"
              title={collapsed ? 'Console Admin' : undefined}
              aria-current={isRouteActive(pathname, '/admin') ? 'page' : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2 min-h-10 rounded-xl mb-4 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-lg",
                collapsed && "lg:justify-center",
                isRouteActive(pathname, '/admin') && "ring-2 ring-blue-500"
              )}
            >
              <ShieldCheck size={18} className="shrink-0" aria-hidden="true" />
              <span className={cn("text-sm font-bold", hideWhenCollapsed)}>Console Admin</span>
            </Link>
          )}

          {navItems.filter((item) => !item.paymentsOnly || isPaymentsEnabled()).map((item) => {
            const isActive = isRouteActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleLinkClick}
                aria-label={item.label}
                title={collapsed ? item.label : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 min-h-10 rounded-xl transition-all duration-200 relative",
                  collapsed && "lg:justify-center",
                  isActive
                    ? "bg-blue-600/10 text-blue-600 border border-blue-500/10"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/50"
                )}
              >
                <item.icon size={18} className={cn("shrink-0", isActive && "text-blue-600")} aria-hidden="true" />
                <span className={cn("text-sm font-medium", isActive && "font-bold", hideWhenCollapsed)}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="w-full p-4 space-y-3 bg-zinc-50/50 dark:bg-zinc-900/10 border-t border-zinc-100 dark:border-zinc-900">
          {resolvedTheme !== undefined && (
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={resolvedTheme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
              className={cn(
                "flex items-center gap-3 w-full px-3 py-2 min-h-10 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900",
                collapsed && "lg:justify-center"
              )}
            >
              <div className="relative w-4 h-4" aria-hidden="true">
                <Sun className={cn("absolute inset-0 transition-all", resolvedTheme === 'dark' ? "rotate-90 scale-0" : "rotate-0 scale-100")} size={18} />
                <Moon className={cn("absolute inset-0 transition-all", resolvedTheme === 'dark' ? "rotate-0 scale-100" : "-rotate-90 scale-0")} size={18} />
              </div>
              <span className={cn("text-xs font-semibold ml-1", hideWhenCollapsed)}>{resolvedTheme === 'dark' ? 'Mode Sombre' : 'Mode Clair'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            aria-label="Se déconnecter"
            className={cn(
              "flex items-center gap-3 w-full px-3 py-2 min-h-10 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-all disabled:opacity-60",
              collapsed && "lg:justify-center"
            )}
          >
            <LogOut size={18} aria-hidden="true" />
            <span className={cn("text-xs font-bold", hideWhenCollapsed)}>{loggingOut ? 'Déconnexion…' : 'Déconnexion'}</span>
          </button>

          <Link
            href="/legal"
            onClick={handleLinkClick}
            aria-label="Mentions légales"
            title={collapsed ? 'Mentions légales' : undefined}
            className={cn(
              "flex items-center gap-3 w-full px-3 py-2.5 min-h-10 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-all",
              collapsed && "lg:justify-center"
            )}
          >
            <ShieldCheck size={14} aria-hidden="true" />
            <span className={cn("text-[10px] font-bold uppercase tracking-widest", hideWhenCollapsed)}>Mentions Légales</span>
          </Link>

          <Link
            href="/profile"
            onClick={handleLinkClick}
            aria-label={`Mon profil, ${userName}`}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm",
              collapsed && "lg:justify-center"
            )}
          >
            <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 overflow-hidden border border-zinc-200 dark:border-zinc-700 relative">
              {session?.user?.image ? (
                <Image src={session.user.image} alt="" fill sizes="32px" className="object-cover" />
              ) : (
                <UserIcon size={16} className="text-zinc-400 dark:text-zinc-500" aria-hidden="true" />
              )}
            </div>
            <div className={cn("flex-1 overflow-hidden", hideWhenCollapsed)}>
              <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">{userName}</p>
              {isAdmin && (
                <div className="flex items-center gap-1">
                  <ShieldCheck size={10} className="text-blue-500" aria-hidden="true" />
                  <p className="text-[8px] font-black text-blue-500 uppercase tracking-widest animate-pulse">Admin</p>
                </div>
              )}
            </div>
          </Link>

          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Déployer la barre latérale' : 'Réduire la barre latérale'}
            aria-expanded={!collapsed}
            aria-controls="sidebar-navigation"
            className="hidden lg:flex items-center justify-center w-full py-2 min-h-10 text-zinc-300 hover:text-zinc-600 dark:hover:text-zinc-500 transition-colors"
          >
            {collapsed ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronLeft size={16} aria-hidden="true" />}
          </button>
        </div>
      </aside>
    </>
  );
}
