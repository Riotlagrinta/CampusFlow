# CampusHub TG (ex-DefiTech Student Hub)

> **Plateforme SaaS B2B2C Multi-Universités & Portail Scolaire FinTech au Togo.**  
> *Connecter les universités, rassurer les parents, propulser les étudiants.*  
> **Équipe de développement :** NEXUS CAMPUS (Projet Académique 2026-2027)

---

## 📄 Charte d'Équipe & Cadrage Officiel (Annexe A)

Le document officiel de cadrage académique, comprenant la charte d'équipe signée, la répartition détaillée des responsabilités et les justifications technologiques pour l'enseignant, est disponible en PDF :
👉 **[Télécharger la Charte d'Équipe (PDF)](./Charte_Equipe_CampusHub_TG.pdf)**

---

## 👥 Équipe & Attribution des Rôles (Team NEXUS CAMPUS)

| Membre | Rôle Attribué | Responsabilités Clés | Compétences & Technologies |
| :--- | :--- | :--- | :--- |
| **KARABOKA Kelvyn** | Chef de Projet & Lead FinTech | Architecture globale, sécurisation des flux de paiement (GeniusPay, T-Money/Flooz), coordination d'équipe et relation institutionnelle. | Next.js, TypeScript, Architecture BDD, DevOps, APIs FinTech. |
| **Camarade 1** | Lead Développeur Frontend & UI/UX | Conception des interfaces Web Mobile-First, vitrine des universités togolaises, portail parent pour la consultation des emplois du temps. | React, Next.js App Router, Tailwind CSS, Ergonomie UI/UX. |
| **Camarade 2** | Lead Développeur Backend & BDD | Modélisation multi-tenant PostgreSQL, sécurisation des API, génération certifiée des reçus de scolarité PDF et intégrité ACID. | PostgreSQL, Prisma ORM, Node.js, Cryptographie, Tests d'API. |
| **Camarade 3** | Lead Développeur Mobile & IA | Application mobile Expo (React Native), notifications push temps réel et intégration du Tuteur d'Intelligence Artificielle. | React Native, Expo, Groq LLM SDK, State Management. |

---

## 🎯 Vision & Spécification du Sujet

**CampusHub** transforme la gestion et la vie universitaire au Togo à travers une plateforme tout-en-un connectant 3 acteurs clés :

1. **Les Universités & Grandes Écoles (B2B SaaS) :**
   - Chaque établissement dispose de son propre mini-site vitrine et portail de gestion intégré (filières, accréditations, plannings, informations officielles).
   - Modèle d'abonnement basé sur l'effectif étudiant.
   - Dématérialisation complète de l'encaissement des frais de scolarité.

2. **Les Parents d'Élèves (B2C FinTech) :**
   - Consultation directe des emplois du temps et de l'assiduité de leurs enfants.
   - **Paiement en ligne sécurisé des tranches de scolarité** par **Mobile Money (T-Money, Moov Flooz)** ou Carte Bancaire.
   - Reçu officiel certifié instantané au format PDF muni d'un **QR Code de vérification infalsifiable**.

3. **Les Étudiants (B2C EdTech Freemium) :**
   - Compte gratuit rattaché à leur université pour accéder aux cours, emplois du temps et forums de filière.
   - Options payantes d'accélération académique : **Tuteur IA 24/7 (Groq Llama 3.3)**, annales corrigées et simulateur d'examens.

---

## ⚙️ Choix Technologiques & Justifications Académiques

Le choix de la stack technologique a été rigoureusement motivé selon trois critères imposés : **les compétences de l'équipe**, **la documentation disponible** et **l'adaptation au sujet**.

### 1. Langage : TypeScript (Full-Stack)
- **Compétences de l'équipe :** Pratique solide de JavaScript et TypeScript dans le cursus et sur des projets antérieurs.
- **Documentation disponible :** Écosystème universellement documenté (Handbook officiel, typages `@types/*` éprouvés).
- **Adaptation au sujet :** Le typage statique strict élimine les erreurs d'exécution critiques lors des calculs financiers (frais de scolarité, commissions) et garantit le partage fluide des interfaces de données entre le web, l'API et le mobile.

### 2. Framework Web & API : Next.js 15/16 (React 19, App Router)
- **Compétences de l'équipe :** Maîtrise des composants React et du routing moderne.
- **Documentation disponible :** Référence mondiale en matière de frameworks web, documentation Vercel exhaustive avec support communautaire massif.
- **Adaptation au sujet :** Architecture hybride idéale :
  - **Rendu côté serveur (SSR) :** Indispensable pour le référencement naturel (SEO) des vitrines d'universités auprès des futurs bacheliers.
  - **Server Actions & API Routes :** Permettent de manipuler les paiements et sessions côté serveur en toute sécurité sans exposer les clés d'API.

### 3. Base de Données & ORM : PostgreSQL (Neon Serverless) + Prisma ORM
- **Compétences de l'équipe :** Formation académique axée sur les bases relationnelles et le langage SQL.
- **Documentation disponible :** PostgreSQL est la base libre la plus documentée au monde ; Prisma offre une documentation interactive et un typage TypeScript automatique.
- **Adaptation au sujet :** 
  - Conformité **ACID absolue** : Requise pour la comptabilité scolaire et la réconciliation des webhooks de paiement Mobile Money.
  - Modélisation relationnelle **Multi-Tenant** : Permet de compartimenter strictement les données de chaque université (`Institution` -> `Faculty/Field` -> `Student` -> `Invoice` -> `Transaction`).

### 4. Moteur d'IA & FinTech
- **Passerelle de Paiement :** GeniusPay API (support natif T-Money Togo et Moov Flooz).
- **Moteur d'IA :** Groq SDK (Llama 3.3 70B & Mixtral) offrant une vitesse d'inférence de 500 tokens/seconde à coût quasi-nul pour le modèle freemium.

---

## 💰 Modèle Économique & Bénéfices Financiers (Projections Lomé / Togo)

CampusHub s'appuie sur un modèle de revenus à triple moteur :

### 1. Abonnements B2B Écoles (MRR Récurrent)
- **Pack Starter (< 300 étudiants) :** 80 000 FCFA / mois (~960 000 FCFA / an).
- **Pack Pro (300 à 1 000 étudiants) :** 200 000 FCFA / mois (~2 400 000 FCFA / an).
- **Pack Enterprise (> 1 000 étudiants) :** 400 000 FCFA / mois (~4 800 000 FCFA / an).
> **Potentiel An 1 (5 écoles partenaires) :** **~14 400 000 FCFA / an**.

### 2. Commissions FinTech sur les Frais de Scolarité
- Frais de service plateforme : **1% à 1,5%** prélevés lors des règlements de scolarité par Mobile Money.
- Simulation pour 1 500 étudiants (panier moyen 500 000 FCFA) :
  $$\text{Volume transigé} = 750\,000\,000\text{ FCFA} \implies \text{Commission (1 \%)} = \mathbf{7\,500\,000\text{ FCFA / an}}.$$

### 3. Micro-Abonnements Étudiants (B2C EdTech)
- Pass Étudiant IA (Tuteur 24/7 + Annales corrigées) : **1 000 FCFA / mois** ou recharges de 500 FCFA.
> **Simulation pour 400 abonnés mensuels :** **~4 800 000 FCFA / an**.

### 4. Sponsoring Rentrée Post-BAC
- Visibilité sponsorisée des universités privées en juillet/septembre : **~2 000 000 FCFA / an**.

👉 **Projection Globale An 1 - 2 :** **~28 700 000 FCFA / an** (marge brute estimée > 80%).

---

## 🗺️ Roadmap & Objectifs

### 📅 Objectifs Court Terme (Mois 1 - 2 : Fondations & Démo Pilote)
- [x] Rdaction de la charte d'équipe (Annexe A) et validation technologique.
- [ ] Initialisation du dépôt multi-tenant avec schéma PostgreSQL.
- [ ] Vitrine publique répertoriant les universités togolaises avec filtres par filière.
- [ ] Page institutionnelle modèle pour l'école pilote (DEFITECH).
- [ ] Passerelle FinTech MVP : Paiement scolarité T-Money/Flooz + Génération de reçu PDF certifié.

### 🚀 Objectifs Moyen Terme (Mois 3 - 6 : Lancement Officiel)
- [ ] Déploiement pilote officiel auprès de la direction et des étudiants de DEFITECH.
- [ ] Tableau de bord comptable de réconciliation pour la caisse de l'école.
- [ ] Assistant Tuteur IA avec quotas et recharge par Mobile Money.
- [ ] Application mobile (Expo) pour notifications push temps réel.

### 🌍 Objectifs Long Terme (Mois 7 - 18 : Expansion Régionale)
- [ ] Onboarding de 10+ universités et instituts supérieurs à Lomé (UAC, ESA, Formatec, etc.).
- [ ] Tableau de bord d'aide à l'orientation pour les autorités académiques.
- [ ] Déploiement dans la sous-région UEMOA (Bénin, Côte d'Ivoire).

---

## 📜 Historique & Sauvegarde
Le code de la première version mono-école (DefiTech) est archivé sur la branche :  
`archive-v1-defitech` *(accessible via GitHub)*.  
Voir [`V1_LEGACY_KNOWLEDGE.md`](./V1_LEGACY_KNOWLEDGE.md) pour les algorithmes et spécifications antérieures.
