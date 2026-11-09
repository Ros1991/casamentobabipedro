import { ChevronLeft, ChevronRight, MapPin, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { toast } from '../lib/toast';
import type { Photo, Reaction } from '../lib/types';
import { useStore } from '../store';
import { Avatar } from './Avatar';
import { Reactions } from './Reactions';

interface Props {
  photos: Photo[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}

export function PhotoViewer({ photos, index, onClose, onIndexChange }: Props) {
  const photo = photos[index];
  const navigate = useNavigate();
  const me = useStore((s) => s.me);
  const isAdmin = useStore((s) => s.isAdmin);
  const guests = useStore((s) => s.guests);
  const message = useStore((s) => (photo?.messageId ? s.messages.find((m) => m.id === photo.messageId) : undefined));
  const deletePhoto = useStore((s) => s.deletePhoto);
  const [localReactions, setLocalReactions] = useState<Reaction[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    setLocalReactions(null);
    setConfirming(false);
  }, [photo?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      if (e.key === 'ArrowRight' && index < photos.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, photos.length, onClose, onIndexChange]);

  if (!photo) return null;

  const author = guests[photo.guestId] ?? photo.guest ?? { name: 'Convidado', avatarUrl: null };
  const canDelete = me && (me.id === photo.guestId || isAdmin);
  const reactions = message?.reactions ?? localReactions ?? [];
  const when = photo.takenAt ?? photo.createdAt;

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(dx) < 50) return;
    if (dx > 0 && index > 0) onIndexChange(index - 1);
    if (dx < 0 && index < photos.length - 1) onIndexChange(index + 1);
  };

  const handleDelete = async () => {
    try {
      await deletePhoto(photo.id);
      toast.success('Foto apagada.');
      if (photos.length <= 1) onClose();
      else onIndexChange(Math.max(0, index - 1));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="fixed inset-0 z-[1200] flex flex-col bg-terra-dark/95 text-cream animate-fade-in" role="dialog" aria-modal="true">
      <div
        className="flex items-center gap-3 px-4 pb-2"
        style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}
      >
        <Avatar guest={author} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{author.name}</div>
          <div className="text-xs text-cream/70">{formatDateTime(when)}</div>
        </div>
        <span className="text-xs text-cream/60 tabular-nums">
          {index + 1}/{photos.length}
        </span>
        <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Fechar">
          <X size={22} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <img key={photo.id} src={photo.url} alt={photo.caption ?? ''} className="max-h-full max-w-full object-contain select-none" draggable={false} />
        {index > 0 && (
          <button
            type="button"
            onClick={() => onIndexChange(index - 1)}
            className="absolute top-1/2 left-2 hidden -translate-y-1/2 rounded-full bg-black/30 p-2 hover:bg-black/50 sm:block"
            aria-label="Anterior"
          >
            <ChevronLeft />
          </button>
        )}
        {index < photos.length - 1 && (
          <button
            type="button"
            onClick={() => onIndexChange(index + 1)}
            className="absolute top-1/2 right-2 hidden -translate-y-1/2 rounded-full bg-black/30 p-2 hover:bg-black/50 sm:block"
            aria-label="Próxima"
          >
            <ChevronRight />
          </button>
        )}
      </div>

      <div className="space-y-3 px-4 pt-3" style={{ paddingBottom: 'calc(var(--safe-bottom) + 14px)' }}>
        {photo.caption && <p className="text-[15px] leading-snug">{photo.caption}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {photo.messageId ? (
            <div className="rounded-2xl bg-cream/95 px-2 py-1 text-ink">
              <Reactions messageId={photo.messageId} reactions={reactions} onLocalUpdate={setLocalReactions} />
            </div>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {photo.lat !== null && photo.lng !== null && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate(`/mapa?foto=${photo.id}`);
                }}
                className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25"
              >
                <MapPin size={15} /> Ver no mapa
              </button>
            )}
            {canDelete &&
              (confirming ? (
                <div className="flex items-center gap-1 text-sm">
                  <span>Apagar esta foto?</span>
                  <button type="button" onClick={handleDelete} className="rounded-full bg-rose px-3 py-1.5 font-semibold">
                    Sim, apagar
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} className="rounded-full bg-white/15 px-3 py-1.5">
                    Não
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-rose"
                  title={isAdmin && me?.id !== photo.guestId ? 'Apagar como administrador' : 'Apagar minha foto'}
                >
                  <Trash2 size={15} /> Apagar
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
