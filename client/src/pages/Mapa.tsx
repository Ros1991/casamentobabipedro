import { CalendarDays, Instagram, List, MessageCircle, Navigation, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Marker, useMapEvents } from 'react-leaflet';
import { Link, useSearchParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { BottomSheet } from '../components/BottomSheet';
import { PhotoCapture } from '../components/PhotoCapture';
import { PhotoViewer } from '../components/PhotoViewer';
import { BaseMap, FitBounds, FlyTo } from '../components/map/MapBase';
import { PhotoClusterLayer } from '../components/map/PhotoClusterLayer';
import { placeIcon } from '../components/map/icons';
import { companionBadge, countPeople, firstName, formatDayMonth, formatEventWhen, joinNames, toDateOnly, whatsappLink } from '../lib/format';
import type { Accommodation, EventItem, GuestPublic, Photo } from '../lib/types';
import { useStore } from '../store';

interface PlaceSheet {
  kind: 'preset' | 'custom' | 'event';
  accommodation?: Accommodation;
  guest?: GuestPublic;
  event?: EventItem;
}

function stayLabel(g: GuestPublic, accs: Record<string, Accommodation>): string {
  if (g.accommodationId && accs[g.accommodationId]) return accs[g.accommodationId].name;
  if (g.customPlaceLabel) return g.customPlaceLabel + (g.customCity && g.customCity !== 'Outro' ? ` · ${g.customCity}` : '');
  return 'Ainda não decidiu';
}

function datesLabel(g: GuestPublic): string | null {
  if (!g.arrivalDate && !g.departureDate) return null;
  const a = g.arrivalDate ? `chega ${formatDayMonth(g.arrivalDate)}` : '';
  const d = g.departureDate ? `sai ${formatDayMonth(g.departureDate)}` : '';
  return [a, d].filter(Boolean).join(' · ');
}

export function Mapa() {
  const config = useStore((s) => s.config);
  const me = useStore((s) => s.me);
  const guests = useStore((s) => s.guests);
  const guestsLoaded = useStore((s) => s.guestsLoaded);
  const loadGuests = useStore((s) => s.loadGuests);
  const photos = useStore((s) => s.photos);
  const photosLoaded = useStore((s) => s.photosLoaded);
  const loadPhotos = useStore((s) => s.loadPhotos);
  const events = useStore((s) => s.events);
  const eventsLoaded = useStore((s) => s.eventsLoaded);
  const loadEvents = useStore((s) => s.loadEvents);
  const online = useStore((s) => s.online);
  const [params, setParams] = useSearchParams();

  const [showPeople, setShowPeople] = useState(true);
  const [showPhotos, setShowPhotos] = useState(true);
  const [sheet, setSheet] = useState<PlaceSheet | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [zoom, setZoom] = useState(10);
  // Com o mapa afastado, os pinos mostram só o ícone e a contagem para não se sobreporem
  const compact = zoom < 13;

  useEffect(() => {
    if (!guestsLoaded) void loadGuests().catch(() => undefined);
    if (!photosLoaded) void loadPhotos().catch(() => undefined);
    if (!eventsLoaded) void loadEvents().catch(() => undefined);
  }, [guestsLoaded, photosLoaded, eventsLoaded, loadGuests, loadPhotos, loadEvents]);

  const today = toDateOnly(new Date());
  const mapEvents = useMemo(
    () => events.filter((e) => e.placeLat !== null && e.placeLng !== null && e.date >= today),
    [events, today],
  );

  const accommodations = useMemo(() => config?.accommodations ?? [], [config]);
  const accById = useMemo(() => Object.fromEntries(accommodations.map((a) => [a.id, a])), [accommodations]);
  const guestList = useMemo(() => Object.values(guests).sort((a, b) => a.name.localeCompare(b.name)), [guests]);

  const guestsByAcc = useMemo(() => {
    const map = new Map<string, GuestPublic[]>();
    for (const g of guestList) {
      if (!g.accommodationId) continue;
      const list = map.get(g.accommodationId) ?? [];
      list.push(g);
      map.set(g.accommodationId, list);
    }
    return map;
  }, [guestList]);

  const customGuests = useMemo(
    () => guestList.filter((g) => !g.accommodationId && g.customLat !== null && g.customLng !== null),
    [guestList],
  );
  const customNoPoint = useMemo(
    () => guestList.filter((g) => !g.accommodationId && g.customPlaceLabel && g.customLat === null),
    [guestList],
  );
  const undecided = useMemo(() => guestList.filter((g) => !g.accommodationId && !g.customPlaceLabel), [guestList]);

  const locatedPhotos = useMemo(() => photos.filter((p) => p.lat !== null && p.lng !== null), [photos]);

  const bounds = useMemo<[number, number][]>(() => accommodations.map((a) => [a.lat, a.lng]), [accommodations]);

  // Links profundos: ?foto=ID, ?lugar=ID e ?evento=ID
  useEffect(() => {
    const fotoId = params.get('foto');
    const lugarId = params.get('lugar');
    const eventoId = params.get('evento');
    if (eventoId && eventsLoaded) {
      const ev = events.find((e) => e.id === eventoId);
      if (ev && ev.placeLat !== null && ev.placeLng !== null) {
        setFlyTarget([ev.placeLat, ev.placeLng]);
        setSheet({ kind: 'event', event: ev });
      }
      params.delete('evento');
      setParams(params, { replace: true });
      return;
    }
    if (fotoId && photosLoaded) {
      const idx = locatedPhotos.findIndex((p) => p.id === fotoId);
      if (idx >= 0) {
        const p = locatedPhotos[idx];
        setFlyTarget([p.lat!, p.lng!]);
        setViewer(idx);
      }
      params.delete('foto');
      setParams(params, { replace: true });
    } else if (lugarId && accommodations.length) {
      const acc = accById[lugarId];
      if (acc) {
        setFlyTarget([acc.lat, acc.lng]);
        setSheet({ kind: 'preset', accommodation: acc });
      }
      params.delete('lugar');
      setParams(params, { replace: true });
    }
  }, [params, photosLoaded, locatedPhotos, accommodations.length, accById, setParams, eventsLoaded, events]);

  const onSelectPhoto = useCallback(
    (p: Photo) => {
      const idx = locatedPhotos.findIndex((x) => x.id === p.id);
      if (idx >= 0) setViewer(idx);
    },
    [locatedPhotos],
  );

  const focusOn = (lat: number, lng: number) => {
    setListOpen(false);
    setFlyTarget([lat, lng]);
  };

  if (!config) return null;
  const w = config.wedding;

  const sheetGuests = sheet?.kind === 'preset' && sheet.accommodation ? (guestsByAcc.get(sheet.accommodation.id) ?? []) : [];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <BaseMap center={[w.mapCenter.lat, w.mapCenter.lng]} zoom={w.mapZoom} className="min-h-0 flex-1" zoomControl={false}>
        <FitBounds points={bounds} trigger={bounds.length} padding={48} maxZoom={13} />
        <FlyTo target={flyTarget} zoom={15} />
        <ZoomWatcher onZoom={setZoom} />

        {showPeople &&
          accommodations.map((a) => {
            const count = countPeople(guestsByAcc.get(a.id) ?? []);
            const kind = a.type === 'evento' ? 'venue' : 'preset';
            return (
              <Marker
                key={a.id}
                position={[a.lat, a.lng]}
                icon={placeIcon(a.type === 'evento' ? a.name : a.name.replace(/\s*\(.*\)$/, ''), count, kind, compact && kind !== 'venue')}
                eventHandlers={{ click: () => setSheet({ kind: 'preset', accommodation: a }) }}
                zIndexOffset={a.type === 'evento' ? 1000 : count * 10}
              />
            );
          })}

        {showPeople &&
          customGuests.map((g) => (
            <Marker
              key={g.id}
              position={[g.customLat!, g.customLng!]}
              icon={placeIcon(firstName(g.name), g.companions?.length ? g.partySize : 0, 'custom', compact)}
              eventHandlers={{ click: () => setSheet({ kind: 'custom', guest: g }) }}
            />
          ))}

        {showPeople &&
          mapEvents.map((e) => (
            <Marker
              key={e.id}
              position={[e.placeLat!, e.placeLng!]}
              icon={placeIcon(e.title, e.counts.people, 'event', compact)}
              eventHandlers={{ click: () => setSheet({ kind: 'event', event: e }) }}
              zIndexOffset={500}
            />
          ))}

        {showPhotos && <PhotoClusterLayer photos={locatedPhotos} onSelect={onSelectPhoto} />}
      </BaseMap>

      {/* Controles sobre o mapa */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[400] flex items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto flex gap-1.5 rounded-full border border-sand bg-cream/95 p-1 shadow-soft backdrop-blur">
          <button
            type="button"
            onClick={() => setShowPeople((v) => !v)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${showPeople ? 'bg-terra-dark text-cream' : 'text-terra-dark'}`}
          >
            Pessoas
          </button>
          <button
            type="button"
            onClick={() => setShowPhotos((v) => !v)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${showPhotos ? 'bg-terra-dark text-cream' : 'text-terra-dark'}`}
          >
            Fotos {locatedPhotos.length > 0 && <span className="opacity-80">({locatedPhotos.length})</span>}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-sand bg-cream/95 px-3 py-2 text-xs font-semibold text-terra-dark shadow-soft backdrop-blur"
        >
          <List size={15} /> Lista
        </button>
      </div>

      <div className="pointer-events-none absolute right-3 bottom-4 z-[400]">
        <div className="pointer-events-auto">
          <PhotoCapture variant="fab" />
        </div>
      </div>

      {/* Painel de um lugar */}
      <BottomSheet
        open={!!sheet}
        onClose={() => setSheet(null)}
        title={
          sheet?.kind === 'preset'
            ? sheet.accommodation?.name
            : sheet?.kind === 'event'
              ? sheet.event?.title
              : sheet?.guest
                ? sheet.guest.customPlaceLabel
                : ''
        }
      >
        {sheet?.kind === 'event' && sheet.event && (
          <div className="space-y-3">
            {sheet.event.isOfficial && (
              <span className="inline-block rounded-full bg-terra-dark px-2 py-0.5 text-[10px] font-bold tracking-wider text-cream uppercase">
                Dos noivos 💍
              </span>
            )}
            <div className="flex items-center gap-2 text-sm text-ink">
              <CalendarDays size={16} className="text-terra" /> {formatEventWhen(sheet.event.date, sheet.event.time)}
            </div>
            {sheet.event.placeLabel && <div className="text-sm text-ink-soft">{sheet.event.placeLabel}</div>}
            {sheet.event.description && <p className="text-sm whitespace-pre-wrap text-ink">{sheet.event.description}</p>}
            <div className="text-sm text-ink-soft">
              {sheet.event.counts.people === 0
                ? 'Ninguém confirmou ainda.'
                : `${sheet.event.counts.people} ${sheet.event.counts.people === 1 ? 'pessoa confirmada' : 'pessoas confirmadas'}`}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/agenda" className="flex items-center gap-1.5 rounded-full bg-terra-dark px-3.5 py-2 text-sm font-semibold text-cream">
                <CalendarDays size={15} /> Responder na Agenda
              </Link>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${sheet.event.placeLat},${sheet.event.placeLng}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-terra px-3.5 py-2 text-sm font-semibold text-terra-dark"
              >
                <Navigation size={15} /> Abrir no Maps
              </a>
            </div>
          </div>
        )}
        {sheet?.kind === 'preset' && sheet.accommodation && (
          <div className="space-y-4">
            <div className="text-sm text-ink-soft">
              {sheet.accommodation.city}
              {sheet.accommodation.description ? ` · ${sheet.accommodation.description}` : ''}
            </div>
            <div className="flex flex-wrap gap-2">
              {sheet.accommodation.type === 'evento' && (
                <a href={w.mapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full bg-terra-dark px-3.5 py-2 text-sm font-semibold text-cream">
                  <Navigation size={15} /> Como chegar
                </a>
              )}
              {sheet.accommodation.type !== 'evento' && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${sheet.accommodation.lat},${sheet.accommodation.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-full border border-terra px-3.5 py-2 text-sm font-semibold text-terra-dark"
                >
                  <Navigation size={15} /> Abrir no Maps
                </a>
              )}
              {sheet.accommodation.instagram && (
                <a href={`https://www.instagram.com/${sheet.accommodation.instagram}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full border border-terra px-3.5 py-2 text-sm font-semibold text-terra-dark">
                  <Instagram size={15} /> Instagram
                </a>
              )}
              {sheet.accommodation.whatsapp && (
                <a href={whatsappLink(sheet.accommodation.whatsapp)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-full border border-terra px-3.5 py-2 text-sm font-semibold text-terra-dark">
                  <MessageCircle size={15} /> WhatsApp
                </a>
              )}
            </div>
            {sheet.accommodation.type !== 'evento' && (
              <div>
                <div className="mb-2 flex items-center gap-2 font-serif text-lg font-semibold text-terra-dark">
                  <Users size={18} />
                  {sheetGuests.length === 0
                    ? 'Ninguém por aqui ainda'
                    : countPeople(sheetGuests) === 1
                      ? '1 pessoa fica aqui'
                      : `${countPeople(sheetGuests)} pessoas ficam aqui`}
                </div>
                <GuestRows guests={sheetGuests} meId={me?.id} online={online} />
              </div>
            )}
          </div>
        )}
        {sheet?.kind === 'custom' && sheet.guest && (
          <div className="space-y-3">
            <div className="text-sm text-ink-soft">{sheet.guest.customCity && sheet.guest.customCity !== 'Outro' ? sheet.guest.customCity : 'Outro lugar'}</div>
            <GuestRows guests={[sheet.guest]} meId={me?.id} online={online} />
          </div>
        )}
      </BottomSheet>

      {/* Lista completa */}
      <BottomSheet open={listOpen} onClose={() => setListOpen(false)} title="Onde a galera fica">
        <div className="space-y-5">
          {accommodations
            .filter((a) => a.type !== 'evento')
            .map((a) => {
              const list = guestsByAcc.get(a.id) ?? [];
              return (
                <div key={a.id}>
                  <button type="button" onClick={() => focusOn(a.lat, a.lng)} className="mb-1.5 flex w-full items-baseline justify-between text-left">
                    <span className="font-serif text-lg font-semibold text-terra-dark">{a.name}</span>
                    <span className="text-xs text-ink-soft">
                      {a.city} · {countPeople(list)}
                    </span>
                  </button>
                  {list.length > 0 ? <GuestRows guests={list} meId={me?.id} online={online} compact /> : <p className="text-xs text-ink-soft">Ninguém ainda.</p>}
                </div>
              );
            })}
          {(customGuests.length > 0 || customNoPoint.length > 0) && (
            <div>
              <div className="mb-1.5 font-serif text-lg font-semibold text-terra-dark">Outros lugares</div>
              <GuestRows
                guests={[...customGuests, ...customNoPoint]}
                meId={me?.id}
                online={online}
                compact
                subtitle={(g) => stayLabel(g, accById)}
                onPick={(g) => (g.customLat !== null && g.customLng !== null ? focusOn(g.customLat, g.customLng) : undefined)}
              />
            </div>
          )}
          {undecided.length > 0 && (
            <div>
              <div className="mb-1.5 font-serif text-lg font-semibold text-terra-dark">Ainda não decidiram ({undecided.length})</div>
              <GuestRows guests={undecided} meId={me?.id} online={online} compact />
            </div>
          )}
          {guestList.length === 0 && <p className="text-sm text-ink-soft">Ninguém entrou ainda.</p>}
          {me && !me.accommodationId && !me.customPlaceLabel && (
            <Link to="/perfil" className="block rounded-2xl bg-terra-pale px-4 py-3 text-center text-sm font-semibold text-terra-dark">
              Diga onde você vai ficar →
            </Link>
          )}
        </div>
      </BottomSheet>

      {viewer !== null && locatedPhotos[viewer] && (
        <PhotoViewer photos={locatedPhotos} index={viewer} onClose={() => setViewer(null)} onIndexChange={setViewer} />
      )}
    </div>
  );
}

function ZoomWatcher({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
  });
  useEffect(() => {
    onZoom(map.getZoom());
  }, [map, onZoom]);
  return null;
}

function GuestRows({
  guests,
  meId,
  online,
  compact = false,
  subtitle,
  onPick,
}: {
  guests: GuestPublic[];
  meId?: string;
  online: string[];
  compact?: boolean;
  subtitle?: (g: GuestPublic) => string;
  onPick?: (g: GuestPublic) => void;
}) {
  return (
    <ul className="divide-y divide-sand/70">
      {guests.map((g) => {
        const dates = datesLabel(g);
        const sub = subtitle?.(g);
        const withCompanions = g.companions?.length ? `com ${joinNames(g.companions)}` : '';
        const details = [withCompanions, sub, dates].filter(Boolean).join(' · ');
        return (
          <li key={g.id} className={`flex items-center gap-3 ${compact ? 'py-1.5' : 'py-2.5'}`}>
            <button type="button" onClick={() => onPick?.(g)} className="flex min-w-0 flex-1 items-center gap-3 text-left" disabled={!onPick}>
              <Avatar guest={g} size={compact ? 30 : 38} online={online.includes(g.id)} badge={companionBadge(g.companions)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink">
                  {g.name}
                  {g.id === meId && <span className="ml-1 text-xs font-normal text-terra">(você)</span>}
                </span>
                {details && <span className="block truncate text-xs text-ink-soft">{details}</span>}
              </span>
            </button>
            {g.whatsapp && g.id !== meId && (
              <a
                href={whatsappLink(g.whatsapp, `Oi ${firstName(g.name)}! Vi você na galera do casamento da Babi e do Pedro.`)}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-terra-pale p-2 text-terra-dark"
                aria-label={`WhatsApp de ${g.name}`}
              >
                <MessageCircle size={16} />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
