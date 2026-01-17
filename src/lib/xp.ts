import { prisma } from './prisma';

export async function addXP(userId: string, amount: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { xp: true, level: true, streak: true, lastActive: true }
  });

  if (!user) return null;

  const now = new Date();
  const lastActive = new Date(user.lastActive);
  
  // Calcul de la série (Streak)
  let newStreak = user.streak;
  const diffInDays = Math.floor((now.getTime() - lastActive.getTime()) / (1000 * 3600 * 24));

  if (diffInDays === 1) {
    // Revenu le lendemain : +1 à la série
    newStreak += 1;
  } else if (diffInDays > 1) {
    // Plus d'un jour d'absence : la série redémarre
    newStreak = 1;
  } else if (user.streak === 0) {
    // Première activité
    newStreak = 1;
  }

  const totalXP = user.xp + amount;
  const newLevel = Math.floor(totalXP / 200) + 1;

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: {
      xp: totalXP,
      level: newLevel,
      streak: newStreak,
      lastActive: now
    }
  });

  // --- Vérification automatique des badges ---
  await checkAndAwardBadges(userId);

  return updatedUser;
}

async function checkAndAwardBadges(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { quizAttempts: true, badges: true }
  });

  if (!user) return;

  const userBadgeSlugs = user.badges.map((b: any) => b.badgeId); // On compare avec les IDs ou slugs
  
  // 1. Badge "Maître des Quizz" (10 quizz complétés)
  if (user.quizAttempts.length >= 10) {
    await awardBadge(userId, 'quiz-master');
  }

  // 2. Badge "Expert du Sujet" (3 quizz réussis > 80% sur une même matière)
  const subjects = user.quizAttempts.filter((q: any) => q.score >= 80);
  // On pourrait grouper par matière si on avait le lien, ici simplifions par score global
  if (subjects.length >= 3) {
    await awardBadge(userId, 'subject-expert');
  }

  // 3. Badge "Série de Fer" (Streak >= 7)
  if (user.streak >= 7) {
    await awardBadge(userId, 'streak-7');
  }
}

async function awardBadge(userId: string, badgeSlug: string) {
  const badge = await prisma.badge.findUnique({ where: { slug: badgeSlug } });
  if (!badge) return;

  const alreadyHas = await prisma.userBadge.findUnique({
    where: { userId_badgeId: { userId, badgeId: badge.id } }
  });

  if (!alreadyHas) {
    await prisma.userBadge.create({
      data: { userId, badgeId: badge.id }
    });
  }
}