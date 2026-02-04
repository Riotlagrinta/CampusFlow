import { NextResponse } from 'next/server';
import { auth } from "@/../auth";
import { prisma } from "@/lib/prisma";

const { FedaPay, Transaction: FedaTransaction } = require('fedapay');

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { packId } = await req.json();

    const PACKS: Record<string, { amount: number, tokens: number, name: string }> = {
      'starter': { amount: 500, tokens: 50, name: 'Pack Étudiant' },
      'pro': { amount: 1000, tokens: 150, name: 'Pack Révision' },
      'master': { amount: 2000, tokens: 500, name: 'Pack Master' }
    };

    const selectedPack = PACKS[packId];
    if (!selectedPack) return NextResponse.json({ error: 'Pack invalide' }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });

    // 1. Création de la transaction en base de données (Statut PENDING)
    const dbTransaction = await prisma.transaction.create({
        data: {
            userId: user.id,
            amount: selectedPack.amount,
            tokens: selectedPack.tokens,
            packName: selectedPack.name,
            status: 'PENDING'
        }
    });

    // 2. Configuration FedaPay
    FedaPay.setApiKey(process.env.FEDAPAY_SECRET_KEY);
    FedaPay.setEnvironment(process.env.NODE_ENV === 'production' ? 'live' : 'sandbox');

    // 3. Création de la transaction FedaPay
    const fedaTransaction = await FedaTransaction.create({
      amount: selectedPack.amount,
      currency: { iso: 'XOF' },
      description: `Achat de ${selectedPack.name} - DEFITECH Student Hub`,
      customer: {
        email: user.email,
        firstname: user.firstName || 'Étudiant',
        lastname: user.lastName || 'DEFITECH'
      },
      callback_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/payment/callback?transactionId=${dbTransaction.id}`
    });

    const token = await fedaTransaction.generateToken();

    // 4. On met à jour la référence externe pour pouvoir vérifier plus tard
    // Note: fedaTransaction.id est l'ID chez FedaPay
    await prisma.transaction.update({
        where: { id: dbTransaction.id },
        data: { reference: String(fedaTransaction.id) }
    });

    return NextResponse.json({ url: token.url });
  } catch (error: any) {
    console.error('Erreur FedaPay:', error);
    return NextResponse.json({ error: 'Erreur lors de la création du paiement' }, { status: 500 });
  }
}