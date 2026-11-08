import { Prisma } from '@prisma/client';
import { prisma } from '../db';

export async function audit(
  userId: string | null | undefined,
  action: string,
  entity: string,
  entityId?: string | null,
  diff?: unknown,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        diff: diff === undefined ? Prisma.JsonNull : (diff as Prisma.InputJsonValue),
      },
    });
  } catch (e) {
    console.error('Audit log yozilmadi:', e);
  }
}
