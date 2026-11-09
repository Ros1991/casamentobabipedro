import { create } from 'zustand';
import { api, ApiError } from './lib/api';
import { firstName } from './lib/format';
import { showLocalNotification, unsubscribePush } from './lib/push';
import { disconnectSocket, getSocket } from './lib/socket';
import type {
  AppConfig,
  EnterPayload,
  EventItem,
  EventPayload,
  GuestMe,
  GuestPublic,
  Message,
  Photo,
  Reaction,
  RsvpStatus,
  StayInput,
} from './lib/types';

type AuthStatus = 'loading' | 'anon' | 'authed';

interface MeResponse {
  guest: GuestMe;
  isAdmin: boolean;
}

export interface ProfilePatch extends Partial<StayInput> {
  name?: string;
  arrivalDate?: string | null;
  departureDate?: string | null;
  companions?: string[];
  showPhone?: boolean;
}

interface State {
  config: AppConfig | null;
  authStatus: AuthStatus;
  me: GuestMe | null;
  isAdmin: boolean;

  guests: Record<string, GuestPublic>;
  guestsLoaded: boolean;
  online: string[];

  messages: Message[];
  messagesLoaded: boolean;
  hasMoreMessages: boolean;
  loadingOlder: boolean;

  photos: Photo[];
  photosLoaded: boolean;

  events: EventItem[];
  eventsLoaded: boolean;

  typing: Record<string, { name: string; until: number }>;
  unreadMural: number;
  muralActive: boolean;
  socketConnected: boolean;

  loadConfig: () => Promise<AppConfig>;
  loadMe: () => Promise<void>;
  enter: (payload: EnterPayload) => Promise<{ returning: boolean }>;
  logout: () => Promise<void>;
  updateMe: (patch: ProfilePatch) => Promise<void>;
  uploadAvatar: (file: Blob) => Promise<void>;
  removeAvatar: () => Promise<void>;

  loadGuests: () => Promise<void>;
  loadMessages: () => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  deleteMessage: (id: number) => Promise<void>;
  deletePhoto: (id: string) => Promise<void>;
  toggleReaction: (messageId: number, emoji: string) => Promise<Reaction[]>;
  loadPhotos: () => Promise<void>;
  addMessageLocally: (message: Message) => void;

  loadEvents: () => Promise<void>;
  createEvent: (payload: EventPayload) => Promise<EventItem>;
  updateEvent: (id: string, payload: Partial<EventPayload>) => Promise<EventItem>;
  deleteEvent: (id: string) => Promise<void>;
  setRsvp: (eventId: string, status: RsvpStatus | 'none', peopleCount?: number) => Promise<void>;

  setMuralActive: (active: boolean) => void;
  connectSocket: () => void;
  emitTyping: () => void;
  refreshAll: () => Promise<void>;
}

let pendingSeq = 0;
let handlersBound = false;
let typingCleanup: number | null = null;
let lastTypingEmit = 0;

function upsertMessage(list: Message[], m: Message): Message[] {
  const idx = list.findIndex((x) => x.id === m.id);
  if (idx >= 0) {
    const copy = [...list];
    copy[idx] = m;
    return copy;
  }
  const out = [...list, m];
  out.sort((a, b) => a.id - b.id);
  return out;
}

function upsertPhoto(list: Photo[], p: Photo): Photo[] {
  const rest = list.filter((x) => x.id !== p.id);
  const out = [p, ...rest];
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

function withGuest(p: Photo, m: Message): Photo {
  return { ...p, guest: p.guest ?? m.guest };
}

function sortEvents(list: EventItem[]): EventItem[] {
  return [...list].sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99:99').localeCompare(b.time ?? '99:99'));
}

function upsertEvent(list: EventItem[], e: EventItem): EventItem[] {
  return sortEvents([...list.filter((x) => x.id !== e.id), e]);
}

export const useStore = create<State>((set, get) => ({
  config: null,
  authStatus: 'loading',
  me: null,
  isAdmin: false,

  guests: {},
  guestsLoaded: false,
  online: [],

  messages: [],
  messagesLoaded: false,
  hasMoreMessages: false,
  loadingOlder: false,

  photos: [],
  photosLoaded: false,

  events: [],
  eventsLoaded: false,

  typing: {},
  unreadMural: 0,
  muralActive: false,
  socketConnected: false,

  async loadConfig() {
    const cached = get().config;
    if (cached) return cached;
    const config = await api<AppConfig>('/api/config');
    set({ config });
    return config;
  },

  async loadMe() {
    // Só considera "não logado" com 401. Erro de rede ou do servidor: tenta de novo antes de desistir,
    // para uma oscilação de sinal não mandar a pessoa de volta para a tela de entrada.
    const delays = [1500, 3000, 5000, 8000];
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await api<MeResponse>('/api/auth/me');
        set({ me: res.guest, isAdmin: res.isAdmin, authStatus: 'authed' });
        get().connectSocket();
        return;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          set({ me: null, isAdmin: false, authStatus: 'anon' });
          return;
        }
        if (attempt >= delays.length) {
          set({ me: null, isAdmin: false, authStatus: 'anon' });
          return;
        }
        await new Promise((r) => setTimeout(r, delays[attempt]));
      }
    }
  },

  async enter(payload) {
    const res = await api<MeResponse & { returning: boolean }>('/api/auth/enter', { method: 'POST', json: payload });
    set({ me: res.guest, isAdmin: res.isAdmin, authStatus: 'authed' });
    get().connectSocket();
    return { returning: res.returning };
  },

  async logout() {
    try {
      await unsubscribePush();
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      disconnectSocket();
      set({
        me: null,
        isAdmin: false,
        authStatus: 'anon',
        messages: [],
        messagesLoaded: false,
        photos: [],
        photosLoaded: false,
        guests: {},
        guestsLoaded: false,
        unreadMural: 0,
      });
    }
  },

  async updateMe(patch) {
    const res = await api<MeResponse>('/api/guests/me', { method: 'PATCH', json: patch });
    set({ me: res.guest, isAdmin: res.isAdmin });
  },

  async uploadAvatar(file) {
    const form = new FormData();
    form.append('file', file, 'avatar.jpg');
    const res = await api<MeResponse>('/api/guests/me/avatar', { method: 'POST', body: form });
    set({ me: res.guest });
  },

  async removeAvatar() {
    const res = await api<MeResponse>('/api/guests/me/avatar', { method: 'DELETE' });
    set({ me: res.guest });
  },

  async loadGuests() {
    const res = await api<{ guests: GuestPublic[]; online: string[] }>('/api/guests');
    const map: Record<string, GuestPublic> = {};
    for (const g of res.guests) map[g.id] = g;
    set({ guests: map, guestsLoaded: true, online: res.online });
  },

  async loadMessages() {
    const res = await api<{ messages: Message[]; hasMore: boolean }>('/api/messages?limit=60');
    const pending = get().messages.filter((m) => m.pending);
    let list = res.messages;
    for (const p of pending) list = upsertMessage(list, p);
    set({ messages: list, messagesLoaded: true, hasMoreMessages: res.hasMore });
  },

  async loadOlderMessages() {
    const { messages, hasMoreMessages, loadingOlder } = get();
    if (!hasMoreMessages || loadingOlder) return;
    const oldest = messages.find((m) => !m.pending);
    if (!oldest) return;
    set({ loadingOlder: true });
    try {
      const res = await api<{ messages: Message[]; hasMore: boolean }>(`/api/messages?limit=60&before=${oldest.id}`);
      let list = get().messages;
      for (const m of res.messages) list = upsertMessage(list, m);
      set({ messages: list, hasMoreMessages: res.hasMore });
    } finally {
      set({ loadingOlder: false });
    }
  },

  async sendMessage(text) {
    const me = get().me;
    if (!me) return;
    const tempId = 1_000_000_000_000 + ++pendingSeq;
    const temp: Message = {
      id: tempId,
      guestId: me.id,
      guest: { id: me.id, name: me.name, avatarUrl: me.avatarUrl },
      text,
      photo: null,
      createdAt: Date.now(),
      reactions: [],
      pending: true,
    };
    set((s) => ({ messages: upsertMessage(s.messages, temp) }));
    try {
      const res = await api<{ message: Message }>('/api/messages', { method: 'POST', json: { text } });
      set((s) => ({ messages: upsertMessage(s.messages.filter((m) => m.id !== tempId), res.message) }));
    } catch (err) {
      set((s) => ({ messages: s.messages.filter((m) => m.id !== tempId) }));
      throw err;
    }
  },

  async deleteMessage(id) {
    await api(`/api/messages/${id}`, { method: 'DELETE' });
    set((s) => {
      const msg = s.messages.find((m) => m.id === id);
      return {
        messages: s.messages.filter((m) => m.id !== id),
        photos: msg?.photo ? s.photos.filter((p) => p.id !== msg.photo!.id) : s.photos,
      };
    });
  },

  async deletePhoto(id) {
    await api(`/api/photos/${id}`, { method: 'DELETE' });
    set((s) => ({
      photos: s.photos.filter((p) => p.id !== id),
      messages: s.messages.filter((m) => m.photo?.id !== id),
    }));
  },

  async toggleReaction(messageId, emoji) {
    const res = await api<{ reactions: Reaction[] }>(`/api/messages/${messageId}/reactions`, {
      method: 'POST',
      json: { emoji },
    });
    set((s) => ({
      messages: s.messages.map((m) => (m.id === messageId ? { ...m, reactions: res.reactions } : m)),
    }));
    return res.reactions;
  },

  async loadPhotos() {
    const res = await api<{ photos: Photo[] }>('/api/photos');
    set({ photos: res.photos, photosLoaded: true });
  },

  addMessageLocally(message) {
    set((s) => ({
      messages: upsertMessage(s.messages, message),
      photos: message.photo ? upsertPhoto(s.photos, withGuest(message.photo, message)) : s.photos,
    }));
  },

  async loadEvents() {
    const res = await api<{ events: EventItem[] }>('/api/events');
    set({ events: sortEvents(res.events), eventsLoaded: true });
  },

  async createEvent(payload) {
    const res = await api<{ event: EventItem }>('/api/events', { method: 'POST', json: payload });
    set((s) => ({ events: upsertEvent(s.events, res.event) }));
    return res.event;
  },

  async updateEvent(id, payload) {
    const res = await api<{ event: EventItem }>(`/api/events/${id}`, { method: 'PATCH', json: payload });
    set((s) => ({ events: upsertEvent(s.events, res.event) }));
    return res.event;
  },

  async deleteEvent(id) {
    await api(`/api/events/${id}`, { method: 'DELETE' });
    set((s) => ({ events: s.events.filter((e) => e.id !== id) }));
  },

  async setRsvp(eventId, status, peopleCount) {
    const res = await api<{ event: EventItem }>(`/api/events/${eventId}/rsvp`, {
      method: 'PUT',
      json: { status, peopleCount },
    });
    set((s) => ({ events: upsertEvent(s.events, res.event) }));
  },

  setMuralActive(active) {
    set({ muralActive: active, unreadMural: active ? 0 : get().unreadMural });
  },

  connectSocket() {
    const socket = getSocket();
    if (!handlersBound) {
      handlersBound = true;

      socket.on('connect', () => {
        set({ socketConnected: true });
        void get().refreshAll();
      });
      socket.on('disconnect', () => set({ socketConnected: false }));

      socket.on('message:new', (m: Message) => {
        const { me, muralActive } = get();
        set((s) => ({
          messages: upsertMessage(s.messages, m),
          photos: m.photo ? upsertPhoto(s.photos, withGuest(m.photo, m)) : s.photos,
          unreadMural: !muralActive && m.guestId !== me?.id ? s.unreadMural + 1 : s.unreadMural,
          typing: Object.fromEntries(Object.entries(s.typing).filter(([id]) => id !== m.guestId)),
        }));
        // App aberto em segundo plano: aviso local (o push do servidor cobre o app fechado)
        if (m.guestId !== me?.id && typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          const author = firstName(m.guest.name);
          const body = m.photo ? `${author} postou uma foto 📸` : `${author}: ${m.text ?? ''}`;
          void showLocalNotification('Galera do casamento', body.slice(0, 180));
        }
      });

      socket.on('message:deleted', ({ id, photoId }: { id: number | null; photoId: string | null }) => {
        set((s) => ({
          messages: s.messages.filter((m) => m.id !== id && (!photoId || m.photo?.id !== photoId)),
          photos: photoId ? s.photos.filter((p) => p.id !== photoId) : s.photos,
        }));
      });

      socket.on('reaction:update', ({ messageId, reactions }: { messageId: number; reactions: Reaction[] }) => {
        set((s) => ({ messages: s.messages.map((m) => (m.id === messageId ? { ...m, reactions } : m)) }));
      });

      socket.on('event:upsert', (e: EventItem) => {
        set((s) => ({ events: upsertEvent(s.events, e) }));
      });
      socket.on('event:deleted', ({ id }: { id: string }) => {
        set((s) => ({ events: s.events.filter((e) => e.id !== id) }));
      });

      socket.on('guest:upsert', (g: GuestPublic) => {
        set((s) => {
          const me = s.me && s.me.id === g.id ? { ...s.me, ...g, phone: s.me.phone, showPhone: s.me.showPhone } : s.me;
          return { guests: { ...s.guests, [g.id]: g }, me };
        });
      });

      socket.on('presence', ({ guestIds }: { count: number; guestIds: string[] }) => {
        set({ online: guestIds });
      });

      socket.on('typing', ({ guestId, name }: { guestId: string; name: string }) => {
        if (guestId === get().me?.id) return;
        set((s) => ({ typing: { ...s.typing, [guestId]: { name, until: Date.now() + 3000 } } }));
        if (typingCleanup) window.clearTimeout(typingCleanup);
        typingCleanup = window.setTimeout(() => {
          const now = Date.now();
          set((s) => ({ typing: Object.fromEntries(Object.entries(s.typing).filter(([, v]) => v.until > now)) }));
        }, 3200);
      });
    }
    if (!socket.connected) socket.connect();
  },

  emitTyping() {
    const now = Date.now();
    if (now - lastTypingEmit < 2000) return;
    lastTypingEmit = now;
    getSocket().emit('typing');
  },

  async refreshAll() {
    const s = get();
    if (s.authStatus !== 'authed') return;
    const jobs: Promise<unknown>[] = [];
    if (s.messagesLoaded) jobs.push(s.loadMessages());
    if (s.photosLoaded) jobs.push(s.loadPhotos());
    if (s.guestsLoaded) jobs.push(s.loadGuests());
    if (s.eventsLoaded) jobs.push(s.loadEvents());
    await Promise.allSettled(jobs);
  },
}));

/** Convidado por id, com fallback para dados embutidos na mensagem/foto. */
export function useGuest(id: string | undefined) {
  return useStore((s) => (id ? s.guests[id] : undefined));
}
