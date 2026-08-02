import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditAction,
  OperationalCatalogKind,
  Prisma,
  SupplierKind,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierPenaltyDto } from './dto/create-supplier-penalty.dto';
import { CreateSupplierDto, SupplierConsortiumMemberDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

const DETAIL_INCLUDE = {
  serviceAreaLinks: {
    where: { deletedAt: null },
    include: { category: { select: { id: true, code: true, name: true } } },
  },
  consortiumMembers: {
    where: { deletedAt: null },
    include: { member: { select: { id: true, legalName: true, tradeName: true, taxId: true } } },
  },
  consortiumMemberships: {
    where: { deletedAt: null },
    include: { consortium: { select: { id: true, legalName: true, tradeName: true, taxId: true } } },
  },
  penalties: { orderBy: { appliedAt: 'desc' as const } },
  _count: { select: { contracts: true, directWorkOrders: true, penalties: true } },
};

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, actorUserId: string, dto: CreateSupplierDto) {
    const normalizedTaxId = dto.taxId.trim();
    const exists = await this.prisma.supplier.findFirst({
      where: { tenantId, taxId: normalizedTaxId, deletedAt: null },
      select: { id: true },
    });
    if (exists) throw new ConflictException('Fornecedor já cadastrado para este CNPJ/CPF.');

    const categories = await this.validateCategories(tenantId, dto.serviceAreaCategoryIds);
    await this.validateMembers(tenantId, dto.kind ?? SupplierKind.COMPANY, dto.consortiumMembers);

    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({
        data: {
          tenantId,
          kind: dto.kind ?? SupplierKind.COMPANY,
          legalName: dto.legalName.trim(),
          tradeName: dto.tradeName?.trim(),
          taxId: normalizedTaxId,
          email: dto.email?.trim().toLowerCase(),
          phone: dto.phone?.trim(),
          contactName: dto.contactName?.trim(),
          addressLine1: dto.addressLine1?.trim(),
          addressLine2: dto.addressLine2?.trim(),
          district: dto.district?.trim(),
          city: dto.city?.trim(),
          state: dto.state?.trim().toUpperCase(),
          postalCode: dto.postalCode?.trim(),
          serviceAreas: categories.map((category) => category.name),
          notes: dto.notes?.trim(),
          serviceAreaLinks: dto.serviceAreaCategoryIds?.length
            ? { create: dto.serviceAreaCategoryIds.map((categoryId) => ({ tenantId, categoryId })) }
            : undefined,
          consortiumMembers: dto.consortiumMembers?.length
            ? {
                create: dto.consortiumMembers.map((member) => ({
                  tenantId,
                  memberSupplierId: member.supplierId,
                  participationPercentage: member.participationPercentage,
                  isLeader: member.isLeader ?? false,
                })),
              }
            : undefined,
        },
        include: DETAIL_INCLUDE,
      });
      await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE, 'Supplier', supplier.id, {
        kind: supplier.kind,
        legalName: supplier.legalName,
        serviceAreaCategoryIds: dto.serviceAreaCategoryIds ?? [],
      });
      return supplier;
    });
  }

  list(tenantId: string) {
    return this.prisma.supplier.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { legalName: 'asc' },
      include: DETAIL_INCLUDE,
    });
  }

  async get(tenantId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: DETAIL_INCLUDE,
    });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado.');
    return supplier;
  }

  async update(tenantId: string, actorUserId: string, id: string, dto: UpdateSupplierDto) {
    const current = await this.get(tenantId, id);
    const normalizedTaxId = dto.taxId?.trim();
    if (normalizedTaxId && normalizedTaxId !== current.taxId) {
      const duplicate = await this.prisma.supplier.findFirst({
        where: { tenantId, taxId: normalizedTaxId, deletedAt: null, NOT: { id } },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException('Fornecedor já cadastrado para este CNPJ/CPF.');
    }
    const kind = dto.kind ?? current.kind;
    const categories = dto.serviceAreaCategoryIds
      ? await this.validateCategories(tenantId, dto.serviceAreaCategoryIds)
      : undefined;
    if (dto.consortiumMembers) {
      await this.validateMembers(tenantId, kind, dto.consortiumMembers, id);
    }
    if (kind !== SupplierKind.CONSORTIUM && current.consortiumMembers.length && !dto.consortiumMembers) {
      throw new BadRequestException('Remova as empresas consorciadas antes de alterar o tipo.');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.serviceAreaCategoryIds) {
        await tx.supplierServiceArea.updateMany({ where: { tenantId, supplierId: id }, data: { deletedAt: new Date() } });
        for (const categoryId of dto.serviceAreaCategoryIds) {
          await tx.supplierServiceArea.upsert({ where: { supplierId_categoryId: { supplierId: id, categoryId } },
            create: { tenantId, supplierId: id, categoryId }, update: { deletedAt: null } });
        }
      }
      if (dto.consortiumMembers) {
        await tx.supplierConsortiumMember.updateMany({ where: { tenantId, consortiumId: id }, data: { deletedAt: new Date() } });
        for (const member of dto.consortiumMembers) {
          await tx.supplierConsortiumMember.upsert({
            where: { consortiumId_memberSupplierId: { consortiumId: id, memberSupplierId: member.supplierId } },
            create: { tenantId, consortiumId: id, memberSupplierId: member.supplierId,
              participationPercentage: member.participationPercentage, isLeader: member.isLeader ?? false },
            update: { participationPercentage: member.participationPercentage,
              isLeader: member.isLeader ?? false, deletedAt: null },
          });
        }
      }
      const supplier = await tx.supplier.update({
        where: { id },
        data: {
          kind,
          legalName: dto.legalName?.trim(),
          tradeName: dto.tradeName?.trim(),
          taxId: normalizedTaxId,
          phone: dto.phone?.trim(),
          contactName: dto.contactName?.trim(),
          notes: dto.notes?.trim(),
          email: dto.email?.trim().toLowerCase(),
          addressLine1: dto.addressLine1?.trim(),
          addressLine2: dto.addressLine2?.trim(),
          district: dto.district?.trim(),
          city: dto.city?.trim(),
          state: dto.state?.trim().toUpperCase(),
          postalCode: dto.postalCode?.trim(),
          serviceAreas: categories?.map((category) => category.name),
        },
        include: DETAIL_INCLUDE,
      });
      await this.audit(tx, tenantId, actorUserId, AuditAction.UPDATE, 'Supplier', id, {
        kind: supplier.kind,
        legalName: supplier.legalName,
        ...(dto.serviceAreaCategoryIds ? { serviceAreaCategoryIds: dto.serviceAreaCategoryIds } : {}),
      });
      return supplier;
    });
  }

  async addPenalty(
    tenantId: string,
    actorUserId: string,
    supplierId: string,
    dto: CreateSupplierPenaltyDto,
  ) {
    await this.get(tenantId, supplierId);
    if (dto.contractId) {
      const contract = await this.prisma.contract.findFirst({
        where: { id: dto.contractId, tenantId, supplierId, deletedAt: null },
        select: { id: true },
      });
      if (!contract) throw new BadRequestException('Contrato não pertence ao fornecedor informado.');
    }
    return this.prisma.$transaction(async (tx) => {
      const penalty = await tx.contractPenalty.create({
        data: {
          tenantId,
          supplierId,
          contractId: dto.contractId,
          registeredByUserId: actorUserId,
          type: dto.type,
          administrativeCase: dto.administrativeCase?.trim(),
          description: dto.description.trim(),
          amount: dto.amount,
          appliedAt: new Date(dto.appliedAt),
          startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        },
      });
      await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE, 'ContractPenalty', penalty.id, {
        supplierId,
        contractId: dto.contractId,
        type: dto.type,
      });
      return penalty;
    });
  }

  private async validateCategories(tenantId: string, ids: string[] = []) {
    if (!ids.length) return [];
    const categories = await this.prisma.operationalCatalogItem.findMany({
      where: {
        tenantId,
        id: { in: ids },
        kind: OperationalCatalogKind.CATEGORY,
        active: true,
        deletedAt: null,
      },
      select: { id: true, name: true },
    });
    if (categories.length !== ids.length) {
      throw new BadRequestException('Uma ou mais áreas de atuação não são categorias ativas da organização.');
    }
    return categories;
  }

  private async validateMembers(
    tenantId: string,
    kind: SupplierKind,
    members: SupplierConsortiumMemberDto[] = [],
    supplierId?: string,
  ) {
    if (kind === SupplierKind.CONSORTIUM && members.length < 2) {
      throw new BadRequestException('Um consórcio deve possuir pelo menos duas empresas.');
    }
    if (kind !== SupplierKind.CONSORTIUM && members.length) {
      throw new BadRequestException('Somente fornecedores do tipo consórcio podem possuir empresas integrantes.');
    }
    if (!members.length) return;
    const ids = members.map((member) => member.supplierId);
    if (new Set(ids).size !== ids.length || (supplierId && ids.includes(supplierId))) {
      throw new BadRequestException('As empresas consorciadas devem ser distintas do próprio consórcio.');
    }
    if (members.filter((member) => member.isLeader).length > 1) {
      throw new BadRequestException('Informe no máximo uma empresa líder do consórcio.');
    }
    const total = members.reduce((sum, member) => sum + (member.participationPercentage ?? 0), 0);
    if (total > 100.0001) throw new BadRequestException('A participação total não pode superar 100%.');
    const count = await this.prisma.supplier.count({
      where: { tenantId, id: { in: ids }, kind: SupplierKind.COMPANY, deletedAt: null },
    });
    if (count !== ids.length) {
      throw new BadRequestException('Todas as integrantes devem ser empresas ativas da mesma organização.');
    }
  }

  private audit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    action: AuditAction,
    entityType: string,
    entityId: string,
    afterData: Prisma.InputJsonValue,
  ) {
    return tx.auditLog.create({ data: { tenantId, actorUserId, action, entityType, entityId, afterData } });
  }
}
