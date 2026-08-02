import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  GeocodingLookupInput,
  GeocodingPort,
  GeocodingProviderCandidate,
} from '../geocoding.port';

type GeoapifyResult = {
  lat?: number;
  lon?: number;
  formatted?: string;
  place_id?: string;
  rank?: {
    confidence?: number;
    match_type?: string;
  };
};

type GeoapifyResponse = {
  results?: GeoapifyResult[];
};

@Injectable()
export class GeoapifyGeocodingProvider implements GeocodingPort {
  readonly name = 'geoapify';

  private readonly apiKey?: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('GEOCODING_API_KEY')?.trim() || undefined;
  }

  async search(input: GeocodingLookupInput): Promise<GeocodingProviderCandidate[]> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'A geocodificação Geoapify não possui uma chave configurada.',
      );
    }

    const params = new URLSearchParams({
      text: input.normalizedAddress,
      format: 'json',
      lang: 'pt',
      filter: 'countrycode:br',
      limit: String(Math.min(Math.max(input.limit, 1), 5)),
      apiKey: this.apiKey,
    });

    let response: Response;
    try {
      response = await fetch(`https://api.geoapify.com/v1/geocode/search?${params.toString()}`, {
        headers: { Accept: 'application/json' },
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

    let body: GeoapifyResponse;
    try {
      body = (await response.json()) as GeoapifyResponse;
    } catch {
      throw new ServiceUnavailableException(
        'O serviço de geocodificação retornou uma resposta inválida.',
      );
    }

    if (!Array.isArray(body.results)) return [];

    return body.results
      .map((result): GeocodingProviderCandidate | null => {
        const latitude = Number(result.lat);
        const longitude = Number(result.lon);
        if (!this.validCoordinates(latitude, longitude) || !result.formatted?.trim()) return null;

        const candidate: GeocodingProviderCandidate = {
          latitude,
          longitude,
          label: result.formatted.trim(),
        };
        if (result.rank?.match_type) candidate.accuracy = result.rank.match_type;
        if (result.place_id) candidate.placeId = result.place_id;
        if (Number.isFinite(result.rank?.confidence)) {
          candidate.confidence = result.rank?.confidence;
        }
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
