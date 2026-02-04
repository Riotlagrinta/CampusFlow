import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addXP } from "@/lib/xp";
import { auth } from "@/../auth";
import fs from 'fs';
import path from 'path';

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
            const result = data.results.map((item: any) => `Titre: ${item.title}
Info: ${item.content}
Lien: ${item.url}`).join("\n\n");
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

    const { message, resourceId, externalLink, tempFilePath, history } = await req.json();
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ reply: `Utilisateur introuvable.` }, { status: 404 });

    // --- 1. DETECTION SALUTATION (Économie de crédits) ---
    const isGreeting = message.toLowerCase().trim().match(/^(bonjour|salut|hello|hi|hey|ça va|ca va|cc|coucou|merci|thanks|ok|d'accord|dac)$/i);

    // --- 2. LECTURE DOCUMENT ---
    let resourceContext = "";
    if (!isGreeting && (tempFilePath || externalLink || resourceId)) {
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

    // --- 3. RECHERCHE WEB (Seulement si nécessaire) ---
    let webContext = "";
    const needsWeb = !isGreeting && (
        message.toLowerCase().match(/(actu|président|météo|nouvelles|prix|cours de|qui est|togo|usa|france|monde|aujourd'hui)/) ||
        (message.split(' ').length > 4 && !resourceContext) // Plus de 4 mots et pas de doc
    );
    
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
    
    // Construction de la mémoire de conversation
    const messages = [
        {
          role: "system",
          content: `Tu es l'IA de l'institut DEFITECH au Togo. Tu es amical, professionnel et pédagogique.
          ${resourceContext ? `DOCUMENT : ${resourceContext}` : ""}
          ${webContext ? `INTERNET : ${webContext}` : ""}
          
          DIRECTIVES :
          1. Si l'étudiant te salue, réponds-lui poliment et propose ton aide.
          2. Utilise le DOCUMENT en priorité.
          3. Utilise INTERNET pour l'actualité ou les faits précis absents du document.
          4. Reste concis et clair.`
        },
        ...(history || []),
        { role: "user", content: message }
    ];

    const completion = await groq.chat.completions.create({
      messages: messages,
      model: "llama-3.3-70b-versatile",
      temperature: 0.5,
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