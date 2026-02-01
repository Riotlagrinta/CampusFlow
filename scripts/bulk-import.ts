
import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

// Configuration
const SOURCE_DIR = 'bulk_import';
const DEST_DIR = path.join(process.cwd(), 'public', 'uploads');

async function main() {
  console.log('🚀 Démarrage du script d\'importation de masse...');

  // 1. Vérifier le dossier source
  try {
    await fs.access(SOURCE_DIR);
  } catch {
    console.error(`❌ Le dossier '${SOURCE_DIR}' n'existe pas.`);
    console.log(`👉 Créez un dossier '${SOURCE_DIR}' à la racine et organisez vos fichiers ainsi :`);
    console.log(`   ${SOURCE_DIR}/[Nom_Filière]/[Nom_Niveau]/[Nom_Matière]/[Fichiers]`);
    process.exit(1);
  }

  // 2. Créer le dossier de destination si besoin
  await fs.mkdir(DEST_DIR, { recursive: true });

  // 3. Trouver un admin pour être l\'auteur
  let admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) {
    console.log('⚠️ Aucun ADMIN trouvé. Utilisation du premier utilisateur comme auteur.');
    admin = await prisma.user.findFirst();
  }
  if (!admin) {
    console.error('❌ Aucun utilisateur trouvé dans la base. Lancez le site et créez un compte d\'abord.');
    process.exit(1);
  }

  console.log(`👤 Auteur assigné : ${admin.firstName} ${admin.lastName}`);

  // 4. Parcourir les dossiers
  const fields = await fs.readdir(SOURCE_DIR);

  for (const fieldName of fields) {
    const fieldPath = path.join(SOURCE_DIR, fieldName);
    const fieldStat = await fs.stat(fieldPath);
    if (!fieldStat.isDirectory()) continue;

    console.log(`
📂 Traitement de la filière : ${fieldName}`);

    // Créer/Récupérer la filière
    // Code généré : GL pour Génie Logiciel
    const fieldCode = fieldName.substring(0, 3).toUpperCase();
    const field = await prisma.field.upsert({
      where: { name: fieldName },
      update: {},
      create: { name: fieldName, code: fieldCode, description: `Filière ${fieldName}` }
    });

    const levels = await fs.readdir(fieldPath);
    for (const levelName of levels) {
      const levelPath = path.join(fieldPath, levelName);
      const levelStat = await fs.stat(levelPath);
      if (!levelStat.isDirectory()) continue;

      console.log(`  └─ 🎓 Niveau : ${levelName}`);

      // Créer/Récupérer le niveau
      const level = await prisma.level.upsert({
        where: { id: levelName }, // Hack si l\'ID n\'est pas le nom, on utilise findFirst logic normalement mais ici upsert requires unique.
        // Le schema a id UUID. Upsert sur non-unique "name" est impossible directement sans @unique.
        // On va faire findFirst puis create.
        update: {},
        create: { name: levelName }
      }).catch(async () => {
         // Fallback manuel si upsert échoue (car name n\'est pas unique dans le schema fourni ?)
         // Le schema montre: Level { id (uuid), name (String) }. Name n\'est pas unique.
         // Donc upsert ne marche pas sur name.
         let l = await prisma.level.findFirst({ where: { name: levelName } });
         if (!l) l = await prisma.level.create({ data: { name: levelName } });
         return l;
      });
      
      // Correction propre pour le Level (car upsert sur 'name' impossible si pas @unique)
      // J\'ai mis un catch block ci-dessus mais le code clean est :
      let dbLevel = await prisma.level.findFirst({ where: { name: levelName } });
      if (!dbLevel) {
          dbLevel = await prisma.level.create({ data: { name: levelName } });
      }

      const subjects = await fs.readdir(levelPath);
      for (const subjectName of subjects) {
        const subjectPath = path.join(levelPath, subjectName);
        const subjectStat = await fs.stat(subjectPath);
        if (!subjectStat.isDirectory()) continue;

        console.log(`     └─ 📚 Matière : ${subjectName}`);

        // Créer/Récupérer la matière
        let dbSubject = await prisma.subject.findFirst({
            where: {
                name: subjectName,
                fieldId: field.id,
                levelId: dbLevel.id
            }
        });

        if (!dbSubject) {
            dbSubject = await prisma.subject.create({
                data: {
                    name: subjectName,
                    code: subjectName.substring(0, 4).toUpperCase(),
                    fieldId: field.id,
                    levelId: dbLevel.id
                }
            });
        }

        // Traiter les fichiers
        const files = await fs.readdir(subjectPath);
        for (const fileName of files) {
           const srcFilePath = path.join(subjectPath, fileName);
           if ((await fs.stat(srcFilePath)).isDirectory()) continue;

           // Eviter doublons (check par titre et matière)
           const existingRes = await prisma.resource.findFirst({
               where: {
                   title: fileName,
                   subjectId: dbSubject.id
               }
           });

           if (existingRes) {
               console.log(`        ⚠️  Déjà existant : ${fileName}`);
               continue;
           }

           // Copie physique
           const uniqueName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
           const destFilePath = path.join(DEST_DIR, uniqueName);
           
           await fs.copyFile(srcFilePath, destFilePath);
           
           // Type MIME simple
           let type = 'OTHER';
           if (fileName.endsWith('.pdf')) type = 'PDF';
           else if (fileName.match(/\.(mp4|mov|avi)$/)) type = 'VIDEO';
           else if (fileName.match(/\.(mp3|wav)$/)) type = 'AUDIO';

           // Taille fichier
           const stats = await fs.stat(srcFilePath);
           const sizeMB = (stats.size / (1024 * 1024)).toFixed(2) + ' MB';

           // DB Insert
           await prisma.resource.create({
               data: {
                   title: fileName,
                   type: type,
                   url: `/uploads/${uniqueName}`,
                   size: sizeMB,
                   authorId: admin.id,
                   subjectId: dbSubject.id,
                   subjectName: dbSubject.name,
                   fieldId: field.id,
                   levelId: dbLevel.id
               }
           });

           console.log(`        ✅ Importé : ${fileName}`);
        }
      }
    }
  }

  console.log('\n✨ Importation terminée avec succès !');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
