import { MoreVertical, Share, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isIos, isStandalone, promptInstall, usePwa } from '../lib/pwa';
import { toast } from '../lib/toast';

const DISMISS_KEY = 'galera:install-dismissed-at';
const DISMISS_MS = 3 * 24 * 60 * 60 * 1000;

function recentlyDismissed(): boolean {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return t > 0 && Date.now() - t < DISMISS_MS;
  } catch {
    return false;
  }
}

function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

/** Navegador interno de outro app (WebView, Facebook, Instagram…): não oferece instalação. */
function isInAppBrowser(): boolean {
  return /\bwv\b|FBAN|FBAV|Instagram|Line\/|Twitter|TikTok/i.test(navigator.userAgent);
}

interface Props {
  /** No Perfil: sempre visível (sem "Agora não"). */
  always?: boolean;
}

/**
 * Convite para instalar o site como app.
 * Android com Chrome: botão nativo quando o Chrome libera; senão, passo a passo pelo menu.
 * iPhone: passo a passo pelo Safari (a Apple não oferece botão).
 */
export function InstallBanner({ always = false }: Props) {
  const installEvent = usePwa((s) => s.installEvent);
  const installed = usePwa((s) => s.installed);
  const [dismissed, setDismissed] = useState(recentlyDismissed);
  const [busy, setBusy] = useState(false);
  // Dá alguns segundos para o Chrome disparar o evento antes de mostrar o caminho manual
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setWaited(true), 2500);
    return () => window.clearTimeout(t);
  }, []);

  if (installed || isStandalone()) return null;
  if (!always && dismissed) return null;

  const ios = isIos();
  const android = isAndroid();
  const inApp = isInAppBrowser();
  if (!installEvent && !ios && !(android && waited)) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* sem storage */
    }
  };

  const install = async () => {
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    if (outcome === 'accepted') toast.success('App instalado! Procure o ícone na sua tela inicial.');
    else if (outcome === 'dismissed' && !always) dismiss();
  };

  return (
    <div className="flex items-start gap-3 rounded-3xl border border-terra-light bg-terra-pale p-4 animate-fade-in">
      <span className="rounded-full bg-cream p-2 text-terra-dark">
        <Smartphone size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-terra-dark">Instale o app da galera</div>

        {installEvent && (
          <p className="mt-0.5 text-sm text-ink-soft">Fica na sua tela inicial, abre em tela cheia e recebe avisos de mensagens.</p>
        )}

        {!installEvent && ios && (
          <p className="mt-0.5 text-sm text-ink-soft">
            No Safari, toque em <Share size={13} className="inline -mt-0.5" /> <strong>Compartilhar</strong> e depois em{' '}
            <strong>"Adicionar à Tela de Início"</strong>. O site vira um app, em tela cheia e com avisos.
          </p>
        )}

        {!installEvent && !ios && android && (
          <div className="mt-0.5 space-y-1 text-sm text-ink-soft">
            {inApp ? (
              <p>
                Você está no navegador interno de um app. Toque em <MoreVertical size={13} className="inline -mt-0.5" /> e em{' '}
                <strong>"Abrir no Chrome"</strong>, depois siga o passo abaixo.
              </p>
            ) : (
              <p>
                Se você abriu este link pelo WhatsApp, toque em <MoreVertical size={13} className="inline -mt-0.5" /> (canto superior) e em{' '}
                <strong>"Abrir no Chrome"</strong>.
              </p>
            )}
            <p>
              No Chrome, toque em <MoreVertical size={13} className="inline -mt-0.5" /> e em <strong>"Instalar app"</strong> (ou{' '}
              <strong>"Adicionar à tela inicial"</strong>).
            </p>
          </div>
        )}

        <div className="mt-2 flex gap-2">
          {installEvent && (
            <button
              type="button"
              onClick={install}
              disabled={busy}
              className="rounded-full bg-terra-dark px-4 py-1.5 text-sm font-semibold text-cream disabled:opacity-60"
            >
              {busy ? 'Abrindo…' : 'Instalar'}
            </button>
          )}
          {!always && (
            <button type="button" onClick={dismiss} className="rounded-full px-3 py-1.5 text-sm font-semibold text-terra">
              {installEvent ? 'Agora não' : 'Entendi'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
