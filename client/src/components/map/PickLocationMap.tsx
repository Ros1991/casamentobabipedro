import { useMemo } from 'react';
import { Marker, useMapEvents } from 'react-leaflet';
import type { LatLng } from '../../lib/geo';
import { BaseMap, FlyTo } from './MapBase';
import { pickIcon } from './icons';

interface Props {
  value: LatLng | null;
  onChange: (p: LatLng) => void;
  center: [number, number];
  zoom?: number;
  className?: string;
}

function ClickToPlace({ onChange }: { onChange: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

/** Mapa pequeno para escolher um ponto: toque para marcar, arraste o pino para ajustar. */
export function PickLocationMap({ value, onChange, center, zoom = 13, className = 'h-48' }: Props) {
  const icon = useMemo(() => pickIcon(), []);
  const flyTarget = useMemo<[number, number] | null>(() => (value ? [value.lat, value.lng] : null), [value?.lat, value?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`overflow-hidden rounded-2xl border border-sand ${className}`}>
      <BaseMap center={value ? [value.lat, value.lng] : center} zoom={value ? 15 : zoom} className="h-full w-full">
        <ClickToPlace onChange={onChange} />
        <FlyTo target={flyTarget} zoom={15} />
        {value && (
          <Marker
            position={[value.lat, value.lng]}
            icon={icon}
            draggable
            eventHandlers={{
              dragend(e) {
                const ll = (e.target as L.Marker).getLatLng();
                onChange({ lat: ll.lat, lng: ll.lng });
              },
            }}
          />
        )}
      </BaseMap>
    </div>
  );
}
