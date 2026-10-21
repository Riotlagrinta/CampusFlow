# DefiTech Student Hub - V1 Legacy Knowledge Base

> **Date d'archivage :** Octobre 2026  
> **Branche Git de sauvegarde complète du code :** `archive-v1-defitech`  
> **Auteurs :** KARABOKA Kelvyn & l'équipe

Ce document consigne l'ensemble des acquis techniques, des patterns d'architecture, des intégrations API et de la logique métier développés dans la V1. Il sert de mémoire technique pour la reconstruction de la plateforme V2 (Hub Multi-Écoles & Multi-Tenants).

---

## 1. Synthèse des Acquis Techniques & Algorithmes

### A. Intégration Paiement Mobile Money Togo (Genius Pay)
- **Fournisseur utilisé :** Genius Pay (avec support T-Money et Moov Flooz).
- **Format des numéros Togo :** Validation stricte par Regex `^(\+228|228)?(9[0-3|6-9]|7[0-1|9])\d{6}$`.
- **Mécanisme de Webhook / Callback Sécurisé :**
  - Vérification de la signature HMAC transmise par Genius Pay pour éviter toute tentative d'injection.
  - **Idempotence des transactions (`src/lib/fulfillment.ts`) :** Traitement atomique de chaque transaction via un `reference_id` unique stocké en BDD pour éviter qu'un callback reçu deux fois ne crédite deux fois un utilisateur.
  - **Circuit de secours (Manuel) :** Workflow de validation manuelle par un administrateur après envoi de capture d'écran / référence T-Money ou Flooz.

### B. Moteur d'IA (Groq avec Rotation de Modèles & Quotas)
- **Infrastructure :** `groq-sdk` avec rotation automatique en cascade. Si un modèle atteint son rate-limit (TPM/RPM) ou est déprécié par Groq, le système bascule dynamiquement sur le modèle suivant (ex: `llama-3.3-70b-versatile`, `mixtral-8x7b-32768`, `llama-3.1-8b-instant`).
- **Déduction atomique des quotas (`src/lib/quota.ts`) :**
  - Quota quotidien gratuit (10 requêtes / jour) avec remise à zéro à minuit.
  - Déduction en transaction BDD *avant* l'appel à l'API LLM pour empêcher les attaques par concurrence (race conditions).
  - Gestion de jetons bonus (`aiBonusRequests`) achetés par pack ou gagnés par visionnage publicitaire.
- **Tavily Search Cache :** Mise en cache PostgreSQL des requêtes web (`SearchCache`) pour économiser les appels d'API externes.

### C. Authentification & Sécurité Hybride
- **Web :** NextAuth v5 (Auth.js) avec cookies HTTP-Only chiffrés.
- **Mobile (Expo) :** API tokens signés en JWT HS256 (`jose`) avec transmission dans le header `Authorization: Bearer <token>`.
- **2FA TOTP Obligatoire pour Administrateurs :** Chiffrement AES-256 de la clé secrète TOTP en base (`MFA_ENCRYPTION_KEY`).
- **Protection Anti-Bot :** Cloudflare Turnstile sur l'inscription et la réinitialisation de mot de passe.
- **Rate Limiting :** Persistance des tentatives de connexion pour bloquer le bruteforce.

### D. Modélisation Académique (Schéma Prisma Relational)
- Organisation hiérarchique :
  `Institution / École` *(V2)* -> `Field (Filière)` -> `Level (Niveau L1-L3)` -> `Subject (Matière)` -> `Semester`.
- Isolation stricte des contenus : Les devoirs, emplois du temps, forums et documents partagés sont filtrés par filière et niveau.

---

## 2. Dépendances & Outils Validés
- **Base de données :** PostgreSQL (hébergé sur Neon Serverless).
- **ORM :** Prisma 6 (ou Drizzle pour la V2).
- **Stockage Objets :** Vercel Blob (pour les PDF de cours et avatars étudiants).
- **Emails Transactionnels :** Nodemailer / Gmail SMTP (codes OTP de validation de compte).
- **Mobile :** Expo Router v3/v4 avec support Android & iOS.

---

## 3. Retours d'Expérience & Pièges Évités
1. **Ne jamais faire de `prisma db push` en production :** Toujours créer des migrations SQL versionnées pour préserver les données des étudiants et écoles.
2. **Ne pas mélanger les rôles côté client :** La validation des privilèges (`SUPER_ADMIN`, `SCHOOL_ADMIN`, `PARENT`, `STUDENT`) doit impérativement se faire côté serveur à chaque route d'API.
3. **Séparation nette Web / API :** Dans la V1, le mélange des pages et des API dans le même répertoire `src/app` compliquait la maintenance à plusieurs. La V2 devra adopter un découpage plus modulaire.
