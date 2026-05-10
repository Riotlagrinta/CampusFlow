"use client";

import React from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Code2, Terminal, Heart, Coffee, MessageCircle, Github, Linkedin, Globe, Cpu, Smartphone, Rocket, Zap } from 'lucide-react';
import { useSound } from '@/hooks/useSound';
import { TiltCard } from '@/components/TiltCard';
import { useRef } from 'react';

const fadeUp = (delay = 0) => ({ initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { delay, type: 'spring' as const, stiffness: 80 } });

const SKILLS = [
  { icon: Globe, title: 'Web & Cloud', desc: "Création d'applications web modernes, rapides et évolutives.", color: 'blue' },
  { icon: Cpu, title: 'IA & Data', desc: "Intégration d'intelligence artificielle pour automatiser les tâches.", color: 'purple' },
  { icon: Smartphone, title: 'Mobile', desc: "Développement d'expériences mobiles fluides et intuitives.", color: 'orange' },
];

const COLOR_CLASSES: Record<string, string> = {
  blue: 'bg-blue-500/10 text-blue-600',
  purple: 'bg-purple-500/10 text-purple-600',
  orange: 'bg-orange-500/10 text-orange-600',
};

export default function AboutPage() {
  const { play } = useSound();
  const heroRef = useRef(null);
  const { scrollY } = useScroll();
  const parallaxY = useTransform(scrollY, [0, 300], [0, -40]);

  const handleContact = () => {
    play('xp');
    window.open("https://wa.me/22871796050", "_blank");
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#050505] pt-20 pb-20 px-4 text-zinc-900 dark:text-white overflow-x-hidden">
      <div className="max-w-4xl mx-auto space-y-20">

        {/* Ambient blobs */}
        <motion.div className="fixed top-10 right-10 w-96 h-96 bg-blue-500/5 rounded-full blur-[150px] -z-10 pointer-events-none"
          animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 8, repeat: Infinity }} />
        <motion.div className="fixed bottom-10 left-10 w-80 h-80 bg-purple-500/5 rounded-full blur-[120px] -z-10 pointer-events-none"
          animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 10, repeat: Infinity, delay: 2 }} />

        {/* Hero */}
        <motion.div style={{ y: parallaxY }} ref={heroRef} className="flex flex-col md:flex-row items-center gap-10 text-center md:text-left">
          <motion.div initial={{ opacity: 0, scale: 0.5, rotate: -10 }} animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 120, damping: 15 }}
            className="relative flex-shrink-0"
          >
            <motion.div
              whileHover={{ scale: 1.05, rotate: 3 }}
              className="w-40 h-40 md:w-56 md:h-56 bg-gradient-to-br from-blue-600 to-purple-600 rounded-[3rem] shadow-2xl flex items-center justify-center text-white overflow-hidden border-4 border-white dark:border-zinc-800 text-7xl font-black"
            >
              K
            </motion.div>
            <motion.div
              animate={{ y: [0, -8, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -bottom-4 -right-4 bg-emerald-500 text-white p-3 rounded-2xl shadow-xl"
            >
              <Code2 size={24} />
            </motion.div>
          </motion.div>

          <div className="space-y-4 flex-1">
            <motion.div {...fadeUp(0.1)} className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-500/10 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-[0.2em]">
              <Terminal size={12} /> Développeur Full-Stack
            </motion.div>
            <motion.h1 {...fadeUp(0.15)} className="text-4xl md:text-6xl font-black tracking-tighter">
              Salut, je suis <span className="text-blue-600">KARABOKA Kelvyn</span>.
            </motion.h1>
            <motion.p {...fadeUp(0.2)} className="text-zinc-500 dark:text-zinc-400 text-lg font-medium leading-relaxed">
              Passionné par la technologie et l&apos;éducation, j&apos;ai conçu <b>DEFITECH Student Hub</b> pour faciliter votre réussite académique grâce à l&apos;IA.
            </motion.p>
          </div>
        </motion.div>

        {/* Skills Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SKILLS.map((skill, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.12, type: 'spring', stiffness: 80 }}>
              <TiltCard className="p-8 bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-100 dark:border-zinc-800 shadow-sm space-y-4 cursor-default h-full">
                <motion.div whileHover={{ rotate: 15, scale: 1.1 }}
                  className={`w-12 h-12 ${COLOR_CLASSES[skill.color]} rounded-2xl flex items-center justify-center`}>
                  <skill.icon size={24} />
                </motion.div>
                <h3 className="font-bold text-xl">{skill.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed font-medium">{skill.desc}</p>
              </TiltCard>
            </motion.div>
          ))}
        </div>

        {/* Commitment Section */}
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="bg-zinc-900 text-white p-10 md:p-16 rounded-[3rem] relative overflow-hidden shadow-2xl"
        >
          <motion.div className="absolute top-0 right-0 p-10 opacity-10"
            animate={{ rotate: [12, 20, 12], scale: [1, 1.05, 1] }} transition={{ duration: 6, repeat: Infinity }}
          >
            <Rocket size={200} />
          </motion.div>
          <motion.div className="absolute top-0 left-0 w-96 h-96 bg-blue-600/10 blur-[100px] pointer-events-none"
            animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 8, repeat: Infinity }} />

          <div className="relative z-10 space-y-6 max-w-2xl">
            <motion.h2 initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} className="text-3xl md:text-4xl font-black tracking-tight">
              Besoin d&apos;aide pour vos projets ?
            </motion.h2>
            <motion.p initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="text-zinc-400 text-lg leading-relaxed">
              Que vous soyez bloqué sur un bug, que vous ayez besoin d&apos;un conseil en architecture ou que vous vouliez lancer votre propre application,{' '}
              <b>je suis là pour vous accompagner</b>.
            </motion.p>
            <div className="flex flex-wrap gap-4 pt-4">
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                onClick={() => window.location.href = '/subscribe'}
                className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 shadow-xl shadow-blue-500/20"
              >
                <Zap size={18} fill="currentColor" /> S&apos;abonner (Premium)
              </motion.button>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                onClick={handleContact}
                className="px-8 py-4 bg-white text-zinc-900 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 border border-zinc-200"
              >
                <MessageCircle size={18} /> Support WhatsApp
              </motion.button>
              <div className="flex items-center gap-4 px-4">
                <motion.button whileHover={{ scale: 1.2 }} className="text-zinc-400 hover:text-white transition-colors"><Github size={24} /></motion.button>
                <motion.button whileHover={{ scale: 1.2 }} className="text-zinc-400 hover:text-white transition-colors"><Linkedin size={24} /></motion.button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} className="text-center space-y-4 py-10">
          <div className="flex items-center justify-center gap-2 text-zinc-400 font-bold uppercase text-[10px] tracking-[0.3em]">
            Fait avec{' '}
            <motion.span animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
              <Heart size={12} className="text-red-500 fill-red-500" />
            </motion.span>{' '}
            et beaucoup de <Coffee size={12} /> au Togo.
          </div>
        </motion.div>

      </div>
    </div>
  );
}
