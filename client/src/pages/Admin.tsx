import { Download, Images, MessageCircle, RefreshCw, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { PhotoViewer } from '../components/PhotoViewer';
import { api, errorMessage } from '../lib/api';
import { formatDateTime, formatDayMonth, whatsappLink } from '../lib/format';
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
  showPhone: boolean;
  accommodation: Accommodation | null;
}

export function Admin() {
  const isAdmin = useStore((s) => s.isAdmin);
  const authStatus = useStore((s) => s.authStatus);
  const photos = useStore((s) => s.photos);
  const photosLoaded = useStore((s) => s.photosLoaded);
  const loadPhotos = useStore((s) => s.loadPhotos);
  const deletePhoto = useStore((s) => s.deletePhoto);
  const storeGuests = useStore((s) => s.guests);
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
    }
  }, [isAdmin, photosLoaded, loadPhotos]);

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
        <a href="/api/admin/guests.csv" download className="flex items-center gap-1.5 rounded-full bg-terra-dark px-4 py-2 text-sm font-semibold text-cream">
          <Download size={15} /> Lista de convidados (CSV)
        </a>
        <a href="/api/admin/photos.zip" download className="flex items-center gap-1.5 rounded-full border border-terra px-4 py-2 text-sm font-semibold text-terra-dark">
          <Download size={15} /> Todas as fotos (ZIP)
        </a>
      </div>

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
                  {g.isAdmin && <span className="rounded-full bg-terra-pale px-2 text-[10px] font-bold text-terra-dark uppercase">admin</span>}
                  {g.companions?.length > 0 && (
                    <span className="rounded-full bg-rose/10 px-2 text-[10px] font-bold text-rose uppercase">+{g.companions.length}</span>
                  )}
                </div>
                {g.companions?.length > 0 && <div className="text-ink-soft">Com {g.companions.join(', ')}</div>}
                <div className="text-ink-soft">
                  <a href={whatsappLink(g.phone)} target="_blank" rel="noreferrer" className="underline">
                    {g.phoneFormatted}
                  </a>
                  {g.showPhone ? '' : ' · oculto para os outros'}
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
