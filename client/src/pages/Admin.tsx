import { CalendarDays, Check, Download, Images, MessageCircle, RefreshCw, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { PhotoViewer } from '../components/PhotoViewer';
import { api, errorMessage } from '../lib/api';
import { formatDateTime, formatDayMonth, formatEventWhen, whatsappLink } from '../lib/format';
import { toast } from '../lib/toast';
import type { Accommodation, GuestPublic } from '../lib/types';
import { useStore } from '../store';

interface Stats {
  guests: number;
  people: number;
  photos: number;
  messages: number;
  online: number;
  guestsWithoutArrival: number;
}

interface AdminGuest extends GuestPublic {
  phone: string;
  phoneFormatted: string;
  cpf: string | null;
  companionHasCpf: boolean[];
  showPhone: boolean;
  accommodation: Accommodation | null;
}

/** Marca se a pessoa já informou o CPF: check verde ou "sem CPF" discreto. */
function CpfMark({ ok, small = false }: { ok: boolean; small?: boolean }) {
  return ok ? (
    <span
      title="CPF informado"
      aria-label="CPF informado"
      className={`inline-flex items-center gap-0.5 rounded-full bg-emerald-100 font-bold text-emerald-700 ${small ? 'px-1 text-[9px]' : 'px-1.5 text-[10px]'}`}
    >
      <Check size={small ? 9 : 11} strokeWidth={3} /> CPF
    </span>
  ) : (
    <span
      title="Ainda não informou o CPF"
      aria-label="Sem CPF"
      className={`inline-flex items-center rounded-full border border-dashed border-sand text-ink-soft ${small ? 'px-1 text-[9px]' : 'px-1.5 text-[10px]'}`}
    >
      sem CPF
    </span>
  );
}

export function Admin() {
  const isAdmin = useStore((s) => s.isAdmin);
  const authStatus = useStore((s) => s.authStatus);
  const photos = useStore((s) => s.photos);
  const photosLoaded = useStore((s) => s.photosLoaded);
  const loadPhotos = useStore((s) => s.loadPhotos);
  const deletePhoto = useStore((s) => s.deletePhoto);
  const storeGuests = useStore((s) => s.guests);
  const events = useStore((s) => s.events);
  const eventsLoaded = useStore((s) => s.eventsLoaded);
  const loadEvents = useStore((s) => s.loadEvents);
  const [stats, setStats] = useState<Stats | null>(null);
  const [guests, setGuests] = useState<AdminGuest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmPhoto, setConfirmPhoto] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, g] = await Promise.all([api<Stats>('/api/admin/stats'), api<{ guests: AdminGuest[] }>('/api/admin/guests')]);
      setStats(s);
      setGuests(g.guests);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      void load();
      if (!photosLoaded) void loadPhotos().catch(() => undefined);
      if (!eventsLoaded) void loadEvents().catch(() => undefined);
    }
  }, [isAdmin, photosLoaded, loadPhotos, eventsLoaded, loadEvents]);

  if (authStatus === 'authed' && !isAdmin) return <Navigate to="/" replace />;

  const removePhoto = async (id: string) => {
    setConfirmPhoto(null);
    try {
      await deletePhoto(id);
      toast.success('Foto apagada.');
      setStats((s) => (s ? { ...s, photos: Math.max(0, s.photos - 1) } : s));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-5 px-4 pt-4 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold text-terra-dark">
          <ShieldCheck size={24} /> Administração
        </h1>
        <button type="button" onClick={load} disabled={loading} className="rounded-full p-2 text-terra hover:bg-terra-pale disabled:opacity-50" aria-label="Atualizar">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <div className="rounded-2xl bg-rose/10 px-4 py-3 text-sm font-semibold text-rose">{error}</div>}

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat icon={<Users size={16} />} label="Cadastros" value={stats.guests} />
          <Stat icon={<Users size={16} />} label="Pessoas" value={stats.people} />
          <Stat icon={<Images size={16} />} label="Fotos" value={stats.photos} />
          <Stat icon={<MessageCircle size={16} />} label="Mensagens" value={stats.messages} />
          <Stat icon={<span className="size-2 rounded-full bg-emerald-500" />} label="Online" value={stats.online} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <a href="/api/admin/pessoas.csv" download className="flex items-center gap-1.5 rounded-full bg-terra-dark px-4 py-2 text-sm font-semibold text-cream">
          <Download size={15} /> Planilha de pessoas e CPF
        </a>
        <a href="/api/admin/guests.csv" download className="flex items-center gap-1.5 rounded-full border border-terra px-4 py-2 text-sm font-semibold text-terra-dark">
          <Download size={15} /> Lista por conta (CSV)
        </a>
        <a href="/api/admin/photos.zip" download className="flex items-center gap-1.5 rounded-full border border-terra px-4 py-2 text-sm font-semibold text-terra-dark">
          <Download size={15} /> Todas as fotos (ZIP)
        </a>
      </div>

      <p className="-mt-2 text-xs text-ink-soft">
        A planilha de pessoas abre no Excel e no Google Planilhas: uma linha por pessoa (titular e acompanhantes), com CPF, hospedagem, datas e
        as respostas dos combinados.
      </p>

      <section className="overflow-hidden rounded-3xl border border-sand bg-white/60">
        <div className="flex items-baseline justify-between border-b border-sand px-4 py-3">
          <span className="flex items-center gap-2 font-serif text-lg font-semibold text-terra-dark">
            <CalendarDays size={18} /> Combinados ({events.length})
          </span>
          <span className="text-xs text-ink-soft">Confirmados · talvez · não vão</span>
        </div>
        {eventsLoaded && events.length === 0 ? (
          <p className="px-4 py-5 text-center text-sm text-ink-soft">Nenhum combinado ainda. Crie o primeiro na Agenda.</p>
        ) : (
          <ul className="divide-y divide-sand/70">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="font-semibold text-ink">{e.title}</span>
                    {e.isOfficial && <span className="rounded-full bg-terra-pale px-2 text-[10px] font-bold text-terra-dark uppercase">noivos</span>}
                  </div>
                  <div className="text-ink-soft">
                    {formatEventWhen(e.date, e.time)}
                    {e.placeLabel ? ` · ${e.placeLabel}` : ''}
                  </div>
                  <div className="text-ink-soft">
                    <strong className="text-terra-dark">{e.counts.people}</strong> {e.counts.people === 1 ? 'pessoa confirmada' : 'pessoas confirmadas'} ·{' '}
                    {e.counts.maybe} talvez · {e.counts.no} não {e.counts.no === 1 ? 'vai' : 'vão'}
                  </div>
                </div>
                <a
                  href={`/api/events/${e.id}/rsvps.csv`}
                  download
                  className="flex shrink-0 items-center gap-1 rounded-full border border-terra px-3 py-1.5 text-xs font-semibold text-terra-dark"
                  title="Baixar lista de confirmados"
                >
                  <Download size={13} /> CSV
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-3xl border border-sand bg-white/60">
        <div className="flex items-baseline justify-between border-b border-sand px-4 py-3">
          <span className="font-serif text-lg font-semibold text-terra-dark">Fotos ({photos.length})</span>
          <span className="text-xs text-ink-soft">Toque para ver · lixeira para apagar</span>
        </div>
        {photosLoaded && photos.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-soft">Nenhuma foto publicada ainda.</p>
        ) : (
          <div className="grid grid-cols-3 gap-1 p-1 sm:grid-cols-4">
            {photos.map((p, i) => {
              const author = storeGuests[p.guestId] ?? p.guest;
              return (
                <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-sand">
                  <button type="button" onClick={() => setViewer(i)} className="block h-full w-full">
                    <img src={p.thumbUrl} alt={p.caption ?? ''} className="h-full w-full object-cover" loading="lazy" />
                  </button>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 pt-4 pb-1 text-[10px] text-cream">
                    {author?.name ?? 'Convidado'}
                  </div>
                  {confirmPhoto === p.id ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-terra-dark/85 p-2 text-center text-cream animate-fade-in">
                      <span className="text-xs font-semibold">Apagar?</span>
                      <button type="button" onClick={() => removePhoto(p.id)} className="rounded-full bg-rose px-3 py-1 text-xs font-bold">
                        Sim
                      </button>
                      <button type="button" onClick={() => setConfirmPhoto(null)} className="rounded-full bg-white/20 px-3 py-1 text-xs">
                        Não
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmPhoto(p.id)}
                      className="absolute top-1 right-1 rounded-full bg-cream/90 p-1.5 text-terra-dark shadow-soft hover:bg-rose hover:text-cream"
                      aria-label="Apagar foto"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-xs text-ink-soft">
        Mensagens impróprias no mural também podem ser apagadas por você: use a lixeira ao lado de cada mensagem. Como admin,
        você pode apagar qualquer conteúdo; cada convidado só apaga o que postou.
      </p>

      <section className="overflow-hidden rounded-3xl border border-sand bg-white/60">
        <div className="border-b border-sand px-4 py-3 font-serif text-lg font-semibold text-terra-dark">
          Convidados ({guests.length})
          {stats && stats.guestsWithoutArrival > 0 && (
            <span className="ml-2 font-sans text-xs font-normal text-ink-soft">{stats.guestsWithoutArrival} sem data de chegada</span>
          )}
        </div>
        <ul className="divide-y divide-sand/70">
          {guests.map((g) => (
            <li key={g.id} className="flex items-start gap-3 px-4 py-3">
              <Avatar guest={g} size={38} />
              <div className="min-w-0 flex-1 text-sm">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="font-semibold text-ink">{g.name}</span>
                  <CpfMark ok={!!g.cpf} />
                  {g.isAdmin && <span className="rounded-full bg-terra-pale px-2 text-[10px] font-bold text-terra-dark uppercase">admin</span>}
                  {g.companions?.length > 0 && (
                    <span className="rounded-full bg-rose/10 px-2 text-[10px] font-bold text-rose uppercase">+{g.companions.length}</span>
                  )}
                </div>
                {g.companions?.length > 0 && (
                  <div className="text-ink-soft">
                    Com{' '}
                    {g.companions.map((name, i) => (
                      <span key={i} className="whitespace-nowrap">
                        {name} <CpfMark ok={!!g.companionHasCpf?.[i]} small />
                        {i < g.companions.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                )}
                <div className="text-ink-soft">
                  {g.phone ? (
                    <>
                      <a href={whatsappLink(g.phone)} target="_blank" rel="noreferrer" className="underline">
                        {g.phoneFormatted}
                      </a>
                      {g.showPhone ? '' : ' · oculto para os outros'}
                    </>
                  ) : (
                    'Sem telefone na lista'
                  )}
                  {!g.joined && ' · ainda não entrou no app'}
                </div>
                <div className="text-ink-soft">
                  {g.accommodation ? `${g.accommodation.name} (${g.accommodation.city})` : g.customPlaceLabel ? `${g.customPlaceLabel}${g.customCity && g.customCity !== 'Outro' ? ` (${g.customCity})` : ''}` : 'Hospedagem não informada'}
                </div>
                <div className="text-ink-soft">
                  {g.arrivalDate ? `Chega ${formatDayMonth(g.arrivalDate)}` : 'Sem data de chegada'}
                  {g.departureDate ? ` · sai ${formatDayMonth(g.departureDate)}` : ''}
                </div>
                <div className="text-[11px] text-ink-soft/80">
                  Entrou {formatDateTime(g.createdAt)} · visto {formatDateTime(g.lastSeenAt)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {viewer !== null && photos[viewer] && (
        <PhotoViewer photos={photos} index={viewer} onClose={() => setViewer(null)} onIndexChange={setViewer} />
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-sand bg-white/60 p-3 shadow-soft">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-terra uppercase">
        {icon} {label}
      </div>
      <div className="font-serif text-3xl font-semibold text-terra-dark">{value}</div>
    </div>
  );
}
