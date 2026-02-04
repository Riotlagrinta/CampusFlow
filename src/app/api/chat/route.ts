import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addXP } from "@/lib/xp";
import { auth } from "@/../auth";
import fs from 'fs';
import path from 'path';

const DAILY_AI_LIMIT = 10;

// Fonction pour rechercher sur Google (via API Google Custom Search)
async function searchWeb(query: string) {
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.GOOGLE_SEARCH_ENGINE_ID;
    
    if (!apiKey || !cx) {
        console.warn("Google Search API non configurée.");
        return "";
    }

    try {
        const res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}`);
        const data = await res.json();
        
        if (data.items && data.items.length > 0) {
            return data.items.slice(0, 3).map((item: any) => 
                `Titre: ${item.title}\nExtrait: ${item.snippet}\nLien: ${item.link}`
            ).join("\n\n");
        }
    } catch (e) {
        console.error("Erreur Google Search:", e);
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

    // --- 1. CONTEXTE DOCUMENT (Priorité 1) ---
    let resourceContext = "";
    if (tempFilePath || externalLink || resourceId) {
        try {
            const pdf = require('pdf-parse');
            if (tempFilePath) {
                const fullTempPath = path.join(process.cwd(), 'public', tempFilePath);
                if (fs.existsSync(fullTempPath)) {
                    const dataBuffer = fs.readFileSync(fullTempPath);
                    const data = await pdf(dataBuffer);
                    resourceContext = data.text.substring(0, 10000);
                    try { fs.unlinkSync(fullTempPath); } catch(e) {}
                }
            } else if (resourceId) {
                const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
                if (resource && resource.type === 'PDF') {
                    const filePath = path.join(process.cwd(), 'public', resource.url);
                    if (fs.existsSync(filePath)) {
                        const dataBuffer = fs.readFileSync(filePath);
                        const data = await pdf(dataBuffer);
                        resourceContext = data.text.substring(0, 10000);
                    }
                }
            }
        } catch (e) {}
    }

    // --- 2. RECHERCHE WEB (Priorité 2 / Renfort) ---
    // On lance la recherche si pas de document, ou si la question semble demander du web (actu, président, etc.)
    let webContext = "";
    const needsWeb = !resourceContext || message.toLowerCase().match(/(actu|président|qui est|météo|nouvelles|monde|aujourd'hui|google|internet|prix|cours)/);
    
    if (needsWeb) {
        webContext = await searchWeb(message);
    }

    // --- 3. LOGIQUE DE QUOTA ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dailyUsage = await prisma.dailyAIUsage.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      update: {},
      create: { userId: user.id, date: today, requestCount: 0 },
    });

    if ((DAILY_AI_LIMIT + user.aiBonusRequests - dailyUsage.requestCount) <= 0) {
      return NextResponse.json({ reply: "Quota épuisé.", quotaExceeded: true }, { status: 429 });
    }

    // --- 4. GENERATION REPONSE ---
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `Tu es l'IA de l'institut DEFITECH au Togo. Tu as accès à deux sources d'informations :
          
          SOURCE 1 (DOCUMENT PDF) :
          ${resourceContext ? resourceContext : "Aucun document joint."}
          
          SOURCE 2 (RECHERCHE GOOGLE EN TEMPS RÉEL) :
          ${webContext ? webContext : "Aucun résultat web trouvé."}
          
          INSTRUCTIONS :
          1. Si la réponse est dans le DOCUMENT (Source 1), utilise-le en priorité absolue.
          2. Si la réponse n'est pas dans le document ou si l'étudiant pose une question générale, utilise les RÉSULTATS WEB (Source 2).
          3. Cite tes sources (ex: "D'après le document..." ou "D'après les informations sur internet...").
          4. Sois précis et factuel.`
        },
        { role: "user", content: message }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.4,
    });

    const text = completion.choices[0]?.message?.content || "";

    await prisma.dailyAIUsage.update({
      where: { id: dailyUsage.id },
      data: { 
        requestCount: { increment: 1 },
        tokensUsed: { increment: completion.usage?.total_tokens || 0 }
      },
    });

    await addXP(user.id, 5);
    return NextResponse.json({ reply: text });

  } catch (error: any) {
    console.error("ERREUR CHAT:", error);
    return NextResponse.json({ reply: "Désolé, j'ai eu un problème technique." }, { status: 500 });
  }
}