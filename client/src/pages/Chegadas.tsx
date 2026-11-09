import { CalendarDays, PlaneLanding, PlaneTakeoff } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { addDays, companionBadge, countPeople, daysBetween, formatDateLong, formatDateShort, partyLabel } from '../lib/format';
import type { GuestPublic } from '../lib/types';
import { useStore } from '../store';

const WEDDING_DAY = '2026-11-19';

export function Chegadas() {
  const me = useStore((s) => s.me);
  const config = useStore((s) => s.config);
  const guests = useStore((s) => s.guests);
  const guestsLoaded = useStore((s) => s.guestsLoaded);
  const loadGuests = useStore((s) => s.loadGuests);

  useEffect(() => {
    if (!guestsLoaded) void loadGuests().catch(() => undefined);
  }, [guestsLoaded, loadGuests]);

  const accById = useMemo(() => Object.fromEntries((config?.accommodations ?? []).map((a) => [a.id, a])), [config]);
  const list = useMemo(() => Object.values(guests), [guests]);
  const withDates = useMemo(() => list.filter((g) => g.arrivalDate || g.departureDate), [list]);
  const withoutDates = useMemo(() => list.filter((g) => !g.arrivalDate && !g.departureDate), [list]);

  const { days, maxCount } = useMemo(() => {
    let start = WEDDING_DAY;
    let end = WEDDING_DAY;
    for (const g of withDates) {
      if (g.arrivalDate && g.arrivalDate < start) start = g.arrivalDate;
      if (g.departureDate && g.departureDate > end) end = g.departureDate;
      if (g.arrivalDate && g.arrivalDate > end) end = g.arrivalDate;
    }
    start = addDays(start, -1);
    end = addDays(end, 1);
    const span = Math.min(45, Math.max(3, daysBetween(start, end)));
    const result: { date: string; present: GuestPublic[]; presentCount: number; arriving: GuestPublic[]; leaving: GuestPublic[] }[] = [];
    let max = 0;
    for (let i = 0; i <= span; i++) {
      const date = addDays(start, i);
      const present = withDates.filter((g) => {
        const a = g.arrivalDate ?? g.departureDate!;
        const d = g.departureDate ?? (g.arrivalDate! <= WEDDING_DAY ? WEDDING_DAY : g.arrivalDate!);
        return a <= date && date <= d;
      });
      const arriving = withDates.filter((g) => g.arrivalDate === date);
      const leaving = withDates.filter((g) => g.departureDate === date);
      const presentCount = countPeople(present);
      max = Math.max(max, presentCount);
      result.push({ date, present, presentCount, arriving, leaving });
    }
    return { days: result, maxCount: max };
  }, [withDates]);

  const placeOf = (g: GuestPublic) =>
    g.accommodationId && accById[g.accommodationId] ? accById[g.accommodationId].name : g.customPlaceLabel ?? null;

  return (
    <div className="space-y-5 px-4 pt-4 pb-10">
      <div>
        <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold text-terra-dark">
          <CalendarDays size={24} /> Quem chega quando
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          Para combinar carona, passeio de buggy, Beach Park, jantar… A festa é {formatDateShort(WEDDING_DAY)}.
        </p>
      </div>

      {me && !me.arrivalDate && (
        <Link to="/perfil" className="block rounded-2xl border border-terra bg-terra-pale px-4 py-3 text-sm font-semibold text-terra-dark">
          Você ainda não disse quando chega. Preencher no perfil →
        </Link>
      )}

      {withDates.length === 0 ? (
        <p className="rounded-2xl border border-sand bg-white/60 p-4 text-sm text-ink-soft">
          Ninguém informou as datas ainda. Quando a galera preencher, aparece aqui quem está na cidade em cada dia.
        </p>
      ) : (
        <>
          <section className="rounded-3xl border border-sand bg-white/60 p-4 shadow-soft">
            <div className="mb-3 text-xs font-bold tracking-widest text-terra uppercase">Quantos estaremos por lá</div>
            <ul className="space-y-1.5">
              {days.map((d) => {
                const isWedding = d.date === WEDDING_DAY;
                const pct = maxCount ? (d.presentCount / maxCount) * 100 : 0;
                return (
                  <li key={d.date} className="flex items-center gap-2 text-xs">
                    <span className={`w-16 shrink-0 ${isWedding ? 'font-bold text-rose' : 'text-ink-soft'}`}>{formatDateShort(d.date)}</span>
                    <span className="h-5 flex-1 overflow-hidden rounded-full bg-cream-dark">
                      <span
                        className={`block h-full rounded-full ${isWedding ? 'bg-rose' : 'bg-terra'}`}
                        style={{ width: `${Math.max(d.presentCount ? 6 : 0, pct)}%` }}
                      />
                    </span>
                    <span className="w-6 text-right font-semibold text-terra-dark tabular-nums">{d.presentCount}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[11px] text-ink-soft">
              Acompanhantes contam junto. Quem não informou a saída conta como presente até o dia da festa.
            </p>
          </section>

          <section className="space-y-3">
            {days
              .filter((d) => d.arriving.length || d.leaving.length)
              .map((d) => (
                <div key={d.date} className="rounded-3xl border border-sand bg-white/60 p-4 shadow-soft">
                  <div className={`font-serif text-lg font-semibold ${d.date === WEDDING_DAY ? 'text-rose' : 'text-terra-dark'}`}>
                    {formatDateLong(d.date)}
                    {d.date === WEDDING_DAY && <span className="ml-2 font-sans text-xs font-bold tracking-widest uppercase">· Casamento 💍</span>}
                  </div>
                  {d.arriving.length > 0 && (
                    <div className="mt-2">
                      <div className="mb-1 flex items-center gap-1.5 text-xs font-bold tracking-wider text-terra uppercase">
                        <PlaneLanding size={13} /> Chegam
                      </div>
                      <GuestChips guests={d.arriving} meId={me?.id} placeOf={placeOf} />
                    </div>
                  )}
                  {d.leaving.length > 0 && (
                    <div className="mt-2">
                      <div className="mb-1 flex items-center gap-1.5 text-xs font-bold tracking-wider text-ink-soft uppercase">
                        <PlaneTakeoff size={13} /> Vão embora
                      </div>
                      <GuestChips guests={d.leaving} meId={me?.id} placeOf={placeOf} />
                    </div>
                  )}
                </div>
              ))}
          </section>
        </>
      )}

      {withoutDates.length > 0 && (
        <section className="rounded-3xl border border-dashed border-sand p-4">
          <div className="mb-2 text-xs font-bold tracking-widest text-ink-soft uppercase">Ainda sem datas ({withoutDates.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {withoutDates.map((g) => (
              <span key={g.id} className="flex items-center gap-1.5 rounded-full bg-cream-dark px-2.5 py-1 text-xs text-ink">
                <Avatar guest={g} size={18} /> {g.name}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function GuestChips({ guests, meId, placeOf }: { guests: GuestPublic[]; meId?: string; placeOf: (g: GuestPublic) => string | null }) {
  return (
    <ul className="space-y-1.5">
      {guests.map((g) => {
        const place = placeOf(g);
        return (
          <li key={g.id} className="flex items-center gap-2.5">
            <Avatar guest={g} size={28} badge={companionBadge(g.companions)} />
            <span className="min-w-0 flex-1 truncate text-sm">
              <span className={`font-semibold ${g.id === meId ? 'text-terra' : 'text-ink'}`}>{partyLabel(g.name, g.companions)}</span>
              {place && <span className="text-ink-soft"> · {place}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
