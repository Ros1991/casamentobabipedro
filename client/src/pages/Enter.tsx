import { CalendarDays, Check, KeyRound, Phone, UserRound, Users } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CompanionsInput } from '../components/CompanionsInput';
import { Splash } from '../components/Splash';
import { StayPicker } from '../components/StayPicker';
import { ApiError, errorMessage } from '../lib/api';
import { maskPhone } from '../lib/format';
import { toast } from '../lib/toast';
import type { StayInput } from '../lib/types';
import { useStore } from '../store';

const DEFAULT_STAY: StayInput = {
  stayMode: 'unknown',
  accommodationId: null,
  customPlaceLabel: '',
  customCity: 'Aquiraz Riviera',
  customLat: null,
  customLng: null,
};

const inputClass =
  'w-full rounded-2xl border border-sand bg-white/70 px-4 py-3 text-ink outline-none placeholder:text-ink-soft/60 focus:border-terra';

const INVITE_STORAGE_KEY = 'galera:invite-code';
const INVITE_PARAMS = ['codigo', 'convite', 'code', 'invite'];

/** Código do convite vindo do link (?codigo=...) ou guardado de uma visita anterior. */
function readInviteFromLink(params: URLSearchParams): string {
  for (const key of INVITE_PARAMS) {
    const value = params.get(key)?.trim();
    if (value) {
      try {
        localStorage.setItem(INVITE_STORAGE_KEY, value);
      } catch {
        /* sem storage */
      }
      return value;
    }
  }
  try {
    return localStorage.getItem(INVITE_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function forgetStoredInvite(): void {
  try {
    localStorage.removeItem(INVITE_STORAGE_KEY);
  } catch {
    /* sem storage */
  }
}

export function Enter() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const inviteFromLink = useMemo(() => readInviteFromLink(params), [params]);
  const config = useStore((s) => s.config);
  const loadConfig = useStore((s) => s.loadConfig);
  const authStatus = useStore((s) => s.authStatus);
  const loadMe = useStore((s) => s.loadMe);
  const enter = useStore((s) => s.enter);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [stay, setStay] = useState<StayInput>(DEFAULT_STAY);
  const [arrivalDate, setArrivalDate] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [inviteCode, setInviteCode] = useState(inviteFromLink);
  const [showInviteField, setShowInviteField] = useState(!inviteFromLink);
  const [companions, setCompanions] = useState<string[]>([]);
  const [showPhone, setShowPhone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadConfig().catch((err) => setError(errorMessage(err)));
    if (authStatus === 'loading') void loadMe();
  }, [loadConfig, loadMe, authStatus]);

  if (authStatus === 'loading') return <Splash text="Só um instante…" />;
  if (authStatus === 'authed') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/entrar' ? from : '/'} replace />;
  }
  if (!config) return <Splash text={error ?? 'Carregando…'} />;

  const wedding = config.wedding;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError('Digite seu nome.');
    if (phone.replace(/\D/g, '').length < 10) return setError('Digite seu WhatsApp com DDD.');
    if (stay.stayMode === 'custom' && !stay.customPlaceLabel.trim()) return setError('Diga onde você vai ficar.');
    if (arrivalDate && departureDate && departureDate < arrivalDate) return setError('A saída precisa ser depois da chegada.');
    if (config.inviteRequired && !inviteCode.trim()) return setError('Digite o código do convite.');

    setSubmitting(true);
    try {
      const { returning } = await enter({
        name: name.trim(),
        phone,
        inviteCode: inviteCode.trim(),
        ...stay,
        arrivalDate: arrivalDate || null,
        departureDate: departureDate || null,
        companions: companions.map((c) => c.trim()).filter(Boolean),
        showPhone,
      });
      toast.success(returning ? `Bem-vindo(a) de volta, ${name.trim().split(' ')[0]}!` : `Bem-vindo(a), ${name.trim().split(' ')[0]}! 🎉`);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/entrar' ? from : '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.code === 'inviteCode') {
        // Código do link está errado ou mudou: mostra o campo para a pessoa corrigir
        forgetStoredInvite();
        setShowInviteField(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-cream">
      <div className="hero-photo flex min-h-[360px] flex-col justify-end px-6 pb-16 text-center" style={{ paddingTop: 'calc(var(--safe-top) + 28px)' }}>
        <h1 className="font-script text-5xl drop-shadow">Galera do casamento</h1>
        <p className="mt-2 font-serif text-2xl font-semibold tracking-wide">{wedding.couple}</p>
        <p className="mt-1 text-sm font-semibold tracking-widest text-white/90 uppercase">
          {wedding.dateLabel} · {wedding.venueCity}
        </p>
      </div>

      <form onSubmit={onSubmit} className="relative mx-auto -mt-4 max-w-lg space-y-6 px-4 pb-12">
        <div className="space-y-4 rounded-3xl border border-sand bg-cream p-5 shadow-soft">
          <div className="-mt-14 flex justify-center -space-x-3">
            <img src="/img/pedro.webp" alt="Pedro" width={80} height={80} className="size-20 rounded-full border-4 border-cream object-cover shadow-soft" />
            <img src="/img/babi.webp" alt="Babi" width={80} height={80} className="size-20 rounded-full border-4 border-cream object-cover shadow-soft" />
          </div>
          <p className="text-sm text-ink-soft text-balance">
            Diga quem você é e onde vai ficar. Assim a galera se encontra, combina passeios e as fotos da viagem ficam todas num
            lugar só.
          </p>

          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-terra-dark">
              <UserRound size={15} /> Seu nome
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Como a galera te conhece"
              autoComplete="name"
              maxLength={60}
              className={inputClass}
              required
            />
          </label>

          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-terra-dark">
              <Phone size={15} /> Seu WhatsApp
            </span>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
              placeholder="(85) 99999-9999"
              autoComplete="tel"
              className={inputClass}
              required
            />
            <label className="mt-2 flex items-start gap-2 text-xs text-ink-soft">
              <input type="checkbox" checked={showPhone} onChange={(e) => setShowPhone(e.target.checked)} className="mt-0.5 accent-terra" />
              <span>Mostrar meu WhatsApp para os outros convidados (para combinar carona, passeio…)</span>
            </label>
          </label>
        </div>

        <div className="space-y-3 rounded-3xl border border-sand bg-cream p-5 shadow-soft">
          <h2 className="flex items-center gap-2 font-serif text-xl font-semibold text-terra-dark">
            <Users size={22} /> Vem alguém com você?
          </h2>
          <p className="text-sm text-ink-soft">Casal, filhos, família: adicione quem vem junto e eles já contam com você.</p>
          <CompanionsInput value={companions} onChange={setCompanions} />
        </div>

        <div className="space-y-4 rounded-3xl border border-sand bg-cream p-5 shadow-soft">
          <h2 className="font-serif text-xl font-semibold text-terra-dark">Onde você vai ficar?</h2>
          <StayPicker value={stay} onChange={setStay} accommodations={config.accommodations} mapCenter={wedding.mapCenter} />
        </div>

        <div className="space-y-4 rounded-3xl border border-sand bg-cream p-5 shadow-soft">
          <h2 className="flex items-center gap-2 font-serif text-xl font-semibold text-terra-dark">
            <CalendarDays size={22} /> Quando você chega e vai embora?
          </h2>
          <p className="text-sm text-ink-soft">
            A festa é dia 19/11. Com as datas, a galera combina carona, passeio e jantar junto. Pode deixar em branco e preencher
            depois.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-terra-dark">Chego em</span>
              <input
                type="date"
                value={arrivalDate}
                min="2026-11-01"
                max="2026-12-31"
                onChange={(e) => setArrivalDate(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-terra-dark">Vou embora em</span>
              <input
                type="date"
                value={departureDate}
                min={arrivalDate || '2026-11-01'}
                max="2026-12-31"
                onChange={(e) => setDepartureDate(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>
        </div>

        {config.inviteRequired && !showInviteField && (
          <div className="flex items-center gap-3 rounded-3xl border border-terra-light bg-terra-pale px-5 py-4 text-sm text-terra-dark">
            <span className="rounded-full bg-terra p-1.5 text-cream">
              <Check size={14} />
            </span>
            <span className="flex-1">Código do convite reconhecido pelo link.</span>
            <button type="button" onClick={() => setShowInviteField(true)} className="font-semibold underline">
              Alterar
            </button>
          </div>
        )}

        {config.inviteRequired && showInviteField && (
          <div className="space-y-3 rounded-3xl border border-sand bg-cream p-5 shadow-soft">
            <label className="block">
              <span className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-terra-dark">
                <KeyRound size={15} /> Código do convite
              </span>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="A palavra que veio com o convite"
                autoComplete="off"
                autoCapitalize="none"
                className={inputClass}
                required
              />
            </label>
            <p className="text-xs text-ink-soft">Não sabe o código? Pergunte no grupo da família ou para os noivos.</p>
          </div>
        )}

        {error && <div className="rounded-2xl bg-rose/10 px-4 py-3 text-sm font-semibold text-rose">{error}</div>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl bg-terra-dark py-4 text-lg font-semibold text-cream shadow-soft transition hover:bg-terra disabled:opacity-60"
        >
          {submitting ? 'Entrando…' : 'Entrar na galera'}
        </button>

        <p className="text-center text-xs text-ink-soft text-balance">
          Seus dados ficam visíveis só para os convidados e serão apagados depois do casamento. Seu WhatsApp só aparece se você
          permitir.
        </p>
      </form>
    </div>
  );
}
