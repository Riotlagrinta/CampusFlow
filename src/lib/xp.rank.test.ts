import { describe, expect, it, vi } from 'vitest';

// Aucune base réelle : `prisma.user.count` est remplacé par un évaluateur en mémoire qui
// comprend uniquement les opérateurs de `leaderboardUserFilter` et de `usersAheadWhere`.
type Row = { id: string; xp: number; role: string; email: string; isActive: boolean };
type Where = Record<string, unknown>;

const { state } = vi.hoisted(() => ({ state: { rows: [] as Row[] } }));

function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Where[]).some((w) => matches(row, w));
    const value = row[key as keyof Row];
    if (cond !== null && typeof cond === 'object') {
      const c = cond as Record<string, unknown>;
      if ('not' in c && value === c.not) return false;
      if ('gt' in c && !((value as number) > (c.gt as number))) return false;
      if ('lt' in c && !((value as string) < (c.lt as string))) return false;
      return true;
    }
    return value === cond;
  });
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      count: vi.fn(async ({ where }: { where: Where }) => state.rows.filter((r) => matches(r, where)).length),
    },
  },
}));
vi.mock('@/lib/rateLimit', () => ({ checkRateLimitDb: vi.fn() }));
vi.mock('@prisma/client', () => {
  class PrismaClientKnownRequestError extends Error {}
  return { Prisma: { PrismaClientKnownRequestError } };
});

import { prisma } from '@/lib/prisma';
import { AI_TUTOR_EMAIL, getUserRank, isRankedUser, leaderboardUserFilter, usersAheadWhere } from '@/lib/xp';

const user = (id: string, xp: number, extra: Partial<Row> = {}): Row => ({
  id,
  xp,
  role: 'STUDENT',
  email: `${id}@example.test`,
  isActive: true,
  ...extra,
});

describe('isRankedUser', () => {
  it('classe un étudiant actif', () => {
    expect(isRankedUser(user('a', 10))).toBe(true);
  });

  it('exclut ADMIN, le compte IA et les comptes inactifs', () => {
    expect(isRankedUser(user('a', 10, { role: 'ADMIN' }))).toBe(false);
    expect(isRankedUser(user('a', 10, { email: AI_TUTOR_EMAIL }))).toBe(false);
    expect(isRankedUser(user('a', 10, { isActive: false }))).toBe(false);
  });
});

describe('usersAheadWhere', () => {
  it('réutilise le filtre du classement et départage les égalités par id croissant', () => {
    const where = usersAheadWhere({ id: 'u2', xp: 100 });
    expect(where).toMatchObject(leaderboardUserFilter);
    expect(where.OR).toEqual([{ xp: { gt: 100 } }, { xp: 100, id: { lt: 'u2' } }]);
  });
});

describe('getUserRank', () => {
  it('renvoie null sans interroger la base pour un compte non classé', async () => {
    state.rows = [user('a', 500)];
    const count = vi.mocked(prisma.user.count);
    count.mockClear();

    expect(await getUserRank(user('adm', 9999, { role: 'ADMIN' }))).toBeNull();
    expect(await getUserRank(user('ai', 9999, { email: AI_TUTOR_EMAIL }))).toBeNull();
    expect(await getUserRank(user('off', 9999, { isActive: false }))).toBeNull();
    expect(count).not.toHaveBeenCalled();
  });

  it('est égal à la position dans le classement (xp décroissant, id croissant), égalités comprises', async () => {
    state.rows = [
      user('d', 300),
      user('b', 300),
      user('a', 500),
      user('c', 300),
      user('e', 50),
      user('f', 0),
      // Jamais classés : ils ne doivent ni apparaître ni décaler les rangs, même avec plus d'XP
      user('adm', 9000, { role: 'ADMIN' }),
      user('ai', 8000, { email: AI_TUTOR_EMAIL }),
      user('off', 7000, { isActive: false }),
    ];

    const leaderboard = state.rows
      .filter((r) => isRankedUser(r))
      .sort((x, y) => y.xp - x.xp || (x.id < y.id ? -1 : 1));
    expect(leaderboard.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);

    for (const [index, row] of leaderboard.entries()) {
      expect(await getUserRank(row)).toBe(index + 1);
    }
  });

  it('donne un rang distinct à chaque utilisateur à égalité d\'XP', async () => {
    state.rows = [user('x', 10), user('y', 10), user('z', 10)];
    const ranks = await Promise.all(state.rows.map((r) => getUserRank(r)));
    expect([...ranks].sort()).toEqual([1, 2, 3]);
  });
});
