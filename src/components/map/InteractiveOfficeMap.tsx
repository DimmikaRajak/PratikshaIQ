import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import type { CrowdLevel, Office } from '../../types/domain';
import { INDIA_CENTER } from '../../data/indiaLocations';
import { buildDirectionsUrl, getCategoryLabel, getCrowdMeta } from '../../lib/utils';
import { useI18n } from '../../i18n/I18nContext';

interface InteractiveOfficeMapProps {
  offices: Office[];
  center?: { latitude: number; longitude: number } | null;
  userCoords?: { latitude: number; longitude: number } | null;
  zoom?: number;
  heightClass?: string;
  pickMode?: boolean;
  pickedCoords?: { latitude: number; longitude: number } | null;
  onPickCoords?: (coords: { latitude: number; longitude: number }) => void;
}

function getMarkerColor(level: CrowdLevel): string {
  switch (level) {
    case 'very_low':
      return '#059669';
    case 'low':
      return '#16A34A';
    case 'moderate':
      return '#D97706';
    case 'high':
      return '#EA580C';
    case 'very_high':
      return '#DC2626';
    default:
      return '#0F2744';
  }
}

export default function InteractiveOfficeMap({
  offices,
  center,
  userCoords,
  zoom = 13,
  heightClass = 'h-[440px]',
  pickMode = false,
  pickedCoords = null,
  onPickCoords,
}: InteractiveOfficeMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const navigate = useNavigate();
  const { language } = useI18n();

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialCenter: [number, number] = center
      ? [center.latitude, center.longitude]
      : [INDIA_CENTER.latitude, INDIA_CENTER.longitude];
    const initialZoom = center ? zoom : 5;

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    markersLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Click handler for coordinate pick mode (Suggest Office page)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !pickMode || !onPickCoords) return;

    const handleClick = (e: L.LeafletMouseEvent) => {
      onPickCoords({
        latitude: Number(e.latlng.lat.toFixed(6)),
        longitude: Number(e.latlng.lng.toFixed(6)),
      });
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [pickMode, onPickCoords]);

  // Recenter smoothly when center changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !center) return;
    map.setView([center.latitude, center.longitude], zoom, { animate: true });
  }, [center?.latitude, center?.longitude, zoom]);

  // Render office markers + optional user/picked pin
  useEffect(() => {
    const layer = markersLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (userCoords) {
      L.circleMarker([userCoords.latitude, userCoords.longitude], {
        radius: 8,
        color: '#FFFFFF',
        weight: 2.5,
        fillColor: '#0D7377',
        fillOpacity: 1,
      })
        .bindPopup('<strong>Your current location</strong>')
        .addTo(layer);
    }

    if (pickMode && pickedCoords) {
      L.circleMarker([pickedCoords.latitude, pickedCoords.longitude], {
        radius: 9,
        color: '#FFFFFF',
        weight: 3,
        fillColor: '#0D7377',
        fillOpacity: 1,
      })
        .bindPopup(
          `<strong>Selected Coordinates</strong><br/>${pickedCoords.latitude.toFixed(5)}, ${pickedCoords.longitude.toFixed(5)}`
        )
        .addTo(layer);
    }

    for (const office of offices) {
      const hasReports = Boolean(office.aggregate && office.aggregate.recent_report_count > 0);
      const crowdLevel: CrowdLevel =
        hasReports && office.aggregate ? office.aggregate.current_crowd_level : 'unknown';
      const markerColor = getMarkerColor(crowdLevel);
      const crowdMeta = getCrowdMeta(crowdLevel, language);

      const marker = L.circleMarker([office.latitude, office.longitude], {
        radius: 8,
        color: '#FFFFFF',
        weight: 2,
        fillColor: markerColor,
        fillOpacity: 0.92,
      });

      const container = document.createElement('div');
      container.className = 'min-w-[210px] space-y-1.5 text-[#0F2744]';

      const titleEl = document.createElement('div');
      titleEl.className = 'font-semibold text-sm leading-snug';
      titleEl.textContent = office.name;
      container.appendChild(titleEl);

      const metaEl = document.createElement('div');
      metaEl.className = 'text-xs text-slate-600';
      metaEl.textContent = `${getCategoryLabel(office.category, language)} · ${crowdMeta.label}`;
      container.appendChild(metaEl);

      if (office.address) {
        const addrEl = document.createElement('div');
        addrEl.className = 'text-xs text-slate-500';
        addrEl.textContent = office.address;
        container.appendChild(addrEl);
      }

      const actionsEl = document.createElement('div');
      actionsEl.className = 'pt-2 flex items-center gap-3 text-xs font-medium';

      const detailsBtn = document.createElement('button');
      detailsBtn.type = 'button';
      detailsBtn.className = 'text-[#0D7377] hover:underline cursor-pointer';
      detailsBtn.textContent = language === 'hi' ? 'विवरण देखें' : 'View Details';
      detailsBtn.addEventListener('click', () => {
        navigate(`/office/${encodeURIComponent(office.slug)}`, { state: { office } });
      });
      actionsEl.appendChild(detailsBtn);

      const dirLink = document.createElement('a');
      dirLink.href = buildDirectionsUrl(office.latitude, office.longitude, office.name);
      dirLink.target = '_blank';
      dirLink.rel = 'noopener noreferrer';
      dirLink.className = 'text-slate-600 hover:underline';
      dirLink.textContent = language === 'hi' ? 'दिशा-निर्देश' : 'Directions';
      actionsEl.appendChild(dirLink);

      container.appendChild(actionsEl);
      marker.bindPopup(container).addTo(layer);
    }
  }, [offices, userCoords, pickedCoords, pickMode, language, navigate]);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ${heightClass}`}
    >
      <div ref={mapContainerRef} className="h-full w-full" aria-label="Interactive public offices map" />
    </div>
  );
}
