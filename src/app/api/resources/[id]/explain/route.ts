import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const pdf = require('pdf-parse');
    const { id } = await params;

    // 1. Récupérer la ressource
    const resource = await prisma.resource.findUnique({ where: { id } });
    if (!resource || resource.type !== 'PDF') {
      return NextResponse.json({ error: 'Fichier PDF non trouvé' }, { status: 404 });
    }

    // 2. Lire le fichier
    const filePath = path.join(process.cwd(), 'public', resource.url);
    const dataBuffer = fs.readFileSync(filePath);

    // 3. Extraire le texte
    const pdfData = await pdf(dataBuffer);
    const fullText = pdfData.text.substring(0, 15000); // Limite pour le prompt

    // 4. Utiliser Gemini pour expliquer
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    const genAI = new GoogleGenerativeAI(apiKey || "");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Tu es un professeur expert à DEFITECH. Explique de manière claire, concise et pédagogique le contenu de ce document de cours pour un étudiant en Génie Logiciel. 
    Utilise du Markdown pour structurer ta réponse (titres, listes, gras).
    Document : ${resource.title}
    
    Contenu du texte :
    ${fullText}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const explanation = response.text();

    return NextResponse.json({ explanation });
  } catch (error) {
    console.error('Erreur Explication IA:', error);
    return NextResponse.json({ error: 'Échec de l\'explication IA' }, { status: 500 });
  }
}
