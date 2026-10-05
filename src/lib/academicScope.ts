import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

// Les filières GL et RIT partagent leurs contenus (même règle que les ressources).
const SHARED_FIELD_CODES = ['GL', 'RIT'];

export type ScopeProfile = {
  role: string;
  fieldId: string | null;
  academicLevelId: string | null;
};

export async function getScopeProfile(userId: string): Promise<ScopeProfile | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, fieldId: true, academicLevelId: true },
  });
}

/** Filières dont l'utilisateur peut voir les contenus (vide si aucune filière renseignée). */
export async function visibleFieldIds(fieldId: string | null): Promise<string[]> {
  if (!fieldId) return [];
  const shared = (
    await prisma.field.findMany({ where: { code: { in: SHARED_FIELD_CODES } }, select: { id: true } })
  ).map(f => f.id);
  return shared.includes(fieldId) ? shared : [fieldId];
}

/**
 * Questions du forum visibles : celles de sa filière et de son niveau, plus les questions
 * générales (sans filière / sans niveau). Un compte sans filière ne voit que le général.
 * Les administrateurs voient tout.
 */
export async function questionScopeWhere(profile: ScopeProfile): Promise<Prisma.QuestionWhereInput> {
  if (profile.role === 'ADMIN') return {};

  const fieldIds = await visibleFieldIds(profile.fieldId);
  return {
    AND: [
      { OR: [{ fieldId: null }, ...(fieldIds.length ? [{ fieldId: { in: fieldIds } }] : [])] },
      { OR: [{ levelId: null }, ...(profile.academicLevelId ? [{ levelId: profile.academicLevelId }] : [])] },
    ],
  };
}

/**
 * Quiz accessibles. Le périmètre d'un quiz vient de sa matière (`subject`) et/ou de sa ressource
 * d'origine (`resource`, cas des quiz générés par l'IA, dont la ressource n'a pas de matière) :
 *  - matière renseignée : elle doit correspondre à la filière et au niveau de l'utilisateur ;
 *  - ressource renseignée : elle doit être visible comme dans la liste des ressources (même
 *    filière et même niveau, tronc commun GL/RIT inclus, ou ressource publique sans filière
 *    ni niveau) ;
 *  - quiz historique sans matière NI ressource (importé avant ce rattachement) : visible de
 *    tous, car rien ne permet de le situer dans une filière. À rattacher à une matière pour
 *    le restreindre.
 * `semester` s'applique à la matière, à défaut à la ressource ; les quiz historiques restent
 * visibles quel que soit le semestre. Un compte sans filière ou sans niveau ne voit que les
 * quiz historiques et ceux de ressources publiques. Les administrateurs voient tout.
 */
export async function quizScopeWhere(
  profile: ScopeProfile,
  semester?: number
): Promise<Prisma.QuizWhereInput> {
  const bySemester: Prisma.QuizWhereInput[] = semester
    ? [
        {
          OR: [
            { subject: { semester } },
            { subjectId: null, resource: { semester } },
            { subjectId: null, resourceId: null },
          ],
        },
      ]
    : [];

  if (profile.role === 'ADMIN') return bySemester.length ? { AND: bySemester } : {};

  const fieldIds = await visibleFieldIds(profile.fieldId);
  const levelId = profile.academicLevelId;
  const hasClass = fieldIds.length > 0 && !!levelId;

  const subjectScope: Prisma.QuizWhereInput = hasClass
    ? { OR: [{ subjectId: null }, { subject: { fieldId: { in: fieldIds }, levelId } }] }
    : { subjectId: null };

  const resourceScope: Prisma.QuizWhereInput = {
    OR: [
      { resourceId: null },
      {
        resource: {
          OR: [
            ...(hasClass ? [{ fieldId: { in: fieldIds }, levelId }] : []),
            { fieldId: null, levelId: null },
          ],
        },
      },
    ],
  };

  return { AND: [subjectScope, resourceScope, ...bySemester] };
}
