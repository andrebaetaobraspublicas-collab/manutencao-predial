import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extension } from 'mime-types';
import {
  AuditAction,
  BuildingAttachmentKind,
  Prisma,
  WorkOrderStatus,
} from '../../generated/prisma/client';
import {
  GeocodingService,
  type GeocodingAddress,
  type GeocodingSource,
  type VerifiedGeocodingConfirmation,
} from '../geocoding/geocoding.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBuildingDto } from './dto/create-building.dto';
import { CreateBuildingInspectionDto } from './dto/create-building-inspection.dto';
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
    private readonly config: ConfigService,
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
        inspections: {
          where: { tenantId, deletedAt: null },
          orderBy: { inspectionDate: 'desc' },
          take: 1,
          select: { inspectionDate: true },
        },
        _count: {
          select: {
            workOrders: true,
            contracts: true,
            assets: true,
            maintenancePlans: true,
            attachments: true,
            inspections: true,
          },
        },
      },
    });
    return buildings.map((building) => this.presentBuilding(building));
  }

  async get(tenantId: string, id: string) {
    const building = await this.prisma.building.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        attachments: {
          where: { tenantId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: {
            uploadedBy: { select: { id: true, name: true } },
            inspection: { select: { id: true, inspectionDate: true, type: true } },
          },
        },
        inspections: {
          where: { tenantId, deletedAt: null },
          orderBy: [{ inspectionDate: 'desc' }, { createdAt: 'desc' }],
          include: {
            createdBy: { select: { id: true, name: true } },
            attachments: {
              where: { tenantId, deletedAt: null },
              select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
            },
          },
        },
        maintenancePlans: {
          where: { tenantId, deletedAt: null },
          orderBy: [{ active: 'desc' }, { nextDueAt: 'asc' }],
          include: {
            asset: { select: { id: true, tag: true, name: true } },
            contract: { select: { id: true, code: true } },
            supplier: { select: { id: true, legalName: true, tradeName: true } },
            _count: { select: { generatedWorkOrders: true, generations: true } },
          },
        },
        _count: {
          select: {
            workOrders: true,
            contracts: true,
            assets: true,
            maintenancePlans: true,
            attachments: true,
            inspections: true,
          },
        },
      },
    });
    if (!building) throw new NotFoundException('Edificação não encontrada.');
    return this.presentBuilding(building);
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

  async createInspection(
    tenantId: string,
    actorUserId: string,
    buildingId: string,
    dto: CreateBuildingInspectionDto,
  ) {
    await this.getRecord(tenantId, buildingId);
    const inspectionDate = new Date(
      dto.inspectionDate.length === 10
        ? `${dto.inspectionDate}T12:00:00.000Z`
        : dto.inspectionDate,
    );
    if (inspectionDate.getTime() > Date.now() + 86_400_000) {
      throw new BadRequestException('A data da vistoria não pode estar no futuro.');
    }
    return this.prisma.$transaction(async (tx) => {
      const inspection = await tx.buildingInspection.create({
        data: {
          tenantId,
          buildingId,
          createdByUserId: actorUserId,
          inspectionDate,
          type: dto.type,
          responsibleTechnician: dto.responsibleTechnician.trim(),
          team: dto.team?.trim(),
          notes: dto.notes?.trim(),
        },
        include: { createdBy: { select: { id: true, name: true } }, attachments: true },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: AuditAction.CREATE,
          entityType: 'BuildingInspection',
          entityId: inspection.id,
          afterData: {
            buildingId,
            inspectionDate: inspection.inspectionDate.toISOString(),
            type: inspection.type,
            responsibleTechnician: inspection.responsibleTechnician,
          },
        },
      });
      return inspection;
    });
  }

  async archiveInspection(
    tenantId: string,
    actorUserId: string,
    buildingId: string,
    inspectionId: string,
  ) {
    await this.getRecord(tenantId, buildingId);
    const current = await this.prisma.buildingInspection.findFirst({
      where: { id: inspectionId, tenantId, buildingId, deletedAt: null },
    });
    if (!current) throw new NotFoundException('Vistoria não encontrada.');
    return this.prisma.$transaction(async (tx) => {
      const archived = await tx.buildingInspection.update({
        where: { id: inspectionId },
        data: { deletedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: AuditAction.DELETE,
          entityType: 'BuildingInspection',
          entityId: inspectionId,
          afterData: { buildingId, archived: true, inspectionDate: current.inspectionDate.toISOString() },
        },
      });
      return archived;
    });
  }

  async uploadAttachment(
    tenantId: string,
    actorUserId: string,
    buildingId: string,
    kind: BuildingAttachmentKind,
    inspectionId?: string,
    file?: Express.Multer.File,
  ) {
    await this.getRecord(tenantId, buildingId);
    if (!file) throw new BadRequestException('Arquivo não enviado.');
    if (!Object.values(BuildingAttachmentKind).includes(kind)) {
      throw new BadRequestException('Tipo de anexo inválido.');
    }
    if (inspectionId) {
      const inspection = await this.prisma.buildingInspection.findFirst({
        where: { id: inspectionId, tenantId, buildingId, deletedAt: null },
        select: { id: true },
      });
      if (!inspection) throw new BadRequestException('A vistoria informada não pertence a esta edificação.');
    }

    const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    const isPdf = file.mimetype === 'application/pdf';
    if (!isImage && !isPdf) {
      throw new BadRequestException('Somente imagens JPG/PNG/WebP e arquivos PDF são aceitos.');
    }
    if (!this.hasExpectedSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException('O conteúdo do arquivo não corresponde ao tipo informado.');
    }
    if (kind === BuildingAttachmentKind.BUILDING_PHOTO && !isImage) {
      throw new BadRequestException('Fotos da edificação devem ser enviadas em JPG, PNG ou WebP.');
    }
    if (kind !== BuildingAttachmentKind.BUILDING_PHOTO && !isPdf) {
      throw new BadRequestException('Laudos e documentos do imóvel devem ser enviados em PDF.');
    }

    const root = path.resolve(this.config.get<string>('UPLOAD_ROOT') ?? './uploads');
    const relativeDir = path.join(tenantId, 'buildings', buildingId);
    const absoluteDir = this.resolveInsideRoot(root, relativeDir);
    await mkdir(absoluteDir, { recursive: true });
    const fileName = `${randomUUID()}.${extension(file.mimetype) || 'bin'}`;
    const storageKey = path.join(relativeDir, fileName).replaceAll(path.sep, '/');
    const absolutePath = path.join(absoluteDir, fileName);
    await writeFile(absolutePath, file.buffer, { flag: 'wx' });

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Building WHERE id = ${buildingId} AND tenantId = ${tenantId} FOR UPDATE`;
        const lockedBuilding = await tx.building.findFirst({
          where: { id: buildingId, tenantId, deletedAt: null },
          select: { id: true },
        });
        if (!lockedBuilding) {
          throw new ConflictException(
            'A edificação foi arquivada enquanto o arquivo era enviado. Atualize e tente novamente.',
          );
        }
        if (inspectionId) {
          const lockedInspection = await tx.buildingInspection.findFirst({
            where: { id: inspectionId, tenantId, buildingId, deletedAt: null },
            select: { id: true },
          });
          if (!lockedInspection) {
            throw new ConflictException('A vistoria vinculada não está mais disponível.');
          }
        }
        const attachment = await tx.buildingAttachment.create({
          data: {
            tenantId,
            buildingId,
            inspectionId: inspectionId || undefined,
            uploadedByUserId: actorUserId,
            kind,
            storageKey,
            fileName,
            originalName: path.basename(file.originalname).replace(/[\r\n\0]/g, '_').slice(0, 255),
            mimeType: file.mimetype,
            sizeBytes: BigInt(file.size),
            sha256: createHash('sha256').update(file.buffer).digest('hex'),
          },
          include: { uploadedBy: { select: { id: true, name: true } } },
        });
        await tx.auditLog.create({
          data: {
            tenantId,
            actorUserId,
            action: AuditAction.CREATE,
            entityType: 'BuildingAttachment',
            entityId: attachment.id,
            afterData: { buildingId, inspectionId: inspectionId ?? null, kind, originalName: attachment.originalName },
          },
        });
        return attachment;
      });
    } catch (error) {
      await unlink(absolutePath).catch(() => undefined);
      throw error;
    }
  }

  async resolveAttachmentForDownload(
    tenantId: string,
    actorUserId: string,
    buildingId: string,
    attachmentId: string,
  ) {
    await this.getRecord(tenantId, buildingId);
    const attachment = await this.prisma.buildingAttachment.findFirst({
      where: {
        id: attachmentId,
        tenantId,
        buildingId,
        deletedAt: null,
        building: { tenantId, deletedAt: null },
      },
    });
    if (!attachment) throw new NotFoundException('Anexo não encontrado.');
    const root = path.resolve(this.config.get<string>('UPLOAD_ROOT') ?? './uploads');
    const absolutePath = this.resolveInsideRoot(root, attachment.storageKey);
    try {
      await access(absolutePath);
    } catch {
      throw new NotFoundException('Arquivo físico não localizado.');
    }
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        action: AuditAction.DOWNLOAD,
        entityType: 'BuildingAttachment',
        entityId: attachment.id,
        afterData: { buildingId, originalName: attachment.originalName },
      },
    });
    return { attachment, absolutePath };
  }

  async archiveAttachment(
    tenantId: string,
    actorUserId: string,
    buildingId: string,
    attachmentId: string,
  ) {
    await this.getRecord(tenantId, buildingId);
    const current = await this.prisma.buildingAttachment.findFirst({
      where: { id: attachmentId, tenantId, buildingId, deletedAt: null },
    });
    if (!current) throw new NotFoundException('Anexo não encontrado.');
    return this.prisma.$transaction(async (tx) => {
      const archived = await tx.buildingAttachment.update({
        where: { id: attachmentId },
        data: { deletedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: AuditAction.DELETE,
          entityType: 'BuildingAttachment',
          entityId: attachmentId,
          afterData: { buildingId, archived: true, kind: current.kind, originalName: current.originalName },
        },
      });
      return archived;
    });
  }

  async deletionImpact(tenantId: string, id: string) {
    const building = await this.prisma.building.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        _count: {
          select: {
            contracts: true,
            workOrders: { where: { deletedAt: null } },
            maintenancePlans: { where: { deletedAt: null } },
            assets: { where: { deletedAt: null } },
            attachments: { where: { deletedAt: null } },
            inspections: { where: { deletedAt: null } },
          },
        },
      },
    });
    if (!building) throw new NotFoundException('Edificação não encontrada.');
    const [openWorkOrders, activeMaintenancePlans] = await Promise.all([
      this.prisma.workOrder.count({
        where: {
          tenantId,
          buildingId: id,
          deletedAt: null,
          status: { notIn: [WorkOrderStatus.CLOSED, WorkOrderStatus.CANCELED] },
        },
      }),
      this.prisma.maintenancePlan.count({
        where: { tenantId, buildingId: id, active: true, deletedAt: null },
      }),
    ]);
    const counts = { ...building._count, openWorkOrders, activeMaintenancePlans };
    const warnings: string[] = [];
    if (counts.contracts) warnings.push(`${counts.contracts} contrato(s) continuarão vinculados ao histórico.`);
    if (counts.workOrders) warnings.push(`${counts.workOrders} ordem(ns) de serviço serão preservadas, sendo ${openWorkOrders} ainda não encerrada(s).`);
    if (counts.maintenancePlans) warnings.push(`${counts.maintenancePlans} plano(s) de manutenção serão preservados; os ${activeMaintenancePlans} ativo(s) serão suspensos.`);
    if (counts.assets) warnings.push(`${counts.assets} ativo(s) permanecerão no dossiê histórico.`);
    if (counts.attachments || counts.inspections) warnings.push('Documentos, fotografias e vistorias permanecerão preservados para auditoria.');
    return {
      building: { id: building.id, code: building.code, name: building.name },
      counts,
      warnings,
      operation: 'LOGICAL_ARCHIVE',
      recordsPreserved: true,
    };
  }

  async archive(tenantId: string, actorUserId: string, id: string) {
    const impact = await this.deletionImpact(tenantId, id);
    const now = new Date();
    const building = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Building WHERE id = ${id} AND tenantId = ${tenantId} FOR UPDATE`;
      const current = await tx.building.findFirst({
        where: { id, tenantId, deletedAt: null },
        select: { id: true, code: true, status: true },
      });
      if (!current) throw new NotFoundException('Edificação não encontrada.');
      const archived = await tx.building.update({
        where: { id },
        data: { deletedAt: now, status: 'INACTIVE' },
      });
      await tx.maintenancePlan.updateMany({
        where: { tenantId, buildingId: id, active: true, deletedAt: null },
        data: { active: false, suspendedAt: now },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId,
          action: AuditAction.DELETE,
          entityType: 'Building',
          entityId: id,
          beforeData: { code: current.code, status: current.status },
          afterData: {
            archived: true,
            status: 'INACTIVE',
            recordsPreserved: true,
            counts: impact.counts,
          },
        },
      });
      return archived;
    });
    return this.presentBuilding(building);
  }

  private async getRecord(tenantId: string, id: string) {
    const building = await this.prisma.building.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        _count: {
          select: {
            workOrders: true,
            contracts: true,
            assets: true,
            maintenancePlans: true,
            attachments: true,
            inspections: true,
          },
        },
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
    const inspectionRows = (building as T & { inspections?: Array<{ inspectionDate: Date }> }).inspections;
    return {
      ...building,
      geocodingConfirmed: building.geocodingConfirmedAt !== null,
      geocodingSource: metadata?.source ?? fallbackSource,
      geocodingLookupId: metadata?.lookupId,
      geocodingCandidateId: metadata?.candidateId,
      lastInspectionAt: inspectionRows?.[0]?.inspectionDate ?? null,
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

  private resolveInsideRoot(root: string, relativePath: string): string {
    const absolutePath = path.resolve(root, relativePath);
    const relative = path.relative(root, absolutePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new BadRequestException('Caminho de arquivo inválido.');
    }
    return absolutePath;
  }

  private hasExpectedSignature(buffer: Buffer, mimeType: string): boolean {
    if (mimeType === 'application/pdf') {
      return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
    }
    if (mimeType === 'image/jpeg') {
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (mimeType === 'image/png') {
      return (
        buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      );
    }
    if (mimeType === 'image/webp') {
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    }
    return false;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
