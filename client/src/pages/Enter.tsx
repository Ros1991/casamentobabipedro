import { ArrowLeft, CalendarDays, IdCard, KeyRound, Phone, Search, UserRound, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CompanionsInput } from '../components/CompanionsInput';
import { Splash } from '../components/Splash';
import { StayPicker } from '../components/StayPicker';
import { api, ApiError, errorMessage } from '../lib/api';
import { isValidCpf, maskCpf } from '../lib/cpf';
import { firstName, maskPhone } from '../lib/format';
import { toast } from '../lib/toast';
import type { NameMatch, StayInput } from '../lib/types';
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
const cardClass = 'space-y-4 rounded-3xl border border-sand bg-cream p-5 shadow-soft';
const primaryButton =
  'w-full rounded-2xl bg-terra-dark py-4 text-lg font-semibold text-cream shadow-soft transition hover:bg-terra disabled:opacity-60';

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

/**
 * Entrada em duas etapas:
 *  1. só o WhatsApp. Quem está na lista de confirmados (ou já entrou antes) cai direto no app com os dados prontos;
 *     quem não é achado pelo número procura o próprio nome, e quem não está na lista faz o cadastro completo.
 *  2. hospedagem, datas, acompanhantes e CPF: só para quem ainda não tinha respondido isso.
 */
type Step = 'phone' | 'name' | 'new';

export function Enter() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const inviteFromLink = useMemo(() => readInviteFromLink(params), [params]);
  const config = useStore((s) => s.config);
  const loadConfig = useStore((s) => s.loadConfig);
  const authStatus = useStore((s) => s.authStatus);
  const me = useStore((s) => s.me);
  const pendingDetails = useStore((s) => s.pendingDetails);
  const finishDetails = useStore((s) => s.finishDetails);
  const loadMe = useStore((s) => s.loadMe);
  const lookup = useStore((s) => s.lookup);
  const claim = useStore((s) => s.claim);
  const enter = useStore((s) => s.enter);
  const updateMe = useStore((s) => s.updateMe);

  const [step, setStep] = useState<Step>('phone');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [stay, setStay] = useState<StayInput>(DEFAULT_STAY);
  const [arrivalDate, setArrivalDate] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [inviteCode, setInviteCode] = useState(inviteFromLink);
  const [companions, setCompanions] = useState<string[]>([]);
  const [companionCpfs, setCompanionCpfs] = useState<string[]>([]);
  const [cpf, setCpf] = useState('');
  const [showPhone, setShowPhone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<NameMatch[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);

  useEffect(() => {
    void loadConfig().catch((err) => setError(errorMessage(err)));
    if (authStatus === 'loading') void loadMe();
  }, [loadConfig, loadMe, authStatus]);

  // Etapa 2 de quem veio da lista: começa com o que já sabemos (acompanhantes e CPFs importados)
  useEffect(() => {
    if (!pendingDetails || !me) return;
    setCompanions(me.companions ?? []);
    setCompanionCpfs((me.companionCpfs ?? []).map(maskCpf));
    setCpf(me.cpf ? maskCpf(me.cpf) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDetails, me?.id]);

  // Busca pelo nome enquanto a pessoa digita
  useEffect(() => {
    if (step !== 'name') return;
    const q = query.trim();
    if (q.replace(/\s/g, '').length < 3) {
      setMatches(null);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ q, inviteCode: inviteCode.trim() });
        const res = await api<{ results: NameMatch[] }>(`/api/auth/search?${qs}`);
        if (seq === searchSeq.current) setMatches(res.results);
      } catch (err) {
        if (seq === searchSeq.current) setError(errorMessage(err));
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, step, inviteCode]);

  const goHome = () => {
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from && from !== '/entrar' ? from : '/', { replace: true });
  };

  if (authStatus === 'loading') return <Splash text="Só um instante…" />;
  if (authStatus === 'authed' && !pendingDetails) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/entrar' ? from : '/'} replace />;
  }
  if (!config) return <Splash text={error ?? 'Carregando…'} />;

  const wedding = config.wedding;
  const needsInviteField = config.inviteRequired && !inviteFromLink;

  const welcome = (guestName: string, firstTime: boolean) =>
    toast.success(firstTime ? `Bem-vindo(a), ${firstName(guestName)}! 🎉` : `Bem-vindo(a) de volta, ${firstName(guestName)}!`);

  const onPhone = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (phone.replace(/\D/g, '').length < 8) return setError('Digite seu WhatsApp com DDD.');
    setSubmitting(true);
    try {
      const res = await lookup(phone);
      if (!res.found) {
        setStep('name');
        return;
      }
      welcome(res.name, res.firstTime);
      if (!res.needsDetails) goHome();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onPick = async (match: NameMatch) => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await claim({ phone, inviteCode: inviteCode.trim(), guestId: match.guestId, companionIndex: match.companionIndex, name: match.name });
      welcome(res.name, res.firstTime);
      if (!res.needsDetails) goHome();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  /** Valida o bloco de detalhes (hospedagem, datas, CPFs). Devolve a mensagem de erro, se houver. */
  const detailsError = (): string | null => {
    if (stay.stayMode === 'custom' && !stay.customPlaceLabel.trim()) return 'Diga onde você vai ficar.';
    if (arrivalDate && departureDate && departureDate < arrivalDate) return 'A saída precisa ser depois da chegada.';
    if (cpf.trim() && !isValidCpf(cpf)) return 'Seu CPF não confere. Verifique os números.';
    const bad = companions.findIndex((c, i) => c.trim() && (companionCpfs[i] ?? '').trim() && !isValidCpf(companionCpfs[i]));
    if (bad >= 0) return `O CPF de ${companions[bad]} não confere. Verifique os números.`;
    return null;
  };

  /** Acompanhantes sem nome saem da lista, levando o CPF junto. */
  const cleanCompanions = () => {
    const kept = companions.map((c, i) => ({ name: c.trim(), cpf: (companionCpfs[i] ?? '').trim() })).filter((c) => c.name);
    return { companions: kept.map((c) => c.name), companionCpfs: kept.map((c) => c.cpf) };
  };

  const onDetails = async (e: FormEvent) => {
    e.preventDefault();
    const problem = detailsError();
    setError(problem);
    if (problem) return;
    setSubmitting(true);
    try {
      await updateMe({ ...stay, arrivalDate: arrivalDate || null, departureDate: departureDate || null, ...cleanCompanions(), cpf: cpf.trim() });
      finishDetails();
      goHome();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onNew = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError('Digite seu nome.');
    if (config.inviteRequired && !inviteCode.trim()) return setError('Digite o código do convite.');
    const problem = detailsError();
    if (problem) return setError(problem);
    setSubmitting(true);
    try {
      await enter({
        name: name.trim(),
        phone,
        inviteCode: inviteCode.trim(),
        ...stay,
        arrivalDate: arrivalDate || null,
        departureDate: departureDate || null,
        ...cleanCompanions(),
        cpf: cpf.trim(),
        showPhone,
      });
      welcome(name.trim(), true);
      goHome();
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && err.code === 'inviteCode') {
        try {
          localStorage.removeItem(INVITE_STORAGE_KEY);
        } catch {
          /* sem storage */
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const errorBox = error && <div className="rounded-2xl bg-rose/10 px-4 py-3 text-sm font-semibold text-rose">{error}</div>;

  const inviteField = needsInviteField && (
    <div className={cardClass}>
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
        />
      </label>
      <p className="text-xs text-ink-soft">Não sabe o código? Pergunte no grupo da família ou para os noivos.</p>
    </div>
  );

  /** Hospedagem, datas, acompanhantes e CPF: usado na etapa 2 e no cadastro de quem não está na lista. */
  const detailsCards = (
    <>
      <div className={cardClass}>
        <h2 className="flex items-center gap-2 font-serif text-xl font-semibold text-terra-dark">
          <Users size={22} /> Vem alguém com você?
        </h2>
        <p className="text-sm text-ink-soft">Casal, filhos, família: adicione quem vem junto e eles já contam com você.</p>
        <CompanionsInput value={companions} onChange={setCompanions} cpfs={companionCpfs} onCpfsChange={setCompanionCpfs} />
      </div>

      <div className={cardClass}>
        <h2 className="font-serif text-xl font-semibold text-terra-dark">Onde você vai ficar?</h2>
        <StayPicker value={stay} onChange={setStay} accommodations={config.accommodations} mapCenter={wedding.mapCenter} />
      </div>

      <div className={cardClass}>
        <h2 className="flex items-center gap-2 font-serif text-xl font-semibold text-terra-dark">
          <CalendarDays size={22} /> Quando você chega e vai embora?
        </h2>
        <p className="text-sm text-ink-soft">A festa é dia 19/11. Com as datas, a galera combina carona, passeio e jantar junto.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-terra-dark">Chego em</span>
            <input type="date" value={arrivalDate} min="2026-11-01" max="2026-12-31" onChange={(e) => setArrivalDate(e.target.value)} className={inputClass} />
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

      <div className={cardClass}>
        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-terra-dark">
            <IdCard size={15} /> Seu CPF <span className="font-normal text-ink-soft">(opcional)</span>
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={cpf}
            onChange={(e) => setCpf(maskCpf(e.target.value))}
            placeholder="000.000.000-00"
            className={inputClass}
          />
        </label>
        <p className="text-xs text-ink-soft">Agiliza o check-in. Só os noivos e a organização veem.</p>
      </div>
    </>
  );

  const backToPhone = (
    <button
      type="button"
      onClick={() => {
        setStep('phone');
        setError(null);
      }}
      className="flex items-center gap-1.5 text-sm font-semibold text-terra"
    >
      <ArrowLeft size={15} /> Trocar o número ({phone})
    </button>
  );

  return (
    <div className="min-h-dvh bg-cream">
      <div className="hero-photo flex min-h-[360px] flex-col justify-end px-6 pb-16 text-center" style={{ paddingTop: 'calc(var(--safe-top) + 28px)' }}>
        <h1 className="font-script text-5xl drop-shadow">Galera do casamento</h1>
        <p className="mt-2 font-serif text-2xl font-semibold tracking-wide">{wedding.couple}</p>
        <p className="mt-1 text-sm font-semibold tracking-widest text-white/90 uppercase">
          {wedding.dateLabel} · {wedding.venueCity}
        </p>
      </div>

      {/* Etapa 2: quem entrou pela lista mas ainda não disse onde fica nem quando chega */}
      {pendingDetails && me ? (
        <form onSubmit={onDetails} className="relative mx-auto -mt-4 max-w-lg space-y-6 px-4 pb-12">
          <div className={cardClass}>
            <p className="font-script text-3xl text-terra-dark">Oi, {firstName(me.name)}!</p>
            <p className="text-sm text-ink-soft text-balance">
              Você já está na lista. Só falta contar onde vai ficar e quando chega, para a galera se encontrar. Leva um minuto, e
              dá para mudar depois no perfil.
            </p>
          </div>
          {detailsCards}
          {errorBox}
          <button type="submit" disabled={submitting} className={primaryButton}>
            {submitting ? 'Salvando…' : 'Salvar e entrar'}
          </button>
          <button
            type="button"
            onClick={() => {
              finishDetails();
              goHome();
            }}
            className="w-full py-2 text-sm font-semibold text-terra"
          >
            Preencher depois
          </button>
        </form>
      ) : step === 'phone' ? (
        <form onSubmit={onPhone} className="relative mx-auto -mt-4 max-w-lg space-y-6 px-4 pb-12">
          <div className={cardClass}>
            <div className="-mt-14 flex justify-center -space-x-3">
              <img src="/img/pedro.webp" alt="Pedro" width={80} height={80} className="size-20 rounded-full border-4 border-cream object-cover shadow-soft" />
              <img src="/img/babi.webp" alt="Babi" width={80} height={80} className="size-20 rounded-full border-4 border-cream object-cover shadow-soft" />
            </div>
            <p className="text-sm text-ink-soft text-balance">
              Para entrar, é só o seu WhatsApp. Se você confirmou presença, seus dados já estão aqui: quem fica onde, a
              programação e as fotos da viagem num lugar só.
            </p>
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
            </label>
            <p className="text-xs text-ink-soft">Número de fora do Brasil? Comece com + e o código do país (ex.: +1 425…).</p>
          </div>
          {errorBox}
          <button type="submit" disabled={submitting} className={primaryButton}>
            {submitting ? 'Procurando…' : 'Entrar'}
          </button>
          <p className="text-center text-xs text-ink-soft text-balance">
            Seus dados ficam visíveis só para os convidados e serão apagados depois do casamento. Seu WhatsApp só aparece se você
            permitir.
          </p>
        </form>
      ) : step === 'name' ? (
        <div className="relative mx-auto -mt-4 max-w-lg space-y-6 px-4 pb-12">
          <div className={cardClass}>
            {backToPhone}
            <h2 className="font-serif text-xl font-semibold text-terra-dark">Não achamos esse número</h2>
            <p className="text-sm text-ink-soft text-balance">
              Sem problema: procure seu nome na lista de confirmados e a gente guarda seu WhatsApp.
            </p>
            <label className="block">
              <span className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-terra-dark">
                <Search size={15} /> Seu nome
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Digite pelo menos 3 letras"
                autoComplete="off"
                autoFocus
                className={inputClass}
              />
            </label>
            {searching && !matches && <p className="text-sm text-ink-soft">Procurando…</p>}
            {matches && matches.length === 0 && <p className="text-sm text-ink-soft">Ninguém com esse nome na lista. Tente só o primeiro nome.</p>}
            {matches && matches.length > 0 && (
              <ul className="space-y-2">
                {matches.map((m) => (
                  <li key={`${m.guestId}-${m.companionIndex ?? 'eu'}`}>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => onPick(m)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-sand bg-white/60 px-3.5 py-3 text-left transition hover:border-terra-light disabled:opacity-60"
                    >
                      <span className="rounded-full bg-cream-dark p-2 text-terra">
                        <UserRound size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-ink">{m.name}</span>
                        {m.invite && m.invite !== m.name && <span className="block truncate text-xs text-ink-soft">Convite: {m.invite}</span>}
                      </span>
                      <span className="text-sm font-semibold text-terra">Sou eu</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {inviteField}
          {errorBox}
          <button
            type="button"
            onClick={() => {
              setStep('new');
              setError(null);
              if (!name) setName(query.trim());
            }}
            className="w-full rounded-2xl border border-terra bg-cream py-3.5 font-semibold text-terra-dark"
          >
            Não estou na lista, quero me cadastrar
          </button>
        </div>
      ) : (
        <form onSubmit={onNew} className="relative mx-auto -mt-4 max-w-lg space-y-6 px-4 pb-12">
          <div className={cardClass}>
            {backToPhone}
            <p className="text-sm text-ink-soft text-balance">
              Diga quem você é e onde vai ficar. Assim a galera se encontra, combina passeios e as fotos da viagem ficam todas
              num lugar só.
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
            <label className="flex items-start gap-2 text-xs text-ink-soft">
              <input type="checkbox" checked={showPhone} onChange={(e) => setShowPhone(e.target.checked)} className="mt-0.5 accent-terra" />
              <span>Mostrar meu WhatsApp para os outros convidados (para combinar carona, passeio…)</span>
            </label>
          </div>
          {detailsCards}
          {inviteField}
          {errorBox}
          <button type="submit" disabled={submitting} className={primaryButton}>
            {submitting ? 'Entrando…' : 'Entrar na galera'}
          </button>
        </form>
      )}
    </div>
  );
}
