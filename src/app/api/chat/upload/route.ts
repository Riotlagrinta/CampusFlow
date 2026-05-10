import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { auth } from "@/../auth";
import { randomBytes } from "crypto";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = ['application/pdf'];
// Magic bytes PDF : %PDF-
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D]);

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
    }

    // Vérification taille
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 10 MB)" }, { status: 400 });
    }

    // Vérification MIME déclarée
    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json({ error: "Seuls les fichiers PDF sont acceptés" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // MEDIUM FIX: vérification des magic bytes pour confirmer que c'est bien un PDF,
    // même si le MIME déclaré par le client est falsifié.
    if (!buffer.subarray(0, 5).equals(PDF_MAGIC)) {
      return NextResponse.json({ error: "Le fichier n'est pas un PDF valide" }, { status: 400 });
    }

    const isProd = process.env.NODE_ENV === 'production';
    const tempDir = isProd ? "/tmp" : path.join(process.cwd(), "public", "uploads", "temp");
    await mkdir(tempDir, { recursive: true });

    // Nom entièrement aléatoire — aucune info du fichier original dans le nom
    const uniqueName = `${randomBytes(16).toString('hex')}.pdf`;
    const filePath = path.join(tempDir, uniqueName);

    await writeFile(filePath, buffer);

    return NextResponse.json({
      tempPath: isProd ? filePath : `uploads/temp/${uniqueName}`,
      originalName: file.name
    });

  } catch (error) {
    console.error("Erreur upload temp:", error);
    return NextResponse.json({ error: "Échec de l'upload" }, { status: 500 });
  }
}
