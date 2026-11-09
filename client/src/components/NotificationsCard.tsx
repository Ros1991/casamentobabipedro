import { Bell, BellOff, BellRing } from 'lucide-react';
import { useEffect, useState } from 'react';
import { errorMessage } from '../lib/api';
import { getPushState, subscribePush, unsubscribePush, type PushState } from '../lib/push';
import { toast } from '../lib/toast';
import { useStore } from '../store';

const DISMISS_KEY = 'galera:notify-dismissed-at';
const DISMISS_MS = 3 * 24 * 60 * 60 * 1000;

interface Props {
  /** No Início: pode ser fechado por alguns dias. No Perfil: sempre visível. */
  dismissable?: boolean;
}

export function NotificationsCard({ dismissable = false }: Props) {
  const push = useStore((s) => s.config?.push);
  const [state, setState] = useState<PushState | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (!dismissable) return false;
    try {
      const t = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      return t > 0 && Date.now() - t < DISMISS_MS;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    void getPushState().then(setState);
  }, []);

  if (!push?.enabled || !push.publicKey || state === 'loading' || dismissed) return null;
  if (state === 'unsupported' && dismissable) return null;
  if (state === 'subscribed' && dismissable) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* sem storage */
    }
  };

  const enable = async () => {
    setBusy(true);
    try {
      const next = await subscribePush(push.publicKey!);
      setState(next);
      if (next === 'subscribed') toast.success('Avisos ativados! Você recebe quando alguém postar no mural.');
      else if (next === 'denied') toast.error('Você bloqueou os avisos no navegador.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await unsubscribePush();
      setState('default');
      toast.info('Avisos desativados neste aparelho.');
    } finally {
      setBusy(false);
    }
  };

  const Icon = state === 'subscribed' ? BellRing : state === 'denied' ? BellOff : Bell;

  return (
    <div className="flex items-start gap-3 rounded-3xl border border-sand bg-white/60 p-4 animate-fade-in">
      <span className={`rounded-full p-2 ${state === 'subscribed' ? 'bg-terra text-cream' : 'bg-cream-dark text-terra-dark'}`}>
        <Icon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-terra-dark">
          {state === 'subscribed' ? 'Avisos de mensagens ativados' : 'Avisos de novas mensagens'}
        </div>
        <p className="mt-0.5 text-sm text-ink-soft">
          {state === 'subscribed' && 'Este aparelho recebe um aviso quando alguém posta no mural e você não está com o app aberto.'}
          {state === 'default' && 'Receba um aviso no celular quando alguém postar no mural, mesmo com o app fechado.'}
          {state === 'needs-install' &&
            'No iPhone, os avisos só funcionam com o app instalado: toque em Compartilhar → "Adicionar à Tela de Início" e ative aqui dentro do app.'}
          {state === 'denied' && 'Os avisos estão bloqueados para este site nas configurações do navegador. Libere lá para ativar.'}
          {state === 'unsupported' && 'Este navegador não suporta avisos. No celular, use o Chrome (Android) ou instale o app (iPhone).'}
        </p>
        <div className="mt-2 flex gap-2">
          {state === 'default' && (
            <button
              type="button"
              onClick={enable}
              disabled={busy}
              className="rounded-full bg-terra-dark px-4 py-1.5 text-sm font-semibold text-cream disabled:opacity-60"
            >
              {busy ? 'Ativando…' : 'Ativar avisos'}
            </button>
          )}
          {state === 'subscribed' && (
            <button type="button" onClick={disable} disabled={busy} className="rounded-full border border-sand px-4 py-1.5 text-sm font-semibold text-ink-soft">
              Desativar
            </button>
          )}
          {dismissable && state !== 'subscribed' && (
            <button type="button" onClick={dismiss} className="rounded-full px-3 py-1.5 text-sm font-semibold text-terra">
              Depois
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
