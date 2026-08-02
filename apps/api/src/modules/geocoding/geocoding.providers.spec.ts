import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { selectGeocodingProvider } from './geocoding.module';
import { DisabledGeocodingProvider } from './providers/disabled-geocoding.provider';
import { GeoapifyGeocodingProvider } from './providers/geoapify-geocoding.provider';
import { NominatimGeocodingProvider } from './providers/nominatim-geocoding.provider';

const lookup = { normalizedAddress: 'Avenida Paulista, Sao Paulo, SP, BR', limit: 5 };

describe('Geocoding providers', () => {
  afterEach(() => jest.restoreAllMocks());

  it('mantém Nominatim serializado em no máximo uma chamada por segundo no processo', async () => {
    const starts: number[] = [];
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      starts.push(Date.now());
      expect((init?.headers as Record<string, string>)['User-Agent']).toContain('GestaoDePredios');
      return new Response(
        JSON.stringify([
          {
            lat: '-23.5614',
            lon: '-46.6559',
            display_name: 'Avenida Paulista, Sao Paulo',
            place_id: 123,
            addresstype: 'building',
          },
        ]),
        { status: 200 },
      );
    });
    const provider = new NominatimGeocodingProvider(new ConfigService());

    const [first, second] = await Promise.all([provider.search(lookup), provider.search(lookup)]);

    expect(first[0]).toEqual(expect.objectContaining({ placeId: '123', accuracy: 'building' }));
    expect(second).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(990);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('countrycodes=br');
  });

  it('normaliza Geoapify e exige chave somente quando o provider é usado', async () => {
    const disabledKeyProvider = new GeoapifyGeocodingProvider(new ConfigService());
    await expect(disabledKeyProvider.search(lookup)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              lat: -23.5614,
              lon: -46.6559,
              formatted: 'Avenida Paulista, Sao Paulo',
              place_id: 'geo-123',
              rank: { confidence: 0.97, match_type: 'full_match' },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = new GeoapifyGeocodingProvider(
      new ConfigService({ GEOCODING_API_KEY: 'test-key' }),
    );

    await expect(provider.search(lookup)).resolves.toEqual([
      expect.objectContaining({
        latitude: -23.5614,
        longitude: -46.6559,
        placeId: 'geo-123',
        accuracy: 'full_match',
        confidence: 0.97,
      }),
    ]);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('filter=countrycode%3Abr');
    expect(String(fetchSpy.mock.calls[0][0])).toContain('apiKey=test-key');
  });

  it('usa disabled por padrão em produção e para configuração desconhecida', () => {
    const disabled = new DisabledGeocodingProvider();
    const productionConfig = new ConfigService({ NODE_ENV: 'production' });
    const nominatim = new NominatimGeocodingProvider(productionConfig);
    const geoapify = new GeoapifyGeocodingProvider(productionConfig);

    expect(selectGeocodingProvider(productionConfig, disabled, nominatim, geoapify).name).toBe(
      'disabled',
    );
    expect(
      selectGeocodingProvider(
        new ConfigService({ GEOCODING_PROVIDER: 'unknown' }),
        disabled,
        nominatim,
        geoapify,
      ).name,
    ).toBe('disabled');
  });
});
