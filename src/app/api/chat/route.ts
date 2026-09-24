import { chatCompletionWithRotation } from "@/lib/ai";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addXP } from "@/lib/xp";
import { auth } from "@/../auth";
import fs from 'fs';
import path from 'path';
import { sendPushNotification } from "@/lib/notifications";

const DAILY_AI_LIMIT = 10;

async function searchWeb(query: string) {
    const cleanQuery = query.toLowerCase().trim();
    const cached = await prisma.searchCache.findUnique({ where: { query: cleanQuery } });
    if (cached) {
        const isFresh = (new Date().getTime() - cached.createdAt.getTime()) < 24 * 60 * 60 * 1000;
        if (isFresh) return cached.result;
    }

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return "";

    try {
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: apiKey,
                query: query,
                search_depth: "basic",
                max_results: 3
            })
        });
        const data = await res.json();
        if (data.results && data.results.length > 0) {
            const result = data.results.map((item: any) => `Titre: ${item.title}\nInfo: ${item.content}\nLien: ${item.url}`).join("\n\n");
            await prisma.searchCache.upsert({
                where: { query: cleanQuery },
                update: { result, createdAt: new Date() },
                create: { query: cleanQuery, result }
            });
            return result;
        }
    } catch (e) {
        console.error("Erreur Tavily:", e);
    }
    return "";
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        const body = await req.json();
        const { message, resourceId, externalLink, tempFilePath, history } = body;

        // SECURITY: on ne fait plus jamais confiance à un email fourni dans le corps de la
        // requête (cela permettait une usurpation totale d'identité et un vol de quota IA).
        // Seule une session NextAuth vérifiée, ou le header x-user-email (fixé exclusivement
        // par le middleware après vérification de session/JWT), font foi.
        const emailFromHeader = req.headers.get("x-user-email");
        const email = emailFromHeader || session?.user?.email;

        if (!email) return NextResponse.json({ reply: "Session expirée ou identification requise." }, { status: 401 });

        // Récupérer l'utilisateur avec ses relations pour personnaliser l'IA
        const user = await prisma.user.findUnique({
            where: { email: email as string },
            include: { field: true, academicLevel: true }
        });
        if (!user) return NextResponse.json({ reply: `Utilisateur introuvable.` }, { status: 404 });

        console.log(`🤖 Chat Init: ${email} (${user.firstName})`);

        // --- 1. DETECTION SALUTATION ---
        const isGreeting = message.toLowerCase().trim().match(/^(bonjour|salut|hello|hi|hey|ça va|ca va|cc|coucou|merci|thanks|ok|d'accord|dac)$/i);

        // --- 2. LECTURE DOCUMENT (CONSERVÉE) ---
        let resourceContext = "";
        if (!isGreeting && (tempFilePath || externalLink || resourceId)) {
            try {
                const pdf = require('pdf-parse');
                if (tempFilePath) {
                    // SECURITY: le client ne doit jamais pouvoir dicter un chemin de fichier
                    // arbitraire (path traversal / lecture de fichier arbitraire). On ignore
                    // toute arborescence fournie par le client — seul le nom du fichier (le
                    // token aléatoire généré par /api/chat/upload) est retenu — puis on
                    // vérifie que le chemin résolu reste bien contenu dans le dossier
                    // temporaire attendu avant toute lecture.
                    const isProd = process.env.NODE_ENV === 'production';
                    const tempDir = path.resolve(isProd ? "/tmp" : path.join(process.cwd(), 'public', 'uploads', 'temp'));
                    const safeName = path.basename(String(tempFilePath));
                    const isValidToken = /^[a-f0-9]{32}\.pdf$/i.test(safeName);
                    const fullTempPath = path.resolve(tempDir, safeName);
                    const isContained = fullTempPath === tempDir || fullTempPath.startsWith(tempDir + path.sep);

                    if (isValidToken && isContained && fs.existsSync(fullTempPath)) {
                        const dataBuffer = fs.readFileSync(fullTempPath);
                        const pdfData = await pdf(dataBuffer);
                        resourceContext = pdfData.text.substring(0, 10000);
                        try { fs.unlinkSync(fullTempPath); } catch (e) { }
                    }
                } else if (resourceId) {
                    const res = await prisma.resource.findUnique({ where: { id: resourceId } });
                    if (res && res.type === 'PDF') {
                        // SECURITY (IDOR) : vérifier que la ressource appartient bien à la
                        // filière/niveau de l'utilisateur (ou est publique/tronc commun),
                        // comme le fait déjà GET /api/resources. Les ADMIN passent toujours.
                        let allowed = user.role === 'ADMIN';
                        if (!allowed) {
                            const isShared = res.fieldId === null && res.levelId === null;
                            let fieldFilter: string | { in: string[] } | null = user.fieldId;
                            if (user.fieldId) {
                                const userField = await prisma.field.findUnique({ where: { id: user.fieldId } });
                                if (userField?.code === 'GL' || userField?.code === 'RIT') {
                                    const sharedFields = await prisma.field.findMany({
                                        where: { code: { in: ['GL', 'RIT'] } },
                                        select: { id: true }
                                    });
                                    fieldFilter = { in: sharedFields.map(f => f.id) };
                                }
                            }
                            const fieldMatches = fieldFilter && typeof fieldFilter === 'object'
                                ? !!res.fieldId && fieldFilter.in.includes(res.fieldId)
                                : res.fieldId === fieldFilter;
                            allowed = isShared || (fieldMatches && res.levelId === user.academicLevelId);
                        }

                        if (allowed) {
                            const relativePath = res.url.startsWith('/') ? res.url.slice(1) : res.url;
                            const fp = path.join(process.cwd(), 'public', relativePath);
                            if (fs.existsSync(fp)) {
                                const pdfData = await pdf(fs.readFileSync(fp));
                                resourceContext = pdfData.text.substring(0, 10000);
                            }
                        }
                    }
                }
            } catch (e) { console.error("Erreur PDF:", e); }
        }

        // --- 3. RECHERCHE WEB (AMÉLIORÉE) ---
        let webContext = "";
        if (!isGreeting && message.length > 10 && !resourceContext) {
            webContext = await searchWeb(message);
        }

        // --- 4. GESTION QUOTA ---
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dailyUsage = await prisma.dailyAIUsage.upsert({
            where: { userId_date: { userId: user.id, date: today } },
            update: {},
            create: { userId: user.id, date: today },
        });

        const remainingFree = Math.max(0, DAILY_AI_LIMIT - dailyUsage.requestCount);
        const totalAvailable = remainingFree + user.aiBonusRequests;

        if (totalAvailable <= 0) {
            return NextResponse.json({
                reply: "Désolé, vous avez épuisé votre quota gratuit et vos jetons bonus. Rechargez votre compte dans la boutique pour continuer à utiliser l'IA !",
                quotaExceeded: true
            }, { status: 429 });
        }

        // --- 5. DÉDUCTION PRÉVENTIVE DES CRÉDITS (ATOMICITÉ) ---
        // On déduit avant l'appel API pour éviter que l'utilisateur lance 10 requêtes en même temps
        if (dailyUsage.requestCount >= DAILY_AI_LIMIT) {
            await prisma.user.update({
                where: { id: user.id },
                data: { aiBonusRequests: { decrement: 1 } }
            });
        }
        
        await prisma.dailyAIUsage.update({
            where: { id: dailyUsage.id },
            data: { requestCount: { increment: 1 } },
        });

        const messages = [
            {
                role: "system",
                content: `Tu es le Tuteur IA Expert de l'institut DEFITECH (Lomé, Togo). 
          
          PROFIL DE L'ÉTUDIANT :
          - Prénom : ${user.firstName || 'Étudiant'}
          - Filière : ${user.field?.name || 'Générale'}
          - Niveau : ${user.academicLevel?.name || 'L1'}
          - Semestre : 2 (Session actuelle)

          CONTEXTE :
          ${resourceContext ? `📄 DOCUMENT (PRIORITÉ) :\n${resourceContext}\n---` : ""}
          ${webContext ? `🌐 WEB (INFO RÉCENTE) :\n${webContext}\n---` : ""}

          DIRECTIVES PÉDAGOGIQUES :
          1. Adresses-toi à l'étudiant par son prénom (${user.firstName}).
          2. Sois concis, précis et académique. Utilise le Markdown.
          3. Pour le code, fournis des explications ligne par ligne.
          4. Encourage l'étudiant dans sa réussite à DEFITECH.`
            },
            ...(history || []).slice(-10), // Garder les 10 derniers messages pour la mémoire
            { role: "user", content: message }
        ];

        const completion = await chatCompletionWithRotation({
            messages: messages,
            temperature: 0.6,
        });

        const text = completion.choices[0]?.message?.content || "Je n'ai pas pu générer de réponse.";

        // PUSH NOTIFICATION QUOTA BAS
        const finalRemaining = totalAvailable - 1;
        if (finalRemaining === 2 && user.pushToken) {
            await sendPushNotification(user.pushToken, "Quota IA presque épuisé", "Il ne vous reste plus que 2 requêtes IA gratuites. Pensez à recharger !");
        }

        await addXP(user.id, 5);
        return NextResponse.json({ reply: text });

    } catch (error: any) {
        console.error("Crash Chat:", error);
        return NextResponse.json({ reply: "Désolé, mon système rencontre une difficulté technique." }, { status: 500 });
    }
}
