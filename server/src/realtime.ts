import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import { guestFromCookieHeader, telaoFromCookieHeader } from './auth.js';

interface GuestLite {
  id: string;
  name: string;
}

const ROOM = 'galera';
let io: Server | null = null;
/** guestId → número de conexões abertas */
const online = new Map<string, number>();

export function setupRealtime(app: FastifyInstance): void {
  io = new Server(app.server, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  io.use((socket, next) => {
    const header = socket.handshake.headers.cookie;
    const guest = guestFromCookieHeader(app, header);
    const telao = !guest && telaoFromCookieHeader(app, header);
    if (!guest && !telao) return next(new Error('unauthorized'));
    socket.data.guest = guest ? ({ id: guest.id, name: guest.name } satisfies GuestLite) : null;
    next();
  });

  io.on('connection', (socket) => {
    const guest = socket.data.guest as GuestLite | null;
    socket.join(ROOM);

    if (guest) {
      online.set(guest.id, (online.get(guest.id) ?? 0) + 1);
      broadcastPresence();
    } else {
      socket.emit('presence', presencePayload());
    }

    socket.on('typing', () => {
      if (guest) socket.to(ROOM).emit('typing', { guestId: guest.id, name: guest.name });
    });

    socket.on('disconnect', () => {
      if (!guest) return;
      const n = (online.get(guest.id) ?? 1) - 1;
      if (n <= 0) online.delete(guest.id);
      else online.set(guest.id, n);
      broadcastPresence();
    });
  });

  app.addHook('onClose', async () => {
    await io?.close();
  });
}

function presencePayload() {
  return { count: online.size, guestIds: [...online.keys()] };
}

function broadcastPresence(): void {
  io?.to(ROOM).emit('presence', presencePayload());
}

/** Envia um evento para todos os conectados (convidados e telão). */
export function broadcast(event: string, payload: unknown): void {
  io?.to(ROOM).emit(event, payload);
}

export function onlineGuestIds(): string[] {
  return [...online.keys()];
}
