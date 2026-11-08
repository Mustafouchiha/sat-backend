import { prisma } from '../db';
import { hasRole, type AuthUser } from './auth';
import { forbidden, notFound } from './http';

/** Operator/admin — har qanday guruh; o'qituvchi — faqat o'zi biriktirilgan guruh. */
export async function assertGroupAccess(user: AuthUser, groupId: string): Promise<void> {
  if (hasRole(user, 'OPERATOR')) {
    const g = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true } });
    if (!g) throw notFound('Guruh');
    return;
  }
  const m = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: user.id } } });
  if (!m || m.role !== 'TEACHER') throw forbidden('Bu guruhga ruxsatingiz yo\'q');
}

/** O'qituvchi o'quvchini ko'ra oladimi (umumiy guruh orqali)? */
export async function canViewStudent(user: AuthUser, studentId: string): Promise<boolean> {
  if (user.id === studentId) return true;
  if (hasRole(user, 'OPERATOR')) return true;
  if (!hasRole(user, 'TEACHER')) return false;
  const shared = await prisma.groupMember.findFirst({
    where: {
      userId: studentId,
      group: { members: { some: { userId: user.id, role: 'TEACHER' } } },
    },
    select: { groupId: true },
  });
  return !!shared;
}

export async function assertStudentAccess(user: AuthUser, studentId: string): Promise<void> {
  if (!(await canViewStudent(user, studentId))) throw forbidden("Bu o'quvchini ko'rishga ruxsatingiz yo'q");
}
