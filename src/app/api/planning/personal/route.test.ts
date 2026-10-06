// Non-régression : les créneaux académiques appartiennent à l'admin qui les a créés (userId). Un ADMIN dont
// le second facteur n'est pas validé (rôle effectif STUDENT) ne doit pas les modifier ni les supprimer
// sous prétexte qu'il en est « propriétaire ». Session et base simulées.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  findUnique: vi.fn(),
  deleteMany: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getAuthUser: m.getAuthUser }));
vi.mock('@/lib/xp', () => ({ awardActionXP: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    personalSchedule: { findUnique: m.findUnique, deleteMany: m.deleteMany, update: m.update },
    user: { findUnique: vi.fn(async () => ({ fieldId: null, academicLevelId: null })) },
    field: { findUnique: vi.fn(async () => ({ id: 'f1' })) },
    level: { findUnique: vi.fn(async () => ({ id: 'l1' })) },
    subject: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: 's1' })) },
  },
}));

import { DELETE, PUT } from './route';
import { DELETE as DELETE_BY_ID } from './[id]/route';

const ADMIN_ID = 'admin-1';
const academicSlot = { userId: ADMIN_ID, isAcademic: true, fieldId: 'f1', levelId: 'l1' };
const personalSlot = { userId: 'student-1', isAcademic: false, fieldId: 'f1', levelId: 'l1' };

// ADMIN dont le second facteur n'est pas validé : getAuthUser le renvoie avec le rôle effectif STUDENT.
const unverifiedAdmin = { id: ADMIN_ID, email: 'admin@exemple.com', role: 'STUDENT', mfaPending: true };
const verifiedAdmin = { id: ADMIN_ID, email: 'admin@exemple.com', role: 'ADMIN' };
const student = { id: 'student-1', email: 'etu@exemple.com', role: 'STUDENT' };

const putRequest = () =>
  new Request('https://studenthub.test/api/planning/personal', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'slot-1', day: 'Lundi', time: '08:00 - 10:00', subject: 'Algorithmique', fieldId: 'f1', levelId: 'l1', semester: 1 }),
  });
const deleteRequest = () => new Request('https://studenthub.test/api/planning/personal?id=slot-1', { method: 'DELETE' });
const deleteByIdRequest = () => new Request('https://studenthub.test/api/planning/personal/slot-1', { method: 'DELETE' });
const params = { params: Promise.resolve({ id: 'slot-1' }) };

beforeEach(() => {
  m.getAuthUser.mockReset();
  m.findUnique.mockReset();
  m.deleteMany.mockReset().mockResolvedValue({ count: 1 });
  m.update.mockReset().mockResolvedValue({ id: 'slot-1' });
});

describe('créneau académique avec un ADMIN non vérifié (rôle effectif STUDENT)', () => {
  beforeEach(() => {
    m.getAuthUser.mockResolvedValue(unverifiedAdmin);
    m.findUnique.mockResolvedValue(academicSlot);
  });

  it('PUT : refusé (403), rien n\'est modifié', async () => {
    const res = await PUT(putRequest());
    expect(res.status).toBe(403);
    expect(m.update).not.toHaveBeenCalled();
  });

  it('DELETE ?id= : refusé (403), rien n\'est supprimé', async () => {
    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(403);
    expect(m.deleteMany).not.toHaveBeenCalled();
  });

  it('DELETE /[id] : refusé (403), rien n\'est supprimé', async () => {
    const res = await DELETE_BY_ID(deleteByIdRequest(), params);
    expect(res.status).toBe(403);
    expect(m.deleteMany).not.toHaveBeenCalled();
  });
});

describe('créneau académique avec un ADMIN vérifié', () => {
  beforeEach(() => {
    m.getAuthUser.mockResolvedValue(verifiedAdmin);
    m.findUnique.mockResolvedValue(academicSlot);
  });

  it('DELETE ?id= et DELETE /[id] : autorisés', async () => {
    expect((await DELETE(deleteRequest())).status).toBe(200);
    expect((await DELETE_BY_ID(deleteByIdRequest(), params)).status).toBe(200);
    expect(m.deleteMany).toHaveBeenCalledTimes(2);
  });

  it('PUT : autorisé', async () => {
    const res = await PUT(putRequest());
    expect(res.status).toBe(200);
    expect(m.update).toHaveBeenCalledTimes(1);
  });
});

describe('créneau personnel d\'un étudiant', () => {
  it('son propriétaire peut le supprimer', async () => {
    m.getAuthUser.mockResolvedValue(student);
    m.findUnique.mockResolvedValue(personalSlot);
    expect((await DELETE(deleteRequest())).status).toBe(200);
    expect((await DELETE_BY_ID(deleteByIdRequest(), params)).status).toBe(200);
  });

  it('un autre étudiant ne le peut pas', async () => {
    m.getAuthUser.mockResolvedValue({ ...student, id: 'student-2' });
    m.findUnique.mockResolvedValue(personalSlot);
    expect((await DELETE(deleteRequest())).status).toBe(403);
    expect((await DELETE_BY_ID(deleteByIdRequest(), params)).status).toBe(403);
    expect(m.deleteMany).not.toHaveBeenCalled();
  });

  it('l\'admin vérifié peut supprimer le créneau privé d\'un étudiant (modération)', async () => {
    m.getAuthUser.mockResolvedValue(verifiedAdmin);
    m.findUnique.mockResolvedValue(personalSlot);
    expect((await DELETE(deleteRequest())).status).toBe(200);
  });

  it('l\'admin NON vérifié ne le peut plus (modération réservée à l\'admin effectif)', async () => {
    m.getAuthUser.mockResolvedValue(unverifiedAdmin);
    m.findUnique.mockResolvedValue(personalSlot);
    expect((await DELETE(deleteRequest())).status).toBe(403);
  });
});
