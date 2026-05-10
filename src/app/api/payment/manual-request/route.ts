import { NextResponse } from 'next/server';
import { auth } from "@/../auth";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from '@/lib/whatsapp';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { packId, method } = await req.json();

    const PACKS: Record<string, { amount: number, tokens: number, name: string }> = {
      'starter': { amount: 500, tokens: 50, name: 'Pack Étudiant' },
      'pro': { amount: 1000, tokens: 150, name: 'Pack Révision' },
      'master': { amount: 2000, tokens: 500, name: 'Pack Master' }
    };

    const selectedPack = PACKS[packId];
    if (!selectedPack) return NextResponse.json({ error: 'Pack invalide' }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });

    // Création de la transaction en base de données avec statut PENDING
    // On précise la méthode dans la référence
    const dbTransaction = await prisma.transaction.create({
        data: {
            userId: user.id,
            amount: selectedPack.amount,
            tokens: selectedPack.tokens,
            packName: selectedPack.name,
            status: 'PENDING',
            reference: `MANUAL_${method}_${Date.now()}`
        }
    });

    // LOW FIX: numéro admin via variable d'env
    const adminPhone = process.env.ADMIN_WHATSAPP_PHONE || '';
    const userName = `${user.firstName || ''} ${user.lastName || ''}`;
    const amountStr = `${selectedPack.amount} FCFA`;

    if (adminPhone) {
      const adminWhatsAppMsg = `⏳ *Nouvelle Demande de Paiement Manuel* ⏳\n\n👤 *Client :* ${userName}\n📧 *Email :* ${user.email}\n💵 *Montant :* ${amountStr}\n📦 *Pack :* ${selectedPack.name}\n💳 *Méthode :* ${method}\n\nL'étudiant attend la validation de son paiement. 🚀`;
      await sendWhatsAppMessage(adminPhone, adminWhatsAppMsg);
    }

    return NextResponse.json(dbTransaction);
  } catch (error) {
    console.error('Erreur Manual Payment:', error);
    return NextResponse.json({ error: 'Erreur lors de l\'enregistrement' }, { status: 500 });
  }
}
