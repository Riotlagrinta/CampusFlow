import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const { FedaPay, Transaction: FedaTransaction } = require('fedapay');

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const transactionId = searchParams.get('transactionId');
    const status = searchParams.get('status'); // Envoyé par le redirect FedaPay

    if (!transactionId) return NextResponse.redirect(new URL('/profile?error=invalid_transaction', req.url));

    // 1. Récupérer la transaction dans notre base
    const dbTransaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
        include: { user: true }
    });

    if (!dbTransaction || dbTransaction.status === 'COMPLETED') {
        return NextResponse.redirect(new URL('/profile', req.url));
    }

    // 2. Si FedaPay nous dit que c'est annulé ou autre
    if (status !== 'approved') {
        await prisma.transaction.update({
            where: { id: transactionId },
            data: { status: 'FAILED' }
        });
        return NextResponse.redirect(new URL('/profile?error=payment_failed', req.url));
    }

    // 3. VERIFICATION DE SECURITE : On demande à FedaPay le statut RÉEL de la transaction
    FedaPay.setApiKey(process.env.FEDAPAY_SECRET_KEY);
    FedaPay.setEnvironment(process.env.NODE_ENV === 'production' ? 'live' : 'sandbox');

    try {
        const fedaTx = await FedaTransaction.retrieve(dbTransaction.reference);
        
        // On vérifie que FedaPay confirme le paiement ('approved') 
        // et que le montant correspond bien à ce qu'on a en base
        if (fedaTx.status === 'approved' && Number(fedaTx.amount) === dbTransaction.amount) {
            
            // 4. TOUT EST OK : On crédite les jetons
            await prisma.$transaction([
                prisma.user.update({
                    where: { id: dbTransaction.userId },
                    data: { aiBonusRequests: { increment: dbTransaction.tokens } }
                }),
                prisma.transaction.update({
                    where: { id: transactionId },
                    data: { status: 'COMPLETED' }
                })
            ]);

            return NextResponse.redirect(new URL('/profile?success=payment_complete', req.url));
        }
    } catch (e) {
        console.error("Erreur vérification FedaPay:", e);
    }

    return NextResponse.redirect(new URL('/profile?error=verification_failed', req.url));
  } catch (error) {
    console.error('Erreur Callback Global:', error);
    return NextResponse.redirect(new URL('/profile?error=server_error', req.url));
  }
}