# Projet : DefiTech Student Hub

## Objectif
Créer une plateforme éducative et sociale ("Student Hub") pour la classe de Génie Logiciel de DEFITECH.
Design : Ultra moderne (2026), interactif, fluide.

## Fonctionnalités Clés
1.  **Emploi du temps double :** Académique (officiel) + Personnel (maison).
2.  **Gamification :** Courbe de progression (XP) basée sur l'activité (questions, cours suivis).
3.  **IA Assistant :** Chatbot intégré pour l'aide aux devoirs et la recherche.
4.  **Social :** Possibilité de poser des questions, contacter les profs.
5.  **Admin :** Ajout de cours, quizz interactifs.

## Stack Technique (Validée)
*   **Framework :** Next.js 15 (App Router)
*   **Langage :** TypeScript
*   **Styling :** Tailwind CSS
*   **Animations :** Framer Motion
*   **Icônes :** Lucide React
*   **Base de données (Future) :** SQLite / PostgreSQL

## État d'avancement
- [x] Dossier créé.
- [ ] Initialisation Next.js (À faire dans VS Code).
- [ ] Installation des dépendances design (`framer-motion`, `lucide-react`, etc.).
- [ ] Création de la page d'accueil (Dashboard).

## Commandes pour démarrer (VS Code)
1.  Initialiser le projet :
    `npx create-next-app@latest . --typescript --eslint --tailwind --src-dir --app --import-alias "@/*" --use-npm --yes --force`
2.  Installer les outils de design :
    `npm install framer-motion lucide-react clsx tailwind-merge`
3.  Lancer le serveur :
    `npm run dev`
