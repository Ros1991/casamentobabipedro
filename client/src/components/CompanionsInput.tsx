import { UserPlus, X } from 'lucide-react';
import { maskCpf } from '../lib/cpf';
import { MAX_COMPANIONS } from '../lib/types';

interface Props {
  value: string[];
  onChange: (v: string[]) => void;
  /** CPFs alinhados com os nomes. Quando informado, cada acompanhante ganha um campo de CPF (opcional). */
  cpfs?: string[];
  onCpfsChange?: (v: string[]) => void;
}

/** Quem vem junto (casal, filhos…): contam nos números sem precisar entrar no site. */
export function CompanionsInput({ value, onChange, cpfs, onCpfsChange }: Props) {
  const withCpf = !!cpfs && !!onCpfsChange;
  const cpfAt = (i: number) => cpfs?.[i] ?? '';
  const update = (i: number, name: string) => onChange(value.map((v, idx) => (idx === i ? name : v)));
  const updateCpf = (i: number, cpf: string) => onCpfsChange?.(value.map((_, idx) => (idx === i ? maskCpf(cpf) : cpfAt(idx))));
  const remove = (i: number) => {
    onCpfsChange?.(value.map((_, idx) => cpfAt(idx)).filter((_, idx) => idx !== i));
    onChange(value.filter((_, idx) => idx !== i));
  };
  const add = () => {
    onCpfsChange?.([...value.map((_, idx) => cpfAt(idx)), '']);
    onChange([...value, '']);
  };

  return (
    <div className="space-y-2">
      {value.map((name, i) => (
        <div key={i} className="flex items-start gap-2 animate-fade-in">
          <div className="min-w-0 flex-1 space-y-1.5">
            <input
              type="text"
              value={name}
              onChange={(e) => update(i, e.target.value)}
              placeholder={i === 0 ? 'Nome de quem vem com você' : 'Mais alguém'}
              maxLength={40}
              autoFocus={name === ''}
              className="w-full rounded-2xl border border-sand bg-white/70 px-4 py-3 text-ink outline-none placeholder:text-ink-soft/60 focus:border-terra"
            />
            {withCpf && (
              <input
                type="text"
                inputMode="numeric"
                value={cpfAt(i)}
                onChange={(e) => updateCpf(i, e.target.value)}
                placeholder="CPF (opcional)"
                autoComplete="off"
                aria-label={`CPF de ${name || 'acompanhante'}`}
                className="w-full rounded-xl border border-sand bg-white/50 px-4 py-2 text-sm text-ink outline-none placeholder:text-ink-soft/60 focus:border-terra"
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => remove(i)}
            className="mt-1.5 rounded-full p-2 text-ink-soft hover:bg-rose/10 hover:text-rose"
            aria-label="Remover acompanhante"
          >
            <X size={18} />
          </button>
        </div>
      ))}
      {value.length < MAX_COMPANIONS && (
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-2 rounded-2xl border border-dashed border-terra-light px-4 py-3 text-sm font-semibold text-terra-dark hover:bg-terra-pale"
        >
          <UserPlus size={18} /> {value.length === 0 ? 'Vou acompanhado(a)' : 'Adicionar mais um'}
        </button>
      )}
      <p className="text-xs text-ink-soft">
        Quem você adicionar conta nos números do mapa e das chegadas junto com você, sem precisar entrar no site. Se a pessoa
        quiser usar o app, ela entra com o próprio WhatsApp e você a remove daqui.
      </p>
    </div>
  );
}
