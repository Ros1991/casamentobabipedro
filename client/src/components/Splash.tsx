import { Monogram } from './Monogram';

export function Splash({ text = 'Carregando…' }: { text?: string }) {
  return (
    <div className="sand-gradient flex h-dvh flex-col items-center justify-center gap-4 text-terra-dark">
      <Monogram size={120} />
      <div className="font-script text-3xl">Galera do casamento</div>
      <div className="text-sm text-ink-soft">{text}</div>
    </div>
  );
}
