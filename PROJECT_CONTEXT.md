# DefiTech Student Hub - Master Plan

## 🚀 Vision du Projet
Passage d'une plateforme de classe à un **ERP Éducatif Institutionnel** pour l'école **DEFITECH**.

## 🛠️ Règles de Travail (Mémorisées)
1. **Zéro Erreur** : Diagnostic technique et build systématique après chaque modification.
2. **Commandes Non-Interactives** : Priorité aux commandes silencieuses. Prévenir avant toute commande interactive.
3. **Langue** : Toujours répondre en français.

## 📋 Plan de Transformation en cours

### 1. Intelligence Artificielle (Rotation Groq)
- Analyse des modèles disponibles sur Groq.
- Système de rotation automatique : `llama-3.3-70b-versatile` -> `mixtral-8x7b-32768` -> `llama-3.1-8b-instant`.
- Suivi de consommation des tokens dans la Console Admin.

### 2. Architecture Multi-Filières
- Refonte de la DB pour gérer les Filières et Années Académiques.
- Isolation des ressources (Documents, Planning, Forum) par segment.
- Personnalisation visuelle aux couleurs de DEFITECH.

### 3. Monitoring & Notifications
- Système d'alertes par email à l'inscription.
- Analytics Admin avancés (Activité, Succès Quizz).

### 4. Monétisation
- Intégration **T-Money** & **Flooz**.
- Système de **Publicités Récompensées** (Rewarded Ads) pour recharger les crédits IA.

### 5. Optimisation Mobile & UX
- Refonte "Mobile-First" de toutes les pages.
- Adaptation des menus et des tableaux pour les petits écrans.

## ✅ État d'avancement
- [x] Sécurisation Auth.js (Session Serveur)
- [x] Base de données Cloud (PostgreSQL Neon)
- [x] Stockage Cloud (Vercel Blob)
- [x] IA Groq opérationnelle
- [x] Profil enrichi (Bio, Avatar)
- [x] Classement réel opérationnel
- [ ] Refonte Multi-filières (Prochaine étape)