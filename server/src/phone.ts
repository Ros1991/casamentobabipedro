/**
 * Normaliza um telefone para só dígitos com código do país.
 * Entrada típica brasileira "(49) 99944-2022" → "5549999442022".
 * Números com "+" explícito de outro país são aceitos como estão (8 a 15 dígitos).
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  const international = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (international) {
    if (digits.startsWith('55')) return normalizeBrazil(digits.slice(2));
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }

  // Sem "+": assume Brasil
  digits = digits.replace(/^0+/, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return normalizeBrazil(digits.slice(2));
  }
  return normalizeBrazil(digits);
}

function normalizeBrazil(local: string): string | null {
  // DDD (2) + número (8 ou 9)
  if (local.length !== 10 && local.length !== 11) return null;
  const ddd = Number(local.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  return '55' + local;
}

/** "5549999442022" → "(49) 99944-2022" */
export function formatPhone(phone: string): string {
  if (phone.startsWith('55') && (phone.length === 12 || phone.length === 13)) {
    const ddd = phone.slice(2, 4);
    const rest = phone.slice(4);
    return `(${ddd}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return '+' + phone;
}
