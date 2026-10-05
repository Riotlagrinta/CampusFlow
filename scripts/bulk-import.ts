/**
 * Import en masse de documents depuis le dossier local `bulk_import/` :
 *
 *   bulk_import/[Nom_Filière]/[Nom_Niveau]/[Nom_Matière]/[fichiers]
 *
 *   npx tsx scripts/bulk-import.ts --yes
 *
 * Les fichiers sont copiés dans public/uploads (disque local) : ce script est prévu pour un
 * poste de développement. Les URL /uploads/... créées n'existent pas sur Vercel (système de
 * fichiers en lecture seule) : pour la production, importer via l'interface (Vercel Blob).
 * Refusé avec NODE_ENV=production.
 */
import { randomBytes } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import { assertSafeToRun, parseArgs } from './lib/safety';

const SOURCE_DIR = 'bulk_import';
const DEST_DIR = path.join(process.cwd(), 'public', 'uploads');

async function listDirectories(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

function detectType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'PDF';
  if (/\.(mp4|mov|avi)$/.test(lower)) return 'VIDEO';
  if (/\.(mp3|wav)$/.test(lower)) return 'AUDIO';
  return 'OTHER';
}

async function main() {
  assertSafeToRun('bulk-import', parseArgs(), `Import des fichiers de ${SOURCE_DIR}/ vers la base et public/uploads.`);

  try {
    await fs.access(SOURCE_DIR);
  } catch {
    console.error(`Le dossier '${SOURCE_DIR}' n'existe pas.`);
    console.log(`Créez-le à la racine et organisez vos fichiers ainsi : ${SOURCE_DIR}/[Nom_Filière]/[Nom_Niveau]/[Nom_Matière]/[Fichiers]`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    await fs.mkdir(DEST_DIR, { recursive: true });

    // Auteur des ressources : un ADMIN, à défaut le premier compte.
    const author =
      (await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } })) ??
      (await prisma.user.findFirst({ select: { id: true } }));
    if (!author) {
      console.error("Aucun utilisateur en base : créez un compte avant d'importer.");
      process.exit(1);
    }

    let imported = 0;
    let skipped = 0;

    for (const fieldName of await listDirectories(SOURCE_DIR)) {
      console.log(`Filière : ${fieldName}`);

      // Field.name est unique : on cherche par nom, sinon on crée avec un code libre.
      let field = await prisma.field.findUnique({ where: { name: fieldName } });
      if (!field) {
        const baseCode = fieldName.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase() || 'FIL';
        for (let attempt = 0; !field; attempt++) {
          const code = attempt === 0 ? baseCode : `${baseCode}${attempt}`;
          try {
            field = await prisma.field.create({
              data: { name: fieldName, code, description: `Filière ${fieldName}` },
            });
          } catch (error) {
            // P2002 sur `code` : déjà pris par une autre filière, on essaie un suffixe.
            if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002' || attempt > 20) throw error;
          }
        }
      }

      for (const levelName of await listDirectories(path.join(SOURCE_DIR, fieldName))) {
        console.log(`  Niveau : ${levelName}`);

        // Level.name n'est PAS unique et son id est un UUID : un upsert sur `id: levelName`
        // créait un nouveau Level à chaque exécution. On cherche par nom, puis on crée.
        const level =
          (await prisma.level.findFirst({ where: { name: levelName } })) ??
          (await prisma.level.create({ data: { name: levelName } }));

        const levelPath = path.join(SOURCE_DIR, fieldName, levelName);
        for (const subjectName of await listDirectories(levelPath)) {
          console.log(`    Matière : ${subjectName}`);

          const subject =
            (await prisma.subject.findFirst({
              where: { name: subjectName, fieldId: field.id, levelId: level.id },
            })) ??
            (await prisma.subject.create({
              data: {
                name: subjectName,
                code: subjectName.substring(0, 4).toUpperCase(),
                fieldId: field.id,
                levelId: level.id,
              },
            }));

          const subjectPath = path.join(levelPath, subjectName);
          for (const fileName of await listFiles(subjectPath)) {
            // Évite les doublons (titre + matière).
            const existing = await prisma.resource.findFirst({
              where: { title: fileName, subjectId: subject.id },
              select: { id: true },
            });
            if (existing) {
              console.log(`      Déjà existant : ${fileName}`);
              skipped++;
              continue;
            }

            const srcFilePath = path.join(subjectPath, fileName);
            const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
            const uniqueName = `${Date.now()}-${randomBytes(4).toString('hex')}-${safeName}`;
            await fs.copyFile(srcFilePath, path.join(DEST_DIR, uniqueName));

            const stats = await fs.stat(srcFilePath);
            const sizeMB = `${(stats.size / (1024 * 1024)).toFixed(2)} MB`;

            await prisma.resource.create({
              data: {
                title: fileName,
                type: detectType(fileName),
                url: `/uploads/${uniqueName}`,
                size: sizeMB,
                authorId: author.id,
                subjectId: subject.id,
                subjectName: subject.name,
                fieldId: field.id,
                levelId: level.id,
              },
            });

            console.log(`      Importé : ${fileName}`);
            imported++;
          }
        }
      }
    }

    console.log(`Import terminé : ${imported} fichier(s) importé(s), ${skipped} déjà présent(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Échec de l'import :", error instanceof Error ? error.message : error);
  process.exit(1);
});
