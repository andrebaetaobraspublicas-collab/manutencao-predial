'use client';

import { LngLatBounds, Map, Marker, NavigationControl, Popup } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';

export type MapBuilding = {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  openWorkOrders: number;
};

export function BuildingsMap({ buildings }: { buildings: MapBuilding[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mapMessage, setMapMessage] = useState('Carregando ruas e endereços…');

  useEffect(() => {
    if (!containerRef.current || !buildings.length) return;

    const center: [number, number] = [buildings[0].longitude, buildings[0].latitude];
    const map = new Map({
      container: containerRef.current,
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/bright',
      center,
      zoom: buildings.length === 1 ? 15 : 4,
    });
    let fallbackApplied = false;
    const applyFallback = () => {
      if (fallbackApplied) return;
      fallbackApplied = true;
      setMapMessage('Mapa alternativo ativado.');
      map.setStyle({
        version: 8,
        sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256,
          attribution: '© OpenStreetMap contributors' } },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      });
    };
    const fallbackTimer = window.setTimeout(() => {
      if (!map.isStyleLoaded()) applyFallback();
    }, 7000);
    map.on('load', () => { window.clearTimeout(fallbackTimer); setMapMessage(''); });
    map.on('error', (event) => {
      if (!map.isStyleLoaded() && event.error) applyFallback();
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    const bounds = new LngLatBounds();
    for (const building of buildings) {
      const markerElement = document.createElement('button');
      markerElement.type = 'button';
      markerElement.className = 'map-marker';
      markerElement.textContent = String(building.openWorkOrders);
      markerElement.title = `${building.name}: ${building.openWorkOrders} OS abertas`;

      const popup = new Popup({ offset: 20 }).setHTML(
        `<strong>${escapeHtml(building.code)} — ${escapeHtml(building.name)}</strong>` +
          `<br><span>${escapeHtml(building.city)}/${escapeHtml(building.state)}</span>` +
          `<br><span>${building.openWorkOrders} OS em backlog</span>`,
      );

      new Marker({ element: markerElement })
        .setLngLat([building.longitude, building.latitude])
        .setPopup(popup)
        .addTo(map);
      bounds.extend([building.longitude, building.latitude]);
    }

    if (buildings.length > 1) {
      map.fitBounds(bounds, { padding: 55, maxZoom: 13, duration: 0 });
    }

    return () => { window.clearTimeout(fallbackTimer); map.remove(); };
  }, [buildings]);

  if (!buildings.length) {
    return (
      <div className="map-empty">
        Cadastre latitude e longitude nas edificações para exibi-las no mapa gerencial.
      </div>
    );
  }

  return <div style={{ position: 'relative' }}>
    <div className="map-container" ref={containerRef} aria-label="Mapa de edificações com ruas, cidades e endereços" />
    {mapMessage ? <span className="map-status">{mapMessage}</span> : null}
    <span className="map-location-summary">{[...new Set(buildings.map((item) => `${item.city}/${item.state}`))].join(' · ')}</span>
  </div>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#039;',
      '"': '&quot;',
    };
    return entities[character] ?? character;
  });
}
