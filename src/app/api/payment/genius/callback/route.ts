import { NextResponse } from 'next/server';
import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "@/lib/notifications";
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { sendEmail } from '@/lib/mail';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);
    const signature = req.headers.get('x-genius-signature');
    const secretKey = process.env.GENIUS_PAY_SECRET_KEY;

    console.log('🛡️ Webhook Reçu. Analyse de sécurité...');

    // 1. VERIFICATION DE LA SIGNATURE (Si activée chez Genius Pay)
    if (signature && secretKey) {
      const expectedSignature = crypto
        .createHmac('sha256', secretKey)
        .update(rawBody)
        .digest('hex');

      if (signature !== expectedSignature) {
        console.error('❌ SIGNATURE WEBHOOK INVALIDE');
        return NextResponse.json({ error: 'Signature invalide' }, { status: 401 });
      }
    }

    const payload = body.data || body;
    const dbTransactionId = payload.metadata?.dbTransactionId;
    const geniusRef = payload.reference || payload.id;

    if (!dbTransactionId) {
      console.error('❌ ID de transaction manquant');
      return NextResponse.json({ error: 'Transaction ID manquant' }, { status: 400 });
    }

    // 2. DOUBLE VERIFICATION (REBOND) : On demande le statut RÉEL à Genius Pay
    // C'est la sécurité ultime : même si le webhook est falsifié, on vérifie à la source.
    try {
        const checkRes = await fetch(`https://pay.genius.ci/api/v1/merchant/payments/${geniusRef}`, {
            headers: {
                'X-API-Key': process.env.GENIUS_PAY_PUBLIC_KEY || '',
                'X-API-Secret': process.env.GENIUS_PAY_SECRET_KEY || '',
                'Accept': 'application/json'
            }
        });
        const checkData = await checkRes.json();
        
        if (!checkRes.ok || !checkData.success || checkData.data.status.toUpperCase() !== 'SUCCESS') {
            console.error('❌ ÉCHEC DE LA VÉRIFICATION DE SÉCURITÉ (REBOND)');
            return NextResponse.json({ error: 'Vérification de paiement échouée' }, { status: 403 });
        }
        console.log('✅ Vérification de sécurité passée avec succès.');
    } catch (e) {
        console.warn('⚠️ Impossible de faire la double vérification, on continue avec prudence.');
    }

    const dbTransaction = await prisma.transaction.findUnique({
      where: { id: dbTransactionId },
      include: { user: true }
    });

    if (!dbTransaction) return NextResponse.json({ error: 'Transaction introuvable' }, { status: 404 });
    if (dbTransaction.status === 'COMPLETED') return NextResponse.json({ message: 'Déjà traité' });

    // 3. MISE À JOUR & CRÉDIT
    await prisma.transaction.update({
        where: { id: dbTransactionId },
        data: { status: 'COMPLETED' }
    });

    if ((dbTransaction as any).type === 'SUBSCRIPTION') {
        const expiresAt = dbTransaction.user.subscriptionExpiresAt && dbTransaction.user.subscriptionExpiresAt > new Date()
          ? new Date(dbTransaction.user.subscriptionExpiresAt)
          : new Date();

        const name = dbTransaction.packName.toLowerCase();
        if (name.includes('trimestriel')) expiresAt.setMonth(expiresAt.getMonth() + 3);
        else if (name.includes('semestriel')) expiresAt.setMonth(expiresAt.getMonth() + 6);
        else expiresAt.setMonth(expiresAt.getMonth() + 1);

        await prisma.user.update({
          where: { id: dbTransaction.userId },
          data: {
            isSubscribed: true,
            subscriptionExpiresAt: expiresAt,
            aiBonusRequests: { increment: dbTransaction.tokens }
          }
        });
    } else {
        await prisma.user.update({
          where: { id: dbTransaction.userId },
          data: { aiBonusRequests: { increment: dbTransaction.tokens } }
        });
    }

    // 4. NOTIFICATION PUSH
    if (dbTransaction.user.pushToken) {
        await sendPushNotification(
          dbTransaction.user.pushToken,
          "Paiement Validé ! ✅",
          `Votre compte a été crédité. Merci de votre confiance !`
        );
    }

    // --- NOUVEAUX NOTIFICATIONS (WhatsApp + Email) ---
    const adminPhone = "22871796050"; // Votre numéro
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || "djkeda82@gmail.com";
    const userName = `${dbTransaction.user.firstName} ${dbTransaction.user.lastName}`;
    const amountStr = `${dbTransaction.amount} FCFA`;
    const packStr = dbTransaction.packName;

    // 1. Notification à l'ADMIN (WhatsApp)
    const adminWhatsAppMsg = `💰 *Nouveau Paiement Reçu !* 💰\n\n👤 *Client :* ${userName}\n📧 *Email :* ${dbTransaction.user.email}\n💵 *Montant :* ${amountStr}\n📦 *Pack :* ${packStr}\n\nL'application vient de créditer le compte automatiquement. 🚀`;
    await sendWhatsAppMessage(adminPhone, adminWhatsAppMsg);

    // 2. Notification à l'ADMIN (Email)
    try {
      await sendEmail({
        to: adminEmail,
        subject: `💰 Nouveau Paiement - ${amountStr} - ${userName}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #059669;">Nouveau Paiement Reçu ! ✅</h2>
            <p><strong>Client :</strong> ${userName} (${dbTransaction.user.email})</p>
            <p><strong>Montant :</strong> <span style="font-size: 20px; color: #059669; font-weight: bold;">${amountStr}</span></p>
            <p><strong>Pack :</strong> ${packStr}</p>
            <p><strong>ID Transaction :</strong> ${dbTransaction.id}</p>
            <hr />
            <p style="font-size: 12px; color: #666;">Notification automatique de DefiTech Student Hub</p>
          </div>
        `
      });
    } catch (e) {}

    // 3. Notification au CLIENT (WhatsApp si numéro dispo)
    if (dbTransaction.user.phone) {
      const clientWhatsAppMsg = `*DefiTech Student Hub* ✅\n\nMerci ${dbTransaction.user.firstName} ! Votre paiement de *${amountStr}* pour le pack *${packStr}* a été validé avec succès.\n\nVos accès sont désormais actifs. Profitez bien de la plateforme ! 🚀`;
      await sendWhatsAppMessage(dbTransaction.user.phone, clientWhatsAppMsg);
    }

    console.log(`🎉 SUCCÈS : Crédit effectué pour ${dbTransaction.user.email}`);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('🔥 Erreur Webhook:', error);
    return NextResponse.json({ error: 'Erreur interne Webhook' }, { status: 500 });
  }
}
