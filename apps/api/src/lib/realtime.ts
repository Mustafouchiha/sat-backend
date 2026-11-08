import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { prisma } from '../db';
import { env } from '../env';
import { verifyToken } from './auth';

let io: Server | null = null;

/** Duel uchun real vaqt (Socket.IO). Mijoz JWT bilan ulanadi va "duel:watch" bilan xonaga qo'shiladi. */
export function initRealtime(server: HttpServer): Server {
  io = new Server(server, {
    path: '/socket.io',
    cors: { origin: env.corsOrigins, credentials: true },
  });

  io.use((socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: string })?.token;
      if (!token) return next(new Error('unauthorized'));
      const payload = verifyToken(token);
      if (payload.scope) return next(new Error('unauthorized'));
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('duel:watch', async (duelId: unknown) => {
      if (typeof duelId !== 'string') return;
      const duel = await prisma.duel.findUnique({ where: { id: duelId }, select: { creatorId: true, opponentId: true } });
      const uid = socket.data.userId as string;
      if (!duel || (duel.creatorId !== uid && duel.opponentId !== uid && duel.opponentId !== null)) return;
      await socket.join(`duel:${duelId}`);
      const { duelSummary } = await import('./duels');
      socket.emit('duel:update', await duelSummary(duelId));
    });
    socket.on('duel:unwatch', (duelId: unknown) => {
      if (typeof duelId === 'string') void socket.leave(`duel:${duelId}`);
    });
  });
  return io;
}

export function emitToDuel(duelId: string, payload: unknown): void {
  io?.to(`duel:${duelId}`).emit('duel:update', payload);
}
