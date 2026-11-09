import { IdCard } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../lib/api';
import { isValidCpf, maskCpf } from '../lib/cpf';
import { toast } from '../lib/toast';
import { useStore } from '../store';

const DISMISS_KEY = 'galera:cpf-depois';

/** Pede o CPF de quem ainda não informou (convidado e acompanhantes). Opcional; some quando está tudo preenchido. */
export function CpfCard() {
  const me = useStore((s) => s.me);
  const updateMe = useStore((s) => s.updateMe);
  const [values, setValues] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (!me || dismissed) return null;
  const companions = me.companions ?? [];
  // índice -1 = a própria pessoa
  const missing = [
    ...(me.cpf ? [] : [{ index: -1, label: 'Seu CPF' }]),
    ...companions.map((name, i) => ({ index: i, label: `CPF de ${name}` })).filter((c) => !me.companionCpfs?.[c.index]),
  ];
  if (missing.length === 0) return null;

  const later = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* sem storage */
    }
  };

  const save = async () => {
    const filled = missing.filter((m) => (values[m.index] ?? '').trim());
    if (filled.length === 0) return toast.info('Digite pelo menos um CPF, ou toque em "Agora não".');
    const bad = filled.find((m) => !isValidCpf(values[m.index]));
    if (bad) return toast.error(`${bad.label} não confere. Verifique os números.`);
    setSaving(true);
    try {
      await updateMe({
        ...(values[-1]?.trim() ? { cpf: values[-1] } : {}),
        companionCpfs: companions.map((_, i) => values[i]?.trim() || me.companionCpfs?.[i] || ''),
      });
      toast.success('CPF salvo. Obrigado!');
      setValues({});
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-3xl border border-terra-light bg-terra-pale p-4 animate-fade-in">
      <div className="flex items-start gap-3">
        <span className="rounded-full bg-cream p-2 text-terra-dark">
          <IdCard size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-terra-dark">Agilize seu check-in</div>
          <p className="mt-0.5 text-sm text-ink-soft">
            Informe o CPF de quem vai. É opcional, só os noivos e a organização veem, e serve para liberar a entrada mais rápido.
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {missing.map((m) => (
          <label key={m.index} className="block">
            <span className="mb-1 block text-xs font-semibold text-terra-dark">{m.label}</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={values[m.index] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [m.index]: maskCpf(e.target.value) }))}
              placeholder="000.000.000-00"
              className="w-full rounded-2xl border border-sand bg-white/80 px-4 py-2.5 text-ink outline-none placeholder:text-ink-soft/50 focus:border-terra"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={save} disabled={saving} className="rounded-full bg-terra-dark px-5 py-2 text-sm font-semibold text-cream disabled:opacity-60">
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" onClick={later} className="rounded-full px-3 py-2 text-sm font-semibold text-terra">
          Agora não
        </button>
      </div>
    </div>
  );
}
