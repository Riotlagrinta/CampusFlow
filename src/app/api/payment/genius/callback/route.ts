import { NextResponse } from 'next/server';
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const data = await req.json();
    console.log('Webhook Genius Pay reçu:', data);

    const transactionId = data.metadata?.dbTransactionId;
    const status = data.status; // 'SUCCESS', 'FAILED', 'PENDING', 'CANCELLED'

    if (!transactionId) return NextResponse.json({ error: 'Transaction ID manquant' }, { status: 400 });

    const dbTransaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { user: true }
    });

    if (!dbTransaction) return NextResponse.json({ error: 'Transaction introuvable' }, { status: 404 });

    // Si la transaction est déjà complétée, on ignore
    if (dbTransaction.status === 'COMPLETED') {
      return NextResponse.json({ message: 'Déjà traité' });
    }

    if (status === 'SUCCESS' || status === 'COMPLETED') {
      // 1. Mettre à jour la transaction
      await prisma.transaction.update({
        where: { id: transactionId },
        data: { status: 'COMPLETED' }
      });

      // 2. Créditer les jetons à l'utilisateur
      await prisma.user.update({
        where: { id: dbTransaction.userId },
        data: {
          aiBonusRequests: { increment: dbTransaction.tokens }
        }
      });

      console.log(`✅ Paiement validé: +${dbTransaction.tokens} jetons pour ${dbTransaction.user.email}`);
      return NextResponse.json({ success: true });
    } else if (status === 'FAILED' || status === 'CANCELLED') {
      await prisma.transaction.update({
        where: { id: transactionId },
        data: { status: 'FAILED' }
      });
      return NextResponse.json({ message: 'Paiement échoué' });
    }

    return NextResponse.json({ message: 'Paiement en attente' });
  } catch (error: any) {
    console.error('Erreur Webhook Genius Pay:', error);
    return NextResponse.json({ error: 'Erreur interne Webhook' }, { status: 500 });
  }
}
