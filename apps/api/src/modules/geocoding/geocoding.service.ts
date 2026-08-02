import { createHash } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchGeocodingDto } from './dto/search-geocoding.dto';
import {
  GEOCODING_PORT,
  type GeocodingPort,
  type GeocodingProviderCandidate,
} from './geocoding.port';

export type GeocodingSource = 'PROVIDER' | 'ADJUSTED' | 'MANUAL';

export type GeocodingAddress = Pick<
  SearchGeocodingDto,
  | 'addressLine1'
  | 'addressLine2'
  | 'district'
  | 'city'
  | 'state'
  | 'postalCode'
  | 'country'
>;

export type GeocodingCandidate = GeocodingProviderCandidate & {
  candidateId: string;
  provider: string;
};

export type GeocodingConfirmationInput = {
  latitude: number;
  longitude: number;
  geocodingLookupId?: string;
  geocodingCandidateId?: string;
  geocodingSource?: GeocodingSource;
  geocodingProvider?: string;
  geocodingAccuracy?: string;
  geocodingPlaceId?: string;
};

export type VerifiedGeocodingConfirmation = {
  source: GeocodingSource;
  provider: string;
  accuracy?: string;
  providerAccuracy?: string;
  placeId?: string;
  lookupId?: string;
  candidateId?: string;
  originalLatitude?: number;
  originalLongitude?: number;
};

type GeocodingCacheRecord = {
  id: string;
  tenantId: string;
  queryHash: string;
  normalizedAddress: string;
  provider: string;
  candidates: Prisma.JsonValue;
  expiresAt: Date;
  createdAt: Date;
};

type SearchResult = {
  lookupId: string;
  expiresAt: Date;
  query: string;
  provider: string;
  cached: boolean;
  candidates: GeocodingCandidate[];
};

@Injectable()
export class GeocodingService {
  private readonly cacheDays: number;
  private readonly negativeCacheMinutes: number;
  private readonly tenantHourlyLimit: number;
  private readonly membershipHourlyLimit: number;
  private readonly lookupLocks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    @Inject(GEOCODING_PORT) private readonly provider: GeocodingPort,
  ) {
    this.cacheDays = this.positiveInteger(config.get<string>('GEOCODING_CACHE_DAYS'), 30);
    this.negativeCacheMinutes = this.positiveInteger(
      config.get<string>('GEOCODING_NEGATIVE_CACHE_MINUTES') ||
        config.get<string>('GEOCODING_EMPTY_CACHE_MINUTES'),
      15,
    );
    this.tenantHourlyLimit = this.positiveInteger(
      config.get<string>('GEOCODING_TENANT_RATE_LIMIT_HOUR') ||
        config.get<string>('GEOCODING_RATE_LIMIT_HOUR'),
      60,
    );
    this.membershipHourlyLimit = this.positiveInteger(
      config.get<string>('GEOCODING_MEMBERSHIP_RATE_LIMIT_HOUR') ||
        config.get<string>('GEOCODING_USER_RATE_LIMIT_HOUR'),
      20,
    );
  }

  async search(
    tenantId: string,
    actorUserId: string,
    dto: SearchGeocodingDto,
  ): Promise<SearchResult> {
    const query = this.normalizeAddress(dto);
    const queryHash = this.addressHash(query);
    const now = new Date();
    const cached = await this.findCache(tenantId, queryHash);
    const cacheHit = cached ? await this.useValidCache(cached, query, now) : null;
    if (cacheHit) return cacheHit;

    return this.withLookupLock(tenantId, async () => {
      // Evita duas chamadas externas quando requisições iguais chegam juntas ao mesmo processo.
      const refreshedCache = await this.findCache(tenantId, queryHash);
      const refreshedHit = refreshedCache
        ? await this.useValidCache(refreshedCache, query, new Date())
        : null;
      if (refreshedHit) return refreshedHit;

      await this.assertRateLimits(tenantId, actorUserId);
      const candidates = this.hydrateProviderCandidates(
        await this.provider.search({ normalizedAddress: query, limit: 5 }),
      );
      const storedAt = new Date();
      const ttlMs =
        candidates.length === 0
          ? this.negativeCacheMinutes * 60 * 1_000
          : this.cacheDays * 24 * 60 * 60 * 1_000;
      const expiresAt = new Date(storedAt.getTime() + ttlMs);

      const stored = await this.prisma.$transaction(async (tx) => {
        const cache = await tx.geocodingCache.upsert({
          where: {
            tenantId_queryHash_provider: {
              tenantId,
              queryHash,
              provider: this.provider.name,
            },
          },
          create: {
            tenantId,
            queryHash,
            normalizedAddress: query,
            provider: this.provider.name,
            candidates: candidates as Prisma.InputJsonValue,
            expiresAt,
            lastUsedAt: storedAt,
          },
          update: {
            normalizedAddress: query,
            candidates: candidates as Prisma.InputJsonValue,
            expiresAt,
            lastUsedAt: storedAt,
            createdAt: storedAt,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            actorUserId,
            action: AuditAction.CREATE,
            entityType: 'GeocodingLookup',
            entityId: queryHash,
            afterData: {
              provider: this.provider.name,
              candidateCount: candidates.length,
            },
          },
        });
        return cache;
      });

      return {
        lookupId: stored.id,
        expiresAt,
        query,
        provider: this.provider.name,
        cached: false,
        candidates,
      };
    });
  }

  async verifyConfirmation(
    tenantId: string,
    address: GeocodingAddress,
    input: GeocodingConfirmationInput,
  ): Promise<VerifiedGeocodingConfirmation> {
    this.assertCoordinates(input.latitude, input.longitude);
    const source = input.geocodingSource?.toUpperCase() as GeocodingSource | undefined;
    const submittedProvider = input.geocodingProvider?.trim().toLowerCase();
    const hasCandidateReference = Boolean(
      input.geocodingLookupId || input.geocodingCandidateId || input.geocodingPlaceId,
    );
    const isManual =
      source === 'MANUAL' ||
      submittedProvider === 'manual' ||
      (!hasCandidateReference && !submittedProvider && source !== 'PROVIDER' && source !== 'ADJUSTED');

    if (isManual) {
      if (
        hasCandidateReference ||
        (submittedProvider && submittedProvider !== 'manual') ||
        (source && source !== 'MANUAL')
      ) {
        throw this.invalidConfirmation();
      }
      return { source: 'MANUAL', provider: 'MANUAL', accuracy: 'MANUAL' };
    }

    if (submittedProvider === 'disabled') throw this.invalidConfirmation();

    const query = this.normalizeAddress(address);
    const queryHash = this.addressHash(query);
    const caches = await this.findConfirmationCaches(
      tenantId,
      queryHash,
      input.geocodingLookupId,
      submittedProvider,
    );
    const now = new Date();

    for (const cache of caches) {
      if (
        cache.tenantId !== tenantId ||
        cache.queryHash !== queryHash ||
        cache.normalizedAddress !== query ||
        cache.expiresAt <= now ||
        (submittedProvider && cache.provider.toLowerCase() !== submittedProvider)
      ) {
        continue;
      }

      const candidates = this.hydrateCandidates(cache.candidates, cache.provider);
      const candidate = this.matchConfirmationCandidate(candidates, input);
      if (!candidate) continue;
      if (
        (input.geocodingCandidateId && candidate.candidateId !== input.geocodingCandidateId) ||
        (input.geocodingPlaceId && candidate.placeId !== input.geocodingPlaceId)
      ) {
        throw this.invalidConfirmation();
      }

      const adjusted =
        this.distanceMeters(
          candidate.latitude,
          candidate.longitude,
          input.latitude,
          input.longitude,
        ) > 1;

      return {
        source: adjusted ? 'ADJUSTED' : 'PROVIDER',
        provider: cache.provider,
        accuracy: adjusted ? 'MANUAL' : candidate.accuracy,
        providerAccuracy: candidate.accuracy,
        placeId: candidate.placeId,
        lookupId: cache.id,
        candidateId: candidate.candidateId,
        originalLatitude: candidate.latitude,
        originalLongitude: candidate.longitude,
      };
    }

    throw this.invalidConfirmation();
  }

  private findCache(tenantId: string, queryHash: string) {
    return this.prisma.geocodingCache.findUnique({
      where: {
        tenantId_queryHash_provider: {
          tenantId,
          queryHash,
          provider: this.provider.name,
        },
      },
    });
  }

  private async useValidCache(
    cached: GeocodingCacheRecord,
    query: string,
    now: Date,
  ): Promise<SearchResult | null> {
    if (cached.normalizedAddress !== query) return null;
    const candidates = this.hydrateCandidates(cached.candidates, cached.provider);
    const negativeExpiresAt = new Date(
      cached.createdAt.getTime() + this.negativeCacheMinutes * 60 * 1_000,
    );
    const effectiveExpiresAt =
      candidates.length === 0 && negativeExpiresAt < cached.expiresAt
        ? negativeExpiresAt
        : cached.expiresAt;
    if (effectiveExpiresAt <= now) return null;

    await this.prisma.geocodingCache.update({
      where: { id: cached.id },
      data: { lastUsedAt: now },
    });
    return {
      lookupId: cached.id,
      expiresAt: effectiveExpiresAt,
      query,
      provider: cached.provider,
      cached: true,
      candidates,
    };
  }

  private async assertRateLimits(tenantId: string, actorUserId: string): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1_000);
    const [tenantUsed, membershipUsed] = await Promise.all([
      this.prisma.auditLog.count({
        where: {
          tenantId,
          entityType: 'GeocodingLookup',
          occurredAt: { gte: oneHourAgo },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          tenantId,
          actorUserId,
          entityType: 'GeocodingLookup',
          occurredAt: { gte: oneHourAgo },
        },
      }),
    ]);

    if (tenantUsed >= this.tenantHourlyLimit || membershipUsed >= this.membershipHourlyLimit) {
      throw new HttpException(
        'Limite temporário de geocodificação atingido. Ajuste o marcador manualmente ou tente mais tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private findConfirmationCaches(
    tenantId: string,
    queryHash: string,
    lookupId?: string,
    provider?: string,
  ): Promise<GeocodingCacheRecord[]> {
    if (lookupId) {
      return this.prisma.geocodingCache
        .findFirst({ where: { id: lookupId, tenantId, queryHash } })
        .then((cache) => (cache ? [cache] : []));
    }
    if (provider) {
      return this.prisma.geocodingCache
        .findUnique({
          where: { tenantId_queryHash_provider: { tenantId, queryHash, provider } },
        })
        .then((cache) => (cache ? [cache] : []));
    }
    return this.prisma.geocodingCache.findMany({
      where: { tenantId, queryHash },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  private matchConfirmationCandidate(
    candidates: GeocodingCandidate[],
    input: GeocodingConfirmationInput,
  ): GeocodingCandidate | undefined {
    if (input.geocodingCandidateId) {
      return candidates.find((candidate) => candidate.candidateId === input.geocodingCandidateId);
    }
    if (input.geocodingPlaceId) {
      return candidates.find((candidate) => candidate.placeId === input.geocodingPlaceId);
    }
    return candidates.find(
      (candidate) =>
        Math.abs(candidate.latitude - input.latitude) <= 0.0000001 &&
        Math.abs(candidate.longitude - input.longitude) <= 0.0000001,
    );
  }

  private hydrateProviderCandidates(
    candidates: GeocodingProviderCandidate[],
  ): GeocodingCandidate[] {
    return candidates
      .map((candidate) => this.hydrateCandidate(candidate, this.provider.name))
      .filter((candidate): candidate is GeocodingCandidate => candidate !== null);
  }

  private hydrateCandidates(raw: Prisma.JsonValue, provider: string): GeocodingCandidate[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((candidate) => this.hydrateCandidate(candidate, provider))
      .filter((candidate): candidate is GeocodingCandidate => candidate !== null);
  }

  private hydrateCandidate(candidate: unknown, provider: string): GeocodingCandidate | null {
    if (!this.isRecord(candidate)) return null;
    const latitude = Number(candidate.latitude);
    const longitude = Number(candidate.longitude);
    const label = typeof candidate.label === 'string' ? candidate.label.trim().slice(0, 500) : '';
    if (!this.validCoordinates(latitude, longitude) || !label) return null;

    const normalized: GeocodingCandidate = {
      candidateId: '',
      latitude,
      longitude,
      label,
      provider,
    };
    if (typeof candidate.accuracy === 'string' && candidate.accuracy.trim()) {
      normalized.accuracy = candidate.accuracy.trim().slice(0, 60);
    }
    if (typeof candidate.placeId === 'string' && candidate.placeId.trim()) {
      normalized.placeId = candidate.placeId.trim().slice(0, 190);
    }
    const confidence = Number(candidate.confidence);
    if (candidate.confidence !== undefined && Number.isFinite(confidence)) {
      normalized.confidence = confidence;
    }
    normalized.candidateId = this.candidateHash(normalized);
    return normalized;
  }

  private normalizeAddress(address: GeocodingAddress): string {
    return [
      address.addressLine1,
      address.addressLine2,
      address.district,
      address.city,
      address.state.toUpperCase(),
      address.postalCode,
      (address.country || 'BR').toUpperCase(),
    ]
      .filter((part): part is string => Boolean(part?.trim()))
      .map((part) => part.trim().replace(/\s+/g, ' '))
      .join(', ');
  }

  private addressHash(query: string): string {
    return createHash('sha256').update(query).digest('hex');
  }

  private candidateHash(candidate: Omit<GeocodingCandidate, 'candidateId'>): string {
    return createHash('sha256')
      .update(
        [
          candidate.provider.toLowerCase(),
          candidate.placeId || '',
          candidate.latitude.toFixed(7),
          candidate.longitude.toFixed(7),
          candidate.label.normalize('NFKC'),
        ].join('|'),
      )
      .digest('hex');
  }

  private withLookupLock<T>(tenantId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.lookupLocks.get(tenantId) ?? Promise.resolve();
    const operation = previous.then(action, action);
    this.lookupLocks.set(tenantId, operation);
    void operation
      .finally(() => {
        if (this.lookupLocks.get(tenantId) === operation) this.lookupLocks.delete(tenantId);
      })
      .catch(() => undefined);
    return operation;
  }

  private distanceMeters(
    latitudeA: number,
    longitudeA: number,
    latitudeB: number,
    longitudeB: number,
  ): number {
    const radians = (value: number) => (value * Math.PI) / 180;
    const deltaLatitude = radians(latitudeB - latitudeA);
    const deltaLongitude = radians(longitudeB - longitudeA);
    const a =
      Math.sin(deltaLatitude / 2) ** 2 +
      Math.cos(radians(latitudeA)) *
        Math.cos(radians(latitudeB)) *
        Math.sin(deltaLongitude / 2) ** 2;
    return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private assertCoordinates(latitude: number, longitude: number): void {
    if (!this.validCoordinates(latitude, longitude)) throw this.invalidConfirmation();
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

  private invalidConfirmation(): BadRequestException {
    return new BadRequestException(
      'A confirmação geográfica não corresponde a uma consulta válida deste tenant e endereço. Pesquise novamente ou use o marcador manual.',
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private positiveInteger(rawValue: string | undefined, fallback: number): number {
    const parsed = Number(rawValue);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }
}
