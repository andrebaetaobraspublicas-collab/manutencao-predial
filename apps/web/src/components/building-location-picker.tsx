'use client';

import { Check, Crosshair, LoaderCircle, MapPin, Search, SlidersHorizontal } from 'lucide-react';
import { Map, Marker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import type {
  BuildingLocationConfirmation,
  GeocodingCandidate,
  GeocodingPreview,
} from '@/lib/types';

export type GeocodingAddress = {
  addressLine1: string;
  addressLine2?: string;
  district?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
};

type Point = { latitude: number; longitude: number };

export function BuildingLocationPicker({
  address,
  value,
  onChange,
  initialPoint,
  disabled = false,
}: {
  address: GeocodingAddress;
  value: BuildingLocationConfirmation | null;
  onChange: (location: BuildingLocationConfirmation | null) => void;
  initialPoint?: Point | null;
  disabled?: boolean;
}) {
  const [preview, setPreview] = useState<GeocodingPreview | null>(null);
  const [selected, setSelected] = useState<GeocodingCandidate | null>(null);
  const [point, setPoint] = useState<Point | null>(
    value ? { latitude: value.latitude, longitude: value.longitude } : initialPoint ?? null,
  );
  const [adjusted, setAdjusted] = useState(value?.adjusted ?? false);
  const [manualMode, setManualMode] = useState(value?.source === 'MANUAL' || Boolean(initialPoint && !value));
  const [manualLatitude, setManualLatitude] = useState(value ? String(value.latitude) : initialPoint ? String(initialPoint.latitude) : '');
  const [manualLongitude, setManualLongitude] = useState(value ? String(value.longitude) : initialPoint ? String(initialPoint.longitude) : '');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  const addressReady = Boolean(
    address.addressLine1.trim() &&
      address.city.trim() &&
      address.state.trim().length === 2 &&
      address.postalCode.trim(),
  );

  async function searchAddress() {
    if (!addressReady) return;
    setSearching(true);
    setError('');
    onChange(null);
    try {
      const data = await apiFetch<GeocodingPreview>('/geocoding/search', {
        method: 'POST',
        body: JSON.stringify({ ...address, country: address.country ?? 'BR' }),
      });
      setPreview(data);
      const first = data.candidates[0] ?? null;
      setSelected(first);
      setPoint(first ? { latitude: first.latitude, longitude: first.longitude } : null);
      setAdjusted(false);
      setManualMode(!first);
      if (!first) setError('Nenhum resultado foi encontrado. Informe o ponto manualmente.');
    } catch (cause) {
      setPreview(null);
      setSelected(null);
      setPoint(null);
      setManualMode(true);
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'A busca do endereço falhou. Você ainda pode informar o ponto manualmente.',
      );
    } finally {
      setSearching(false);
    }
  }

  function chooseCandidate(candidate: GeocodingCandidate) {
    setSelected(candidate);
    setPoint({ latitude: candidate.latitude, longitude: candidate.longitude });
    setManualLatitude(String(candidate.latitude));
    setManualLongitude(String(candidate.longitude));
    setAdjusted(false);
    setManualMode(false);
    setError('');
    onChange(null);
  }

  function applyManualPoint() {
    const latitude = Number(manualLatitude.replace(',', '.'));
    const longitude = Number(manualLongitude.replace(',', '.'));
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      setError('Informe latitude entre -90 e 90 e longitude entre -180 e 180.');
      return;
    }
    setPoint({ latitude, longitude });
    setSelected(null);
    setAdjusted(true);
    setError('');
    onChange(null);
  }

  function confirmLocation() {
    if (!point) return;
    setError('');
    const confirmation: BuildingLocationConfirmation = {
      latitude: point.latitude,
      longitude: point.longitude,
      source: manualMode ? 'MANUAL' : adjusted ? 'ADJUSTED' : 'PROVIDER',
      lookupId: manualMode ? undefined : preview?.lookupId,
      candidateId: manualMode ? undefined : selected?.candidateId,
      provider: manualMode ? 'MANUAL' : selected?.provider ?? preview?.provider,
      accuracy: manualMode || adjusted ? 'MANUAL' : selected?.accuracy,
      placeId: selected?.placeId,
      label: selected?.label,
      adjusted,
      confirmedAt: new Date().toISOString(),
    };
    onChange(confirmation);
    setManualLatitude(String(confirmation.latitude));
    setManualLongitude(String(confirmation.longitude));
  }

  return (
    <div className="location-picker">
      <div className="location-picker-toolbar">
        <div>
          <strong>Localização confirmada no mapa</strong>
          <span>Busque pelo endereço, ajuste o marcador se necessário e confirme antes de salvar.</span>
        </div>
        <div className="actions">
          <button
            className="btn btn-secondary"
            type="button"
            disabled={disabled || searching || !addressReady}
            onClick={() => void searchAddress()}
          >
            {searching ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}
            {searching ? 'Buscando…' : 'Buscar endereço'}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            disabled={disabled}
            onClick={() => {
              setManualMode(true);
              setSelected(null);
              onChange(null);
            }}
          >
            <SlidersHorizontal size={16} /> Informar manualmente
          </button>
        </div>
      </div>

      {!addressReady ? (
        <div className="notice">Preencha endereço, município, UF e CEP para habilitar a busca.</div>
      ) : null}
      {error ? <div className="notice error">{error}</div> : null}

      {preview && preview.candidates.length > 1 && !manualMode ? (
        <div className="geocode-candidates" role="listbox" aria-label="Resultados de endereço">
          {preview.candidates.map((candidate) => (
            <button
              className={`geocode-candidate ${candidate.placeId === selected?.placeId && candidate.latitude === selected?.latitude ? 'selected' : ''}`}
              key={candidate.placeId ?? `${candidate.latitude}:${candidate.longitude}`}
              type="button"
              onClick={() => chooseCandidate(candidate)}
            >
              <MapPin size={16} />
              <span><strong>{candidate.label}</strong><small>{candidate.provider} · precisão {(candidate.accuracy ?? 'não informada').toLowerCase()}{preview.cached ? ' · cache' : ''}</small></span>
            </button>
          ))}
        </div>
      ) : null}

      {manualMode ? (
        <div className="manual-coordinates">
          <div className="field">
            <label htmlFor="manualLatitude">Latitude</label>
            <input id="manualLatitude" className="input" inputMode="decimal" value={manualLatitude} onChange={(event) => setManualLatitude(event.target.value)} placeholder="-15.793889" />
          </div>
          <div className="field">
            <label htmlFor="manualLongitude">Longitude</label>
            <input id="manualLongitude" className="input" inputMode="decimal" value={manualLongitude} onChange={(event) => setManualLongitude(event.target.value)} placeholder="-47.882778" />
          </div>
          <button className="btn btn-secondary" type="button" onClick={applyManualPoint}><Crosshair size={16} /> Exibir ponto</button>
        </div>
      ) : null}

      {point ? (
        <>
          <LocationMap point={point} disabled={disabled} onMove={(next) => {
            setPoint(next);
            setManualLatitude(String(next.latitude));
            setManualLongitude(String(next.longitude));
            setAdjusted(true);
            if (!preview) setManualMode(true);
            onChange(null);
          }} />
          <div className="location-confirmation-bar">
            <div>
              <strong>{value ? <><Check size={15} /> Localização confirmada</> : <><MapPin size={15} /> Confirmação pendente</>}</strong>
              <span>{point.latitude.toFixed(7)}, {point.longitude.toFixed(7)}{adjusted ? ' · marcador ajustado' : ''}</span>
              {selected ? <span>{selected.provider} · precisão {(selected.accuracy ?? 'não informada').toLowerCase()}</span> : <span>Coordenadas informadas manualmente</span>}
            </div>
            <button className="btn btn-primary" type="button" disabled={disabled || Boolean(value)} onClick={confirmLocation}>
              <Check size={16} />
              {value ? 'Ponto confirmado' : 'Confirmar localização'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function LocationMap({ point, disabled, onMove }: { point: Point; disabled: boolean; onMove: (point: Point) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onMoveRef = useRef(onMove);

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new Map({
      container: containerRef.current,
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty',
      center: [point.longitude, point.latitude],
      zoom: 16,
    });
    const marker = new Marker({ draggable: !disabled })
      .setLngLat([point.longitude, point.latitude])
      .addTo(map);
    marker.on('dragend', () => {
      const next = marker.getLngLat();
      onMoveRef.current({ latitude: next.lat, longitude: next.lng });
    });
    if (!disabled) {
      map.on('click', (event) => {
        marker.setLngLat(event.lngLat);
        onMoveRef.current({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
      });
    }
    return () => map.remove();
  }, [disabled, point.latitude, point.longitude]);

  return <div className="location-map" ref={containerRef} aria-label="Mapa para confirmar a localização da edificação" />;
}
