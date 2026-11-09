import * as L from 'leaflet';
import { useEffect, type ReactNode } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { useStore } from '../../store';

// Padrão sem chave de API; pode ser trocado pelo servidor via MAP_TILE_URL / MAP_TILE_ATTRIBUTION
const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

interface BaseMapProps {
  center: [number, number];
  zoom: number;
  className?: string;
  children?: ReactNode;
  scrollWheelZoom?: boolean;
  zoomControl?: boolean;
}

export function BaseMap({ center, zoom, className = '', children, scrollWheelZoom = true, zoomControl = false }: BaseMapProps) {
  const tiles = useStore((s) => s.config?.map);
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className={className}
      scrollWheelZoom={scrollWheelZoom}
      zoomControl={zoomControl}
      attributionControl={true}
    >
      <TileLayer url={tiles?.tileUrl ?? DEFAULT_TILE_URL} attribution={tiles?.attribution ?? DEFAULT_TILE_ATTRIBUTION} maxZoom={19} />
      <InvalidateOnMount />
      {children}
    </MapContainer>
  );
}

/** Garante que o Leaflet meça o container certo quando o mapa aparece dentro de painéis. */
function InvalidateOnMount() {
  const map = useMap();
  useEffect(() => {
    const t1 = window.setTimeout(() => map.invalidateSize(), 50);
    const t2 = window.setTimeout(() => map.invalidateSize(), 400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [map]);
  return null;
}

interface FitBoundsProps {
  points: [number, number][];
  padding?: number;
  maxZoom?: number;
  /** Mude este valor para refazer o enquadramento */
  trigger?: unknown;
}

export function FitBounds({ points, padding = 40, maxZoom = 15, trigger }: FitBoundsProps) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map(([lat, lng]) => L.latLng(lat, lng)));
    const t = window.setTimeout(() => map.fitBounds(bounds, { padding: [padding, padding], maxZoom }), 80);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, trigger]);
  return null;
}

interface FlyToProps {
  target: [number, number] | null;
  zoom?: number;
}

export function FlyTo({ target, zoom = 16 }: FlyToProps) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo(target, zoom, { duration: 0.8 });
  }, [map, target, zoom]);
  return null;
}
