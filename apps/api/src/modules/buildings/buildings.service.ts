import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma } from '../../generated/prisma/client';
import {
  GeocodingService,
  type GeocodingAddress,
  type GeocodingSource,
  type VerifiedGeocodingConfirmation,
} from '../geocoding/geocoding.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBuildingDto } from './dto/create-building.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';

type StoredGeocodingMetadata = {
  source: GeocodingSource;
  lookupId?: string;
  candidateId?: string;
};

type MutableJsonObject = Record<string, Prisma.InputJsonValue | null>;

@Injectable()
export class BuildingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoding: GeocodingService,
  ) {}

  async create(tenantId: string, actorUserId: string, dto: CreateBuildingDto) {
    const normalizedCode = dto.code.trim().toUpperCase();
    this.validateCoordinates(dto.latitude, dto.longitude);
    this.validateGeocodingConfirmation(dto.latitude, dto.longitude, dto.geocodingConfirmed);
    const exists = await this.prisma.building.findFirst({
      where: { tenantId, code: normalizedCode, deletedAt: null },
      select: { id: true },
    });
    if (exists) throw new ConflictException('Já existe uma edificação com esse código.');

    const confirmation =
      dto.latitude !== undefined && dto.longitude !== undefined
        ? await this.geocoding.verifyConfirmation(
            tenantId,
            this.addressFromCreate(dto),
            this.confirmationInput(dto.latitude, dto.longitude, dto),
          )
        : undefined;
    const confirmedAt = confirmation ? new Date() : undefined;

    const building = await this.prisma.$transaction(async (tx) => {
      const created = await tx.building.create({
        data: {
          tenantId,
          code: normalizedCode,
          name: dto.name.trim(),
          type: dto.type?.trim(),
          addressLine1: dto.addressLine1.trim(),
          addressLine2: dto.addressLine2?.trim(),
          district: dto.district?.trim(),
          city: dto.city.trim(),
          state: dto.state.trim().toUpperCase(),
          postalCode: dto.postalCode.trim(),
          country: dto.country?.trim().toUpperCase() || 'BR',
          latitude: dto.latitude,
          longitude: dto.longitude,
          geocodedAt: confirmedAt,
          geocodingProvider: confirmation?.provider,
          geocodingAccuracy: confirmation?.accuracy,
          geocodingPlaceId: confirmation?.placeId,
          geocodingConfirmedAt: confirmedAt,
          geocodingConfirmedByUserId: confirmation ? actorUserId : undefined,
          metadata: confirmation
            ? this.mergeGeocodingMetadata(null, confirmation, confirmedAt as Date)
            : undefined,
          grossAreaM2: dto.grossAreaM2,
          constructionYear: dto.constructionYear,
          floors: dto.floors,
        },
      });

      if (confirmation) {
        await tx.auditLog.create({
          data: {
            tenantId,
            actorUserId,
            action: AuditAction.CREATE,
            entityType: 'BuildingGeocoding',
            entityId: created.id,
            afterData: this.confirmationAuditData(
              dto.latitude as number,
              dto.longitude as number,
              confirmation,
              confirmedAt as Date,
            ),
          },
        });
      }
      return created;
    });

    return this.presentBuilding(building);
  }

  async list(tenantId: string) {
    const buildings = await this.prisma.building.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { workOrders: true, contracts: true, assets: true } },
      },
    });
    return buildings.map((building) => this.presentBuilding(building));
  }

  async get(tenantId: string, id: string) {
    return this.presentBuilding(await this.getRecord(tenantId, id));
  }

  async update(tenantId: string, actorUserId: string, id: string, dto: UpdateBuildingDto) {
    const current = await this.getRecord(tenantId, id);
    const latitude = dto.latitude ?? (current.latitude === null ? undefined : Number(current.latitude));
    const longitude =
      dto.longitude ?? (current.longitude === null ? undefined : Number(current.longitude));
    const addressChanged = this.addressChanged(current, dto);
    const coordinatesSupplied = dto.latitude !== undefined || dto.longitude !== undefined;
    const coordinatesChanged =
      coordinatesSupplied &&
      (current.latitude === null ||
        current.longitude === null ||
        latitude === undefined ||
        longitude === undefined ||
        Math.abs(Number(current.latitude) - latitude) > 0.0000001 ||
        Math.abs(Number(current.longitude) - longitude) > 0.0000001);
    const confirmationRequired = coordinatesSupplied && (coordinatesChanged || addressChanged);

    if (confirmationRequired) {
      this.validateCoordinates(latitude, longitude);
      this.validateGeocodingConfirmation(latitude, longitude, dto.geocodingConfirmed);
    }

    const normalizedCode = dto.code?.trim().toUpperCase();
    if (normalizedCode && normalizedCode !== current.code) {
      const duplicate = await this.prisma.building.findFirst({
        where: { tenantId, code: normalizedCode, deletedAt: null, NOT: { id } },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException('Já existe uma edificação com esse código.');
    }

    const confirmation =
      confirmationRequired && latitude !== undefined && longitude !== undefined
        ? await this.geocoding.verifyConfirmation(
            tenantId,
            this.addressFromUpdate(current, dto),
            this.confirmationInput(latitude, longitude, dto),
          )
        : undefined;
    const confirmedAt = confirmation ? new Date() : undefined;

    const {
      geocodingConfirmed: _geocodingConfirmed,
      geocodingProvider: _geocodingProvider,
      geocodingAccuracy: _geocodingAccuracy,
      geocodingPlaceId: _geocodingPlaceId,
      geocodingLookupId: _geocodingLookupId,
      geocodingCandidateId: _geocodingCandidateId,
      geocodingSource: _geocodingSource,
      latitude: _latitude,
      longitude: _longitude,
      ...buildingData
    } = dto;

    const updated = await this.prisma.$transaction(async (tx) => {
      const building = await tx.building.update({
        where: { id },
        data: {
          ...buildingData,
          code: normalizedCode,
          name: dto.name?.trim(),
          type: dto.type?.trim(),
          addressLine1: dto.addressLine1?.trim(),
          addressLine2: dto.addressLine2?.trim(),
          district: dto.district?.trim(),
          city: dto.city?.trim(),
          postalCode: dto.postalCode?.trim(),
          state: dto.state?.trim().toUpperCase(),
          country: dto.country?.trim().toUpperCase(),
          latitude: confirmationRequired ? latitude : addressChanged ? null : undefined,
          longitude: confirmationRequired ? longitude : addressChanged ? null : undefined,
          geocodedAt: confirmationRequired ? confirmedAt : addressChanged ? null : undefined,
          geocodingProvider: confirmationRequired
            ? confirmation?.provider
            : addressChanged
              ? null
              : undefined,
          geocodingAccuracy: confirmationRequired
            ? confirmation?.accuracy ?? null
            : addressChanged
              ? null
              : undefined,
          geocodingPlaceId: confirmationRequired
            ? confirmation?.placeId ?? null
            : addressChanged
              ? null
              : undefined,
          geocodingConfirmedAt: confirmationRequired
            ? confirmedAt
            : addressChanged
              ? null
              : undefined,
          geocodingConfirmedByUserId: confirmationRequired
            ? actorUserId
            : addressChanged
              ? null
              : undefined,
          metadata: confirmation
            ? this.mergeGeocodingMetadata(current.metadata, confirmation, confirmedAt as Date)
            : addressChanged
              ? this.clearGeocodingMetadata(current.metadata)
              : undefined,
        },
      });

      if (confirmation || addressChanged) {
        await tx.auditLog.create({
          data: {
            tenantId,
            actorUserId,
            action: AuditAction.UPDATE,
            entityType: 'BuildingGeocoding',
            entityId: id,
            beforeData: this.currentGeocodingAuditData(current),
            afterData: confirmation
              ? this.confirmationAuditData(
                  latitude as number,
                  longitude as number,
                  confirmation,
                  confirmedAt as Date,
                )
              : { clearedBecauseAddressChanged: true },
          },
        });
      }
      return building;
    });

    return this.presentBuilding(updated);
  }

  async archive(tenantId: string, id: string) {
    await this.getRecord(tenantId, id);
    const building = await this.prisma.building.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
    return this.presentBuilding(building);
  }

  private async getRecord(tenantId: string, id: string) {
    const building = await this.prisma.building.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        _count: { select: { workOrders: true, contracts: true, assets: true } },
      },
    });
    if (!building) throw new NotFoundException('Edificação não encontrada.');
    return building;
  }

  private addressFromCreate(dto: CreateBuildingDto): GeocodingAddress {
    return {
      addressLine1: dto.addressLine1,
      addressLine2: dto.addressLine2,
      district: dto.district,
      city: dto.city,
      state: dto.state,
      postalCode: dto.postalCode,
      country: dto.country ?? 'BR',
    };
  }

  private addressChanged(
    current: Awaited<ReturnType<BuildingsService['getRecord']>>,
    dto: UpdateBuildingDto,
  ): boolean {
    const comparisons: Array<[string | undefined, string | null, (value: string) => string]> = [
      [dto.addressLine1, current.addressLine1, (value) => value.trim()],
      [dto.addressLine2, current.addressLine2, (value) => value.trim()],
      [dto.district, current.district, (value) => value.trim()],
      [dto.city, current.city, (value) => value.trim()],
      [dto.state, current.state, (value) => value.trim().toUpperCase()],
      [dto.postalCode, current.postalCode, (value) => value.trim()],
      [dto.country, current.country, (value) => value.trim().toUpperCase()],
    ];
    return comparisons.some(
      ([submitted, stored, normalize]) =>
        submitted !== undefined && normalize(submitted) !== (stored ?? ''),
    );
  }

  private addressFromUpdate(
    current: Awaited<ReturnType<BuildingsService['getRecord']>>,
    dto: UpdateBuildingDto,
  ): GeocodingAddress {
    return {
      addressLine1: dto.addressLine1 ?? current.addressLine1,
      addressLine2: dto.addressLine2 ?? current.addressLine2 ?? undefined,
      district: dto.district ?? current.district ?? undefined,
      city: dto.city ?? current.city,
      state: dto.state ?? current.state,
      postalCode: dto.postalCode ?? current.postalCode,
      country: dto.country ?? current.country,
    };
  }

  private confirmationInput(
    latitude: number,
    longitude: number,
    dto: CreateBuildingDto | UpdateBuildingDto,
  ) {
    return {
      latitude,
      longitude,
      geocodingLookupId: dto.geocodingLookupId,
      geocodingCandidateId: dto.geocodingCandidateId,
      geocodingSource: dto.geocodingSource,
      geocodingProvider: dto.geocodingProvider,
      geocodingAccuracy: dto.geocodingAccuracy,
      geocodingPlaceId: dto.geocodingPlaceId,
    };
  }

  private mergeGeocodingMetadata(
    metadata: Prisma.JsonValue | null,
    confirmation: VerifiedGeocodingConfirmation,
    confirmedAt: Date,
  ): Prisma.InputJsonObject {
    const root = this.metadataObject(metadata);
    const geocoding: MutableJsonObject = {
      source: confirmation.source,
      provider: confirmation.provider,
      confirmedAt: confirmedAt.toISOString(),
    };
    if (confirmation.lookupId) geocoding.lookupId = confirmation.lookupId;
    if (confirmation.candidateId) geocoding.candidateId = confirmation.candidateId;
    if (confirmation.providerAccuracy) {
      geocoding.providerAccuracy = confirmation.providerAccuracy;
    }
    if (confirmation.originalLatitude !== undefined) {
      geocoding.originalLatitude = confirmation.originalLatitude;
    }
    if (confirmation.originalLongitude !== undefined) {
      geocoding.originalLongitude = confirmation.originalLongitude;
    }
    root.geocoding = geocoding;
    return root as Prisma.InputJsonObject;
  }

  private clearGeocodingMetadata(metadata: Prisma.JsonValue | null): Prisma.InputJsonObject {
    const root = this.metadataObject(metadata);
    delete root.geocoding;
    return root as Prisma.InputJsonObject;
  }

  private metadataObject(metadata: Prisma.JsonValue | null): MutableJsonObject {
    if (this.isRecord(metadata)) {
      return { ...(metadata as Record<string, Prisma.InputJsonValue | null>) };
    }
    if (metadata !== null) return { legacyValue: metadata as Prisma.InputJsonValue };
    return {};
  }

  private presentBuilding<
    T extends {
      metadata: Prisma.JsonValue | null;
      latitude: unknown;
      longitude: unknown;
      geocodingProvider: string | null;
      geocodingAccuracy: string | null;
      geocodingConfirmedAt: Date | null;
    },
  >(building: T) {
    const metadata = this.readStoredGeocodingMetadata(building.metadata);
    const fallbackSource = this.inferLegacySource(building);
    return {
      ...building,
      geocodingConfirmed: building.geocodingConfirmedAt !== null,
      geocodingSource: metadata?.source ?? fallbackSource,
      geocodingLookupId: metadata?.lookupId,
      geocodingCandidateId: metadata?.candidateId,
    };
  }

  private readStoredGeocodingMetadata(
    metadata: Prisma.JsonValue | null,
  ): StoredGeocodingMetadata | undefined {
    if (!this.isRecord(metadata) || !this.isRecord(metadata.geocoding)) return undefined;
    const source = metadata.geocoding.source;
    if (source !== 'PROVIDER' && source !== 'ADJUSTED' && source !== 'MANUAL') return undefined;
    return {
      source,
      lookupId:
        typeof metadata.geocoding.lookupId === 'string'
          ? metadata.geocoding.lookupId
          : undefined,
      candidateId:
        typeof metadata.geocoding.candidateId === 'string'
          ? metadata.geocoding.candidateId
          : undefined,
    };
  }

  private inferLegacySource(building: {
    latitude: unknown;
    longitude: unknown;
    geocodingProvider: string | null;
    geocodingAccuracy: string | null;
  }): GeocodingSource | undefined {
    if (building.latitude === null || building.longitude === null) return undefined;
    if (building.geocodingProvider?.toUpperCase() === 'MANUAL') return 'MANUAL';
    if (building.geocodingAccuracy?.toUpperCase() === 'MANUAL') return 'ADJUSTED';
    return building.geocodingProvider ? 'PROVIDER' : 'MANUAL';
  }

  private confirmationAuditData(
    latitude: number,
    longitude: number,
    confirmation: VerifiedGeocodingConfirmation,
    confirmedAt: Date,
  ): Prisma.InputJsonObject {
    const data: MutableJsonObject = {
      latitude,
      longitude,
      source: confirmation.source,
      provider: confirmation.provider,
      confirmedAt: confirmedAt.toISOString(),
    };
    if (confirmation.lookupId) data.lookupId = confirmation.lookupId;
    if (confirmation.candidateId) data.candidateId = confirmation.candidateId;
    if (confirmation.placeId) data.placeId = confirmation.placeId;
    return data as Prisma.InputJsonObject;
  }

  private currentGeocodingAuditData(current: {
    latitude: unknown;
    longitude: unknown;
    geocodingProvider: string | null;
    geocodingPlaceId: string | null;
    geocodingConfirmedAt: Date | null;
  }): Prisma.InputJsonObject {
    return {
      latitude: current.latitude === null ? null : String(current.latitude),
      longitude: current.longitude === null ? null : String(current.longitude),
      provider: current.geocodingProvider,
      placeId: current.geocodingPlaceId,
      confirmedAt: current.geocodingConfirmedAt?.toISOString() ?? null,
    };
  }

  private validateCoordinates(latitude?: number, longitude?: number): void {
    const hasLatitude = latitude !== undefined;
    const hasLongitude = longitude !== undefined;
    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException('Latitude e longitude devem ser informadas em conjunto.');
    }
    if (
      hasLatitude &&
      hasLongitude &&
      (!Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        (latitude as number) < -90 ||
        (latitude as number) > 90 ||
        (longitude as number) < -180 ||
        (longitude as number) > 180)
    ) {
      throw new BadRequestException('Latitude ou longitude inválida.');
    }
  }

  private validateGeocodingConfirmation(
    latitude?: number,
    longitude?: number,
    confirmed?: boolean,
  ): void {
    if ((latitude !== undefined || longitude !== undefined) && confirmed !== true) {
      throw new BadRequestException(
        'Confirme o marcador no mapa antes de salvar as coordenadas da edificação.',
      );
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
