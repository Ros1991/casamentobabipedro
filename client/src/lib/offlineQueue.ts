import { del, get, keys, set } from 'idb-keyval';
import { create } from 'zustand';

/** Foto que não conseguiu subir (sem sinal) e espera a conexão voltar. */
export interface PendingUpload {
  id: string;
  blob: Blob;
  caption: string | null;
  lat: number | null;
  lng: number | null;
  locationSource: string;
  takenAt: number | null;
  createdAt: number;
  attempts: number;
}

const PREFIX = 'pending-upload:';

interface QueueState {
  count: number;
  flushing: boolean;
  setCount: (n: number) => void;
  setFlushing: (v: boolean) => void;
}

export const useQueueStore = create<QueueState>((setState) => ({
  count: 0,
  flushing: false,
  setCount: (count) => setState({ count }),
  setFlushing: (flushing) => setState({ flushing }),
}));

export async function listPending(): Promise<PendingUpload[]> {
  try {
    const all = await keys();
    const items: PendingUpload[] = [];
    for (const k of all) {
      if (typeof k === 'string' && k.startsWith(PREFIX)) {
        const item = await get<PendingUpload>(k);
        if (item) items.push(item);
      }
    }
    items.sort((a, b) => a.createdAt - b.createdAt);
    useQueueStore.getState().setCount(items.length);
    return items;
  } catch {
    return [];
  }
}

export async function enqueue(item: Omit<PendingUpload, 'id' | 'attempts'>): Promise<void> {
  const id = crypto.randomUUID();
  await set(PREFIX + id, { ...item, id, attempts: 0 } satisfies PendingUpload);
  await listPending();
}

export async function removePending(id: string): Promise<void> {
  await del(PREFIX + id);
  await listPending();
}

type UploadFn = (item: PendingUpload) => Promise<void>;
let flushPromise: Promise<void> | null = null;

/** Tenta enviar tudo o que está na fila. Para no primeiro erro de rede. */
export function flushQueue(upload: UploadFn): Promise<void> {
  if (flushPromise) return flushPromise;
  flushPromise = (async () => {
    const store = useQueueStore.getState();
    const items = await listPending();
    if (items.length === 0) return;
    store.setFlushing(true);
    try {
      for (const item of items) {
        try {
          await upload(item);
          await removePending(item.id);
        } catch (err) {
          const status = (err as { status?: number }).status;
          if (status === 0) break; // ainda sem rede: tenta depois
          // Erro definitivo (foto inválida, limite...): descarta para não travar a fila
          if (status && status >= 400 && status < 500 && status !== 429) {
            await removePending(item.id);
            continue;
          }
          break;
        }
      }
    } finally {
      store.setFlushing(false);
      await listPending();
      flushPromise = null;
    }
  })();
  return flushPromise;
}
