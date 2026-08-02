import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  MembershipRole,
  MembershipStatus,
  UserStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateContractDto) {
    const normalizedCode = dto.code.trim().toUpperCase();
    const [duplicate, supplier, buildings] = await Promise.all([
      this.prisma.contract.findFirst({
        where: { tenantId, code: normalizedCode, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, tenantId, deletedAt: null },
        select: { id: true },
      }),
      dto.buildingIds?.length
        ? this.prisma.building.findMany({
            where: { id: { in: dto.buildingIds }, tenantId, deletedAt: null },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);

    if (duplicate) throw new ConflictException('Já existe contrato com esse código.');
    if (!supplier) throw new BadRequestException('Fornecedor não pertence à organização.');
    if (dto.buildingIds && buildings.length !== dto.buildingIds.length) {
      throw new BadRequestException('Uma ou mais edificações não pertencem à organização.');
    }
    await this.ensureUsersBelongToTenant(tenantId, [dto.managerUserId, dto.inspectorUserId]);

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate <= startDate) throw new BadRequestException('A data final deve ser posterior à inicial.');

    return this.prisma.contract.create({
      data: {
        tenantId,
        supplierId: dto.supplierId,
        code: normalizedCode,
        administrativeProcess: dto.administrativeProcess?.trim(),
        object: dto.object.trim(),
        type: dto.type,
        status: dto.status ?? 'ACTIVE',
        startDate,
        endDate,
        originalValue: dto.originalValue,
        currentValue: dto.currentValue ?? dto.originalValue,
        managerUserId: dto.managerUserId,
        inspectorUserId: dto.inspectorUserId,
        notes: dto.notes,
        buildings: dto.buildingIds?.length
          ? { create: dto.buildingIds.map((buildingId) => ({ buildingId })) }
          : undefined,
      },
      include: { supplier: true, buildings: { include: { building: true } } },
    });
  }

  list(tenantId: string) {
    return this.prisma.contract.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ status: 'asc' }, { endDate: 'asc' }],
      include: {
        supplier: { select: { id: true, legalName: true, tradeName: true } },
        buildings: { include: { building: { select: { id: true, code: true, name: true } } } },
        _count: { select: { workOrders: true, measurements: true, amendments: true } },
      },
    });
  }

  async get(tenantId: string, id: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        supplier: true,
        buildings: { include: { building: true } },
        amendments: { orderBy: { createdAt: 'desc' } },
        adjustments: { orderBy: { createdAt: 'desc' } },
        penalties: { orderBy: { appliedAt: 'desc' } },
        commitments: { include: { movements: true } },
        measurements: { orderBy: { referenceMonth: 'desc' } },
        workOrders: {
          include: { workOrder: { select: { id: true, number: true, title: true, status: true } } },
        },
      },
    });
    if (!contract) throw new NotFoundException('Contrato não encontrado.');
    return contract;
  }

  async update(tenantId: string, id: string, dto: UpdateContractDto) {
    const current = await this.get(tenantId, id);

    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, tenantId, deletedAt: null },
      });
      if (!supplier) throw new BadRequestException('Fornecedor inválido para esta organização.');
    }

    if (dto.buildingIds) {
      const count = await this.prisma.building.count({
        where: { id: { in: dto.buildingIds }, tenantId, deletedAt: null },
      });
      if (count !== dto.buildingIds.length) {
        throw new BadRequestException('Uma ou mais edificações são inválidas.');
      }
    }

    await this.ensureUsersBelongToTenant(tenantId, [dto.managerUserId, dto.inspectorUserId]);

    const startDate = dto.startDate ? new Date(dto.startDate) : current.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : current.endDate;
    if (endDate <= startDate) {
      throw new BadRequestException('A data final deve ser posterior à inicial.');
    }

    const normalizedCode = dto.code?.trim().toUpperCase();
    if (normalizedCode && normalizedCode !== current.code) {
      const duplicate = await this.prisma.contract.findFirst({
        where: { tenantId, code: normalizedCode, deletedAt: null, NOT: { id } },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException('Já existe contrato com esse código.');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.buildingIds) {
        await tx.contractBuilding.deleteMany({ where: { contractId: id } });
      }

      return tx.contract.update({
        where: { id },
        data: {
          supplierId: dto.supplierId,
          code: normalizedCode,
          administrativeProcess: dto.administrativeProcess,
          object: dto.object,
          type: dto.type,
          status: dto.status,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          originalValue: dto.originalValue,
          currentValue: dto.currentValue,
          managerUserId: dto.managerUserId,
          inspectorUserId: dto.inspectorUserId,
          notes: dto.notes,
          buildings: dto.buildingIds?.length
            ? { create: dto.buildingIds.map((buildingId) => ({ buildingId })) }
            : undefined,
        },
        include: { supplier: true, buildings: { include: { building: true } } },
      });
    });
  }

  private async ensureUsersBelongToTenant(
    tenantId: string,
    userIds: Array<string | undefined>,
  ): Promise<void> {
    const ids = [...new Set(userIds.filter((value): value is string => Boolean(value)))];
    if (!ids.length) return;

    const now = new Date();
    const memberships = await this.prisma.tenantMembership.findMany({
      where: {
        tenantId,
        userId: { in: ids },
        status: MembershipStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        role: {
          in: [
            MembershipRole.OWNER,
            MembershipRole.ADMIN,
            MembershipRole.MANAGER,
            MembershipRole.CONTRACT_MANAGER,
            MembershipRole.CONTRACT_INSPECTOR,
          ],
        },
        user: { status: UserStatus.ACTIVE, deletedAt: null },
      },
      select: { userId: true },
    });
    if (new Set(memberships.map((membership) => membership.userId)).size !== ids.length) {
      throw new BadRequestException(
        'Gestor ou fiscal não possui papel gerencial ativo na organização.',
      );
    }
  }
}
