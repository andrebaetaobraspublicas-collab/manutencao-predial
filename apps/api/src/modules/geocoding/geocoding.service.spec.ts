import { createHash } from 'node:crypto';
import { BadRequestException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { GeocodingPort } from './geocoding.port';
import { GeocodingService } from './geocoding.service';

const address = {
  addressLine1: 'Avenida Paulista, 1000',
  city: 'Sao Paulo',
  state: 'SP',
  postalCode: '01310-100',
  country: 'BR',
};
const normalizedAddress = 'Avenida Paulista, 1000, Sao Paulo, SP, 01310-100, BR';
const queryHash = createHash('sha256').update(normalizedAddress).digest('hex');

const rawCandidate = {
  latitude: -23.5614,
  longitude: -46.6559,
  label: 'Avenida Paulista, Sao Paulo',
  accuracy: 'building',
  placeId: 'place-123',
};

const validCache = (overrides: Record<string, unknown> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: 'tenant-1',
  queryHash,
  normalizedAddress,
  provider: 'nominatim',
  candidates: [rawCandidate],
  expiresAt: new Date(Date.now() + 60_000),
  lastUsedAt: new Date(),
  createdAt: new Date(),
  ...overrides,
});

function makeProvider(
  search: jest.Mock = jest.fn().mockResolvedValue([rawCandidate]),
): GeocodingPort {
  return { name: 'nominatim', search };
}

function makeService(
  prisma: Partial<PrismaService>,
  env: Record<string, string> = {},
  provider: GeocodingPort = makeProvider(),
) {
  return new GeocodingService(
    prisma as PrismaService,
    new ConfigService(env),
    provider,
  );
}

describe('GeocodingService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reutiliza cache válido e adiciona lookupId/candidateId sem consumir cota', async () => {
    const count = jest.fn();
    const cache = validCache();
    const prisma = {
      geocodingCache: {
        findUnique: jest.fn().mockResolvedValue(cache),
        update: jest.fn().mockResolvedValue(cache),
      },
      auditLog: { count },
    } as unknown as PrismaService;
    const provider = makeProvider();

    const result = await makeService(prisma, {}, provider).search('tenant-1', 'user-1', address);

    expect(result).toEqual(
      expect.objectContaining({
        lookupId: cache.id,
        provider: 'nominatim',
        cached: true,
        candidates: [expect.objectContaining({ candidateId: expect.stringMatching(/^[a-f0-9]{64}$/) })],
      }),
    );
    expect(count).not.toHaveBeenCalled();
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('bloqueia consulta externa ao atingir a cota por tenant ou vínculo', async () => {
    const provider = makeProvider();
    const prisma = {
      geocodingCache: { findUnique: jest.fn().mockResolvedValue(null) },
      auditLog: {
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(20),
      },
    } as unknown as PrismaService;

    const request = makeService(
      prisma,
      { GEOCODING_TENANT_RATE_LIMIT_HOUR: '60', GEOCODING_MEMBERSHIP_RATE_LIMIT_HOUR: '20' },
      provider,
    ).search('tenant-1', 'user-1', address);

    await expect(request).rejects.toBeInstanceOf(HttpException);
    await request.catch((error: HttpException) => expect(error.getStatus()).toBe(429));
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('normaliza resposta, grava cache e auditoria em transação', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'lookup-1' });
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const transaction = jest.fn().mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({ geocodingCache: { upsert }, auditLog: { create: auditCreate } }),
    );
    const prisma = {
      geocodingCache: { findUnique: jest.fn().mockResolvedValue(null) },
      auditLog: { count: jest.fn().mockResolvedValue(0) },
      $transaction: transaction,
    } as unknown as PrismaService;

    const result = await makeService(prisma).search('tenant-1', 'user-1', address);

    expect(result).toEqual(
      expect.objectContaining({
        lookupId: 'lookup-1',
        provider: 'nominatim',
        cached: false,
        candidates: [
          expect.objectContaining({
            latitude: -23.5614,
            longitude: -46.6559,
            placeId: 'place-123',
            candidateId: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        ],
      }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_queryHash_provider: expect.objectContaining({
            tenantId: 'tenant-1',
            provider: 'nominatim',
          }),
        },
      }),
    );
    expect(auditCreate).toHaveBeenCalled();
  });

  it('considera cache vazio antigo expirado e o renova com TTL curto', async () => {
    const oldEmptyCache = validCache({
      candidates: [],
      createdAt: new Date(Date.now() - 20 * 60_000),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
    });
    const upsert = jest.fn().mockResolvedValue({ id: oldEmptyCache.id });
    const prisma = {
      geocodingCache: {
        findUnique: jest.fn().mockResolvedValue(oldEmptyCache),
        update: jest.fn(),
      },
      auditLog: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn().mockImplementation((callback: (tx: unknown) => unknown) =>
        callback({
          geocodingCache: { upsert },
          auditLog: { create: jest.fn().mockResolvedValue({}) },
        }),
      ),
    } as unknown as PrismaService;
    const provider = makeProvider(jest.fn().mockResolvedValue([]));
    const before = Date.now();

    const result = await makeService(
      prisma,
      { GEOCODING_NEGATIVE_CACHE_MINUTES: '15' },
      provider,
    ).search('tenant-1', 'user-1', address);

    expect(result.cached).toBe(false);
    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 14 * 60_000);
    expect(result.expiresAt.getTime()).toBeLessThanOrEqual(before + 16 * 60_000);
    expect(provider.search).toHaveBeenCalledTimes(1);
  });

  it('vincula confirmação ao lookup, tenant, endereço e candidato', async () => {
    const cache = validCache();
    const prisma = {
      geocodingCache: {
        findUnique: jest.fn().mockResolvedValue(cache),
        findFirst: jest.fn().mockResolvedValue(cache),
        update: jest.fn().mockResolvedValue(cache),
      },
    } as unknown as PrismaService;
    const service = makeService(prisma);
    const search = await service.search('tenant-1', 'user-1', address);

    const confirmation = await service.verifyConfirmation('tenant-1', address, {
      latitude: rawCandidate.latitude,
      longitude: rawCandidate.longitude,
      geocodingLookupId: cache.id,
      geocodingCandidateId: search.candidates[0].candidateId,
      geocodingProvider: 'nominatim',
    });

    expect(confirmation).toEqual(
      expect.objectContaining({
        source: 'PROVIDER',
        provider: 'nominatim',
        lookupId: cache.id,
        candidateId: search.candidates[0].candidateId,
        placeId: 'place-123',
      }),
    );
  });

  it('detecta ajuste do ponto sem confiar na accuracy enviada pelo cliente legado', async () => {
    const cache = validCache();
    const prisma = {
      geocodingCache: { findUnique: jest.fn().mockResolvedValue(cache) },
    } as unknown as PrismaService;

    const confirmation = await makeService(prisma).verifyConfirmation('tenant-1', address, {
      latitude: -23.562,
      longitude: -46.6565,
      geocodingProvider: 'nominatim',
      geocodingPlaceId: 'place-123',
      geocodingAccuracy: 'building',
    });

    expect(confirmation).toEqual(
      expect.objectContaining({
        source: 'ADJUSTED',
        accuracy: 'MANUAL',
        providerAccuracy: 'building',
      }),
    );
  });

  it('aceita marcação manual e rejeita candidato adulterado ou de outro tenant', async () => {
    const manual = await makeService({} as PrismaService).verifyConfirmation('tenant-1', address, {
      latitude: -23.56,
      longitude: -46.65,
      geocodingProvider: 'MANUAL',
    });
    expect(manual).toEqual({ source: 'MANUAL', provider: 'MANUAL', accuracy: 'MANUAL' });

    const prisma = {
      geocodingCache: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    await expect(
      makeService(prisma).verifyConfirmation('tenant-2', address, {
        latitude: rawCandidate.latitude,
        longitude: rawCandidate.longitude,
        geocodingLookupId: '11111111-1111-4111-8111-111111111111',
        geocodingCandidateId: 'a'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
