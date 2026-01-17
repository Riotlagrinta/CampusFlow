import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const DEMO_USER_EMAIL = 'etudiant@defitech.tg';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { amount } = body; 
    // const { reason } = body; // Pour logs futurs
    const xpToAdd = parseInt(amount, 10) || 10;

    const user = await prisma.user.findUnique({
      where: { email: DEMO_USER_EMAIL },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const newXp = user.xp + xpToAdd;
    // Logique simple : 1 niveau tous les 200 XP
    const newLevel = Math.floor(newXp / 200) + 1;

    const updatedUser = await prisma.user.update({
      where: { email: DEMO_USER_EMAIL },
      data: {
        xp: newXp,
        level: newLevel,
        lastActive: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      xp: updatedUser.xp,
      level: updatedUser.level,
      leveledUp: newLevel > user.level
    });
  } catch (error) {
    console.error('Error adding XP:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
