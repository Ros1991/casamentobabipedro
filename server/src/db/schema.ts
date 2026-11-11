import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Hotéis/pousadas pré-cadastrados (do site oficial) + pontos de referência (Beach Club Aquiraz Riviera). */
export const accommodations = sqliteTable('accommodations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** hotel | pousada | apto | casa | outro | evento */
  type: text('type').notNull(),
  city: text('city').notNull(),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  instagram: text('instagram'),
  whatsapp: text('whatsapp'),
  description: text('description'),
  isPreset: integer('is_preset', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const guests = sqliteTable('guests', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Só dígitos com código do país, ex.: 5585999999999 */
  phone: text('phone').notNull().unique(),
  accommodationId: text('accommodation_id').references(() => accommodations.id),
  customPlaceLabel: text('custom_place_label'),
  customCity: text('custom_city'),
  customLat: real('custom_lat'),
  customLng: real('custom_lng'),
  /** YYYY-MM-DD */
  arrivalDate: text('arrival_date'),
  departureDate: text('departure_date'),
  showPhone: integer('show_phone', { mode: 'boolean' }).notNull().default(false),
  avatarKey: text('avatar_key'),
  /** Nomes de quem vem junto (casal, família): contam nos números sem precisar entrar no site */
  companions: text('companions', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  /** CPF (só dígitos), opcional: facilita o check-in. Nunca vai para os outros convidados. */
  cpf: text('cpf'),
  /** CPFs dos acompanhantes, na mesma ordem de companions ('' quando não informado) */
  companionCpfs: text('companion_cpfs', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  /** Chave da linha na lista de confirmados importada (null para quem se cadastrou sozinho) */
  importKey: text('import_key').unique(),
  /** Nome do convite na lista importada (ex.: "Fulano e família") */
  inviteLabel: text('invite_label'),
  /** Quando a pessoa entrou no app pela primeira vez (null = só importada, ainda não entrou) */
  claimedAt: integer('claimed_at'),
  createdAt: integer('created_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),
  guestId: text('guest_id')
    .notNull()
    .references(() => guests.id),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

export const photos = sqliteTable(
  'photos',
  {
    id: text('id').primaryKey(),
    guestId: text('guest_id')
      .notNull()
      .references(() => guests.id),
    fileKey: text('file_key').notNull(),
    thumbKey: text('thumb_key').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    lat: real('lat'),
    lng: real('lng'),
    /** gps | exif | manual | none */
    locationSource: text('location_source').notNull().default('none'),
    caption: text('caption'),
    takenAt: integer('taken_at'),
    createdAt: integer('created_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => [index('photos_created_idx').on(t.createdAt)],
);

/** O mural: cada item é uma mensagem; uma foto postada vira uma mensagem com photo_id. */
export const messages = sqliteTable(
  'messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    guestId: text('guest_id')
      .notNull()
      .references(() => guests.id),
    text: text('text'),
    photoId: text('photo_id').references(() => photos.id),
    /** Conversa de um combinado da agenda (null = mural geral) */
    eventId: text('event_id'),
    /** Mensagem à qual esta responde (como no WhatsApp) */
    replyToId: integer('reply_to_id'),
    /** Ids dos convidados marcados com @ no texto */
    mentions: text('mentions', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    createdAt: integer('created_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => [index('messages_created_idx').on(t.createdAt)],
);

export const reactions = sqliteTable(
  'reactions',
  {
    messageId: integer('message_id')
      .notNull()
      .references(() => messages.id),
    guestId: text('guest_id')
      .notNull()
      .references(() => guests.id),
    emoji: text('emoji').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.guestId, t.emoji] })],
);

/** Assinaturas de Web Push (um aparelho/navegador por linha). */
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: text('id').primaryKey(),
    guestId: text('guest_id')
      .notNull()
      .references(() => guests.id),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: integer('created_at').notNull(),
    lastNotifiedAt: integer('last_notified_at'),
  },
  (t) => [index('push_guest_idx').on(t.guestId)],
);

/** Combinados: programas criados pelos noivos (oficiais) ou pela galera, com confirmação de presença. */
export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    /** YYYY-MM-DD */
    date: text('date').notNull(),
    /** HH:MM (opcional) */
    time: text('time'),
    placeLabel: text('place_label'),
    placeLat: real('place_lat'),
    placeLng: real('place_lng'),
    /** Criado por um admin (noivos/organização): aparece em destaque e avisa todo mundo */
    isOfficial: integer('is_official', { mode: 'boolean' }).notNull().default(false),
    createdBy: text('created_by')
      .notNull()
      .references(() => guests.id),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => [index('events_date_idx').on(t.date)],
);

export const eventRsvps = sqliteTable(
  'event_rsvps',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    guestId: text('guest_id')
      .notNull()
      .references(() => guests.id),
    /** yes | maybe | no */
    status: text('status').notNull(),
    /** Quantas pessoas da turma do convidado vão (1 + acompanhantes que vão) */
    peopleCount: integer('people_count').notNull().default(1),
    note: text('note'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.guestId] })],
);

export type EventRow = typeof events.$inferSelect;
export type EventRsvpRow = typeof eventRsvps.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type Accommodation = typeof accommodations.$inferSelect;
export type Guest = typeof guests.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Reaction = typeof reactions.$inferSelect;
