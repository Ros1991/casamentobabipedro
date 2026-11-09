import { BedDouble, Building2, HelpCircle, Home, MapPin } from 'lucide-react';
import { useMemo } from 'react';
import type { LatLng } from '../lib/geo';
import { CITIES, type Accommodation, type StayInput } from '../lib/types';
import { PickLocationMap } from './map/PickLocationMap';

interface Props {
  value: StayInput;
  onChange: (v: StayInput) => void;
  accommodations: Accommodation[];
  mapCenter: { lat: number; lng: number };
}

const CITY_CENTERS: Record<string, [number, number]> = {
  'Aquiraz Riviera': [-3.923, -38.328],
  'Praia do Presídio': [-3.935, -38.311],
  'Porto das Dunas': [-3.845, -38.4],
  Fortaleza: [-3.74, -38.52],
};

function typeIcon(type: string) {
  if (type === 'apto') return <Building2 size={18} />;
  if (type === 'casa') return <Home size={18} />;
  return <BedDouble size={18} />;
}

export function StayPicker({ value, onChange, accommodations, mapCenter }: Props) {
  const presets = useMemo(() => accommodations.filter((a) => a.type !== 'evento'), [accommodations]);
  const byCity = useMemo(() => {
    const groups = new Map<string, Accommodation[]>();
    for (const a of presets) {
      const list = groups.get(a.city) ?? [];
      list.push(a);
      groups.set(a.city, list);
    }
    return [...groups.entries()];
  }, [presets]);

  const selectPreset = (id: string) => onChange({ ...value, stayMode: 'preset', accommodationId: id });
  const selectCustom = () => onChange({ ...value, stayMode: 'custom', accommodationId: null });
  const selectUnknown = () => onChange({ ...value, stayMode: 'unknown', accommodationId: null });

  const customCenter: [number, number] =
    CITY_CENTERS[value.customCity] ?? [mapCenter.lat, mapCenter.lng];
  const customZoom = CITY_CENTERS[value.customCity] ? 13 : 10;
  const point: LatLng | null =
    value.customLat !== null && value.customLng !== null ? { lat: value.customLat, lng: value.customLng } : null;

  const optionClass = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition ${
      active ? 'border-terra bg-terra-pale text-terra-dark shadow-soft' : 'border-sand bg-white/60 text-ink hover:border-terra-light'
    }`;

  return (
    <div className="space-y-4">
      {byCity.map(([city, list]) => (
        <div key={city}>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-widest text-terra uppercase">
            <MapPin size={12} /> {city}
          </div>
          <div className="space-y-2">
            {list.map((a) => {
              const active = value.stayMode === 'preset' && value.accommodationId === a.id;
              return (
                <button key={a.id} type="button" onClick={() => selectPreset(a.id)} className={optionClass(active)}>
                  <span className={`rounded-full p-2 ${active ? 'bg-terra text-cream' : 'bg-cream-dark text-terra'}`}>
                    {typeIcon(a.type)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{a.name}</span>
                    {a.description && <span className="block text-xs text-ink-soft">{a.description}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div>
        <div className="mb-2 text-xs font-bold tracking-widest text-terra uppercase">Ou</div>
        <div className="space-y-2">
          <button type="button" onClick={selectCustom} className={optionClass(value.stayMode === 'custom')}>
            <span className={`rounded-full p-2 ${value.stayMode === 'custom' ? 'bg-terra text-cream' : 'bg-cream-dark text-terra'}`}>
              <Home size={18} />
            </span>
            <span className="flex-1">
              <span className="block font-semibold">Outro lugar</span>
              <span className="block text-xs text-ink-soft">Casa, Airbnb, outra pousada…</span>
            </span>
          </button>

          {value.stayMode === 'custom' && (
            <div className="space-y-3 rounded-2xl border border-sand bg-white/60 p-3.5 animate-fade-in">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-terra-dark">Onde?</span>
                <input
                  type="text"
                  value={value.customPlaceLabel}
                  onChange={(e) => onChange({ ...value, customPlaceLabel: e.target.value })}
                  placeholder="Ex.: Airbnb no Porto das Dunas, casa em Fortaleza"
                  maxLength={80}
                  className="w-full rounded-xl border border-sand bg-cream px-3 py-2.5 text-ink outline-none focus:border-terra"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-terra-dark">Cidade</span>
                <select
                  value={value.customCity}
                  onChange={(e) => onChange({ ...value, customCity: e.target.value, customLat: null, customLng: null })}
                  className="w-full rounded-xl border border-sand bg-cream px-3 py-2.5 text-ink outline-none focus:border-terra"
                >
                  {CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <span className="mb-1 block text-sm font-semibold text-terra-dark">
                  Marque no mapa <span className="font-normal text-ink-soft">(opcional, aparece para a galera)</span>
                </span>
                <PickLocationMap
                  value={point}
                  onChange={(p) => onChange({ ...value, customLat: p.lat, customLng: p.lng })}
                  center={customCenter}
                  zoom={customZoom}
                  className="h-44"
                />
                <p className="mt-1 text-xs text-ink-soft">Toque no mapa para colocar o pino e arraste para ajustar.</p>
              </div>
            </div>
          )}

          <button type="button" onClick={selectUnknown} className={optionClass(value.stayMode === 'unknown')}>
            <span className={`rounded-full p-2 ${value.stayMode === 'unknown' ? 'bg-terra text-cream' : 'bg-cream-dark text-terra'}`}>
              <HelpCircle size={18} />
            </span>
            <span className="flex-1">
              <span className="block font-semibold">Ainda não sei</span>
              <span className="block text-xs text-ink-soft">Dá para mudar depois no seu perfil</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
