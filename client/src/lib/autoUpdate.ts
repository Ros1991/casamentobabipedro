/**
 * Atualização automática do app.
 *
 * O site é uma página única e, instalado no celular, fica aberto por dias: sem isto, a pessoa continua
 * usando a versão que carregou da primeira vez. Aqui o app confere se o servidor já tem uma versão mais
 * nova (o nome do arquivo principal muda a cada publicação) e recarrega sozinho num momento seguro:
 * quando a pessoa volta para o app, ou de tempos em tempos se ela não estiver digitando nem com janela aberta.
 */
const CHECK_EVERY_MS = 5 * 60_000;

function currentBundle(): string | null {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  return script ? new URL(script.src).pathname : null;
}

async function latestBundle(): Promise<string | null> {
  try {
    const res = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return /\/assets\/index-[\w-]+\.js/.exec(await res.text())?.[0] ?? null;
  } catch {
    return null; // sem rede: tenta de novo depois
  }
}

/** Não recarrega no meio de uma digitação, de um envio ou com uma janela (foto, formulário) aberta. */
function busy(): boolean {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  return !!document.querySelector('[role="dialog"]');
}

export function setupAutoUpdate(): void {
  if (!import.meta.env.PROD) return;
  const mine = currentBundle();
  if (!mine) return;
  let pending = false;
  let lastCheck = 0;

  const check = async (returning: boolean) => {
    if (!pending) {
      if (Date.now() - lastCheck < 30_000) return;
      lastCheck = Date.now();
      const latest = await latestBundle();
      pending = !!latest && latest !== mine;
    }
    if (pending && (returning || !busy()) && navigator.onLine) window.location.reload();
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check(true);
  });
  window.addEventListener('pageshow', () => void check(true));
  window.setInterval(() => void check(false), CHECK_EVERY_MS);
}
