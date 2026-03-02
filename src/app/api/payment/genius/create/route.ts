import { NextResponse } from 'next/server';
import { auth } from "@/../auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { packId } = await req.json();

    const PACKS: Record<string, { amount: number, tokens: number, name: string, type?: string }> = {
      'starter': { amount: 500, tokens: 50, name: 'Pack Étudiant' },
      'pro': { amount: 1000, tokens: 150, name: 'Pack Révision' },
      'master': { amount: 2000, tokens: 500, name: 'Pack Master' },
      'monthly_basic': { amount: 500, tokens: 0, name: 'Abonnement Basique (1 mois)', type: 'SUBSCRIPTION' },
      'quarterly_promo': { amount: 2000, tokens: 500, name: 'Pack Trimestriel Promo', type: 'SUBSCRIPTION' },
      'semestriel_elite': { amount: 2500, tokens: 1000, name: 'Pack Semestriel Elite', type: 'SUBSCRIPTION' },
      'token_master': { amount: 2000, tokens: 5000, name: 'Pack Token Master', type: 'SUBSCRIPTION' },
      'monthly': { amount: 5000, tokens: 0, name: 'Abonnement Premium (Ancien)', type: 'SUBSCRIPTION' }
    };

    const selectedPack = PACKS[packId];
    if (!selectedPack) return NextResponse.json({ error: 'Pack invalide' }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });

    // 1. Création de la transaction en base de données
    const dbTransaction = await prisma.transaction.create({
      data: {
        userId: user.id,
        amount: selectedPack.amount,
        tokens: selectedPack.tokens,
        packName: selectedPack.name,
        status: 'PENDING',
        type: (selectedPack as any).type || 'TOPUP'
      } as any
    });

    // 2. Préparation du Payload pour Genius Pay
    const payload = {
      amount: selectedPack.amount,
      currency: 'XOF',
      description: `Achat ${selectedPack.name} - StudentHub`,
      customer: {
        name: `${user.firstName} ${user.lastName}`,
        email: user.email
      },
      success_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/shop/success`,
      error_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/shop`,
      metadata: {
        dbTransactionId: dbTransaction.id,
        userId: user.id
      }
    };

    // 3. Appel API Genius Pay
    const GENIUS_API_URL = 'https://pay.genius.ci/api/v1/merchant/payments';
    const secretKey = (process.env.GENIUS_PAY_SECRET_KEY || '').trim();
    const publicKey = (process.env.GENIUS_PAY_PUBLIC_KEY || '').trim();

    console.log('💳 Diagnostic Genius Pay:', {
      hasPublic: !!publicKey,
      publicPrefix: publicKey.substring(0, 7),
      hasSecret: !!secretKey,
      secretPrefix: secretKey.substring(0, 7),
      env: process.env.NODE_ENV
    });

    const response = await fetch(GENIUS_API_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': publicKey,
        'X-API-Secret': secretKey
      },
      body: JSON.stringify(payload)
    });

    let result;
    try {
      result = await response.json();
    } catch (e) {
      throw new Error("Réponse Genius Pay non JSON");
    }

    if (!response.ok || !result.success) {
      console.error('Erreur Genius Pay:', result);
      return NextResponse.json({ error: result.error?.message || result.message || 'Erreur API Genius Pay' }, { status: response.status });
    }

    // 4. Mise à jour de la référence
    const geniusData = result.data;
    await prisma.transaction.update({
      where: { id: dbTransaction.id },
      data: { reference: String(geniusData.reference || geniusData.id) }
    });

    return NextResponse.json({ url: geniusData.checkout_url });
  } catch (error: any) {
    console.error('Crash Genius Pay Create:', error);
    return NextResponse.json({ error: "Erreur d'initialisation" }, { status: 500 });
  }
}
