# CampusHub TG (ex-DefiTech Student Hub)

> **Plateforme SaaS B2B2C Multi-Universités & Portail Scolaire FinTech au Togo.**  
> *Connecter les universités, rassurer les parents, propulser les étudiants.*  
> **Équipe de développement :** NEXUS CAMPUS (Projet Académique 2026-2027 — DEFITECH Lomé)

---

## 📄 Dossier Officiel Master (PDF à Télécharger)

Le document officiel complet, comprenant la **Charte d'Équipe (Annexe A)**, la **Justification approfondie de la Stack Technologique** et le **Cahier des Charges Fonctionnel & Technique**, est directement disponible :  
👉 **[Télécharger le Dossier de Cadrage, Charte & Cahier des Charges (PDF)](./Dossier_Cadrage_Charte_Cahier_des_Charges_CampusHub.pdf)**

---

## 👥 Équipe & Attribution des Rôles (Team NEXUS CAMPUS)

| Membre | Rôle Attribué | Missions & Responsabilités Clés | Compétences & Technologies |
| :--- | :--- | :--- | :--- |
| **KARABOKA Kelvyn** | Chef de Projet & Lead Architecte FinTech | Supervision générale, architecture logicielle, sécurisation des encaissements Mobile Money (GeniusPay T-Money/Flooz), coordination d'équipe et relation institutionnelle. | Next.js, TypeScript, PostgreSQL, Intégration Paiement, DevOps. |
| **Camarade 1** | Lead Développeur Frontend & UI/UX | Conception des interfaces Web (Mobile-First), vitrines publiques des universités togolaises, portail parent de consultation des emplois du temps et ergonomie globale. | React, Next.js App Router, Tailwind CSS, Responsive Design, Accessibilité. |
| **Camarade 2** | Lead Développeur Backend & BDD | Modélisation multi-tenant PostgreSQL, sécurisation des API REST, génération certifiée des reçus de scolarité PDF avec QR Code et intégrité transactionnelle ACID. | PostgreSQL, Prisma ORM, Node.js, Cryptographie, Tests d'API. |
| **Camarade 3** | Lead Développeur Mobile & IA | Application mobile Expo (React Native), notifications push temps réel et intégration du module Tuteur d'Intelligence Artificielle. | React Native, Expo Router, Groq LLM API, State Management. |

---

## ⚙️ Choix Technologiques & Justifications Méthodologiques

Chaque technologie a été choisie et validée selon les trois critères académiques obligatoires :

### 1. Langage de Programmation : TypeScript (Full-Stack)
- **Compétences de l'équipe :** Pratique solide acquise en cours et sur des projets antérieurs.
- **Documentation disponible :** Standard absolu de l'industrie (Handbook officiel Microsoft, typages universels `@types/*` sur NPM).
- **Adaptation au sujet :** Le typage statique strict élimine dès la compilation les erreurs critiques sur la manipulation des montants financiers (centimes, devises XOF, statuts stricts de paiement `PENDING | COMPLETED | FAILED`). Il permet en outre de partager directement les interfaces de données (modèles de scolarité, plannings) entre le Web, le Backend et le Mobile sans duplication.

### 2. Framework Web & API : Next.js 15/16 (React 19 & App Router)
- **Compétences de l'équipe :** Maîtrise des concepts React (Composants, Hooks, Context, Server vs Client Components).
- **Documentation disponible :** Documentation officielle Vercel d'une clarté exemplaire, supportée par un écosystème mondial massif.
- **Adaptation au sujet :** Double atout majeur :
  - **Rendu Côté Serveur (SSR / SSG) :** Capital pour le référencement naturel (SEO) des vitrines d'universités sur Google auprès des futurs bacheliers togolais.
  - **Server Actions & API Routes sécurisées :** Permettent d'exécuter les webhooks de paiement Mobile Money et les opérations comptables sensibles côté serveur, garantissant qu'aucune clé secrète ne fuite côté navigateur.

### 3. Base de Données & ORM : PostgreSQL (Neon Serverless) & Prisma ORM
- **Compétences de l'équipe :** Formation approfondie sur le modèle relationnel, l'algèbre relationnelle et les requêtes SQL (jointures, index, transactions).
- **Documentation disponible :** PostgreSQL est la base relationnelle open-source la plus documentée et éprouvée depuis 30 ans. Prisma fournit un client TypeScript auto-généré et des migrations de schéma automatisées.
- **Adaptation au sujet :**
  - **Conformité ACID stricte :** Obligatoire pour une plateforme manipulant des frais de scolarité (Atomicité, Cohérence, Isolation, Durabilité). Un paiement Mobile Money ne peut être validé sans mise à jour immédiate et infaillible du solde étudiant.
  - **Isolation Multi-Tenant :** Modélisation relationnelle avec clé étrangère `institutionId` et indexation composée, garantissant l'étanchéité absolue des données entre universités concurrentes.

### 4. Briques Spécialisées : Mobile, FinTech & Intelligence Artificielle
- **Mobile :** **React Native / Expo** — Déploiement cross-platform rapide sur Android (qui représente plus de 90% du parc mobile au Togo) avec notifications push gratuites.
- **Passerelle FinTech :** **GeniusPay API** — Support natif des portefeuilles locaux togolais (T-Money Togo Telecom et Moov Money Flooz) avec vérification cryptographique des signatures de callbacks.
- **Moteur d'IA :** **Groq SDK (Llama 3.3 70B & Mixtral)** — Vitesse d'inférence exceptionnelle (500 tokens/s) sans latence, avec un coût infime permettant d'offrir le tuteur de révision en modèle freemium.

---

## 📋 Cahier des Charges Fonctionnel & Technique

### 1. Identification des Utilisateurs & Cartographie des Besoins (Personas)

1. **Directions d'Universités & Comptabilité (B2B) :**
   - *Besoins :* Mini-site vitrine officiel personnalisable, tableau de bord d'encaissement en direct, publication en un clic des emplois du temps officiels, export comptable et réduction drastique des impayés.
2. **Parents d'Élèves (B2C FinTech) :**
   - *Besoins :* Consultation des emplois du temps sans mot de passe complexe, règlement en ligne instantané des tranches de scolarité par Mobile Money (T-Money, Flooz), obtention immédiate d'un reçu officiel certifié par QR Code.
3. **Étudiants (B2C EdTech) :**
   - *Besoins :* Compte gratuit rattaché à leur filière (GL, Réseaux, etc.), consultation temps réel des plannings et cours, et accès à un Tuteur IA 24/7 pour réviser et simuler des quiz.
4. **Super-Administrateurs CampusHub :**
   - *Besoins :* Validation et onboarding des nouveaux campus, suivi des commissions financières et monitoring de l'infrastructure multi-tenant.

---

### 2. Périmètre du Projet (In-Scope vs Out-of-Scope)

| Périmètre Inclus (MVP V1) | Périmètre Exclu / Reporté (V2+) |
| :--- | :--- |
| **Multi-Tenancy :** Isolation stricte des données pour 3 écoles pilotes. | Gestion complète des notes et bulletins semestriels officiels (V2). |
| **Annuaire Public :** Moteur de recherche des universités togolaises par filière. | Émargement biométrique des professeurs en salle de classe. |
| **Mini-Site Institutionnel :** Vitrine de l'école pilote (DEFITECH). | Paiement par virement bancaire SWIFT international (hors UEMOA). |
| **Emplois du Temps :** Consultation dynamique par filière et semestre. | Réseau social interne complexe avec messagerie chiffrée. |
| **Passerelle FinTech :** Paiement scolarité T-Money & Flooz (GeniusPay). | Bourse de stages et recrutement d'entreprises partenaires. |
| **Reçu Certifié :** Quittance numérique PDF avec QR Code infalsifiable. | Déploiement hors du Togo (Bénin, Côte d'Ivoire en V3). |
| **Espace Étudiant & IA :** Hub de cours + Tuteur IA Llama 3.3 freemium. | |

---

### 3. Matrice MoSCoW des Fonctionnalités

- **MUST HAVE (P0 - Vital pour le MVP) :**
  - Formulaire de paiement de scolarité en ligne par T-Money et Flooz avec mise à jour immédiate des soldes.
  - Émission instantanée d'un reçu de paiement officiel en PDF muni d'un QR code de vérification publique.
  - Isolation logique et sécurisée des données par établissement (`institutionId`).
  - Consultation réactive des emplois du temps par filière et semestre pour parents et étudiants.
- **SHOULD HAVE (P1 - Important) :**
  - Vitrines institutionnelles personnalisées pour chaque université partenaire.
  - Assistant Tuteur IA (Groq Llama 3.3) pour l'aide aux révisions (quota gratuit quotidien de 10 requêtes).
  - Tableau de bord de réconciliation pour les comptables d'universités avec export Excel.
- **COULD HAVE (P2 - Souhaitable) :**
  - Notifications push mobiles et alertes WhatsApp en cas de changement d'horaire ou confirmation de paiement.
  - Micro-recharges de jetons IA supplémentaires (500 à 1 000 FCFA par Mobile Money).
- **WON'T HAVE (P3 - Reporté V2) :**
  - Gestion des relevés de notes d'examens et délibérations semestrielles.

---

### 4. Contraintes du Système

1. **Contraintes Techniques & Réseau :** Conception *Mobile-First*, pages légères (< 1.5 Mo) et transactions ultra-rapides (< 800 ms) adaptées à la couverture 3G/4G au Togo.
2. **Contraintes Réglementaires & Sécurité Financière :** Traçabilité intégrale des fonds, réconciliation par `reference_id` unique, base de données transactionnelle inaltérable et respect des normes locales.
3. **Contraintes Temporelles & Académiques :** Cycle de développement du MVP fixé à 8 semaines pour validation par le jury académique et déploiement pilote à DEFITECH.

---

## 💰 Modèle Économique & Bénéfices Financiers (Projections Lomé / Togo)

- **Abonnements B2B Universités :** De 80 000 FCFA/mois (petits instituts) à 400 000 FCFA/mois (grands campus). Estimation An 1 (5 écoles) : **~14 400 000 FCFA / an**.
- **Commissions FinTech Scolarité :** 1% à 1,5% de commission de service sur les paiements Mobile Money. Pour 1 500 étudiants (panier moyen 500 000 FCFA) : **~7 500 000 FCFA / an**.
- **Micro-Abonnements Étudiants :** Pass Étudiant IA à 1 000 FCFA/mois ou packs de jetons à 500 FCFA : **~4 800 000 FCFA / an**.
- **Sponsoring Rentrée Post-BAC :** Mise en avant sponsorisée des écoles en juillet/septembre : **~2 000 000 FCFA / an**.
👉 **Potentiel Annuel :** **~28 700 000 FCFA / an** avec une marge brute supérieure à 80%.

---

## 📜 Historique & Sauvegarde
Le code de la première version mono-école (DefiTech) est archivé en sécurité sur la branche :  
`archive-v1-defitech` *(accessible via GitHub)*.  
Consulter [`V1_LEGACY_KNOWLEDGE.md`](./V1_LEGACY_KNOWLEDGE.md) pour retrouver tous les algorithmes validés.
