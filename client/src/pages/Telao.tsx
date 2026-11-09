import { Maximize2 } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Avatar } from '../components/Avatar';
import { Monogram } from '../components/Monogram';
import { api, ApiError, errorMessage } from '../lib/api';
import { formatEventWhen, formatTime } from '../lib/format';
import { getSocket } from '../lib/socket';
import type { EventItem, Message, Photo, Wedding } from '../lib/types';

interface Feed {
  photos: Photo[];
  stats: { guests: number; people: number; photos: number };
  nextEvents?: EventItem[];
  wedding: Wedding;
  publicUrl: string;
  inviteCode: string | null;
}

const ROTATE_MS = 9000;

export function Telao() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [fresh, setFresh] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const load = async () => {
    try {
      const data = await api<Feed>('/api/telao/feed');
      setFeed(data);
      setNeedCode(false);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setNeedCode(true);
      else setError(errorMessage(err));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // QR code com o endereço do site e o código do convite já embutido
  useEffect(() => {
    const base = (feed?.publicUrl || window.location.origin) + '/entrar';
    const url = feed?.inviteCode ? `${base}?codigo=${encodeURIComponent(feed.inviteCode)}` : base;
    QRCode.toDataURL(url, { width: 320, margin: 1, color: { dark: '#36441d', light: '#f3f1ea' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [feed?.publicUrl, feed?.inviteCode]);

  // Tempo real: fotos novas entram na frente
  useEffect(() => {
    if (!feed) return;
    const socket = getSocket();
    const onNew = (m: Message) => {
      if (!m.photo) return;
      const photo: Photo = { ...m.photo, guest: m.guest };
      setFeed((f) => (f ? { ...f, photos: [photo, ...f.photos.filter((p) => p.id !== photo.id)], stats: { ...f.stats, photos: f.stats.photos + 1 } } : f));
      setCurrent(0);
      setFresh(photo.id);
      window.setTimeout(() => setFresh((v) => (v === photo.id ? null : v)), 6000);
    };
    const onDeleted = ({ photoId }: { id: number | null; photoId: string | null }) => {
      if (!photoId) return;
      setFeed((f) => (f ? { ...f, photos: f.photos.filter((p) => p.id !== photoId) } : f));
    };
    const onConnect = () => void load();
    socket.on('message:new', onNew);
    socket.on('message:deleted', onDeleted);
    socket.on('connect', onConnect);
    if (!socket.connected) socket.connect();
    return () => {
      socket.off('message:new', onNew);
      socket.off('message:deleted', onDeleted);
      socket.off('connect', onConnect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!feed]);

  // Rotação automática
  const total = feed?.photos.length ?? 0;
  useEffect(() => {
    if (timer.current) window.clearInterval(timer.current);
    if (total <= 1) return;
    timer.current = window.setInterval(() => setCurrent((c) => (c + 1) % total), ROTATE_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [total, fresh]);

  const photo = feed?.photos[Math.min(current, Math.max(0, total - 1))];
  const recent = useMemo(() => feed?.photos.slice(0, 8) ?? [], [feed?.photos]);

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/telao/login', { method: 'POST', json: { code } });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const fullscreen = () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) void el.requestFullscreen?.();
    else void document.exitFullscreen?.();
  };

  if (needCode) {
    return (
      <div className="sand-gradient flex min-h-dvh items-center justify-center p-6">
        <form onSubmit={submitCode} className="w-full max-w-sm space-y-4 rounded-3xl border border-sand bg-cream p-6 text-center shadow-soft">
          <Monogram size={96} className="mx-auto" />
          <h1 className="font-serif text-2xl font-semibold text-terra-dark">Telão da festa</h1>
          <p className="text-sm text-ink-soft">Digite o código do telão para projetar as fotos da galera em tempo real.</p>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Código"
            autoCapitalize="none"
            className="w-full rounded-2xl border border-sand bg-white/70 px-4 py-3 text-center text-ink outline-none focus:border-terra"
          />
          {error && <p className="text-sm font-semibold text-rose">{error}</p>}
          <button type="submit" className="w-full rounded-2xl bg-terra-dark py-3 font-semibold text-cream">
            Abrir telão
          </button>
        </form>
      </div>
    );
  }

  if (!feed) {
    return <div className="flex min-h-dvh items-center justify-center bg-[#231b17] text-cream">{error ?? 'Carregando…'}</div>;
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-[#231b17] text-cream select-none">
      {/* Foto principal */}
      <div className="relative min-w-0 flex-1">
        {photo ? (
          <>
            <img
              key={photo.id + '-bg'}
              src={photo.url}
              alt=""
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl"
            />
            <img
              key={photo.id}
              src={photo.url}
              alt={photo.caption ?? ''}
              className="animate-kenburns absolute inset-0 h-full w-full object-contain p-6 animate-fade-in"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-8 pt-24">
              <div className="flex items-end gap-4">
                <Avatar guest={photo.guest ?? { name: 'Convidado', avatarUrl: null }} size={64} />
                <div className="min-w-0 flex-1">
                  <div className="font-serif text-4xl font-semibold">{photo.guest?.name ?? 'Convidado'}</div>
                  {photo.caption && <div className="mt-1 text-2xl leading-snug text-cream/90">{photo.caption}</div>}
                  <div className="mt-1 text-sm text-cream/60">{formatTime(photo.takenAt ?? photo.createdAt)}</div>
                </div>
                {fresh === photo.id && (
                  <span className="rounded-full bg-rose px-4 py-2 text-lg font-bold animate-fade-in">Nova foto!</span>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="relative flex h-full flex-col items-center justify-center gap-4 p-10 text-center">
            <img src="/img/hero-wide.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
            <div className="relative flex flex-col items-center gap-4">
              <Monogram size={160} tone="light" />
              <p className="font-script text-6xl drop-shadow">As fotos da galera aparecem aqui</p>
              <p className="text-xl text-cream/80">Aponte a câmera para o QR code e poste a primeira!</p>
            </div>
          </div>
        )}
        <button type="button" onClick={fullscreen} className="absolute top-4 right-4 rounded-full bg-black/30 p-2 opacity-40 hover:opacity-100" aria-label="Tela cheia">
          <Maximize2 size={18} />
        </button>
      </div>

      {/* Painel lateral */}
      <aside className="flex w-[28%] min-w-[280px] max-w-sm flex-col items-center gap-5 border-l border-white/10 bg-[#17110e] p-7 text-center">
        <Monogram size={110} tone="light" />
        <div>
          <div className="font-script text-4xl">Galera do casamento</div>
          <div className="mt-1 text-xs font-semibold tracking-[0.25em] text-cream/60 uppercase">{feed.wedding.couple}</div>
        </div>
        {qr && (
          <div className="rounded-3xl bg-cream p-3">
            <img src={qr} alt="QR code para entrar no site" className="size-48" />
          </div>
        )}
        <p className="text-base leading-snug text-cream/80 text-balance">
          Aponte a câmera para o QR code, entre na galera e <strong className="text-cream">poste sua foto</strong>: ela aparece aqui na hora.
          {feed.inviteCode && <span className="block text-sm text-cream/60">O código do convite já vai no QR code.</span>}
        </p>
        <div className="grid w-full grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="font-serif text-4xl font-semibold">{feed.stats.photos}</div>
            <div className="text-[11px] font-semibold tracking-widest text-cream/60 uppercase">fotos</div>
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="font-serif text-4xl font-semibold">{feed.stats.people ?? feed.stats.guests}</div>
            <div className="text-[11px] font-semibold tracking-widest text-cream/60 uppercase">na galera</div>
          </div>
        </div>
        {feed.nextEvents && feed.nextEvents.length > 0 && (
          <div className="w-full rounded-2xl bg-white/5 p-3 text-left">
            <div className="mb-1.5 text-[11px] font-semibold tracking-widest text-cream/60 uppercase">Combinados dos noivos</div>
            <ul className="space-y-1.5">
              {feed.nextEvents.map((e) => (
                <li key={e.id} className="text-sm leading-snug">
                  <span className="font-semibold">{e.title}</span>
                  <span className="text-cream/70">
                    {' '}
                    · {formatEventWhen(e.date, e.time)}
                    {e.counts.people > 0 ? ` · ${e.counts.people} confirmados` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {recent.length > 0 && (
          <div className="mt-auto grid w-full grid-cols-4 gap-1.5">
            {recent.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setCurrent(i)}
                className={`aspect-square overflow-hidden rounded-lg ${photo?.id === p.id ? 'ring-2 ring-cream' : 'opacity-70'}`}
              >
                <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
