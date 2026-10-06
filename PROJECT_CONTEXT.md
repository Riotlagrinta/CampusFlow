# DefiTech Student Hub - Contexte du projet

## Vision du Projet
Passage d'une plateforme de classe à un **ERP Éducatif Institutionnel** pour l'école **DEFITECH**.

## Règles de Travail (Mémorisées)
1. **Zéro Erreur** : Diagnostic technique (`npm run typecheck`, `npm run lint`, `npm test`) et build après chaque modification.
2. **Commandes Non-Interactives** : Priorité aux commandes silencieuses. Prévenir avant toute commande interactive.
3. **Langue** : Toujours répondre en français.
4. **Base de données** : jamais de `prisma db push` sur la production ; les évolutions de schéma passent par des migrations (voir `README.md`). Aucun secret dans le dépôt (`.env.example` ne contient que des placeholders).

## Architecture actuelle (résumé)
- **Web** : Next.js 16 (App Router, build webpack), React 19, Tailwind CSS 4. Pages et API dans `src/app`.
- **Mobile** : application Expo (`mobile/`) qui consomme la même API en Bearer JWT.
- **Base de données** : PostgreSQL sur Neon via Prisma 6 (`prisma/schema.prisma`).
- **Authentification** : NextAuth v5 (cookie de session) pour le web ; JWT HS256 (`jose`, signé avec `AUTH_SECRET`) pour le mobile. `getAuthUser` (`src/lib/session.ts`) relit rôle et état du compte en base.
- **Documentation d'installation, variables, déploiement, sécurité** : `README.md` et `.env.example`.

## Fonctionnalités en place

### Multi-filières (existe)
- Modèles `Field` (filière), `Level` (niveau), `Subject` (matière, par filière, niveau et semestre) ; les utilisateurs sont rattachés à une filière et un niveau (`fieldId`, `academicLevelId`).
- Isolation des ressources, du planning, des devoirs et du forum par filière, niveau et semestre.
- Données de base (filières GL, RI, SR, MI, GE, COM, CG, SD et Licence 1 à 3) : `scripts/setup-defitech-data.ts`. Import en masse de documents : `scripts/bulk-import.ts` (développement).

### Intelligence artificielle (Groq, Tavily)
- **Groq** (`groq-sdk`) avec rotation automatique des modèles, liste par défaut dans `src/lib/ai.ts`, remplaçable par la variable `AI_MODELS` sans modifier le code (un modèle déprécié par Groq se retire ainsi).
- **Tavily** : recherche web de l'assistant (mise en cache en base, table `SearchCache`).
- **Google Drive API** (`GOOGLE_API_KEY`) : lecture de PDF publics pour l'explication et la génération de quiz.
- Chat, flashcards, génération de quiz et explications partagent un **quota quotidien** unique (10 requêtes gratuites par jour), puis consomment des jetons bonus (`aiBonusRequests`). Consommation atomique dans `src/lib/quota.ts`, avant l'appel au modèle.
- Les jetons s'obtiennent par achat ou par pub-récompense (plafonnée par jour et espacée côté serveur ; la preuve de visionnage n'est pas vérifiée : décision propriétaire en attente).

### Paiement et abonnements (Genius Pay)
- Offres définies une seule fois dans `src/lib/packs.ts` (recharges de jetons et abonnements 1, 3, 6 mois), partagée par le serveur et les pages boutique.
- **Genius Pay** : création du paiement (`/api/payment/genius/create`), callback signé (`/api/payment/genius/callback`), crédit idempotent via `src/lib/fulfillment.ts`.
- **Paiement manuel** (T-Money, Flooz) : demande par l'étudiant, validation par un administrateur (`/api/admin/transactions/[id]/approve`).
- L'expiration d'un abonnement est appliquée par `isPremium()` (`src/lib/subscription.ts`) à chaque lecture.

### Stockage (Vercel Blob)
- Ressources et avatars sur **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`) ; upload direct depuis le navigateur pour les gros fichiers.

### Notifications et monitoring
- OTP et alertes par email (Gmail). WhatsApp (UltraMsg) est abandonné pour le moment : son code reste en place et se réactive si `WHATSAPP_INSTANCE_ID` et `WHATSAPP_TOKEN` sont définies ; alertes admin à l'inscription et aux signalements.
- Paiements désactivés (mode freemium) : interrupteur `NEXT_PUBLIC_PAYMENTS_ENABLED`, fermé par défaut.
- Notifications push mobile (Expo). Console admin : utilisateurs, transactions et gestion académique.

### Gamification
- XP, niveaux, séries quotidiennes (`lastStreakAt`), badges, classement.

## État d'avancement
- [x] Sécurisation Auth.js (session serveur), JWT mobile, OTP avec compteur d'essais, rate limit persistant
- [x] Base de données cloud (PostgreSQL Neon)
- [x] Stockage cloud (Vercel Blob)
- [x] IA Groq opérationnelle (rotation, quota atomique)
- [x] Profil enrichi (bio, avatar)
- [x] Classement réel opérationnel
- [x] Refonte multi-filières (filières, niveaux, matières, isolation des contenus)
- [x] Paiement Genius Pay et paiement manuel (idempotent)
- [x] Double authentification TOTP obligatoire des administrateurs (`MFA_ENCRYPTION_KEY`) et CAPTCHA Turnstile sur l'inscription et « mot de passe oublié » (`TURNSTILE_*`) : actifs seulement quand leurs variables sont définies
- [x] Tests unitaires (Vitest), lancés à la main avant chaque push (pas d'intégration continue automatique)
- [ ] Migrations Prisma versionnées dans le dépôt (baseline de la production à faire, voir `README.md`)
- [ ] Content-Security-Policy appliquée (actuellement en Report-Only, `CSP_ENFORCE=true` après validation en navigateur)
- [ ] Contrainte d'unicité sur `Subject` (filière + niveau + nom) : à ajouter après dédoublonnage de la base de production
- [ ] Preuve serveur-à-serveur pour les publicités-récompenses
- [ ] Parité mobile (devoirs, flashcards, support)

## Décisions en attente du propriétaire
- Rotation des clés exposées (Genius Pay, UltraMsg, `AUTH_SECRET`, Groq, Gmail) et saisie dans Vercel.
- Baseline des migrations sur la base de production ; passage du compte `ai-tutor@defitech.tg` de ADMIN à STUDENT.
- Domaine canonique unique (`NEXT_PUBLIC_APP_URL`) ; licence ; politique de comptes de démonstration.
- `public/sw.js` : conserver ou retirer le script publicitaire tiers.
- Retrait de `User.json`, `dev.db`, `prisma/dev.db` et des PDF de `public/uploads/` de l'historique git.
