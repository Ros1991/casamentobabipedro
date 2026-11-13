// Importa a lista de confirmados (planilha .xlsx dos noivos) para o site.
//
// Uso:
//   IMPORT_TOKEN=... node scripts/importar-lista.mjs "C:/caminho/lista.xlsx" https://endereco-do-site [--dry] [--reset]
//
// A planilha NÃO fica no repositório (tem telefone e CPF). O script lê o arquivo, monta os grupos e manda
// para POST /api/import, protegido pelo token IMPORT_TOKEN (variável do servidor). --dry só mostra o que faria.
//
// O que ele faz:
//   - considera só as linhas com situação "Confirmado";
//   - padroniza os telefones (qualquer formato; DDI da coluna ao lado; Brasil quando vazio);
//   - cada pessoa com telefone próprio vira um convidado; quem não tem telefone (ou divide o número com outra
//     pessoa do convite) entra como acompanhante;
//   - leva hospedagem, chegada, saída e CPF, e cria os combinados da programação com as presenças do formulário.
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// O Railway falha por IPv6 em algumas redes: força IPv4
dns.setDefaultResultOrder('ipv4first');

const [file, baseUrl] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const dry = process.argv.includes('--dry');
// --reset apaga TUDO do site antes de importar (convidados, mural, fotos, combinados). Só para zerar dados de teste.
const reset = process.argv.includes('--reset');
if (!file || !baseUrl) {
  console.error('Uso: IMPORT_TOKEN=... node scripts/importar-lista.mjs <planilha.xlsx> <url-do-site> [--dry]');
  process.exit(1);
}
// Token: variável IMPORT_TOKEN ou o arquivo data/import-token.txt (a pasta data/ não vai para o git)
const tokenFile = path.resolve(import.meta.dirname, '../data/import-token.txt');
const token = process.env.IMPORT_TOKEN || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : '');
if (!token) {
  console.error('Defina IMPORT_TOKEN (o mesmo valor configurado no servidor) ou grave o token em data/import-token.txt.');
  process.exit(1);
}

// ---------- leitura do .xlsx (zip + XML), sem dependências ----------
function unzip(buf) {
  const files = {};
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Arquivo não parece um .xlsx válido.');
  let p = buf.readUInt32LE(eocd + 16);
  const total = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < total; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    files[name] = method === 0 ? data : zlib.inflateRawSync(data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/_x000D_/g, '');

function readSheet(path) {
  const files = unzip(fs.readFileSync(path));
  const text = (name) => (files[name] ? files[name].toString('utf8') : '');
  const strings = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join('')),
  );
  const sheetName = Object.keys(files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  const col = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const rows = [];
  for (const r of text(sheetName).matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const c of r[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const type = /t="(\w+)"/.exec(c[2])?.[1];
      const body = c[3] ?? '';
      let v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '';
      if (type === 's') v = strings[Number(v)] ?? '';
      else if (type === 'inlineStr') v = decode([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
      else v = decode(v);
      row[col(c[1])] = String(v).trim();
    }
    rows.push(row);
  }
  return rows;
}

// ---------- normalização ----------
const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
const slug = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Mesmo critério do servidor (server/src/phone.ts): só dígitos com código do país. */
function normalizePhone(ddi, tel) {
  const clean = String(tel ?? '').replace(/[^\d+]/g, '');
  if (!clean.replace(/\D/g, '')) return null;
  const brazil = (local) => (local.length === 10 || local.length === 11) && Number(local.slice(0, 2)) >= 11 ? '55' + local : null;
  let digits = clean.replace(/\D/g, '');
  const code = String(ddi ?? '').replace(/\D/g, '') || '55';
  if (clean.startsWith('+')) {
    if (digits.startsWith('55')) return brazil(digits.slice(2));
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }
  if (code !== '55') {
    if (digits.startsWith(code) && digits.length > 10) digits = digits.slice(code.length);
    const full = code + digits.replace(/^0+/, '');
    return full.length >= 8 && full.length <= 15 ? full : null;
  }
  digits = digits.replace(/^0+/, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return brazil(digits.slice(2));
  return brazil(digits);
}

/** Número serial do Excel (ou texto de data) → "YYYY-MM-DD" dentro da janela do casamento; senão null. */
function toDate(v) {
  if (!v) return null;
  let iso = null;
  if (/^\d+(\.\d+)?$/.test(v)) iso = new Date(Math.round((Math.floor(Number(v)) - 25569) * 86400000)).toISOString().slice(0, 10);
  else if (/^\d{4}-\d{2}-\d{2}/.test(v)) iso = v.slice(0, 10);
  else if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(v)) {
    const [d, m, y] = v.split(/[\/ ]/);
    iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return iso && iso >= '2026-11-01' && iso <= '2026-12-31' ? iso : null;
}

function stayOf(text) {
  const t = fold(text);
  if (!t) return {};
  if (t.includes('manhattan')) return { accommodationId: 'manhattan-riviera' };
  if (t.includes('beach place')) return { accommodationId: 'riviera-beach-place' };
  if (t.includes('dom pedro')) return { accommodationId: 'dom-pedro-laguna' };
  if (t.includes('jangadeiro')) return { accommodationId: 'hotel-jangadeiro' };
  if (t.includes('pousada do sol')) return { accommodationId: 'pousada-do-sol' };
  if (t.includes('fortaleza')) return { customPlaceLabel: t.includes('mora') ? 'Mora em Fortaleza' : 'Fortaleza', customCity: 'Fortaleza' };
  return {}; // "Outro", "parte em cada hospedagem": a pessoa ajusta no perfil
}

// ---------- combinados da programação e como cada resposta do formulário vira presença ----------
const VENUE = { placeLabel: 'Beach Club Aquiraz Riviera', placeLat: -3.9224405, placeLng: -38.3278161 };
const TBD = 'Horário e local serão confirmados pelos noivos por aqui.';
const EVENTS = [
  { id: 'prog-cerimonia', title: 'Cerimônia e festa', date: '2026-11-19', time: '15:30', description: 'O grande dia! Das 15h30 às 23h. Traje esporte fino.', ...VENUE },
  { id: 'prog-pagode', title: 'Pagode de sexta', date: '2026-11-20', description: `Dia de praia, piscina e pagode. ${TBD}` },
  { id: 'prog-beach-park', title: 'Beach Park', date: '2026-11-21', description: `Sugestão para quem tem filhos (e para quem quiser ir junto). ${TBD}`, placeLabel: 'Beach Park, Porto das Dunas' },
  { id: 'prog-buggy', title: 'Passeio de buggy', date: '2026-11-21', description: `Passeio de buggy pela região. ${TBD}` },
  { id: 'prog-resort', title: 'Dia de resort', date: '2026-11-21', description: 'Para quem prefere aproveitar a piscina e o resort no sábado.' },
  { id: 'prog-sabado-noite', title: 'Sábado à noite', date: '2026-11-21', description: `Encontro da galera no sábado à noite. ${TBD}` },
];
function answersOf(p) {
  const out = { 'prog-cerimonia': 'yes' };
  const pagode = fold(p.pagode);
  if (pagode === 'sim') out['prog-pagode'] = 'yes';
  else if (pagode === 'nao') out['prog-pagode'] = 'no';
  else if (pagode) out['prog-pagode'] = 'maybe';
  const dia = fold(p.sabadoDia);
  // Os três programas de sábado de dia são alternativas: quem escolheu um não vai nos outros dois;
  // quem já terá ido embora não vai em nenhum; quem marcou "Não decidi" fica sem resposta (aparece como pendente).
  const saturday = ['prog-beach-park', 'prog-buggy', 'prog-resort'];
  const chosen = dia.includes('beach park') ? 'prog-beach-park' : dia.includes('buggy') ? 'prog-buggy' : dia.includes('resort') ? 'prog-resort' : null;
  if (chosen) for (const id of saturday) out[id] = id === chosen ? 'yes' : 'no';
  else if (dia.includes('ido embora')) for (const id of saturday) out[id] = 'no';
  const noite = fold(p.sabadoNoite);
  if (noite.startsWith('sim') || noite.startsWith('animo')) out['prog-sabado-noite'] = 'yes';
  else if (noite.startsWith('ja tenho')) out['prog-sabado-noite'] = 'no';
  return out;
}

// ---------- ajustes manuais (data/ajustes-lista.json, fora do git) ----------
// Correções combinadas com os noivos que valem por cima da planilha, por nome da pessoa:
//   { "Fulana de Tal": { "chegada": "2026-11-13", "saida": "2026-11-21", "contaPropria": true } }
// "contaPropria" tira a pessoa da lista de acompanhantes e dá a ela uma conta separada (com as datas dela).
const overridesFile = path.resolve(import.meta.dirname, '../data/ajustes-lista.json');
const overridesRaw = fs.existsSync(overridesFile) ? JSON.parse(fs.readFileSync(overridesFile, 'utf8')) : {};
// "_adicionar": pessoas que não estão na planilha (ex.: cerimonial), cada uma com conta própria:
//   [{ "nome": "Fulana", "telefone": "+55 85 99999-9999", "chegada": "2026-11-19", "saida": "2026-11-19", "hospedagem": "Mora em Fortaleza" }]
const extras = Array.isArray(overridesRaw._adicionar) ? overridesRaw._adicionar : [];
const overrides = new Map(
  Object.entries(overridesRaw)
    .filter(([name]) => !name.startsWith('_'))
    .map(([name, o]) => [fold(name), o]),
);
const usedOverrides = new Set();

// ---------- planilha → pessoas ----------
const rows = readSheet(file);
const headerIndex = rows.findIndex((r) => r.some((c) => fold(c) === 'convidado') && r.some((c) => fold(c) === 'telefone'));
if (headerIndex < 0) throw new Error('Não achei a linha de cabeçalho (com "Convidado" e "Telefone").');
const header = rows[headerIndex].map(fold);
const at = (...names) => header.findIndex((h) => names.some((n) => h.startsWith(n)));
const C = {
  invite: at('convite'), group: at('grupo'), ddi: at('ddi'), phone: at('telefone'), name: at('convidado'), age: at('faixa'),
  status: at('situacao'), cpf: at('cpf'), arrival: at('chegada'), departure: at('saida'), stay: at('hospedagem'),
  pagode: at('pagode'), sabadoDia: at('sabado (dia'), sabadoNoite: at('sabado (noite'),
};
const cell = (r, i) => (i >= 0 ? (r[i] ?? '') : '');

const people = [];
let skipped = 0;
for (const r of rows.slice(headerIndex + 1)) {
  const name = cell(r, C.name);
  if (!name) continue;
  if (!fold(cell(r, C.status)).startsWith('confirmad')) {
    skipped++;
    continue;
  }
  let arrival = toDate(cell(r, C.arrival));
  let departure = toDate(cell(r, C.departure));
  if (arrival && departure && departure < arrival) arrival = departure = null;
  const adjust = overrides.get(fold(name));
  if (adjust) {
    usedOverrides.add(fold(name));
    if (adjust.chegada !== undefined) arrival = adjust.chegada;
    if (adjust.saida !== undefined) departure = adjust.saida;
  }
  people.push({
    separate: adjust?.contaPropria === true,
    name,
    invite: cell(r, C.invite) || name,
    phone: normalizePhone(cell(r, C.ddi), cell(r, C.phone)),
    rawPhone: cell(r, C.phone),
    adult: !/crianca|adolescente/.test(fold(cell(r, C.age))),
    cpf: cell(r, C.cpf),
    arrival,
    departure,
    stay: stayOf(cell(r, C.stay)),
    pagode: cell(r, C.pagode),
    sabadoDia: cell(r, C.sabadoDia),
    sabadoNoite: cell(r, C.sabadoNoite),
  });
}

// Pessoas extras (fora da planilha)
for (const x of extras) {
  if (!x?.nome) continue;
  if (people.some((p) => fold(p.name) === fold(x.nome))) continue; // já está na planilha
  people.push({
    separate: false,
    name: x.nome,
    invite: x.convite || x.nome,
    phone: normalizePhone('', x.telefone ?? ''),
    rawPhone: x.telefone ?? '',
    adult: true,
    cpf: x.cpf ?? '',
    arrival: toDate(x.chegada ?? ''),
    departure: toDate(x.saida ?? ''),
    stay: stayOf(x.hospedagem ?? ''),
    pagode: '',
    sabadoDia: '',
    sabadoNoite: '',
  });
}
if (extras.length) console.log(`Pessoas extras (fora da planilha): ${extras.length}`);

// ---------- pessoas → contas (quem tem telefone próprio) + acompanhantes ----------
const MAX_COMPANIONS = 6;
const notes = [];
const guests = [];
const rsvps = [];
/** Contas tocadas por ajuste manual: o servidor corrige datas e acompanhantes mesmo se a pessoa já entrou no app */
const forceKeys = [];
const usedPhones = new Map();
const byInvite = new Map();
for (const p of people) byInvite.set(p.invite, [...(byInvite.get(p.invite) ?? []), p]);

for (const [invite, members] of byInvite) {
  for (const p of members) if (p.rawPhone && !p.phone) notes.push(`Telefone não reconhecido de ${p.name} ("${p.rawPhone}"): entra sem telefone e se acha pelo nome.`);
  const holders = [];
  // adultos primeiro: criança só vira titular se nenhum adulto do convite tiver telefone
  for (const p of [...members.filter((m) => m.adult), ...members.filter((m) => !m.adult)]) {
    if (!p.phone || holders.some((h) => h.phone === p.phone)) continue;
    if (usedPhones.has(p.phone)) {
      notes.push(`${p.name} (${invite}) tem o mesmo telefone de ${usedPhones.get(p.phone)}, de outro convite: entra sem telefone.`);
      p.phone = null;
      continue;
    }
    if (!p.adult && members.some((m) => m.adult && m.phone)) continue;
    usedPhones.set(p.phone, p.name);
    holders.push({ ...p, group: [p] });
  }
  // Ajuste manual: pessoa com conta própria mesmo sem telefone (ex.: chega em outro dia)
  for (const p of members) {
    if (p.separate && !holders.some((h) => h.name === p.name)) holders.push({ ...p, phone: null, group: [p] });
  }
  if (holders.length === 0) {
    const first = members.find((m) => m.adult) ?? members[0];
    holders.push({ ...first, phone: null, group: [first] });
  }
  const holderNames = new Set(holders.map((h) => h.name));
  for (const p of members) {
    if (holderNames.has(p.name)) continue;
    const owner = holders.find((h) => p.phone && h.phone === p.phone) ?? holders.find((h) => !h.separate) ?? holders[0];
    owner.group.push(p);
  }
  for (const h of holders) {
    let companions = h.group.slice(1);
    if (companions.length > MAX_COMPANIONS) {
      notes.push(`${h.name} (${invite}): ${companions.length} acompanhantes, ficaram os ${MAX_COMPANIONS} primeiros.`);
      companions = companions.slice(0, MAX_COMPANIONS);
    }
    const key = slug(`${invite}--${h.name}`);
    // hospedagem e datas: as do titular; se ele não respondeu, as de alguém do grupo
    const withStay = [h, ...companions].find((m) => Object.keys(m.stay).length) ?? h;
    // datas: as do titular; o que faltar, completa com as de alguém do grupo
    const withDates = {
      arrival: h.arrival ?? companions.find((m) => m.arrival)?.arrival ?? null,
      departure: h.departure ?? companions.find((m) => m.departure)?.departure ?? null,
    };
    if (members.some((m) => usedOverrides.has(fold(m.name))) && [h, ...h.group, ...members.filter((m) => m.separate)].some((m) => usedOverrides.has(fold(m.name)))) forceKeys.push(key);
    guests.push({
      key,
      name: h.name,
      phone: h.phone ? '+' + h.phone : null,
      inviteLabel: invite,
      cpf: h.cpf,
      companions: companions.map((c) => c.name),
      companionCpfs: companions.map((c) => c.cpf),
      ...withStay.stay,
      arrivalDate: withDates.arrival,
      departureDate: withDates.departure,
    });
    for (const e of EVENTS) {
      const answers = [h, ...companions].map((m) => answersOf(m)[e.id]).filter(Boolean);
      const count = (s) => answers.filter((a) => a === s).length;
      if (count('yes')) rsvps.push({ eventId: e.id, guestKey: key, status: 'yes', peopleCount: count('yes') });
      else if (count('maybe')) rsvps.push({ eventId: e.id, guestKey: key, status: 'maybe', peopleCount: count('maybe') });
      else if (count('no')) rsvps.push({ eventId: e.id, guestKey: key, status: 'no', peopleCount: 1 });
    }
  }
}

console.log(`Planilha: ${people.length} confirmados (${skipped} não confirmados ficaram de fora), ${byInvite.size} convites.`);
console.log(`Vão virar ${guests.length} contas (${guests.filter((g) => !g.phone).length} sem telefone) + ${guests.reduce((n, g) => n + g.companions.length, 0)} acompanhantes.`);
console.log(`Com hospedagem: ${guests.filter((g) => g.accommodationId || g.customPlaceLabel).length} · com datas: ${guests.filter((g) => g.arrivalDate).length} · presenças: ${rsvps.length}`);
for (const e of EVENTS) {
  const yes = rsvps.filter((r) => r.eventId === e.id && r.status === 'yes').reduce((n, r) => n + r.peopleCount, 0);
  console.log(`  ${e.title}: ${yes} pessoas confirmadas`);
}
for (const name of overrides.keys()) if (!usedOverrides.has(name)) notes.push(`Ajuste manual sem efeito: "${name}" não está entre os confirmados da planilha.`);
if (usedOverrides.size) console.log(`Ajustes manuais aplicados: ${usedOverrides.size}`);
if (notes.length) console.log('\nPontos de atenção:\n- ' + notes.join('\n- '));

const res = await fetch(baseUrl.replace(/\/$/, '') + '/api/import', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-import-token': token },
  body: JSON.stringify({ ownerName: 'Pedro & Babi', guests, events: EVENTS, rsvps, forceKeys, dryRun: dry, reset }),
});
const out = await res.json().catch(() => ({}));
console.log(`\n${dry ? 'SIMULAÇÃO' : 'IMPORTAÇÃO'} (${res.status}):`, JSON.stringify(out, null, 1));
if (!res.ok) process.exit(1);
