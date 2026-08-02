import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  GeocodingLookupInput,
  GeocodingPort,
  GeocodingProviderCandidate,
} from '../geocoding.port';

@Injectable()
export class DisabledGeocodingProvider implements GeocodingPort {
  readonly name = 'disabled';

  search(_input: GeocodingLookupInput): Promise<GeocodingProviderCandidate[]> {
    throw new ServiceUnavailableException(
      'A geocodificação está desabilitada. Informe e confirme o marcador manualmente.',
    );
  }
}
