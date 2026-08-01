import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBuildingDto } from './dto/create-building.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';

@Injectable()
export class BuildingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateBuildingDto) {
    const normalizedCode = dto.code.trim().toUpperCase();
    this.validateCoordinates(dto.latitude, dto.longitude);
    const exists = await this.prisma.building.findFirst({
      where: { tenantId, code: normalizedCode, deletedAt: null },
      select: { id: true },
    });
    if (exists) throw new ConflictException('Já existe uma edificação com esse código.');

    return this.prisma.building.create({
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
        latitude: dto.latitude,
        longitude: dto.longitude,
        geocodedAt:
          dto.latitude !== undefined || dto.longitude !== undefined ? new Date() : undefined,
        grossAreaM2: dto.grossAreaM2,
        constructionYear: dto.constructionYear,
        floors: dto.floors,
      },
    });
  }

  list(tenantId: string) {
    return this.prisma.building.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { workOrders: true, contracts: true, assets: true } },
      },
    });
  }

  async get(tenantId: string, id: string) {
    const building = await this.prisma.building.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        _count: { select: { workOrders: true, contracts: true, assets: true } },
      },
    });
    if (!building) throw new NotFoundException('Edificação não encontrada.');
    return building;
  }

  async update(tenantId: string, id: string, dto: UpdateBuildingDto) {
    const current = await this.get(tenantId, id);
    const latitude = dto.latitude ?? (current.latitude === null ? undefined : Number(current.latitude));
    const longitude = dto.longitude ?? (current.longitude === null ? undefined : Number(current.longitude));
    if (dto.latitude !== undefined || dto.longitude !== undefined) {
      this.validateCoordinates(latitude, longitude);
    }

    const normalizedCode = dto.code?.trim().toUpperCase();
    if (normalizedCode && normalizedCode !== current.code) {
      const duplicate = await this.prisma.building.findFirst({
        where: { tenantId, code: normalizedCode, deletedAt: null, NOT: { id } },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException('Já existe uma edificação com esse código.');
    }

    return this.prisma.building.update({
      where: { id },
      data: {
        ...dto,
        code: normalizedCode,
        name: dto.name?.trim(),
        type: dto.type?.trim(),
        addressLine1: dto.addressLine1?.trim(),
        addressLine2: dto.addressLine2?.trim(),
        district: dto.district?.trim(),
        city: dto.city?.trim(),
        postalCode: dto.postalCode?.trim(),
        state: dto.state?.trim().toUpperCase(),
        geocodedAt:
          dto.latitude !== undefined || dto.longitude !== undefined ? new Date() : undefined,
      },
    });
  }

  async archive(tenantId: string, id: string) {
    await this.get(tenantId, id);
    return this.prisma.building.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
  }

  private validateCoordinates(latitude?: number, longitude?: number): void {
    const hasLatitude = latitude !== undefined;
    const hasLongitude = longitude !== undefined;
    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException('Latitude e longitude devem ser informadas em conjunto.');
    }
  }
}
