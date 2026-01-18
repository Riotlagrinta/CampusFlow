import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const packId = searchParams.get('packId');
    const userId = searchParams.get('userId');

    // FedaPay renvoie 'approved' quand c'est un succès
    if (status === 'approved' && packId && userId) {
      const PACKS: Record<string, number> = {
        'starter': 50,
        'pro': 150,
        'master': 500
      };

      const tokensToAdd = PACKS[packId] || 0;

      // Créditer l'utilisateur
      await prisma.user.update({
        where: { id: userId },
        data: {
          aiBonusRequests: { increment: tokensToAdd }
        }
      });

      // Redirection vers une page de succès
      return NextResponse.redirect(new URL('/payment-success', req.url));
    }

    // Sinon redirection vers erreur
    return NextResponse.redirect(new URL('/payment-error', req.url));
  } catch (error) {
    console.error('Erreur Callback FedaPay:', error);
    return NextResponse.redirect(new URL('/payment-error', req.url));
  }
}
