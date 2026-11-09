import { enqueue, flushQueue, type PendingUpload } from './offlineQueue';
import { uploadWithProgress } from './upload';
import type { Message } from './types';
import { useStore } from '../store';

export interface PhotoPayload {
  blob: Blob;
  caption: string | null;
  lat: number | null;
  lng: number | null;
  locationSource: string;
  takenAt: number | null;
}

export async function uploadPhoto(payload: PhotoPayload, onProgress?: (f: number) => void): Promise<Message> {
  const form = new FormData();
  form.append('file', payload.blob, 'foto.jpg');
  if (payload.caption) form.append('caption', payload.caption);
  if (payload.lat !== null && payload.lng !== null) {
    form.append('lat', String(payload.lat));
    form.append('lng', String(payload.lng));
    form.append('locationSource', payload.locationSource);
  }
  if (payload.takenAt) form.append('takenAt', String(payload.takenAt));
  const res = await uploadWithProgress<{ message: Message }>('/api/photos', form, onProgress);
  useStore.getState().addMessageLocally(res.message);
  return res.message;
}

/** Guarda a foto no aparelho para enviar quando a conexão voltar. */
export async function queuePhoto(payload: PhotoPayload): Promise<void> {
  await enqueue({
    blob: payload.blob,
    caption: payload.caption,
    lat: payload.lat,
    lng: payload.lng,
    locationSource: payload.locationSource,
    takenAt: payload.takenAt,
    createdAt: Date.now(),
  });
}

export function flushPendingPhotos(): Promise<void> {
  return flushQueue(async (item: PendingUpload) => {
    await uploadPhoto({
      blob: item.blob,
      caption: item.caption,
      lat: item.lat,
      lng: item.lng,
      locationSource: item.locationSource,
      takenAt: item.takenAt,
    });
  });
}
