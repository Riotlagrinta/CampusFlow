import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';
import { isPremium } from '@/lib/subscription';
import { getUserRank } from '@/lib/xp';
import { getCurrentSemester, resolveFieldScope } from '@/lib/contentListing';

export const dynamic = 'force-dynamic';

// Fuseau des cours : les horaires du planning sont saisis en heure locale (Togo, UTC+0).
const SCHOOL_TIMEZONE = 'Africa/Lome';

function getSchoolNow(): { day: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: SCHOOL_TIMEZONE,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = get('weekday');
  return {
    // Les jours du planning sont stockés en français avec une majuscule (« Lundi »)
    day: weekday.charAt(0).toUpperCase() + weekday.slice(1),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** Extrait début et fin (en minutes) d'un créneau du type « 08h00 - 10h00 ». */
function parseTimeRange(time: string): { start: number; end: number | null } | null {
  const matches = [...time.matchAll(/(\d{1,2})\s*[hH:]\s*(\d{2})?/g)];
  if (matches.length === 0) return null;
  const toMinutes = (m: RegExpMatchArray) => Number(m[1]) * 60 + Number(m[2] ?? 0);
  return { start: toMinutes(matches[0]), end: matches.length > 1 ? toMinutes(matches[1]) : null };
}

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        email: true,
        isActive: true,
        role: true,
        xp: true,
        level: true,
        isSubscribed: true,
        subscriptionExpiresAt: true,
        fieldId: true,
        academicLevelId: true,
      },
    });
    if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

    const schoolNow = getSchoolNow();
    const fieldScope = await resolveFieldScope(user.fieldId);

    const [quizStats, badgeCount, recentQuizzes, todaysCourses, rank] = await Promise.all([
      prisma.quizAttempt.aggregate({
        where: { userId: user.id },
        _avg: { score: true },
        _count: { _all: true },
      }),
      prisma.userBadge.count({ where: { userId: user.id } }),
      // Activités récentes
      prisma.quizAttempt.findMany({
        where: { userId: user.id },
        select: { score: true, createdAt: true, quiz: { select: { title: true } } },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
      // Cours du jour de SA classe (filière, niveau, semestre en cours) : jamais ceux des autres
      user.fieldId && user.academicLevelId
        ? prisma.personalSchedule.findMany({
            where: {
              day: schoolNow.day,
              isAcademic: true,
              fieldId: fieldScope,
              levelId: user.academicLevelId,
              semester: getCurrentSemester(),
            },
            select: { time: true, teacher: true, subjectName: true, subject: { select: { name: true } } },
            orderBy: { time: 'asc' },
            take: 30,
          })
        : Promise.resolve([]),
      // Rang : même calcul que /api/user/stats et le classement (null pour ADMIN, compte IA, inactif)
      getUserRank(user),
    ]);

    // Calculs réels
    const quizCount = quizStats._count._all;
    // GPA fictif basé sur les scores de quiz
    const gpa = ((quizStats._avg.score ?? 0) / 25).toFixed(1);

    const recentActivities = recentQuizzes.map((q) => ({
      title: `Quiz terminé : ${q.quiz.title}`,
      date: q.createdAt.toLocaleDateString('fr-FR', { timeZone: SCHOOL_TIMEZONE }),
      status: `Score : ${q.score}%`,
    }));

    // Prochain cours : celui en cours ou le prochain à venir aujourd'hui
    const readable = todaysCourses.flatMap((course) => {
      const range = parseTimeRange(course.time);
      return range ? [{ course, range }] : [];
    });
    const upcoming = readable
      .sort((a, b) => a.range.start - b.range.start)
      .find((s) => (s.range.end ?? s.range.start + 1) > schoolNow.minutes);
    // Horaires illisibles pour tous les cours : on retombe sur le premier cours du jour
    const nextCourse = upcoming?.course ?? (readable.length === 0 ? todaysCourses[0] : undefined);

    return NextResponse.json({
      rank,
      // Rôle effectif : un ADMIN sans second facteur validé apparaît comme étudiant (voir AuthUser).
      role: authUser.role,
      mfaPending: authUser.mfaPending === true,
      isSubscribed: isPremium(user),
      subscriptionExpiresAt: user.subscriptionExpiresAt,
      stats: [
        { label: 'GPA Actuel', value: `${gpa}/4.0`, trend: 'Basé sur quiz', icon: 'Activity' },
        { label: 'Quizz Complétés', value: `${quizCount}`, trend: 'Total', icon: 'BookOpen' },
        { label: 'XP Accumulée', value: user.xp.toLocaleString('fr-FR'), trend: `Lvl ${user.level}`, icon: 'Zap' },
        { label: 'Badges', value: `${badgeCount}`, trend: 'Obtenus', icon: 'Award' },
      ],
      activities: recentActivities,
      nextCourse: nextCourse
        ? {
            title: nextCourse.subject?.name || nextCourse.subjectName || 'Cours',
            time: nextCourse.time,
            teacher: nextCourse.teacher || 'N/A',
          }
        : null,
    });
  } catch (error) {
    console.error('Erreur dashboard-stats:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
