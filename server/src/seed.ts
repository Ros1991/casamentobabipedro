import { db } from './db/index.js';
import { accommodations } from './db/schema.js';

export const CITY_RIVIERA = 'Aquiraz Riviera';
export const CITY_PRESIDIO = 'Praia do Presídio';
export const CITY_DUNAS = 'Porto das Dunas';
export const CITY_FORTALEZA = 'Fortaleza';
export const CITY_OTHER = 'Outro';

/**
 * Hospedagens sugeridas no site oficial + o local da festa como referência.
 * Coordenadas do OpenStreetMap (Riviera Beach Club, Dom Pedro Laguna, Manhattan Beach Riviera, Rua do Sol)
 * e do mapa "Casamento Babi e Pedro" do site oficial (Riviera Beach Place, Hotel Jangadeiro), em 09/11/2026.
 */
export const PRESET_ACCOMMODATIONS = [
  {
    id: 'beach-club-riviera',
    name: 'Beach Club Aquiraz Riviera',
    type: 'evento',
    city: CITY_RIVIERA,
    lat: -3.9224405,
    lng: -38.3278161,
    instagram: null,
    whatsapp: null,
    description: 'Cerimônia e festa — 19/11/2026, das 15h30 às 23h',
    sortOrder: 0,
  },
  {
    id: 'manhattan-riviera',
    name: 'Manhattan Beach Riviera',
    type: 'apto',
    city: CITY_RIVIERA,
    lat: -3.9242567,
    lng: -38.3237371,
    instagram: null,
    whatsapp: null,
    description: 'Hospedagem dos noivos · resort com aptos de 3 e 4 quartos (Airbnb) · 10 min a pé da festa',
    sortOrder: 1,
  },
  {
    id: 'riviera-beach-place',
    name: 'Riviera Beach Place',
    type: 'apto',
    city: CITY_RIVIERA,
    lat: -3.9212,
    lng: -38.3285,
    instagram: null,
    whatsapp: null,
    description: 'Resort com aptos de 2 e 3 quartos (Airbnb ou corretores) · 3 min a pé da festa',
    sortOrder: 2,
  },
  {
    id: 'dom-pedro-laguna',
    name: 'Hotel Dom Pedro Laguna',
    type: 'hotel',
    city: CITY_RIVIERA,
    lat: -3.9198075,
    lng: -38.3288752,
    instagram: null,
    whatsapp: null,
    description: 'Hotel 5 estrelas com café da manhã · 5 min a pé da festa · laguna.dompedro.com',
    sortOrder: 3,
  },
  {
    id: 'hotel-jangadeiro',
    name: 'Hotel Jangadeiro',
    type: 'hotel',
    city: CITY_PRESIDIO,
    lat: -3.9372,
    lng: -38.3068,
    instagram: null,
    whatsapp: null,
    description: 'Pé na areia na Praia do Presídio · 10 min de carro da festa · hoteljangadeiro.com.br',
    sortOrder: 4,
  },
  {
    id: 'pousada-do-sol',
    name: 'Pousada do Sol Praia',
    type: 'pousada',
    city: CITY_PRESIDIO,
    lat: -3.9349687,
    lng: -38.3132687,
    instagram: 'pousadadosolceara1',
    whatsapp: null,
    description: 'Pousada simples e aconchegante · 10 min de carro da festa',
    sortOrder: 5,
  },
];

export function seedAccommodations(): void {
  for (const preset of PRESET_ACCOMMODATIONS) {
    db.insert(accommodations)
      .values({ ...preset, isPreset: true })
      .onConflictDoUpdate({
        target: accommodations.id,
        set: {
          name: preset.name,
          type: preset.type,
          city: preset.city,
          lat: preset.lat,
          lng: preset.lng,
          instagram: preset.instagram,
          whatsapp: preset.whatsapp,
          description: preset.description,
          sortOrder: preset.sortOrder,
        },
      })
      .run();
  }
}
