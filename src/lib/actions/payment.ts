"use server";

import { auth } from "../../../auth";
import { prisma } from "@/lib/prisma";

export async function createGeniusPayment(packId: string) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      throw new Error("Vous devez être connecté pour effectuer un achat.");
    }

    const email = session.user.email;

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
    if (!selectedPack) throw new Error("Pack invalide.");

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error("Utilisateur introuvable.");

    // --- DIAGNOSTIC VARIABLE VERCEL ---
    // On liste les clés dispos pour voir si Genius est là (SÉCURISÉ : On ne log pas les valeurs)
    const envKeys = Object.keys(process.env);
    const geniusKeysFound = envKeys.filter(k => k.includes('GENIUS'));
    
    console.log('🔍 Diagnostic des variables dispo sur Vercel:', geniusKeysFound);

    // --- LECTURE ULTRA-ROBUSTE ---
    // Si Vercel ne voit pas les variables, on utilise ces valeurs de production
    const FALLBACK_PUBLIC = "pk_live_ASsE949NKz8zdwaGy76wYHjyW412aND1"; 
    const FALLBACK_SECRET = "sk_live_0a34b395b690a3fdbbbece75b9f63537dbfe9372054bb981220368348d9af2f3";

    const publicKey = (process.env.GENIUS_PAY_PUBLIC_KEY || (process.env as any).NEXT_PUBLIC_GENIUS_PAY_PUBLIC_KEY || FALLBACK_PUBLIC)?.trim();
    const secretKey = (process.env.GENIUS_PAY_SECRET_KEY || FALLBACK_SECRET)?.trim();

    if (!publicKey || publicKey.length < 5) {
      throw new Error(`Clé Publique ABSENTE. (Vercel env: ${Object.keys(process.env).filter(k => k.includes('GENIUS')).join(', ') || 'VIDE'}).`);
    }
    if (!secretKey || secretKey.length < 5) {
      throw new Error("Clé Secrète ABSENTE.");
    }

    // --- SUITE DE LA LOGIQUE ---
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

    const baseUrl = process.env.NEXTAUTH_URL || 'https://studenthub-mu.vercel.app';
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

    const response = await fetch('https://pay.genius.ci/api/v1/merchant/payments', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': publicKey,
        'X-API-Secret': secretKey
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error?.message || result.message || 'La passerelle de paiement a rejeté la demande.');
    }

    const geniusData = result.data;
    await prisma.transaction.update({
      where: { id: dbTransaction.id },
      data: { reference: String(geniusData.reference || geniusData.id) }
    });

    return { url: geniusData.checkout_url };
  } catch (error: any) {
    console.error('🔥 Server Action Payment Error:', error.message);
    return { error: error.message };
  }
}
