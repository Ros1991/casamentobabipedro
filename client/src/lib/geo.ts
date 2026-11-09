import exifr from 'exifr';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PositionResult extends LatLng {
  accuracy: number;
}

/** Posição atual do aparelho; resolve null se negado, indisponível ou sem resposta no tempo. */
export function getCurrentPosition(timeoutMs = 8000): Promise<PositionResult | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: PositionResult | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        finish({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      },
      () => {
        clearTimeout(timer);
        finish(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

/** Pede a permissão de localização uma vez (sem usar o resultado). */
export async function warmUpLocationPermission(): Promise<boolean> {
  const pos = await getCurrentPosition(10_000);
  return pos !== null;
}

export interface ExifInfo {
  position: LatLng | null;
  takenAt: number | null;
}

/** Lê GPS e data da foto quando o arquivo ainda tem EXIF (Android costuma manter; iPhone remove). */
export async function readExif(file: Blob): Promise<ExifInfo> {
  const result: ExifInfo = { position: null, takenAt: null };
  try {
    const gps = await exifr.gps(file);
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      result.position = { lat: gps.latitude, lng: gps.longitude };
    }
  } catch {
    /* sem GPS */
  }
  try {
    const data = (await exifr.parse(file, ['DateTimeOriginal', 'CreateDate'])) as
      | { DateTimeOriginal?: Date; CreateDate?: Date }
      | undefined;
    const d = data?.DateTimeOriginal ?? data?.CreateDate;
    if (d instanceof Date && !Number.isNaN(d.getTime())) result.takenAt = d.getTime();
  } catch {
    /* sem data */
  }
  return result;
}

export function isValidLatLng(p: Partial<LatLng> | null | undefined): p is LatLng {
  return (
    !!p &&
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}
