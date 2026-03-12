'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Lock, FileText, Scale, Eye, Globe, ArrowLeft, CreditCard } from 'lucide-react';
import Link from 'next/link';

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#050505] pt-24 pb-20 px-4">
      <div className="max-w-4xl mx-auto space-y-12">
        
        {/* Header */}
        <div className="space-y-4">
          <Link href="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-blue-600 transition-colors text-sm font-bold uppercase tracking-widest mb-4">
            <ArrowLeft size={16} /> Retour à l&apos;accueil
          </Link>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-500/20">
              <ShieldCheck size={32} />
            </div>
            <div>
              <h1 className="text-3xl md:text-5xl font-black tracking-tight text-zinc-900 dark:text-white">Mentions Légales</h1>
              <p className="text-zinc-500 font-medium italic">Dernière mise à jour : 8 Mars 2026</p>
            </div>
          </div>
        </div>

        <div className="grid gap-8">
          
          {/* Section 1: Propriété */}
          <motion.section 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-6"
          >
            <div className="flex items-center gap-3 text-blue-600 font-black text-xs uppercase tracking-[0.2em]">
              <Globe size={18} /> Éditeur du service
            </div>
            <div className="space-y-4 text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <p>
                Le service <span className="text-zinc-900 dark:text-white font-bold uppercase">DefiTech Student Hub</span> est édité par l&apos;agence digitale <span className="text-zinc-900 dark:text-white font-bold">Kelvix Digital Solutions</span>.
              </p>
              <div className="grid md:grid-cols-2 gap-6 pt-4">
                <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                  <p className="text-[10px] font-black uppercase text-zinc-400 mb-1">Responsables de publication</p>
                  <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">KARABOKA Kelvyn & DJATOZ Stephane</p>
                </div>
                <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                  <p className="text-[10px] font-black uppercase text-zinc-400 mb-1">Contact Support</p>
                  <p className="text-sm font-bold text-blue-600">support@kelvix.tg</p>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Section 2: Confidentialité */}
          <motion.section 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-6"
          >
            <div className="flex items-center gap-3 text-emerald-600 font-black text-xs uppercase tracking-[0.2em]">
              <Lock size={18} /> Protection des Données
            </div>
            <div className="space-y-4 text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <p>
                Nous accordons une importance capitale à la confidentialité de vos données académiques. Conformément aux législations sur la protection des données :
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li><span className="font-bold text-zinc-900 dark:text-zinc-200">Collecte minimale</span> : Seules les données nécessaires à votre identification et votre parcours scolaire sont enregistrées.</li>
                <li><span className="font-bold text-zinc-900 dark:text-zinc-200">Non-partage</span> : Vos données ne sont jamais vendues ou cédées à des régies publicitaires.</li>
                <li><span className="font-bold text-zinc-900 dark:text-zinc-200">Droit d&apos;accès</span> : Vous pouvez à tout moment demander la modification ou la suppression de vos informations personnelles via le support.</li>
              </ul>
            </div>
          </motion.section>

          {/* Section 3: Propriété Intellectuelle */}
          <motion.section 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-6"
          >
            <div className="flex items-center gap-3 text-amber-600 font-black text-xs uppercase tracking-[0.2em]">
              <Scale size={18} /> Propriété Intellectuelle
            </div>
            <div className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <p>
                L&apos;intégralité du code source, des interfaces graphiques, des logos et des algorithmes d&apos;Intelligence Artificielle présents sur cette plateforme sont la propriété exclusive de <span className="font-bold text-zinc-900 dark:text-white">Kelvix</span>.
              </p>
              <p className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-700 dark:text-amber-400 text-sm font-medium italic">
                &quot;Toute reproduction, totale ou partielle, sans accord écrit préalable est interdite.&quot;
              </p>
            </div>
          </motion.section>

          {/* Section 4: IA & Éthique */}
          <motion.section 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-6"
          >
            <div className="flex items-center gap-3 text-purple-600 font-black text-xs uppercase tracking-[0.2em]">
              <FileText size={18} /> Intelligence Artificielle
            </div>
            <div className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
              <p>
                L&apos;assistant IA est un outil d&apos;accompagnement pédagogique. Kelvix ne peut être tenu responsable des erreurs factuelles produites par les modèles de langage, bien que nous travaillions à maximiser leur précision.
              </p>
            </div>
          </motion.section>

          {/* Section 5: CGV */}
          <motion.section 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="bg-zinc-900 dark:bg-blue-600 p-8 rounded-[2.5rem] text-white shadow-xl space-y-6"
          >
            <div className="flex items-center gap-3 font-black text-xs uppercase tracking-[0.2em]">
              <CreditCard size={18} /> Conditions de Vente (CGV)
            </div>
            <div className="grid md:grid-cols-2 gap-8 text-sm leading-relaxed opacity-90">
              <div className="space-y-4">
                <p><span className="font-bold">Livraison</span> : Le crédit des jetons IA est immédiat après validation du paiement mobile (T-Money/Flooz).</p>
                <p><span className="font-bold">Tarification</span> : Les prix sont nets et exprimés en Francs CFA.</p>
              </div>
              <div className="space-y-4">
                <p><span className="font-bold">Remboursement</span> : En raison de la nature numérique des produits, aucun remboursement n&apos;est possible après livraison des jetons.</p>
                <p><span className="font-bold">Sécurité</span> : Kelvix ne stocke aucune donnée bancaire ou code secret.</p>
              </div>
            </div>
          </motion.section>

        </div>

        {/* Footer legal */}
        <div className="text-center pt-10 border-t border-zinc-200 dark:border-zinc-800">
          <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">© 2026 Kelvix Digital Solutions • Tous droits réservés</p>
        </div>

      </div>
    </div>
  );
}
