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

export type Accommodation = typeof accommodations.$inferSelect;
export type Guest = typeof guests.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Reaction = typeof reactions.$inferSelect;
