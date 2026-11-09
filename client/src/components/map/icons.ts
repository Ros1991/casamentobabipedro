import * as L from 'leaflet';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const BED = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>`;
const RINGS = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="9" cy="13" r="6"/><circle cx="15" cy="13" r="6"/><path d="M12 3l2 3h-4z" fill="currentColor"/></svg>`;
const HOME = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>`;

export type PlaceKind = 'venue' | 'preset' | 'custom';

/**
 * Pino de lugar (hotel, local da festa ou "outro lugar").
 * `compact` esconde o rótulo (usado com o mapa afastado, para os pinos não se sobreporem).
 */
const placeIconCache = new Map<string, L.DivIcon>();

export function placeIcon(label: string, count: number, kind: PlaceKind, compact = false): L.DivIcon {
  // Mesmo objeto para os mesmos parâmetros: evita o react-leaflet trocar o DOM do pino a cada render
  const key = `${kind}|${compact ? 1 : 0}|${count}|${label}`;
  const cached = placeIconCache.get(key);
  if (cached) return cached;
  const created = buildPlaceIcon(label, count, kind, compact);
  placeIconCache.set(key, created);
  return created;
}

function buildPlaceIcon(label: string, count: number, kind: PlaceKind, compact: boolean): L.DivIcon {
  const icon = kind === 'venue' ? RINGS : kind === 'custom' ? HOME : BED;
  const classes = ['pin-place'];
  if (kind === 'venue') classes.push('pin-venue');
  if (kind === 'custom') classes.push('pin-custom');
  if (compact) classes.push('pin-compact');
  const labelHtml = compact ? '' : `<span>${escapeHtml(label)}</span>`;
  const countHtml = count > 0 ? `<span class="pin-count">${count}</span>` : '';
  return L.divIcon({
    className: '',
    html: `<div class="${classes.join(' ')}" title="${escapeHtml(label)}">${icon}${labelHtml}${countHtml}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export function photoIcon(thumbUrl: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<img class="pin-photo" src="${thumbUrl}" alt="" loading="lazy" />`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export function pickIcon(): L.DivIcon {
  return L.divIcon({ className: '', html: '<div class="pin-pick"></div>', iconSize: [0, 0], iconAnchor: [0, 0] });
}

export function clusterIcon(count: number): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="cluster-photos">${count}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}
