'use client';

import React from 'react';
import {
    LayoutDashboard,
    Calendar,
    BookOpen,
    MessageSquare,
    ShoppingCart
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

const navItems = [
    { icon: LayoutDashboard, label: 'Accueil', href: '/' },
    { icon: Calendar, label: 'Planning', href: '/planning' },
    { icon: BookOpen, label: 'Docs', href: '/resources' },
    { icon: MessageSquare, label: 'Forum', href: '/forum' },
    { icon: ShoppingCart, label: 'Shop', href: '/shop' },
];

export default function BottomNav() {
    const pathname = usePathname();

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-[60] lg:hidden">
            <div className="bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-t border-zinc-200 dark:border-zinc-800 px-6 py-3 pb-8 flex items-center justify-between rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
                {navItems.map((item, index) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link key={index} href={item.href} className="flex flex-col items-center gap-1 group relative">
                            <div className={cn(
                                "p-2 rounded-2xl transition-all duration-300 relative overflow-hidden",
                                isActive
                                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-110"
                                    : "text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100"
                            )}>
                                <item.icon size={22} className={cn("relative z-10", isActive && "animate-pulse")} />
                                {isActive && (
                                    <motion.div
                                        layoutId="activeTab"
                                        className="absolute inset-0 bg-blue-600"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                    />
                                )}
                            </div>
                            <span className={cn(
                                "text-[10px] font-bold tracking-tight transition-all duration-300",
                                isActive
                                    ? "text-blue-600 opacity-100 translate-y-0"
                                    : "text-zinc-400 dark:text-zinc-500 opacity-0 -translate-y-1"
                            )}>
                                {item.label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
