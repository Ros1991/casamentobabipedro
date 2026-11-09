/** CPF: devolve os 11 dígitos se for válido (dígitos verificadores conferem), senão null. */
export function normalizeCpf(input: unknown): string | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  let d = String(input).replace(/\D/g, '');
  if (d.length === 0 || d.length > 11) return null;
  // Planilhas costumam comer os zeros à esquerda
  if (d.length >= 9) d = d.padStart(11, '0');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return null;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return digit(9) === Number(d[9]) && digit(10) === Number(d[10]) ? d : null;
}

export function formatCpf(cpf: string): string {
  return cpf.length === 11 ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}` : cpf;
}

/**
 * Lista de CPFs dos acompanhantes, alinhada com os nomes ('' quando não informado).
 * Devolve o índice do primeiro CPF inválido em `invalid`, se houver.
 */
export function parseCompanionCpfs(value: unknown, count: number): { cpfs: string[]; invalid: number | null } {
  const list = Array.isArray(value) ? value : [];
  const cpfs: string[] = [];
  let invalid: number | null = null;
  for (let i = 0; i < count; i++) {
    const raw = typeof list[i] === 'string' ? (list[i] as string).trim() : '';
    if (!raw) {
      cpfs.push('');
      continue;
    }
    const cpf = normalizeCpf(raw);
    if (!cpf && invalid === null) invalid = i;
    cpfs.push(cpf ?? '');
  }
  return { cpfs, invalid };
}
