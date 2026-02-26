import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FIELDS = [
  { name: 'Génie Logiciel', code: 'GL' },
  { name: 'Réseaux et Informatique', code: 'RI' },
  { name: 'Systèmes et Réseaux', code: 'SR' },
  { name: 'Maintenance Informatique', code: 'MI' },
  { name: 'Gestion des Entreprises', code: 'GE' },
  { name: 'Communication des Entreprises', code: 'COM' },
  { name: 'Comptabilité et Gestion', code: 'CG' },
  { name: 'Secrétariat de Direction', code: 'SD' },
];

const LEVELS = [
  { name: 'Licence 1' },
  { name: 'Licence 2' },
  { name: 'Licence 3' },
];

async function main() {
  console.log('Demarrage de l initialisation...');

  // 1. Création des Filières
  const createdFields = [];
  for (const f of FIELDS) {
    let field = await prisma.field.findFirst({
        where: { OR: [{ code: f.code }, { name: f.name }] }
    });

    if (!field) {
        field = await prisma.field.create({
            data: { name: f.name, code: f.code }
        });
    } else {
        field = await prisma.field.update({
            where: { id: field.id },
            data: { name: f.name, code: f.code }
        });
    }
    createdFields.push(field);
    console.log('Filiere OK: ' + f.name);
  }

  // 2. Création des Niveaux
  const createdLevels = [];
  for (const l of LEVELS) {
    let level = await prisma.level.findFirst({ where: { name: l.name } });
    if (!level) {
      level = await prisma.level.create({ data: { name: l.name } });
    }
    createdLevels.push(level);
    console.log('Niveau OK: ' + l.name);
  }

  // 3. Ajout de quelques matières types pour le SEMESTRE 2 (Exemple pour GL L1)
  const glField = createdFields.find(f => f.code === 'GL');
  const l1Level = createdLevels.find(l => l.name === 'Licence 1');

  if (glField && l1Level) {
    const s2Subjects = [
      { name: 'Algorithmique Avancee', code: 'ALGO2', semester: 2 },
      { name: 'Base de Donnees Relationnelles', code: 'BDD', semester: 2 },
      { name: 'Programmation Orientee Objet', code: 'POO', semester: 2 },
      { name: 'Architecture des Ordinateurs', code: 'ARCHI', semester: 2 },
      { name: 'Systemes d Exploitation', code: 'OS', semester: 2 },
    ];

    for (const sub of s2Subjects) {
        const existing = await prisma.subject.findFirst({
            where: { name: sub.name, fieldId: glField.id, levelId: l1Level.id }
        });
        if (!existing) {
            await prisma.subject.create({
              data: {
                name: sub.name,
                code: sub.code,
                semester: sub.semester,
                fieldId: glField.id,
                levelId: l1Level.id,
              }
            });
            console.log('Matiere S2 OK: ' + sub.name);
        }
    }
  }

  console.log('Initialisation terminee !');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
