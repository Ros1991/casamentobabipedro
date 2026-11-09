import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { accommodations } from '../db/schema.js';
import { CITY_DUNAS, CITY_FORTALEZA, CITY_OTHER, CITY_PRESIDIO, CITY_RIVIERA } from '../seed.js';
import { dateStr, num, str, validLatLng } from '../validate.js';

export interface StayFields {
  accommodationId: string | null;
  customPlaceLabel: string | null;
  customCity: string | null;
  customLat: number | null;
  customLng: number | null;
}

export interface DateFields {
  arrivalDate: string | null;
  departureDate: string | null;
}

export interface InputError {
  error: string;
  message: string;
}

const CITIES = new Set<string>([CITY_RIVIERA, CITY_PRESIDIO, CITY_DUNAS, CITY_FORTALEZA, CITY_OTHER]);

/**
 * stayMode: "preset" (hotel da lista), "custom" (outro lugar) ou "unknown" (ainda não sei).
 */
export function parseStay(body: Record<string, unknown>): StayFields | InputError {
  const mode = str(body.stayMode, 20) ?? 'unknown';

  if (mode === 'preset') {
    const id = str(body.accommodationId, 60);
    const acc = id ? db.select().from(accommodations).where(eq(accommodations.id, id)).get() : undefined;
    if (!acc || acc.type === 'evento') {
      return { error: 'accommodation', message: 'Escolha uma hospedagem da lista.' };
    }
    return { accommodationId: acc.id, customPlaceLabel: null, customCity: null, customLat: null, customLng: null };
  }

  if (mode === 'custom') {
    const label = str(body.customPlaceLabel, 80);
    if (!label) return { error: 'customPlaceLabel', message: 'Diga onde você vai ficar (nome do lugar ou bairro).' };
    const cityRaw = str(body.customCity, 40) ?? CITY_OTHER;
    const city = CITIES.has(cityRaw) ? cityRaw : CITY_OTHER;
    const lat = num(body.customLat);
    const lng = num(body.customLng);
    const hasPoint = validLatLng(lat, lng);
    return {
      accommodationId: null,
      customPlaceLabel: label,
      customCity: city,
      customLat: hasPoint ? lat : null,
      customLng: hasPoint ? (lng as number) : null,
    };
  }

  return { accommodationId: null, customPlaceLabel: null, customCity: null, customLat: null, customLng: null };
}

export function parseDates(body: Record<string, unknown>): DateFields | InputError {
  const arrivalRaw = body.arrivalDate;
  const departureRaw = body.departureDate;
  const arrivalDate = arrivalRaw ? dateStr(arrivalRaw) : null;
  const departureDate = departureRaw ? dateStr(departureRaw) : null;
  if (arrivalRaw && !arrivalDate) return { error: 'arrivalDate', message: 'Data de chegada inválida.' };
  if (departureRaw && !departureDate) return { error: 'departureDate', message: 'Data de saída inválida.' };
  if (arrivalDate && departureDate && departureDate < arrivalDate) {
    return { error: 'departureDate', message: 'A saída precisa ser depois da chegada.' };
  }
  return { arrivalDate, departureDate };
}

export const MAX_COMPANIONS = 6;

/** Lista de acompanhantes: nomes curtos, até MAX_COMPANIONS; entradas vazias viram "Acompanhante". */
export function parseCompanions(value: unknown): string[] | InputError {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return { error: 'companions', message: 'Lista de acompanhantes inválida.' };
  const names = value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim().slice(0, 40))
    .map((v) => v || 'Acompanhante');
  if (names.length > MAX_COMPANIONS) {
    return { error: 'companions', message: `No máximo ${MAX_COMPANIONS} acompanhantes por pessoa.` };
  }
  return names;
}

export function isInputError(v: unknown): v is InputError {
  return !!v && typeof v === 'object' && 'error' in v && 'message' in v;
}
