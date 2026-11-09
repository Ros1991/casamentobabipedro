import { CloudUpload } from 'lucide-react';
import { useEffect } from 'react';
import { listPending, useQueueStore } from '../lib/offlineQueue';
import { flushPendingPhotos } from '../lib/photoUpload';
import { useStore } from '../store';

/** Mostra fotos aguardando conexão e tenta reenviar quando a rede volta. */
export function OfflineQueueBanner() {
  const count = useQueueStore((s) => s.count);
  const flushing = useQueueStore((s) => s.flushing);
  const authed = useStore((s) => s.authStatus === 'authed');

  useEffect(() => {
    if (!authed) return;
    void listPending().then((items) => {
      if (items.length) void flushPendingPhotos();
    });
    const onOnline = () => void flushPendingPhotos();
    window.addEventListener('online', onOnline);
    const timer = window.setInterval(() => {
      if (navigator.onLine && useQueueStore.getState().count > 0) void flushPendingPhotos();
    }, 30_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  }, [authed]);

  if (!authed || count === 0) return null;

  return (
    <div className="mx-3 mt-2 flex items-center gap-3 rounded-2xl border border-sand bg-sea-light px-3.5 py-2.5 text-sm text-terra-dark animate-fade-in">
      <CloudUpload size={18} className={flushing ? 'animate-pulse' : ''} />
      <span className="flex-1">
        {count === 1 ? '1 foto aguardando conexão' : `${count} fotos aguardando conexão`}
        {flushing ? ' · enviando…' : ''}
      </span>
      {!flushing && (
        <button type="button" onClick={() => void flushPendingPhotos()} className="font-semibold underline">
          Tentar agora
        </button>
      )}
    </div>
  );
}
