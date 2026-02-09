import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { auth } from "@/../auth";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Dossier temporaire sécurisé
    const tempDir = path.join(process.cwd(), "public", "uploads", "temp");
    await mkdir(tempDir, { recursive: true });

    // Nom de fichier unique pour éviter les collisions
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const filePath = path.join(tempDir, uniqueName);

    await writeFile(filePath, buffer);

    // On renvoie le chemin RELATIF pour que l'API chat puisse le retrouver
    // Note: On force les '/' pour la compatibilité Windows/Web
    return NextResponse.json({ 
        tempPath: `uploads/temp/${uniqueName}`,
        originalName: file.name
    });

  } catch (error) {
    console.error("Erreur upload temp:", error);
    return NextResponse.json({ error: "Échec de l'upload" }, { status: 500 });
  }
}
