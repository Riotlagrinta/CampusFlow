import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addXP } from "@/lib/xp";
import { auth } from "@/../auth";
import fs from 'fs';
import path from 'path';

const DAILY_AI_LIMIT = 10;

// Fonction de recherche optimisée avec CACHE
async function searchWeb(query: string) {
    const cleanQuery = query.toLowerCase().trim();
    
    // 1. Vérifier si on a déjà cherché ça récemment (Cache)
    const cached = await prisma.searchCache.findUnique({ where: { query: cleanQuery } });
    if (cached) {
        // Si le cache a moins de 24h, on le réutilise
        const isFresh = (new Date().getTime() - cached.createdAt.getTime()) < 24 * 60 * 60 * 1000;
        if (isFresh) {
            console.log("Utilisation du cache pour:", cleanQuery);
            return cached.result;
        }
    }

    // 2. Sinon, faire la vraie recherche
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
            const result = data.results.map((item: any) => 
                `Titre: ${item.title}\nExtrait: ${item.content}\nLien: ${item.url}`
            ).join("\n\n");

            // Sauvegarder dans le cache pour la prochaine fois
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
    if (!session || !session.user?.email) return NextResponse.json({ reply: "Session expirée." }, { status: 401 });

    const { message, resourceId, externalLink, tempFilePath } = await req.json();
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ reply: `Utilisateur introuvable.` }, { status: 404 });

    // --- 1. LECTURE DOCUMENT ---
    let resourceContext = "";
    if (tempFilePath || externalLink || resourceId) {
        try {
            const pdf = require('pdf-parse');
            if (tempFilePath) {
                const fullTempPath = path.join(process.cwd(), 'public', tempFilePath);
                if (fs.existsSync(fullTempPath)) {
                    resourceContext = (await pdf(fs.readFileSync(fullTempPath))).text.substring(0, 10000);
                    try { fs.unlinkSync(fullTempPath); } catch(e) {}
                }
            } else if (resourceId) {
                const res = await prisma.resource.findUnique({ where: { id: resourceId } });
                if (res && res.type === 'PDF') {
                    const fp = path.join(process.cwd(), 'public', res.url);
                    if (fs.existsSync(fp)) resourceContext = (await pdf(fs.readFileSync(fp))).text.substring(0, 10000);
                }
            }
        } catch (e) {}
    }

    // --- 2. RECHERCHE WEB INTELLIGENTE ---
    let webContext = "";
    // On ne cherche sur le web que si c'est vraiment nécessaire (Actualité ou question complexe hors document)
    const needsWeb = message.toLowerCase().match(/(actu|président|météo|nouvelles|prix|cours de|qui est|togo|usa|france|monde|aujourd'hui)/) || (!resourceContext && message.length < 100);
    
    if (needsWeb) {
        webContext = await searchWeb(message);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dailyUsage = await prisma.dailyAIUsage.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      update: {},
      create: { userId: user.id, date: today },
    });

    if ((DAILY_AI_LIMIT + user.aiBonusRequests - dailyUsage.requestCount) <= 0) {
      return NextResponse.json({ reply: "Quota épuisé.", quotaExceeded: true }, { status: 429 });
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `Tu es l'IA de l'institut DEFITECH.
          DOCUMENT : ${resourceContext || "Aucun."}
          WEB : ${webContext || "Aucun."}
          
          DIRECTIVES :
          1. Priorité au DOCUMENT.
          2. Si absent, utilise le WEB.
          3. Si les deux sont absents, utilise tes connaissances générales.
          4. Cite tes sources.`
        },
        { role: "user", content: message }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
    });

    const text = completion.choices[0]?.message?.content || "";
    await prisma.dailyAIUsage.update({
      where: { id: dailyUsage.id },
      data: { requestCount: { increment: 1 } },
    });

    await addXP(user.id, 5);
    return NextResponse.json({ reply: text });

  } catch (error: any) {
    return NextResponse.json({ reply: "Erreur technique." }, { status: 500 });
  }
}
