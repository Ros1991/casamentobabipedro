import { UserPlus, X } from 'lucide-react';
import { MAX_COMPANIONS } from '../lib/types';

interface Props {
  value: string[];
  onChange: (v: string[]) => void;
}

/** Quem vem junto (casal, filhos…): contam nos números sem precisar entrar no site. */
export function CompanionsInput({ value, onChange }: Props) {
  const update = (i: number, name: string) => onChange(value.map((v, idx) => (idx === i ? name : v)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      {value.map((name, i) => (
        <div key={i} className="flex items-center gap-2 animate-fade-in">
          <input
            type="text"
            value={name}
            onChange={(e) => update(i, e.target.value)}
            placeholder={i === 0 ? 'Nome de quem vem com você' : 'Mais alguém'}
            maxLength={40}
            autoFocus={name === ''}
            className="flex-1 rounded-2xl border border-sand bg-white/70 px-4 py-3 text-ink outline-none placeholder:text-ink-soft/60 focus:border-terra"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="rounded-full p-2 text-ink-soft hover:bg-rose/10 hover:text-rose"
            aria-label="Remover acompanhante"
          >
            <X size={18} />
          </button>
        </div>
      ))}
      {value.length < MAX_COMPANIONS && (
        <button
          type="button"
          onClick={() => onChange([...value, ''])}
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
