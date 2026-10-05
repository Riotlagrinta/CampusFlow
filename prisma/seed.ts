/**
 * Données de démonstration pour un environnement de DÉVELOPPEMENT (`npm run db:seed`).
 *
 * - Refusé si NODE_ENV ou VERCEL_ENV vaut "production".
 * - Aucun mot de passe ni adresse réelle dans le code : les comptes de démo sont créés
 *   uniquement si SEED_*_EMAIL et SEED_*_PASSWORD (12 caractères minimum) sont définis ;
 *   les mots de passe sont hachés en bcrypt (coût 12), comme à l'inscription.
 * - Idempotent : un compte ou un quiz existant n'est jamais modifié.
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { describeDatabaseTarget, isProductionEnvironment } from '../scripts/lib/safety';

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 12;

const prisma = new PrismaClient();

type DemoAccount = {
  label: string;
  emailVar: string;
  passwordVar: string;
  data: {
    firstName: string;
    lastName: string;
    role: 'STUDENT' | 'ADMIN';
    xp: number;
    level: number;
    streak: number;
  };
};

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    label: 'étudiant de démo',
    emailVar: 'SEED_STUDENT_EMAIL',
    passwordVar: 'SEED_STUDENT_PASSWORD',
    data: { firstName: 'Étudiant', lastName: 'Demo', role: 'STUDENT', xp: 2450, level: 12, streak: 7 },
  },
  {
    label: 'administrateur de démo',
    emailVar: 'SEED_ADMIN_EMAIL',
    passwordVar: 'SEED_ADMIN_PASSWORD',
    data: { firstName: 'Admin', lastName: 'DefiTech', role: 'ADMIN', xp: 5000, level: 25, streak: 30 },
  },
];

async function seedDemoAccount(account: DemoAccount) {
  const email = process.env[account.emailVar]?.trim().toLowerCase();
  const password = process.env[account.passwordVar];

  if (!email || !password) {
    console.log(`Compte ${account.label} ignoré : ${account.emailVar} / ${account.passwordVar} non définis.`);
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Compte ${account.label} ignoré : ${account.passwordVar} doit faire ${MIN_PASSWORD_LENGTH} caractères minimum.`);
    return;
  }

  await prisma.user.upsert({
    where: { email },
    update: {}, // jamais de modification d'un compte existant (ni mot de passe, ni rôle)
    create: {
      email,
      password: await bcrypt.hash(password, BCRYPT_COST),
      isActive: true,
      ...account.data,
    },
  });
  console.log(`Compte ${account.label} prêt.`);
}

async function main() {
  if (isProductionEnvironment()) {
    console.error('Seed refusé : NODE_ENV/VERCEL_ENV vaut "production". Ce script est réservé au développement.');
    process.exit(1);
  }
  console.log(`Seed de la base : ${describeDatabaseTarget()}`);

  // Badges par défaut
  const badges = [
    {
      slug: 'algo-master',
      name: 'Algorithm Master',
      description: "A résolu 10 problèmes d'algorithmique complexes.",
      icon: 'Code',
      xpCost: 500,
    },
    {
      slug: 'web-architect',
      name: 'Web Architect',
      description: 'A construit une application Full-Stack complète.',
      icon: 'Globe',
      xpCost: 1000,
    },
    {
      slug: 'database-pro',
      name: 'Database Pro',
      description: 'Maîtrise SQL et les modélisations complexes.',
      icon: 'Database',
      xpCost: 750,
    },
    {
      slug: 'first-step',
      name: 'Premiers Pas',
      description: 'A créé son compte et configuré son profil.',
      icon: 'Flag',
      xpCost: 50,
    },
  ];

  for (const badge of badges) {
    await prisma.badge.upsert({
      where: { slug: badge.slug },
      update: {},
      create: badge,
    });
  }

  for (const account of DEMO_ACCOUNTS) {
    await seedDemoAccount(account);
  }
  console.log('Badges initialisés.');

  // --- QUIZ ---
  await prisma.quiz.upsert({
    where: { id: 'quiz-java-1' },
    update: {},
    create: {
      id: 'quiz-java-1',
      title: 'Maîtrise de Java I',
      description: 'Testez vos connaissances sur les bases du langage Java.',
      subjectName: 'JAVA',
      xpReward: 150,
      questions: {
        create: [
          {
            question: "Quelle est la méthode principale de départ d'un programme Java ?",
            options: JSON.stringify(['start()', 'init()', 'main()', 'run()']),
            answer: 2,
          },
          {
            question: 'Java est un langage...',
            options: JSON.stringify(['Compilé', 'Interprété', 'Les deux (Bytecode)', 'Aucun']),
            answer: 2,
          },
        ],
      },
    },
  });

  await prisma.quiz.upsert({
    where: { id: 'quiz-algo-1' },
    update: {},
    create: {
      id: 'quiz-algo-1',
      title: 'Complexité Algorithmique',
      description: 'Comprendre les notations Big O.',
      subjectName: 'ALGO',
      xpReward: 200,
      questions: {
        create: [
          {
            question: "Quelle est la complexité d'une recherche binaire ?",
            options: JSON.stringify(['O(n)', 'O(log n)', 'O(n²)', 'O(1)']),
            answer: 1,
          },
        ],
      },
    },
  });

  console.log('Quiz initialisés.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
