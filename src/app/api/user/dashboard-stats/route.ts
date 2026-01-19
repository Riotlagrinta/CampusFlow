import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function GET(req: Request) {
  try {
    const session = await auth();

    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        quizAttempts: true,
        badges: true
      }
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Calculs réels
    const totalXP = user.xp;
    const level = user.level;
    const quizCount = user.quizAttempts.length;
    
    // GPA fictif basé sur les scores de quiz (ex: moyenne des scores / 25 pour avoir sur 4.0)
    const averageScore = user.quizAttempts.length > 0 
      ? user.quizAttempts.reduce((acc: number, curr: any) => acc + curr.score, 0) / user.quizAttempts.length 
      : 0;
    const gpa = (averageScore / 25).toFixed(1);

    // Activités récentes
    const recentQuizzes = await prisma.quizAttempt.findMany({
      where: { userId: user.id },
      include: { quiz: true },
      orderBy: { createdAt: 'desc' },
      take: 3
    });

    const recentActivities = recentQuizzes.map((q: any) => ({
      title: `Quiz terminé : ${q.quiz.title}`,
      date: new Date(q.createdAt).toLocaleDateString(),
      status: `Score : ${q.score}%`
    }));

    // Prochain cours (le plus proche aujourd'hui)
    const now = new Date();
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const today = days[now.getDay()];

    const nextCourse = await prisma.personalSchedule.findFirst({
      where: {
        day: today,
        isAcademic: true
      },
      include: { subject: { select: { name: true } } },
      orderBy: { time: 'asc' }
    });

    // Calcul du classement
    const allUsers = await prisma.user.findMany({
      orderBy: { xp: 'desc' },
      select: { id: true }
    });
    const rank = allUsers.findIndex((u: any) => u.id === user.id) + 1;

    return NextResponse.json({
      rank,
      stats: [
        { label: 'GPA Actuel', value: `${gpa}/4.0`, trend: 'Basé sur quiz', icon: 'Activity' },
        { label: 'Quizz Complétés', value: `${quizCount}`, trend: 'Total', icon: 'BookOpen' },
        { label: 'XP Accumulée', value: totalXP.toLocaleString(), trend: `Lvl ${level}`, icon: 'Zap' },
        { label: 'Badges', value: `${user.badges.length}`, trend: 'Obtenus', icon: 'Award' },
      ],
      activities: recentActivities,
      nextCourse: nextCourse ? {
        title: nextCourse.subject?.name || nextCourse.subjectName,
        time: nextCourse.time,
        teacher: nextCourse.teacher || 'N/A'
      } : null
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
