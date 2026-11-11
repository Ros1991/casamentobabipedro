import { CalendarDays, Check, Clock, HelpCircle, Hourglass, MapPin, MessagesSquare, Minus, MoreHorizontal, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../lib/api';
import { formatDateLong, joinNames } from '../lib/format';
import { toast } from '../lib/toast';
import type { EventItem, RsvpStatus } from '../lib/types';
import { useStore } from '../store';
import { Avatar } from './Avatar';
import { BottomSheet } from './BottomSheet';

interface Props {
  event: EventItem;
  onEdit?: (event: EventItem) => void;
  /** Versão resumida para o Início */
  compact?: boolean;
}

const STATUS_LABEL: Record<string, string> = { yes: 'Vou', maybe: 'Talvez', no: 'Não vou' };

/** Botão único mostrado depois que a pessoa responde. */
const ANSWER: Record<string, { label: string; tone: string }> = {
  yes: { label: 'Você vai', tone: 'border-terra-dark bg-terra-dark text-cream' },
  maybe: { label: 'Talvez você vá', tone: 'border-terra bg-terra text-cream' },
  no: { label: 'Você não vai', tone: 'border-rose bg-rose text-cream' },
};

export function EventCard({ event, onEdit, compact = false }: Props) {
  const me = useStore((s) => s.me);
  const isAdmin = useStore((s) => s.isAdmin);
  const guests = useStore((s) => s.guests);
  const setRsvp = useStore((s) => s.setRsvp);
  const deleteEvent = useStore((s) => s.deleteEvent);
  const [busy, setBusy] = useState(false);
  const [whoOpen, setWhoOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const mine = event.rsvps.find((r) => r.guestId === me?.id);
  const myStatus = mine?.status ?? null;
  const partySize = me?.partySize ?? 1;
  const canManage = !!me && (event.createdBy.id === me.id || isAdmin);
  const going = event.rsvps.filter((r) => r.status === 'yes');
  const isPast = event.date < new Date().toISOString().slice(0, 10);
  // Só admins: quem ainda não respondeu a este combinado (quem criou não entra)
  const pending = isAdmin
    ? Object.values(guests)
        .filter((g) => g.id !== event.createdBy.id && !event.rsvps.some((r) => r.guestId === g.id))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const pendingPeople = pending.reduce((n, g) => n + g.partySize, 0);

  const respond = async (status: RsvpStatus | 'none', peopleCount?: number) => {
    setBusy(true);
    try {
      await setRsvp(event.id, status, peopleCount);
      if (status === 'yes') toast.success(`Presença confirmada em "${event.title}"!`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setConfirmDelete(false);
    setMenuOpen(false);
    try {
      await deleteEvent(event.id);
      toast.success('Combinado apagado.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const rsvpButton = (status: RsvpStatus, label: string, Icon: typeof Check) => {
    const active = myStatus === status;
    const tone =
      status === 'yes'
        ? active
          ? 'bg-terra-dark text-cream border-terra-dark'
          : 'border-terra text-terra-dark hover:bg-terra-pale'
        : status === 'maybe'
          ? active
            ? 'bg-terra text-cream border-terra'
            : 'border-sand text-ink-soft hover:bg-cream-dark'
          : active
            ? 'bg-rose text-cream border-rose'
            : 'border-sand text-ink-soft hover:bg-cream-dark';
    return (
      <button
        key={status}
        type="button"
        disabled={busy}
        onClick={() => respond(status)}
        className={`flex flex-1 items-center justify-center gap-1 rounded-full border px-3 py-2 text-sm font-semibold transition disabled:opacity-60 ${tone}`}
      >
        <Icon size={15} /> {label}
      </button>
    );
  };

  return (
    <article
      className={`relative rounded-3xl border p-4 shadow-soft ${
        event.isOfficial ? 'border-terra bg-terra-pale/60' : 'border-sand bg-white/60'
      } ${isPast ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex w-14 shrink-0 flex-col items-center rounded-2xl py-2 ${
            event.isOfficial ? 'bg-terra-dark text-cream' : 'bg-cream-dark text-terra-dark'
          }`}
        >
          <span className="text-[10px] font-bold tracking-wider uppercase">{weekdayShort(event.date)}</span>
          <span className="font-serif text-2xl leading-none font-semibold">{event.date.slice(8, 10)}</span>
          <span className="text-[10px] font-semibold uppercase">{monthShort(event.date)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {event.isOfficial && (
              <span className="rounded-full bg-terra-dark px-2 py-0.5 text-[10px] font-bold tracking-wider text-cream uppercase">
                Dos noivos 💍
              </span>
            )}
            {!event.isOfficial && <span className="text-xs text-ink-soft">Proposto por {event.createdBy.name}</span>}
          </div>
          <h3 className="mt-0.5 font-serif text-xl leading-tight font-semibold text-terra-dark">{event.title}</h3>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-ink-soft">
            <span className="flex items-center gap-1">
              <CalendarDays size={14} /> {formatDateLong(event.date)}
            </span>
            {event.time && (
              <span className="flex items-center gap-1">
                <Clock size={14} /> {event.time}
              </span>
            )}
            {event.placeLabel &&
              (event.placeLat !== null && event.placeLng !== null ? (
                <Link to={`/mapa?evento=${event.id}`} className="flex items-center gap-1 underline">
                  <MapPin size={14} /> {event.placeLabel}
                </Link>
              ) : (
                <span className="flex items-center gap-1">
                  <MapPin size={14} /> {event.placeLabel}
                </span>
              ))}
          </div>
          {!compact && event.description && <p className="mt-2 text-sm whitespace-pre-wrap text-ink">{event.description}</p>}
        </div>
        {canManage && !compact && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-full p-1.5 text-ink-soft hover:bg-cream-dark"
              aria-label="Opções do combinado"
            >
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              <>
                <button type="button" className="fixed inset-0 z-[1000] cursor-default" aria-label="Fechar" onClick={() => setMenuOpen(false)} />
                <div className="absolute top-full right-0 z-[1010] mt-1 min-w-40 overflow-hidden rounded-2xl border border-sand bg-cream shadow-soft animate-fade-in">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onEdit?.(event);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-terra-dark hover:bg-terra-pale"
                  >
                    <Pencil size={15} /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmDelete(true);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-rose hover:bg-rose/10"
                  >
                    <Trash2 size={15} /> Apagar
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-rose/10 px-3 py-2 text-sm text-rose">
          <span>Apagar este combinado para todo mundo?</span>
          <span className="flex gap-1">
            <button type="button" onClick={remove} className="rounded-full bg-rose px-3 py-1 font-semibold text-cream">
              Sim
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-full border border-rose/40 px-3 py-1">
              Não
            </button>
          </span>
        </div>
      )}

      {/* Confirmação */}
      {/* Sem resposta: três opções. Com resposta: um botão só dizendo o que foi escolhido; tocar nele desfaz. */}
      {!isPast && !myStatus && (
        <div className="mt-3">
          <div className="mb-1.5 text-xs font-semibold text-ink-soft">Você vai?</div>
          <div className="flex gap-2">
            {rsvpButton('yes', 'Vou', Check)}
            {rsvpButton('maybe', 'Talvez', HelpCircle)}
            {rsvpButton('no', 'Não vou', X)}
          </div>
        </div>
      )}
      {!isPast && myStatus && (
        <button
          type="button"
          disabled={busy}
          onClick={() => respond('none')}
          aria-label={`${ANSWER[myStatus]?.label ?? 'Respondido'}. Toque para mudar a resposta.`}
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 font-semibold transition disabled:opacity-60 ${ANSWER[myStatus]?.tone ?? ''}`}
        >
          {myStatus === 'yes' ? <Check size={18} /> : myStatus === 'maybe' ? <HelpCircle size={18} /> : <X size={18} />}
          <span>{ANSWER[myStatus]?.label ?? 'Respondido'}</span>
          <span className="text-xs font-normal opacity-80">· toque para mudar</span>
        </button>
      )}

      {myStatus === 'yes' && partySize > 1 && !isPast && (
        <div className="mt-2 flex items-center justify-between rounded-2xl bg-cream px-3 py-2 text-sm">
          <span className="text-ink-soft">
            Quantos de vocês vão? <span className="text-xs">(você{me?.companions?.length ? ` + ${joinNames(me.companions)}` : ''})</span>
          </span>
          <span className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || (mine?.peopleCount ?? 1) <= 1}
              onClick={() => respond('yes', (mine?.peopleCount ?? 1) - 1)}
              className="rounded-full border border-sand p-1 disabled:opacity-40"
              aria-label="Menos uma pessoa"
            >
              <Minus size={14} />
            </button>
            <span className="w-5 text-center font-bold text-terra-dark tabular-nums">{mine?.peopleCount ?? 1}</span>
            <button
              type="button"
              disabled={busy || (mine?.peopleCount ?? 1) >= partySize}
              onClick={() => respond('yes', (mine?.peopleCount ?? 1) + 1)}
              className="rounded-full border border-sand p-1 disabled:opacity-40"
              aria-label="Mais uma pessoa"
            >
              <Plus size={14} />
            </button>
          </span>
        </div>
      )}

      {/* Quem vai */}
      <button type="button" onClick={() => setWhoOpen(true)} className="mt-3 flex w-full items-center gap-2 text-left">
        <div className="flex -space-x-2">
          {going.slice(0, 6).map((r) => {
            const g = guests[r.guestId];
            return g ? <Avatar key={r.guestId} guest={g} size={26} /> : null;
          })}
        </div>
        <span className="flex items-center gap-1 text-sm text-ink-soft">
          <Users size={14} />
          {event.counts.people === 0
            ? 'Ninguém confirmou ainda'
            : `${event.counts.people} ${event.counts.people === 1 ? 'pessoa confirmada' : 'pessoas confirmadas'}`}
          {event.counts.maybe > 0 && ` · ${event.counts.maybe} talvez`}
        </span>
      </button>

      {/* Só admins: quem ainda não respondeu, em um botão à vista no cartão */}
      {isAdmin && pending.length > 0 && (
        <button
          type="button"
          onClick={() => setPendingOpen(true)}
          className="mt-2 flex w-full items-center gap-2 rounded-2xl border border-dashed border-terra-light px-3 py-2 text-left text-sm text-terra-dark"
        >
          <Hourglass size={15} className="shrink-0" />
          <span className="min-w-0 flex-1">
            <strong>{pendingPeople}</strong> ainda não {pendingPeople === 1 ? 'decidiu' : 'decidiram'}
          </span>
          <span className="shrink-0 rounded-full bg-terra-pale px-2 py-0.5 text-[10px] font-bold">só admins</span>
          <span className="shrink-0 font-semibold underline">ver</span>
        </button>
      )}

      {/* Conversa só deste combinado */}
      <Link
        to={`/agenda/${event.id}/conversa`}
        className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-terra-light bg-cream px-4 py-2.5 text-sm font-semibold text-terra-dark"
      >
        <MessagesSquare size={16} /> Conversa do combinado
        {(event.messageCount ?? 0) > 0 && (
          <span className="rounded-full bg-terra px-2 py-0.5 text-[11px] font-bold text-cream">{event.messageCount}</span>
        )}
      </Link>

      <BottomSheet open={whoOpen} onClose={() => setWhoOpen(false)} title={event.title}>
        {(['yes', 'maybe', 'no'] as const).map((status) => {
          const list = event.rsvps.filter((r) => r.status === status);
          if (list.length === 0) return null;
          return (
            <div key={status} className="mb-4">
              <div className="mb-1.5 text-xs font-bold tracking-widest text-terra uppercase">
                {STATUS_LABEL[status]} ({status === 'yes' ? list.reduce((n, r) => n + r.peopleCount, 0) : list.length})
              </div>
              <ul className="divide-y divide-sand/70">
                {list.map((r) => {
                  const g = guests[r.guestId];
                  if (!g) return null;
                  return (
                    <li key={r.guestId} className="flex items-center gap-3 py-2">
                      <Avatar guest={g} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ink">
                          {g.name}
                          {g.id === me?.id && <span className="ml-1 text-xs font-normal text-terra">(você)</span>}
                        </span>
                        {status === 'yes' && r.peopleCount > 1 && (
                          <span className="block text-xs text-ink-soft">{r.peopleCount} pessoas</span>
                        )}
                        {r.note && <span className="block text-xs text-ink-soft">{r.note}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {event.rsvps.length === 0 && <p className="text-sm text-ink-soft">Ninguém respondeu ainda. Seja a primeira pessoa!</p>}
      </BottomSheet>

      <BottomSheet open={pendingOpen} onClose={() => setPendingOpen(false)} title={`Ainda não decidiram: ${event.title}`}>
        {isAdmin && pending.length > 0 && (
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-x-2 text-xs font-bold tracking-widest text-terra uppercase">
              {pendingPeople} {pendingPeople === 1 ? 'pessoa' : 'pessoas'} em {pending.length} {pending.length === 1 ? 'conta' : 'contas'}
              <span className="rounded-full bg-terra-pale px-2 py-0.5 text-[10px] tracking-normal text-terra-dark normal-case">só admins veem</span>
            </div>
            <ul className="divide-y divide-sand/70">
              {pending.map((g) => (
                <li key={g.id} className="flex items-center gap-3 py-2">
                  <Avatar guest={g} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{g.name}</span>
                    <span className="block text-xs text-ink-soft">
                      {g.partySize > 1 ? `${g.partySize} pessoas` : '1 pessoa'}
                      {!g.joined && ' · ainda não entrou no app'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </BottomSheet>
    </article>
  );
}

function weekdayShort(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(new Date(y, m - 1, d, 12)).replace('.', '');
}

function monthShort(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(y, m - 1, d, 12)).replace('.', '');
}
