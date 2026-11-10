import { Camera, LogOut, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { AvatarCropper } from '../components/AvatarCropper';
import { CompanionsInput } from '../components/CompanionsInput';
import { InstallBanner } from '../components/InstallBanner';
import { NotificationsCard } from '../components/NotificationsCard';
import { StayPicker } from '../components/StayPicker';
import { errorMessage } from '../lib/api';
import { isValidCpf, maskCpf } from '../lib/cpf';
import { formatPhone } from '../lib/format';
import { toast } from '../lib/toast';
import type { StayInput } from '../lib/types';
import { useStore } from '../store';

const inputClass =
  'w-full rounded-2xl border border-sand bg-white/70 px-4 py-3 text-ink outline-none placeholder:text-ink-soft/60 focus:border-terra';

export function Perfil() {
  const navigate = useNavigate();
  const me = useStore((s) => s.me);
  const isAdmin = useStore((s) => s.isAdmin);
  const config = useStore((s) => s.config);
  const updateMe = useStore((s) => s.updateMe);
  const uploadAvatar = useStore((s) => s.uploadAvatar);
  const removeAvatar = useStore((s) => s.removeAvatar);
  const logout = useStore((s) => s.logout);
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [stay, setStay] = useState<StayInput | null>(null);
  const [arrivalDate, setArrivalDate] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [companions, setCompanions] = useState<string[]>([]);
  const [companionCpfs, setCompanionCpfs] = useState<string[]>([]);
  const [cpf, setCpf] = useState('');
  const [showPhone, setShowPhone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    if (!me) return;
    setName(me.name);
    setArrivalDate(me.arrivalDate ?? '');
    setDepartureDate(me.departureDate ?? '');
    setCompanions(me.companions ?? []);
    setCompanionCpfs((me.companionCpfs ?? []).map(maskCpf));
    setCpf(me.cpf ? maskCpf(me.cpf) : '');
    setShowPhone(me.showPhone);
    setStay({
      stayMode: me.accommodationId ? 'preset' : me.customPlaceLabel ? 'custom' : 'unknown',
      accommodationId: me.accommodationId,
      customPlaceLabel: me.customPlaceLabel ?? '',
      customCity: me.customCity ?? 'Aquiraz Riviera',
      customLat: me.customLat,
      customLng: me.customLng,
    });
    // Só na primeira carga: edições locais não devem ser sobrescritas por eventos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  if (!me || !config || !stay) return null;

  const save = async () => {
    if (name.trim().length < 2) return toast.error('Digite seu nome.');
    if (stay.stayMode === 'custom' && !stay.customPlaceLabel.trim()) return toast.error('Diga onde você vai ficar.');
    if (arrivalDate && departureDate && departureDate < arrivalDate) return toast.error('A saída precisa ser depois da chegada.');
    if (cpf.trim() && !isValidCpf(cpf)) return toast.error('Seu CPF não confere. Verifique os números.');
    const kept = companions.map((c, i) => ({ name: c.trim(), cpf: (companionCpfs[i] ?? '').trim() })).filter((c) => c.name);
    const badCpf = kept.find((c) => c.cpf && !isValidCpf(c.cpf));
    if (badCpf) return toast.error(`O CPF de ${badCpf.name} não confere. Verifique os números.`);
    setSaving(true);
    try {
      await updateMe({
        name: name.trim(),
        ...stay,
        arrivalDate: arrivalDate || null,
        departureDate: departureDate || null,
        companions: kept.map((c) => c.name),
        companionCpfs: kept.map((c) => c.cpf),
        cpf: cpf.trim(),
        showPhone,
      });
      toast.success('Perfil atualizado!');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Escolheu a foto: abre o ajuste de enquadramento antes de enviar
  const onAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) setCropFile(file);
  };

  const onCropped = async (blob: Blob) => {
    setAvatarBusy(true);
    try {
      await uploadAvatar(blob);
      toast.success('Foto de perfil atualizada!');
      setCropFile(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setAvatarBusy(false);
    }
  };

  const onRemoveAvatar = async () => {
    setAvatarBusy(true);
    try {
      await removeAvatar();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setAvatarBusy(false);
    }
  };

  const doLogout = async () => {
    await logout();
    navigate('/entrar', { replace: true });
  };

  return (
    <div className="space-y-5 px-4 pt-5 pb-10">
      {cropFile && <AvatarCropper file={cropFile} busy={avatarBusy} onCancel={() => setCropFile(null)} onConfirm={onCropped} />}
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar guest={me} size={84} badge={me.companions?.length ? `+${me.companions.length}` : null} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={avatarBusy}
            className="absolute -right-1 -bottom-1 rounded-full bg-terra-dark p-2 text-cream shadow-soft disabled:opacity-60"
            aria-label="Trocar foto de perfil"
          >
            <Camera size={15} />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onAvatar} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-serif text-2xl font-semibold text-terra-dark">{me.name}</div>
          {me.phone && <div className="text-sm text-ink-soft">{formatPhone(me.phone)}</div>}
          {me.avatarUrl && (
            <button type="button" onClick={onRemoveAvatar} disabled={avatarBusy} className="mt-1 flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-rose">
              <Trash2 size={12} /> Remover foto
            </button>
          )}
        </div>
      </div>

      <section className="space-y-4 rounded-3xl border border-sand bg-cream p-5 shadow-soft">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-terra-dark">Nome</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-terra-dark">
            CPF <span className="font-normal text-ink-soft">(opcional, agiliza o check-in; só os noivos veem)</span>
          </span>
          <input type="text" inputMode="numeric" autoComplete="off" value={cpf} onChange={(e) => setCpf(maskCpf(e.target.value))} placeholder="000.000.000-00" className={inputClass} />
        </label>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" checked={showPhone} onChange={(e) => setShowPhone(e.target.checked)} className="mt-1 accent-terra" />
          <span>
            Mostrar meu WhatsApp para os outros convidados
            <span className="block text-xs text-ink-soft">Aparece um botão de conversa ao lado do seu nome no mapa e nas chegadas.</span>
          </span>
        </label>
      </section>

      <section className="space-y-3 rounded-3xl border border-sand bg-cream p-5 shadow-soft">
        <h2 className="flex items-center gap-2 font-serif text-2xl font-semibold text-terra-dark">
          <Users size={22} /> Quem vem comigo
        </h2>
        <CompanionsInput value={companions} onChange={setCompanions} cpfs={companionCpfs} onCpfsChange={setCompanionCpfs} />
      </section>

      <section className="space-y-4 rounded-3xl border border-sand bg-cream p-5 shadow-soft">
        <h2 className="font-serif text-2xl font-semibold text-terra-dark">Onde vou ficar</h2>
        <StayPicker value={stay} onChange={setStay} accommodations={config.accommodations} mapCenter={config.wedding.mapCenter} />
      </section>

      <section className="space-y-4 rounded-3xl border border-sand bg-cream p-5 shadow-soft">
        <h2 className="font-serif text-2xl font-semibold text-terra-dark">Quando chego e vou embora</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-terra-dark">Chego em</span>
            <input type="date" value={arrivalDate} min="2026-11-01" max="2026-12-31" onChange={(e) => setArrivalDate(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-terra-dark">Vou embora em</span>
            <input type="date" value={departureDate} min={arrivalDate || '2026-11-01'} max="2026-12-31" onChange={(e) => setDepartureDate(e.target.value)} className={inputClass} />
          </label>
        </div>
      </section>

      <button type="button" onClick={save} disabled={saving} className="w-full rounded-2xl bg-terra-dark py-4 text-lg font-semibold text-cream shadow-soft hover:bg-terra disabled:opacity-60">
        {saving ? 'Salvando…' : 'Salvar alterações'}
      </button>

      <NotificationsCard />

      <InstallBanner always />

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        {isAdmin ? (
          <Link to="/admin" className="flex items-center gap-1.5 rounded-full border border-terra bg-terra-pale px-4 py-2 text-sm font-semibold text-terra-dark">
            <ShieldCheck size={16} /> Administração
          </Link>
        ) : (
          <span />
        )}
        {confirmLogout ? (
          <span className="flex items-center gap-2 text-sm">
            Sair mesmo?
            <button type="button" onClick={doLogout} className="rounded-full bg-rose px-3 py-1.5 font-semibold text-cream">
              Sim, sair
            </button>
            <button type="button" onClick={() => setConfirmLogout(false)} className="rounded-full border border-sand px-3 py-1.5">
              Não
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmLogout(true)} className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-ink-soft hover:text-rose">
            <LogOut size={16} /> Sair
          </button>
        )}
      </div>
    </div>
  );
}
