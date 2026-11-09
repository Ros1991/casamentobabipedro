import * as L from 'leaflet';
import 'leaflet.markercluster';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type { Photo } from '../../lib/types';
import { clusterIcon, photoIcon } from './icons';

interface Props {
  photos: Photo[];
  onSelect: (photo: Photo) => void;
}

/** Miniaturas das fotos no mapa, agrupadas quando estão muito próximas. */
export function PhotoClusterLayer({ photos, onSelect }: Props) {
  const map = useMap();

  useEffect(() => {
    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 48,
      iconCreateFunction: (cluster) => clusterIcon(cluster.getChildCount()),
    });

    for (const p of photos) {
      if (p.lat === null || p.lng === null) continue;
      const marker = L.marker([p.lat, p.lng], { icon: photoIcon(p.thumbUrl), title: p.caption ?? '' });
      marker.on('click', () => onSelect(p));
      group.addLayer(marker);
    }

    map.addLayer(group);
    return () => {
      map.removeLayer(group);
    };
  }, [map, photos, onSelect]);

  return null;
}
