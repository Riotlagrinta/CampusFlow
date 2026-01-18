import { NextResponse } from 'next/server';
import { auth } from "@/../auth";
import { prisma } from "@/lib/prisma";

// On utilise require pour éviter les problèmes de typage ou d'export sur le SDK FedaPay
const { FedaPay, Transaction } = require('fedapay');

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { packId } = await req.json();

    // Définition des packs
    const PACKS: Record<string, { amount: number, tokens: number, name: string }> = {
      'starter': { amount: 500, tokens: 50, name: 'Pack Étudiant (50 jetons)' },
      'pro': { amount: 1000, tokens: 150, name: 'Pack Révision (150 jetons)' },
      'master': { amount: 2000, tokens: 500, name: 'Pack Master (500 jetons)' }
    };

    const selectedPack = PACKS[packId];
    if (!selectedPack) return NextResponse.json({ error: 'Pack invalide' }, { status: 400 });

    /* 
       Configuration FedaPay
       Il faudra ajouter FEDAPAY_SECRET_KEY dans Vercel/ .env
    */
    FedaPay.setApiKey(process.env.FEDAPAY_SECRET_KEY);
    FedaPay.setEnvironment(process.env.NODE_ENV === 'production' ? 'live' : 'sandbox');

    const transaction = await Transaction.create({
      amount: selectedPack.amount,
      currency: { iso: 'XOF' },
      description: `Achat de ${selectedPack.name} sur Student Hub`,
      customer: {
        email: session.user.email,
        firstname: session.user.name?.split(' ')[0] || 'Étudiant',
        lastname: session.user.name?.split(' ')[1] || 'Hub'
      },
      callback_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/payment/callback?packId=${packId}&userId=${(session.user as any).id}`
    });

    const token = await transaction.generateToken();

    return NextResponse.json({ url: token.url });
  } catch (error: any) {
    console.error('Erreur FedaPay:', error);
    return NextResponse.json({ error: 'Erreur lors de la création du paiement' }, { status: 500 });
  }
}
