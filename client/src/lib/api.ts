export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface Options extends Omit<RequestInit, 'body'> {
  json?: unknown;
  body?: BodyInit | null;
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { json, headers: rawHeaders, ...rest } = options;
  const headers = new Headers(rawHeaders);
  let body = rest.body ?? null;
  if (json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(json);
  }

  let res: Response;
  try {
    res = await fetch(path, { ...rest, headers, body, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'network', 'Sem conexão. Verifique sua internet e tente de novo.');
  }

  if (!res.ok) {
    let data: { error?: string; message?: string } | null = null;
    try {
      data = (await res.json()) as { error?: string; message?: string };
    } catch {
      /* corpo não é JSON */
    }
    throw new ApiError(res.status, data?.error ?? 'error', data?.message ?? `Erro ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Algo deu errado.';
}
