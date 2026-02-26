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

    // 2. Préparation de la requête Genius Pay
    const payload = {
      amount: selectedPack.amount,
      currency: 'XOF',
      description: `Recharge Jetons IA (${selectedPack.name}) - StudentHub`,
      customer_name: `${user.firstName} ${user.lastName}`,
      customer_email: user.email,
      success_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/shop`,
      cancel_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/shop`,
      callback_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/payment/genius/callback`,
      metadata: {
        dbTransactionId: dbTransaction.id,
        userId: user.id
      }
    };

    // 3. Appel API Genius Pay
    const GENIUS_API_URL = 'https://pay.genius.ci/api/v1/merchant/payments';
    const apiKey = (process.env.GENIUS_PAY_SECRET_KEY || '').trim();
    
    console.log('--- TENTATIVE AVEC PRÉFIXE TOKEN ---');

    const response = await fetch(GENIUS_API_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Token ${apiKey}`
      },
      body: JSON.stringify({
        amount: selectedPack.amount,
        currency: 'XOF',
        description: `Achat ${selectedPack.name}`,
        customer_name: `${user.firstName} ${user.lastName}`,
        customer_email: user.email,
        success_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/shop`,
        cancel_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/shop`,
        callback_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/payment/genius/callback`,
        metadata: {
          dbTransactionId: dbTransaction.id,
          userId: user.id
        }
      })
    });

    let result;
    try {
        result = await response.json();
    } catch (e) {
        throw new Error("Réponse Genius Pay invalide (pas du JSON)");
    }

    if (!response.ok) {
      console.error('Erreur Genius Pay:', result);
      return NextResponse.json({ error: result.message || 'Erreur API Genius Pay' }, { status: response.status });
    }

    // 4. On met à jour la référence externe (ID Genius Pay)
    await prisma.transaction.update({
        where: { id: dbTransaction.id },
        data: { reference: String(result.id || result.transaction_id || result.data?.id) }
    });

    // Renvoie l'URL de paiement à l'utilisateur
    return NextResponse.json({ url: result.payment_url || result.data?.payment_url });
  } catch (error: any) {
    console.error('Crash Genius Pay Create:', error);
    return NextResponse.json({ 
        error: "Erreur d'initialisation", 
        details: error.message,
        debug: { hasKey: !!process.env.GENIUS_PAY_SECRET_KEY }
    }, { status: 500 });
  }
}
