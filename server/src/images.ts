import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from './config.js';

export class ImageError extends Error {}

export interface ProcessedPhoto {
  fileKey: string;
  thumbKey: string;
  width: number;
  height: number;
}

/**
 * Corrige a orientação (EXIF), limita a 1600 px, gera JPEG e miniatura WebP.
 * O EXIF é descartado nas saídas (privacidade): a localização vai separada no banco.
 */
export async function processPhoto(buffer: Buffer, id: string): Promise<ProcessedPhoto> {
  let base: sharp.Sharp;
  try {
    base = sharp(buffer, { failOn: 'none', limitInputPixels: 80_000_000 }).rotate();
    const meta = await base.metadata();
    if (!meta.width || !meta.height) throw new ImageError('invalid');
  } catch (err) {
    throw new ImageError(describeError(err));
  }

  const fileKey = `${id}.jpg`;
  const thumbKey = `${id}_t.webp`;

  const main = await base
    .clone()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  const thumb = await base
    .clone()
    .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 74 })
    .toBuffer();

  await Promise.all([
    fs.writeFile(path.join(config.uploadDir, fileKey), main.data),
    fs.writeFile(path.join(config.uploadDir, thumbKey), thumb),
  ]);

  return { fileKey, thumbKey, width: main.info.width, height: main.info.height };
}

/** Foto de perfil: quadrada, 256 px, WebP. */
export async function processAvatar(buffer: Buffer, id: string): Promise<string> {
  const key = `${id}_a_${Date.now().toString(36)}.webp`;
  try {
    const out = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: 256, height: 256, fit: 'cover', position: 'attention' })
      .webp({ quality: 80 })
      .toBuffer();
    await fs.writeFile(path.join(config.uploadDir, key), out);
  } catch (err) {
    throw new ImageError(describeError(err));
  }
  return key;
}

export async function removeUpload(key: string | null | undefined): Promise<void> {
  if (!key) return;
  try {
    await fs.unlink(path.join(config.uploadDir, key));
  } catch {
    /* já não existe */
  }
}

function describeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/heif|heic|hevc/i.test(msg)) {
    return 'Formato HEIC não suportado. Tire a foto pela câmera do site ou converta para JPEG.';
  }
  if (/unsupported image format|Input buffer contains unsupported/i.test(msg)) {
    return 'Arquivo não reconhecido como imagem.';
  }
  return 'Não foi possível processar a imagem.';
}
