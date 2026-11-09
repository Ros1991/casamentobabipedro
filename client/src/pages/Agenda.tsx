import { CalendarDays, CalendarPlus, PlaneLanding } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EventCard } from '../components/EventCard';
import { EventForm } from '../components/EventForm';
import { toDateOnly } from '../lib/format';
import type { EventItem } from '../lib/types';
import { useStore } from '../store';
import { Chegadas } from './Chegadas';

type Tab = 'combinados' | 'chegadas';

export function Agenda() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'chegadas' ? 'chegadas' : 'combinados';
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    if (t === 'combinados') next.delete('tab');
    else next.set('tab', t);
    setParams(next, { replace: true });
  };

  return (
    <div className="min-h-full pb-6">
      <div className="sticky top-0 z-10 flex gap-1 border-b border-sand bg-cream/95 px-4 py-2 backdrop-blur">
        <TabButton active={tab === 'combinados'} onClick={() => setTab('combinados')} icon={<CalendarDays size={16} />} label="Combinados" />
        <TabButton active={tab === 'chegadas'} onClick={() => setTab('chegadas')} icon={<PlaneLanding size={16} />} label="Quem chega quando" />
      </div>
      {tab === 'combinados' ? <Combinados /> : <Chegadas />}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition ${
        active ? 'bg-terra-dark text-cream' : 'text-terra-dark hover:bg-terra-pale'
      }`}
    >
      {icon} {label}
    </button>
  );
}

function Combinados() {
  const isAdmin = useStore((s) => s.isAdmin);
  const events = useStore((s) => s.events);
  const eventsLoaded = useStore((s) => s.eventsLoaded);
  const loadEvents = useStore((s) => s.loadEvents);
  const guestsLoaded = useStore((s) => s.guestsLoaded);
  const loadGuests = useStore((s) => s.loadGuests);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EventItem | null>(null);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    if (!eventsLoaded) void loadEvents().catch(() => undefined);
    if (!guestsLoaded) void loadGuests().catch(() => undefined);
  }, [eventsLoaded, guestsLoaded, loadEvents, loadGuests]);

  const today = toDateOnly(new Date());
  const { upcoming, past } = useMemo(() => {
    const upcomingList = events.filter((e) => e.date >= today);
    // Oficiais primeiro dentro do mesmo dia
    upcomingList.sort(
      (a, b) =>
        a.date.localeCompare(b.date) || Number(b.isOfficial) - Number(a.isOfficial) || (a.time ?? '99:99').localeCompare(b.time ?? '99:99'),
    );
    return { upcoming: upcomingList, past: events.filter((e) => e.date < today).reverse() };
  }, [events, today]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (e: EventItem) => {
    setEditing(e);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4 px-4 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-terra-dark">Combinados</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Os programas dos noivos e da galera. Responda se vai, e todo mundo sabe quem estará lá.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={openCreate}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-terra px-4 py-3 font-semibold text-terra-dark hover:bg-terra-pale"
      >
        <CalendarPlus size={18} /> {isAdmin ? 'Criar combinado dos noivos' : 'Propor um combinado para a galera'}
      </button>

      {eventsLoaded && upcoming.length === 0 && (
        <div className="rounded-3xl border border-sand bg-white/60 p-6 text-center text-ink-soft">
          <p className="font-script text-3xl text-terra-dark">Nada combinado ainda</p>
          <p className="mt-1 text-sm">Que tal propor um passeio, um jantar ou um café para a galera se encontrar?</p>
        </div>
      )}

      {upcoming.map((e) => (
        <EventCard key={e.id} event={e} onEdit={openEdit} />
      ))}

      {past.length > 0 && (
        <div className="pt-2">
          <button type="button" onClick={() => setShowPast((v) => !v)} className="text-sm font-semibold text-terra underline">
            {showPast ? 'Esconder' : 'Ver'} {past.length === 1 ? '1 combinado que já passou' : `${past.length} combinados que já passaram`}
          </button>
          {showPast && (
            <div className="mt-3 space-y-3">
              {past.map((e) => (
                <EventCard key={e.id} event={e} onEdit={openEdit} />
              ))}
            </div>
          )}
        </div>
      )}

      <EventForm open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
    </div>
  );
}
