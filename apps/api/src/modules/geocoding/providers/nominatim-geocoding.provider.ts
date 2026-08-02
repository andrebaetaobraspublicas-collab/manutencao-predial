import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GeocodingLookupInput,
  GeocodingPort,
  GeocodingProviderCandidate,
} from '../geocoding.port';

type NominatimResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  place_id?: number | string;
  type?: string;
  addresstype?: string;
  importance?: number;
};

@Injectable()
export class NominatimGeocodingProvider implements GeocodingPort {
  readonly name = 'nominatim';

  private readonly userAgent: string;
  private queue: Promise<void> = Promise.resolve();
  private nextAllowedAt = 0;

  constructor(config: ConfigService) {
    this.userAgent =
      config.get<string>('GEOCODING_USER_AGENT')?.trim() ||
      'GestaoDePredios/0.7 (+https://www.gestaodepredios.com.br)';
  }

  search(input: GeocodingLookupInput): Promise<GeocodingProviderCandidate[]> {
    const operation = this.queue.then(
      () => this.serializedLookup(input),
      () => this.serializedLookup(input),
    );
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async serializedLookup(
    input: GeocodingLookupInput,
  ): Promise<GeocodingProviderCandidate[]> {
    const delayMs = Math.max(0, this.nextAllowedAt - Date.now());
    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }

    // A instância do provider é singleton no processo. A fila acima garante que
    // o início de duas chamadas ao Nominatim nunca ocorra em menos de um segundo.
    this.nextAllowedAt = Date.now() + 1_000;

    const params = new URLSearchParams({
      q: input.normalizedAddress,
      format: 'jsonv2',
      addressdetails: '1',
      countrycodes: 'br',
      limit: String(Math.min(Math.max(input.limit, 1), 5)),
    });

    let response: Response;
    try {
      response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'pt-BR,pt;q=0.9',
          'User-Agent': this.userAgent,
        },
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'O serviço de geocodificação está temporariamente indisponível. Use o ajuste manual do marcador.',
      );
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        'O serviço de geocodificação recusou a consulta. Use o ajuste manual do marcador.',
      );
    }

    let results: NominatimResult[];
    try {
      results = (await response.json()) as NominatimResult[];
    } catch {
      throw new ServiceUnavailableException(
        'O serviço de geocodificação retornou uma resposta inválida.',
      );
    }

    if (!Array.isArray(results)) return [];

    return results
      .map((result): GeocodingProviderCandidate | null => {
        const latitude = Number(result.lat);
        const longitude = Number(result.lon);
        if (!this.validCoordinates(latitude, longitude) || !result.display_name?.trim()) {
          return null;
        }

        const candidate: GeocodingProviderCandidate = {
          latitude,
          longitude,
          label: result.display_name.trim(),
        };
        const accuracy = result.addresstype || result.type;
        if (accuracy) candidate.accuracy = accuracy;
        if (result.place_id !== undefined) candidate.placeId = String(result.place_id);
        if (Number.isFinite(result.importance)) candidate.confidence = result.importance;
        return candidate;
      })
      .filter((candidate): candidate is GeocodingProviderCandidate => candidate !== null);
  }

  private validCoordinates(latitude: number, longitude: number): boolean {
    return (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  }
}
