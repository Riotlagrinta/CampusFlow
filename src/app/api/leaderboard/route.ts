import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const topUsers = await prisma.user.findMany({
      orderBy: { xp: 'desc' },
      take: 5,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        xp: true,
        level: true
      }
    });

    return NextResponse.json(topUsers);
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
