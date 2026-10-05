import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/session';
import { getAiQuota } from '@/lib/quota';

export const dynamic = 'force-dynamic';

// Même formule que la consommation (src/lib/quota.ts) : remaining = (limit - used) + bonus.
// `used` = requêtes gratuites utilisées aujourd'hui (0..limit).
export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { used, limit, bonus, remaining } = await getAiQuota(user.id);
    return NextResponse.json({ used, limit, bonus, remaining });
  } catch (error) {
    console.error('[ai-quota] erreur:', error instanceof Error ? error.name : 'erreur inconnue');
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
