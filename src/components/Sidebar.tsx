'use client';

import React, { useEffect, useState } from 'react';
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
  Command,
  LogOut,
  Brain,
  ShoppingCart,
  Layers,
  FileText,
  Sparkles as SparklesIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut as nextSignOut } from "next-auth/react";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navItems = [
  { icon: LayoutDashboard, label: 'Vue d\'ensemble', href: '/' },
  { icon: FileText, label: 'Devoirs', href: '/assignments' },
  { icon: Calendar, label: 'Planning', href: '/planning' },
  { icon: ShieldCheck, label: 'Profil Académique', href: '/profile' },
  { icon: Brain, label: 'Quizz', href: '/quiz' },
  { icon: MessageSquare, label: 'Forum', href: '/forum' },
  { icon: Bot, label: 'AI Assistant', href: '/ai-assistant' },
  { icon: Layers, label: 'Flashcards IA', href: '/flashcards' },
  { icon: ShoppingCart, label: 'Boutique IA', href: '/shop' },
  { icon: SparklesIcon, label: 'Le Développeur', href: '/about' },
  { icon: BookOpen, label: 'Ressources', href: '/resources' },
];

export default function Sidebar() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false); 
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  const userName = session?.user?.name || 'Étudiant';
  const isAdmin = (session?.user as any)?.role === 'ADMIN';
  
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    const isMobile = window.innerWidth < 1024;
    const initialOpen = !isMobile;
    setIsOpen(initialOpen);
    if (isMobile) {
      document.documentElement.style.setProperty('--sidebar-width', '0px');
    } else {
      document.documentElement.style.setProperty('--sidebar-width', initialOpen ? '260px' : '72px');
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      const isMobile = window.innerWidth < 1024;
      if (isMobile) {
        document.documentElement.style.setProperty('--sidebar-width', '0px');
      } else {
        document.documentElement.style.setProperty('--sidebar-width', isOpen ? '260px' : '72px');
      }
    }
  }, [isOpen, mounted]);

  const handleLinkClick = () => {
    if (window.innerWidth < 1024) setIsOpen(false);
  };

  const handleLogout = async () => {
    localStorage.removeItem('user');
    await nextSignOut({ callbackUrl: '/login' });
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <button 
        className="fixed top-4 left-4 z-50 p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg lg:hidden text-zinc-600 dark:text-zinc-400"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <motion.aside
        initial={false}
        animate={{
          width: isOpen ? 260 : 72,
          x: (typeof window !== 'undefined' && window.innerWidth < 1024 && !isOpen) ? -260 : 0
        }}
        className={cn(
          "fixed top-0 left-0 h-screen bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-900 z-50 transition-all flex flex-col shadow-xl md:shadow-none",
          !isOpen && "items-center"
        )}
      >
        <div className="h-16 flex items-center px-5 mb-6">
          <Link href="/" onClick={handleLinkClick} className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-900 dark:bg-zinc-50 rounded-lg flex items-center justify-center shrink-0">
               <Command size={18} className="text-white dark:text-zinc-900" />
            </div>
            {isOpen && (
              <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-zinc-50 uppercase tracking-[0.1em]">Student Hub</span>
            )}
          </Link>
        </div>

        <div className="flex-1 px-3 space-y-1 overflow-y-auto no-scrollbar">
          {isOpen && <p className="px-3 mb-2 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Navigation</p>}
          
          {isAdmin && (
            <Link
              href="/admin"
              onClick={handleLinkClick}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl mb-4 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-lg",
                pathname === '/admin' && "ring-2 ring-blue-500"
              )}
            >
              <ShieldCheck size={18} className="shrink-0" />
              {isOpen && <span className="text-sm font-bold">Console Admin</span>}
            </Link>
          )}

          {navItems.map((item, index) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={index}
                href={item.href}
                onClick={handleLinkClick}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200",
                  isActive 
                    ? "bg-blue-600/10 text-blue-600 border border-blue-500/10" 
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/50"
                )}
              >
                <item.icon size={18} className={cn("shrink-0", isActive && "text-blue-600")} />
                {isOpen && <span className={cn("text-sm font-medium", isActive && "font-bold")}>{item.label}</span>}
              </Link>
            );
          })}
        </div>

        <div className="p-4 space-y-3 bg-zinc-50/50 dark:bg-zinc-900/10 border-t border-zinc-100 dark:border-zinc-900">
            {mounted && (
                <button
                    onClick={toggleTheme}
                    className="flex items-center gap-3 w-full px-3 py-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900"
                >
                    <div className="relative w-4 h-4">
                        <Sun className={cn("absolute inset-0 transition-all", resolvedTheme === 'dark' ? "rotate-90 scale-0" : "rotate-0 scale-100")} size={18} />
                        <Moon className={cn("absolute inset-0 transition-all", resolvedTheme === 'dark' ? "rotate-0 scale-100" : "-rotate-90 scale-0")} size={18} />
                    </div>
                    {isOpen && <span className="text-xs font-semibold ml-1">{resolvedTheme === 'dark' ? 'Mode Clair' : 'Mode Sombre'}</span>}
                </button>
            )}

            <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-3 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-all"
            >
                <LogOut size={18} />
                {isOpen && <span className="text-xs font-bold">Déconnexion</span>}
            </button>
            
            <Link href="/profile" onClick={handleLinkClick} className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm",
                !isOpen && "justify-center"
            )}>
                <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 overflow-hidden border border-zinc-200 dark:border-zinc-700">
                    {(session?.user as any)?.image ? (
                      <img src={(session?.user as any).image} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <UserIcon size={16} className="text-zinc-400 dark:text-zinc-500" />
                    )}
                </div>
                {isOpen && (
                    <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">{userName}</p>
                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            <ShieldCheck size={10} className="text-blue-500" />
                            <p className="text-[8px] font-black text-blue-500 uppercase tracking-widest animate-pulse">Admin</p>
                          </div>
                        )}
                    </div>
                )}
            </Link>

            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="hidden lg:flex items-center justify-center w-full py-2 text-zinc-300 hover:text-zinc-600 dark:hover:text-zinc-500 transition-colors"
            >
                {isOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>
        </div>
      </motion.aside>
    </>
  );
}