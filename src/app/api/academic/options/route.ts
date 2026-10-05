import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Route publique (utilisée par l'inscription, avant toute connexion) : uniquement id, nom et code.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [fields, levels] = await Promise.all([
      prisma.field.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } }),
      prisma.level.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
    ]);

    return NextResponse.json(
      { fields, levels },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } }
    );
  } catch (error) {
    console.error('Erreur academic/options:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
