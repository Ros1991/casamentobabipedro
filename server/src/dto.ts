import { isAdmin } from './auth.js';
import type { Accommodation, Guest, Photo } from './db/schema.js';

export const uploadUrl = (key: string | null | undefined): string | null => (key ? `/uploads/${key}` : null);

export interface GuestLiteDTO {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface GuestPublicDTO extends GuestLiteDTO {
  accommodationId: string | null;
  customPlaceLabel: string | null;
  customCity: string | null;
  customLat: number | null;
  customLng: number | null;
  arrivalDate: string | null;
  departureDate: string | null;
  /** Só preenchido quando o convidado permitiu mostrar */
  whatsapp: string | null;
  /** Quem vem junto (nomes) */
  companions: string[];
  /** 1 + acompanhantes */
  partySize: number;
  isAdmin: boolean;
  createdAt: number;
  lastSeenAt: number;
}

export interface GuestMeDTO extends GuestPublicDTO {
  phone: string;
  showPhone: boolean;
}

export interface PhotoDTO {
  id: string;
  guestId: string;
  messageId: number | null;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  lat: number | null;
  lng: number | null;
  locationSource: string;
  caption: string | null;
  takenAt: number | null;
  createdAt: number;
}

export interface ReactionDTO {
  emoji: string;
  guestId: string;
}

export interface MessageDTO {
  id: number;
  guestId: string;
  guest: GuestLiteDTO;
  text: string | null;
  photo: PhotoDTO | null;
  createdAt: number;
  reactions: ReactionDTO[];
}

export function guestLite(g: Guest): GuestLiteDTO {
  return { id: g.id, name: g.name, avatarUrl: uploadUrl(g.avatarKey) };
}

export function guestPublic(g: Guest): GuestPublicDTO {
  return {
    ...guestLite(g),
    accommodationId: g.accommodationId,
    customPlaceLabel: g.customPlaceLabel,
    customCity: g.customCity,
    customLat: g.customLat,
    customLng: g.customLng,
    arrivalDate: g.arrivalDate,
    departureDate: g.departureDate,
    whatsapp: g.showPhone ? g.phone : null,
    companions: g.companions ?? [],
    partySize: 1 + (g.companions?.length ?? 0),
    isAdmin: isAdmin(g),
    createdAt: g.createdAt,
    lastSeenAt: g.lastSeenAt,
  };
}

/** Total de pessoas (convidados + acompanhantes) de uma lista de convidados. */
export function countPeople(list: Pick<Guest, 'companions'>[]): number {
  return list.reduce((sum, g) => sum + 1 + (g.companions?.length ?? 0), 0);
}

export function guestMe(g: Guest): GuestMeDTO {
  return { ...guestPublic(g), phone: g.phone, showPhone: g.showPhone };
}

export function photoDTO(p: Photo, messageId: number | null): PhotoDTO {
  return {
    id: p.id,
    guestId: p.guestId,
    messageId,
    url: uploadUrl(p.fileKey)!,
    thumbUrl: uploadUrl(p.thumbKey)!,
    width: p.width,
    height: p.height,
    lat: p.lat,
    lng: p.lng,
    locationSource: p.locationSource,
    caption: p.caption,
    takenAt: p.takenAt,
    createdAt: p.createdAt,
  };
}

export interface RsvpDTO {
  guestId: string;
  status: 'yes' | 'maybe' | 'no' | string;
  peopleCount: number;
  note: string | null;
  updatedAt: number;
}

export interface EventDTO {
  id: string;
  title: string;
  description: string | null;
  date: string;
  time: string | null;
  placeLabel: string | null;
  placeLat: number | null;
  placeLng: number | null;
  isOfficial: boolean;
  createdBy: GuestLiteDTO;
  createdAt: number;
  updatedAt: number;
  rsvps: RsvpDTO[];
  counts: { yes: number; maybe: number; no: number; people: number };
}

export function accommodationDTO(a: Accommodation) {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    city: a.city,
    lat: a.lat,
    lng: a.lng,
    instagram: a.instagram,
    whatsapp: a.whatsapp,
    description: a.description,
    sortOrder: a.sortOrder,
  };
}
