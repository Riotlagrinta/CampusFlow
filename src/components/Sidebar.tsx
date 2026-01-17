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
  Brain
} from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const navItems = [
  { icon: LayoutDashboard, label: 'Vue d\'ensemble', href: '/' },
  { icon: Calendar, label: 'Planning', href: '/planning' },
  { icon: ShieldCheck, label: 'Profil Académique', href: '/profile' },
  { icon: Brain, label: 'Quizz', href: '/quiz' },
  { icon: MessageSquare, label: 'Forum', href: '/forum' },
  { icon: Bot, label: 'AI Assistant', href: '/ai-assistant' },
  { icon: BookOpen, label: 'Ressources', href: '/resources' },
];

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(true);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [userName, setUserName] = useState('Étudiant GL');
  const [isAdmin, setIsAdmin] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);

    const checkUser = () => {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          if (user) {
            if (user.firstName) {
              const initial = user.lastName ? ` ${user.lastName.charAt(0)}.` : '';
              setUserName(`${user.firstName}${initial}`);
            } else if (user.email) {
              setUserName(user.email.split('@')[0]);
            }
            setIsAdmin(user.role === 'ADMIN');
          }
        } catch (e) {
          console.error("Erreur parsing user storage", e);
        }
      }
    };

    checkUser();

    // Système de Heartbeat pour le statut "En ligne"
    const sendHeartbeat = async () => {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        if (user.email) {
          try {
            await fetch('/api/user/heartbeat', {
              method: 'POST',
              body: JSON.stringify({ email: user.email }),
              headers: { 'Content-Type': 'application/json' }
            });
          } catch (e) { /* silent error */ }
        }
      }
    };

    sendHeartbeat(); // Premier appel immédiat
    const heartbeatInterval = setInterval(sendHeartbeat, 60000); // Toutes les minutes

    // Écouter les changements de localStorage pour mettre à jour en temps réel
    window.addEventListener('storage', checkUser);
    return () => {
      window.removeEventListener('storage', checkUser);
      clearInterval(heartbeatInterval);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    router.push('/login');
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <>
      <button 
        className="fixed top-4 left-4 z-50 p-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-sm lg:hidden"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      <motion.aside
        initial={false}
        animate={{ width: isOpen ? 260 : 72 }}
        className={cn(
          "fixed top-0 left-0 h-screen bg-zinc-50/50 dark:bg-zinc-950/50 border-r border-zinc-200 dark:border-zinc-900 z-40 transition-all flex flex-col",
          !isOpen && "items-center"
        )}
      >
        {/* Logo Section */}
        <div className="h-16 flex items-center px-5 mb-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-900 dark:bg-zinc-50 rounded-lg flex items-center justify-center shrink-0">
               <Command size={18} className="text-white dark:text-zinc-900" />
            </div>
            {isOpen && (
              <span className="font-bold text-sm tracking-tight text-zinc-900 dark:text-zinc-50 uppercase tracking-[0.1em]">Student Hub</span>
            )}
          </Link>
        </div>

        {/* Nav Items */}
        <div className="flex-1 px-3 space-y-1">
          {isOpen && <p className="px-3 mb-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Navigation</p>}
          
          {isAdmin && (
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md mb-4 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-lg",
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
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200",
                  isActive 
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm border border-zinc-200 dark:border-zinc-800" 
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                )}
              >
                <item.icon size={18} className="shrink-0" />
                {isOpen && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 space-y-2">
            {mounted && (
                <button
                    onClick={toggleTheme}
                    className="flex items-center gap-3 w-full px-3 py-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900"
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
                className="flex items-center gap-3 w-full px-3 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-md transition-all"
            >
                <LogOut size={18} />
                {isOpen && <span className="text-xs font-bold">Déconnexion</span>}
            </button>
            
            <Link href="/profile" className={cn(
                "flex items-center gap-3 px-2 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800",
                !isOpen && "justify-center"
            )}>
                <div className="w-6 h-6 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                    <UserIcon size={14} className="text-zinc-500" />
                </div>
                {isOpen && (
                    <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-bold truncate">{userName}</p>
                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            <ShieldCheck size={10} className="text-blue-500" />
                            <p className="text-[8px] font-black text-blue-500 uppercase tracking-widest animate-pulse">Administrateur</p>
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
