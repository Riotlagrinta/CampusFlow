import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const [fields, levels] = await Promise.all([
      prisma.field.findMany({ orderBy: { name: 'asc' } }),
      prisma.level.findMany({ orderBy: { name: 'asc' } })
    ]);

    return NextResponse.json({ fields, levels });
  } catch (error) {
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
