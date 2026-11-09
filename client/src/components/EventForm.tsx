import { useEffect, useState } from 'react';
import { errorMessage } from '../lib/api';
import type { LatLng } from '../lib/geo';
import { toast } from '../lib/toast';
import type { EventItem, EventPayload } from '../lib/types';
import { useStore } from '../store';
import { BottomSheet } from './BottomSheet';
import { PickLocationMap } from './map/PickLocationMap';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Quando presente, edita em vez de criar */
  editing?: EventItem | null;
}

const inputClass =
  'w-full rounded-2xl border border-sand bg-white/70 px-4 py-3 text-ink outline-none placeholder:text-ink-soft/60 focus:border-terra';

export function EventForm({ open, onClose, editing }: Props) {
  const isAdmin = useStore((s) => s.isAdmin);
  const config = useStore((s) => s.config);
  const createEvent = useStore((s) => s.createEvent);
  const updateEvent = useStore((s) => s.updateEvent);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [placeLabel, setPlaceLabel] = useState('');
  const [point, setPoint] = useState<LatLng | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [description, setDescription] = useState('');
  const [isOfficial, setIsOfficial] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? '');
    setDate(editing?.date ?? '');
    setTime(editing?.time ?? '');
    setPlaceLabel(editing?.placeLabel ?? '');
    const hasPoint = editing?.placeLat !== null && editing?.placeLat !== undefined && editing?.placeLng !== null && editing?.placeLng !== undefined;
    setPoint(hasPoint ? { lat: editing!.placeLat!, lng: editing!.placeLng! } : null);
    setShowMap(hasPoint);
    setDescription(editing?.description ?? '');
    setIsOfficial(editing ? editing.isOfficial : isAdmin);
  }, [open, editing, isAdmin]);

  const submit = async () => {
    if (title.trim().length < 3) return toast.error('Dê um nome ao combinado.');
    if (!date) return toast.error('Escolha a data.');
    const payload: EventPayload = {
      title: title.trim(),
      description: description.trim() || null,
      date,
      time: time || null,
      placeLabel: placeLabel.trim() || null,
      placeLat: showMap && point ? point.lat : null,
      placeLng: showMap && point ? point.lng : null,
      isOfficial: isAdmin ? isOfficial : undefined,
    };
    setSaving(true);
    try {
      if (editing) {
        await updateEvent(editing.id, payload);
        toast.success('Combinado atualizado.');
      } else {
        await createEvent(payload);
        toast.success(isAdmin && isOfficial ? 'Combinado criado e galera avisada! 💍' : 'Combinado criado! Ele já está no mural.');
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const center: [number, number] = [-9.834, -35.886];

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? 'Editar combinado' : 'Novo combinado'} maxHeight="max-h-[92dvh]">
      <div className="space-y-4 pb-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-terra-dark">O que vai rolar?</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Jangaday na Praia do Gunga"
            maxLength={80}
            className={inputClass}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-terra-dark">Dia</span>
            <input type="date" value={date} min="2026-11-15" max="2027-01-31" onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-terra-dark">
              Hora <span className="font-normal text-ink-soft">(opcional)</span>
            </span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-terra-dark">
            Onde <span className="font-normal text-ink-soft">(opcional)</span>
          </span>
          <input
            type="text"
            value={placeLabel}
            onChange={(e) => setPlaceLabel(e.target.value)}
            placeholder="Ex.: Saída do Manhattan Beach Riviera"
            maxLength={100}
            className={inputClass}
          />
        </label>

        <div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={showMap} onChange={(e) => setShowMap(e.target.checked)} className="accent-terra" />
            Marcar o ponto no mapa
          </label>
          {showMap && (
            <div className="mt-2">
              <PickLocationMap value={point} onChange={setPoint} center={center} zoom={13} className="h-44" />
              <p className="mt-1 text-xs text-ink-soft">Toque no mapa para colocar o pino. O combinado aparece no mapa da galera.</p>
            </div>
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-terra-dark">
            Detalhes <span className="font-normal text-ink-soft">(opcional)</span>
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Valor por pessoa, o que levar, ponto de encontro, link para pagar…"
            maxLength={600}
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </label>

        {isAdmin && (
          <label className="flex items-start gap-2 rounded-2xl bg-terra-pale px-3 py-2.5 text-sm text-terra-dark">
            <input type="checkbox" checked={isOfficial} onChange={(e) => setIsOfficial(e.target.checked)} className="mt-0.5 accent-terra" />
            <span>
              <strong>Combinado dos noivos</strong>
              <span className="block text-xs">Fica em destaque, aparece no Início e no telão e avisa todo mundo no celular.</span>
            </span>
          </label>
        )}

        {!editing && (
          <p className="text-xs text-ink-soft">
            {config?.wedding.shortCouple ?? 'Os noivos'} e a galera veem o combinado na Agenda e no mural. Você já entra como confirmado(a).
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="w-full rounded-2xl bg-terra-dark py-3.5 font-semibold text-cream shadow-soft hover:bg-terra disabled:opacity-60"
        >
          {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar combinado'}
        </button>
      </div>
    </BottomSheet>
  );
}
