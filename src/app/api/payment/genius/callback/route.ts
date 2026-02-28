import { NextResponse } from 'next/server';
import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "@/lib/notifications";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log('Webhook Genius Pay reçu:', body);

    // Genius Pay peut envoyer les infos directement ou dans un objet "data"
    const payload = body.data || body;
    const transactionId = payload.metadata?.dbTransactionId;
    const status = (payload.status || '').toUpperCase();

    if (!transactionId) {
      console.error('ID de transaction manquant dans le Webhook');
      return NextResponse.json({ error: 'Transaction ID manquant' }, { status: 400 });
    }

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

      // 2. Action selon le type de transaction
      if ((dbTransaction as any).type === 'SUBSCRIPTION') {
        const expiresAt = dbTransaction.user.subscriptionExpiresAt && dbTransaction.user.subscriptionExpiresAt > new Date()
          ? new Date(dbTransaction.user.subscriptionExpiresAt)
          : new Date();

        // Calcul de la durée selon le pack
        const name = dbTransaction.packName.toLowerCase();
        if (name.includes('trimestriel')) {
          expiresAt.setMonth(expiresAt.getMonth() + 3);
        } else if (name.includes('semestriel')) {
          expiresAt.setMonth(expiresAt.getMonth() + 6);
        } else {
          expiresAt.setMonth(expiresAt.getMonth() + 1);
        }

        await prisma.user.update({
          where: { id: dbTransaction.userId },
          data: {
            isSubscribed: true,
            subscriptionExpiresAt: expiresAt,
            // Créditer les jetons si le pack en contient (ex: promo)
            aiBonusRequests: { increment: dbTransaction.tokens }
          }
        });
        console.log(`✅ Abonnement activé/prolongé pour ${dbTransaction.user.email} (Expire le: ${expiresAt})`);
        if (dbTransaction.tokens > 0) {
          console.log(`🎁 Bonus: +${dbTransaction.tokens} jetons crédités.`);
        }
      } else {
        // Créditer les jetons à l'utilisateur (Top-up classique)
        await prisma.user.update({
          where: { id: dbTransaction.userId },
          data: {
            aiBonusRequests: { increment: dbTransaction.tokens }
          }
        });
        console.log(`✅ Top-up validé: +${dbTransaction.tokens} jetons pour ${dbTransaction.user.email}`);
      }

      // 3. Envoyer une notification Push si l'utilisateur a un token
      if (dbTransaction.user.pushToken) {
        await sendPushNotification(
          dbTransaction.user.pushToken,
          "Paiement Validé ! ✅",
          `Votre compte a été crédité de ${dbTransaction.tokens} jetons IA. Merci !`
        );
      }

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
