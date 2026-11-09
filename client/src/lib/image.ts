/**
 * Redimensiona e recomprime a imagem no próprio celular antes do envio.
 * Fotos de 3–8 MB viram ~200–400 KB, o que faz diferença no 4G fraco.
 * O navegador aplica a orientação EXIF ao decodificar, então a saída já sai "em pé".
 */
export async function compressImage(file: Blob, maxSide = 1600, quality = 0.82): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w0 = img.naturalWidth;
    const h0 = img.naturalHeight;
    if (!w0 || !h0) return file;

    const scale = Math.min(1, maxSide / Math.max(w0, h0));
    const w = Math.round(w0 * scale);
    const h = Math.round(h0 * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    // Se por algum motivo ficou maior, mantém o original
    return blob.size < file.size || scale < 1 ? blob : file;
  } catch {
    // Formato que o navegador não decodifica (ex.: HEIC no Chrome): deixa o servidor tentar
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function blobToObjectUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}
