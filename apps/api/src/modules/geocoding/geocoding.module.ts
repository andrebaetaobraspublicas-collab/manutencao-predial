import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeocodingController } from './geocoding.controller';
import { GEOCODING_PORT, type GeocodingPort } from './geocoding.port';
import { GeocodingService } from './geocoding.service';
import { DisabledGeocodingProvider } from './providers/disabled-geocoding.provider';
import { GeoapifyGeocodingProvider } from './providers/geoapify-geocoding.provider';
import { NominatimGeocodingProvider } from './providers/nominatim-geocoding.provider';

export function selectGeocodingProvider(
  config: ConfigService,
  disabled: DisabledGeocodingProvider,
  nominatim: NominatimGeocodingProvider,
  geoapify: GeoapifyGeocodingProvider,
): GeocodingPort {
  const configured = config.get<string>('GEOCODING_PROVIDER')?.trim().toLowerCase();
  const provider =
    configured || (config.get<string>('NODE_ENV') === 'production' ? 'disabled' : 'nominatim');

  if (provider === 'nominatim') return nominatim;
  if (provider === 'geoapify') return geoapify;
  return disabled;
}

@Module({
  controllers: [GeocodingController],
  providers: [
    DisabledGeocodingProvider,
    NominatimGeocodingProvider,
    GeoapifyGeocodingProvider,
    {
      provide: GEOCODING_PORT,
      inject: [
        ConfigService,
        DisabledGeocodingProvider,
        NominatimGeocodingProvider,
        GeoapifyGeocodingProvider,
      ],
      useFactory: selectGeocodingProvider,
    },
    GeocodingService,
  ],
  exports: [GeocodingService],
})
export class GeocodingModule {}
