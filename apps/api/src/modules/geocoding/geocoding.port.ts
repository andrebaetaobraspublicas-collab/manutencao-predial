export const GEOCODING_PORT = Symbol('GEOCODING_PORT');

export type GeocodingProviderCandidate = {
  latitude: number;
  longitude: number;
  label: string;
  accuracy?: string;
  placeId?: string;
  confidence?: number;
};

export type GeocodingLookupInput = {
  normalizedAddress: string;
  limit: number;
};

export interface GeocodingPort {
  readonly name: string;
  search(input: GeocodingLookupInput): Promise<GeocodingProviderCandidate[]>;
}
