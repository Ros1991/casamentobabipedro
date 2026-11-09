import { ApiError } from './api';

/** Upload com progresso (fetch ainda não expõe progresso de envio de forma ampla). */
export function uploadWithProgress<T>(
  url: string,
  form: FormData,
  onProgress?: (fraction: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.responseType = 'json';
    xhr.timeout = 120_000;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      const data = xhr.response as { error?: string; message?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as T);
      } else {
        reject(new ApiError(xhr.status, data?.error ?? 'error', data?.message ?? `Erro ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'network', 'Sem conexão. A foto ficará na fila e será enviada depois.'));
    xhr.ontimeout = () => reject(new ApiError(0, 'network', 'A conexão demorou demais. A foto ficará na fila.'));
    xhr.send(form);
  });
}
