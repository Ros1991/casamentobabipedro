const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
const longDayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });
const dateTimeFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function formatTime(ms: number): string {
  return timeFmt.format(new Date(ms));
}

export function formatDateTime(ms: number): string {
  return dateTimeFmt.format(new Date(ms));
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Hoje", "Ontem" ou "qui., 17/12" */
export function formatDayLabel(ms: number): string {
  const today = startOfDay(new Date());
  const day = startOfDay(new Date(ms));
  const diff = Math.round((today - day) / 86_400_000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return capitalize(dayFmt.format(new Date(ms)).replace('.', ''));
}

/** Converte "YYYY-MM-DD" em Date local ao meio-dia (evita pular de dia por fuso). */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "qui 17/12" */
export function formatDateShort(value: string): string {
  return capitalize(dayFmt.format(parseDateOnly(value)).replace('.', ''));
}

/** "17/12" */
export function formatDayMonth(value: string): string {
  return shortDateFmt.format(parseDateOnly(value));
}

/** "quinta-feira, 17 de dezembro" */
export function formatDateLong(value: string): string {
  return capitalize(longDayFmt.format(parseDateOnly(value)));
}

export function addDays(value: string, days: number): string {
  const d = parseDateOnly(value);
  d.setDate(d.getDate() + days);
  return toDateOnly(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDateOnly(b).getTime() - parseDateOnly(a).getTime()) / 86_400_000);
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Máscara (49) 99944-2022 enquanto digita; aceita também números internacionais com "+" */
export function maskPhone(raw: string): string {
  if (raw.trim().startsWith('+')) return '+' + raw.replace(/[^\d]/g, '').slice(0, 15);
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function formatPhone(phone: string): string {
  if (phone.startsWith('55') && (phone.length === 12 || phone.length === 13)) {
    const ddd = phone.slice(2, 4);
    const rest = phone.slice(4);
    return `(${ddd}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return '+' + phone;
}

export function whatsappLink(phone: string, text?: string): string {
  const base = `https://wa.me/${phone}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

export function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** "Marina" / "Marina e João" / "Marina, João e Ana" */
export function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/** "Rodrigo e Marina" / "Rodrigo, Marina e João" */
export function partyLabel(name: string, companions: string[] | undefined): string {
  if (!companions || companions.length === 0) return name;
  return joinNames([name, ...companions]);
}

/** "+1", "+2"… ou null quando vem sozinho */
export function companionBadge(companions: string[] | undefined): string | null {
  const n = companions?.length ?? 0;
  return n > 0 ? `+${n}` : null;
}

/** Total de pessoas numa lista de convidados (cada um conta 1 + acompanhantes). */
export function countPeople(list: { companions?: string[] }[]): number {
  return list.reduce((sum, g) => sum + 1 + (g.companions?.length ?? 0), 0);
}
