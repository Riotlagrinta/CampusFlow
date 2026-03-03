import { NextResponse } from 'next/server';

// On définit les headers CORS globaux pour autoriser les applications mobiles et web
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-email',
};

// Gérer les requêtes préliminaires OPTIONS (CORS Preflight)
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

import { auth } from "@/../auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await auth();
    const body = await req.json();
    const { packId, email: providedEmail } = body;

    const emailFromHeader = req.headers.get("x-user-email");
    const email = emailFromHeader || providedEmail || session?.user?.email;

    if (!email) {
      return NextResponse.json(
        { error: 'Identification requise', details: 'Connectez-vous pour continuer.' }, 
        { status: 401, headers: corsHeaders }
      );
    }

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
    if (!selectedPack) return NextResponse.json({ error: 'Pack invalide' }, { status: 400, headers: corsHeaders });

    const user = await prisma.user.findUnique({ where: { email: email as string } });
    if (!user) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404, headers: corsHeaders });

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

    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Étudiant DefiTech';

    const payload = {
      amount: selectedPack.amount,
      currency: 'XOF',
      description: `Achat ${selectedPack.name} - StudentHub`,
      customer: {
        name: fullName,
        email: user.email
      },
      success_url: `${baseUrl}/shop/success`,
      error_url: `${baseUrl}/shop`,
      callback_url: `${baseUrl}/api/payment/genius/callback`, 
      metadata: {
        dbTransactionId: dbTransaction.id,
        userId: user.id
      }
    };

    const GENIUS_API_URL = 'https://pay.genius.ci/api/v1/merchant/payments';
    const secretKey = (process.env.GENIUS_PAY_SECRET_KEY || '').trim();
    const publicKey = (process.env.GENIUS_PAY_PUBLIC_KEY || '').trim();

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
      return NextResponse.json(
        { error: result.error?.message || result.message || 'Erreur API Genius Pay' }, 
        { status: response.status, headers: corsHeaders }
      );
    }

    const geniusData = result.data;
    await prisma.transaction.update({
      where: { id: dbTransaction.id },
      data: { reference: String(geniusData.reference || geniusData.id) }
    });

    return NextResponse.json({ url: geniusData.checkout_url }, { headers: corsHeaders });
  } catch (error: any) {
    console.error('Crash Genius Pay Create:', error);
    return NextResponse.json({ error: "Erreur d'initialisation" }, { status: 500, headers: corsHeaders });
  }
}
