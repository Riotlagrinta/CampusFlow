import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Badges par défaut
  const badges = [
    {
      slug: 'algo-master',
      name: 'Algorithm Master',
      description: 'A résolu 10 problèmes d\'algorithmique complexes.',
      icon: 'Code',
      xpCost: 500
    },
    {
      slug: 'web-architect',
      name: 'Web Architect',
      description: 'A construit une application Full-Stack complète.',
      icon: 'Globe',
      xpCost: 1000
    },
    {
      slug: 'database-pro',
      name: 'Database Pro',
      description: 'Maîtrise SQL et les modélisations complexes.',
      icon: 'Database',
      xpCost: 750
    },
    {
      slug: 'first-step',
      name: 'Premiers Pas',
      description: 'A créé son compte et configuré son profil.',
      icon: 'Flag',
      xpCost: 50
    }
  ];

  for (const badge of badges) {
    await prisma.badge.upsert({
      where: { slug: badge.slug },
      update: {},
      create: badge,
    });
  }

  // Initialiser l'utilisateur démo avec le nouveau format de nom
    const user = await prisma.user.upsert({ 
      where: { email: 'etudiant@defitech.tg' },
      update: {
          xp: 2450,
          level: 12,
          streak: 7,
          firstName: 'Étudiant',
          lastName: 'Demo',
          role: 'STUDENT'
      },
      create: {
          email: 'etudiant@defitech.tg',
          firstName: 'Étudiant',
          lastName: 'Demo',
          password: 'hash_placeholder',
          xp: 2450,
          level: 12,
          streak: 7,
          role: 'STUDENT'
      }
    });
  
    const adminUser = await prisma.user.upsert({
      where: { email: 'djkeda82@gmail.com' },
      update: {
          firstName: 'Admin',
          lastName: 'DefiTech',
          role: 'ADMIN'
      },
      create: {
          email: 'djkeda82@gmail.com',
          firstName: 'Admin',
          lastName: 'DefiTech',
          password: 'password', // Mot de passe simple pour l'admin
          xp: 5000,
          level: 25,
          streak: 30,
          role: 'ADMIN'
      }
    });
  console.log('Utilisateur démo et Badges initialisés.');

  // --- QUIZZ ---
  const quizJava = await prisma.quiz.upsert({
    where: { id: 'quiz-java-1' },
    update: {},
    create: {
      id: 'quiz-java-1',
      title: 'Maîtrise de Java I',
      description: 'Testez vos connaissances sur les bases du langage Java.',
      subject: 'JAVA',
      xpReward: 150,
      questions: {
        create: [
          {
            question: 'Quelle est la méthode principale de départ d\'un programme Java ?',
            options: JSON.stringify(['start()', 'init()', 'main()', 'run()']),
            answer: 2
          },
          {
            question: 'Java est un langage...',
            options: JSON.stringify(['Compilé', 'Interprété', 'Les deux (Bytecode)', 'Aucun']),
            answer: 2
          }
        ]
      }
    }
  });

  const quizAlgo = await prisma.quiz.upsert({
    where: { id: 'quiz-algo-1' },
    update: {},
    create: {
      id: 'quiz-algo-1',
      title: 'Complexité Algorithmique',
      description: 'Comprendre les notations Big O.',
      subject: 'ALGO',
      xpReward: 200,
      questions: {
        create: [
          {
            question: 'Quelle est la complexité d\'une recherche binaire ?',
            options: JSON.stringify(['O(n)', 'O(log n)', 'O(n²)', 'O(1)']),
            answer: 1
          }
        ]
      }
    }
  });

  console.log('Quizz initialisés.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });