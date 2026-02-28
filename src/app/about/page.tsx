"use client";

import React from 'react';
import { motion } from 'framer-motion';
import {
  Code2,
  Terminal,
  Heart,
  Coffee,
  MessageCircle,
  Github,
  Linkedin,
  Globe,
  Cpu,
  Smartphone,
  Rocket,
  Zap
} from 'lucide-react';
import { useSound } from '@/hooks/useSound';

export default function AboutPage() {
  const { play } = useSound();

  const handleContact = () => {
    play('xp');
    window.open("https://wa.me/22871796050", "_blank");
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#050505] pt-20 pb-20 px-4 text-zinc-900 dark:text-white">
      <div className="max-w-4xl mx-auto space-y-20">

        {/* Hero Section */}
        <div className="flex flex-col md:flex-row items-center gap-10 text-center md:text-left">
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
            className="relative"
          >
            <div className="w-40 h-40 md:w-56 md:h-56 bg-gradient-to-br from-blue-600 to-purple-600 rounded-[3rem] shadow-2xl flex items-center justify-center text-white overflow-hidden border-4 border-white dark:border-zinc-800 text-7xl font-black">
              K
            </div>
            <div className="absolute -bottom-4 -right-4 bg-emerald-500 text-white p-3 rounded-2xl shadow-xl animate-bounce">
              <Code2 size={24} />
            </div>
          </motion.div>

          <div className="space-y-4 flex-1">
            <motion.div
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-500/10 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-[0.2em]"
            >
              <Terminal size={12} /> Développeur Full-Stack
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="text-4xl md:text-6xl font-black tracking-tighter"
            >
              Salut, je suis <span className="text-blue-600">KARABOKA Kelvyn</span>.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="text-zinc-500 dark:text-zinc-400 text-lg font-medium leading-relaxed"
            >
              Passionné par la technologie et l'éducation, j'ai conçu <b>DEFITECH Student Hub</b> pour faciliter votre réussite académique grâce à l'IA.
            </motion.p>
          </div>
        </div>

        {/* What I Do Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div
            whileHover={{ y: -5 }}
            className="p-8 bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800 shadow-sm space-y-4"
          >
            <div className="w-12 h-12 bg-blue-500/10 text-blue-600 rounded-2xl flex items-center justify-center"><Globe size={24} /></div>
            <h3 className="font-bold text-xl">Web & Cloud</h3>
            <p className="text-sm text-zinc-500 leading-relaxed font-medium">Création d'applications web modernes, rapides et évolutives.</p>
          </motion.div>

          <motion.div
            whileHover={{ y: -5 }}
            className="p-8 bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800 shadow-sm space-y-4"
          >
            <div className="w-12 h-12 bg-purple-500/10 text-purple-600 rounded-2xl flex items-center justify-center"><Cpu size={24} /></div>
            <h3 className="font-bold text-xl">IA & Data</h3>
            <p className="text-sm text-zinc-500 leading-relaxed font-medium">Intégration d'intelligence artificielle pour automatiser les tâches.</p>
          </motion.div>

          <motion.div
            whileHover={{ y: -5 }}
            className="p-8 bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800 shadow-sm space-y-4"
          >
            <div className="w-12 h-12 bg-orange-500/10 text-orange-600 rounded-2xl flex items-center justify-center"><Smartphone size={24} /></div>
            <h3 className="font-bold text-xl">Mobile</h3>
            <p className="text-sm text-zinc-500 leading-relaxed font-medium">Développement d'expériences mobiles fluides et intuitives.</p>
          </motion.div>
        </div>

        {/* Commitment Section */}
        <div className="bg-zinc-900 text-white p-10 md:p-16 rounded-[3rem] relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 p-10 opacity-10 rotate-12">
            <Rocket size={200} />
          </div>

          <div className="relative z-10 space-y-6 max-w-2xl">
            <h2 className="text-3xl md:text-4xl font-black tracking-tight">Besoin d'aide pour vos projets ?</h2>
            <p className="text-zinc-400 text-lg leading-relaxed">
              Que vous soyez bloqué sur un bug, que vous ayez besoin d'un conseil en architecture ou que vous vouliez lancer votre propre application, <b>je suis là pour vous accompagner</b>.
              En tant qu'étudiant de DEFITECH, vous bénéficiez d'un soutien prioritaire.
            </p>
            <div className="flex flex-wrap gap-4 pt-4">
              <button
                onClick={() => window.location.href = '/subscribe'}
                className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 hover:scale-105 transition-all shadow-xl shadow-blue-500/20"
              >
                <Zap size={18} fill="currentColor" /> S&apos;abonner (Premium)
              </button>
              <button
                onClick={handleContact}
                className="px-8 py-4 bg-white text-zinc-900 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 hover:scale-105 transition-all border border-zinc-200"
              >
                <MessageCircle size={18} /> Support WhatsApp
              </button>
              <div className="flex items-center gap-4 px-4">
                <button className="text-zinc-400 hover:text-white transition-colors"><Github size={24} /></button>
                <button className="text-zinc-400 hover:text-white transition-colors"><Linkedin size={24} /></button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center space-y-4 py-10">
          <div className="flex items-center justify-center gap-2 text-zinc-400 font-bold uppercase text-[10px] tracking-[0.3em]">
            Fait avec <Heart size={12} className="text-red-500 fill-red-500" /> et beaucoup de <Coffee size={12} /> au Togo.
          </div>
        </div>

      </div>
    </div>
  );
}