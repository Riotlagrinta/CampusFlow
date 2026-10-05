import { beforeEach, describe, expect, it, vi } from 'vitest';

// Aucune base : la seule lecture (filières du tronc commun GL/RIT) est simulée.
const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { field: { findMany } } }));

import { quizScopeWhere, type ScopeProfile } from '@/lib/academicScope';

const student = (overrides: Partial<ScopeProfile> = {}): ScopeProfile => ({
  role: 'STUDENT',
  fieldId: 'f-info',
  academicLevelId: 'l-1',
  ...overrides,
});

// Aplatit le filtre Prisma en JSON pour l'inspecter simplement.
const dump = (where: unknown) => JSON.stringify(where);

describe('quizScopeWhere', () => {
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([{ id: 'f-gl' }, { id: 'f-rit' }]);
  });

  it('administrateur : tout, sans filtre de périmètre', async () => {
    expect(await quizScopeWhere(student({ role: 'ADMIN' }))).toEqual({});
  });

  it('administrateur avec semestre : matière, à défaut ressource, quiz historiques toujours visibles', async () => {
    expect(await quizScopeWhere(student({ role: 'ADMIN' }), 1)).toEqual({
      AND: [
        {
          OR: [
            { subject: { semester: 1 } },
            { subjectId: null, resource: { semester: 1 } },
            { subjectId: null, resourceId: null },
          ],
        },
      ],
    });
  });

  it('étudiant : la matière ET la ressource doivent correspondre à sa filière et son niveau', async () => {
    const where = await quizScopeWhere(student());
    expect(where).toEqual({
      AND: [
        { OR: [{ subjectId: null }, { subject: { fieldId: { in: ['f-info'] }, levelId: 'l-1' } }] },
        {
          OR: [
            { resourceId: null },
            {
              resource: {
                OR: [{ fieldId: { in: ['f-info'] }, levelId: 'l-1' }, { fieldId: null, levelId: null }],
              },
            },
          ],
        },
      ],
    });
  });

  it('un quiz sans matière rattaché à une ressource n’est plus visible de toutes les filières', async () => {
    const where = dump(await quizScopeWhere(student()));
    // Plus de branche « sans matière » inconditionnelle : toujours couplée au contrôle de la ressource.
    expect(where).toContain('"resourceId":null');
    expect(where).toContain('"resource":{"OR"');
  });

  it('tronc commun GL/RIT : les deux filières sont visibles', async () => {
    const where = dump(await quizScopeWhere(student({ fieldId: 'f-gl' })));
    expect(where).toContain('"in":["f-gl","f-rit"]');
  });

  it('étudiant avec semestre : le semestre porte sur la matière, à défaut la ressource', async () => {
    const where = await quizScopeWhere(student(), 2);
    expect(where).toMatchObject({
      AND: [
        expect.anything(),
        expect.anything(),
        {
          OR: [
            { subject: { semester: 2 } },
            { subjectId: null, resource: { semester: 2 } },
            { subjectId: null, resourceId: null },
          ],
        },
      ],
    });
  });

  it('compte sans filière ou sans niveau : quiz historiques et ressources publiques seulement', async () => {
    for (const profile of [student({ fieldId: null }), student({ academicLevelId: null })]) {
      const where = await quizScopeWhere(profile);
      expect(where).toEqual({
        AND: [
          { subjectId: null },
          { OR: [{ resourceId: null }, { resource: { OR: [{ fieldId: null, levelId: null }] } }] },
        ],
      });
    }
  });
});
