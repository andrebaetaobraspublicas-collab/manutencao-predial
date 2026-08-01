import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateSupplierDto) {
    const normalizedTaxId = dto.taxId.trim();
    const exists = await this.prisma.supplier.findFirst({
      where: { tenantId, taxId: normalizedTaxId, deletedAt: null },
      select: { id: true },
    });
    if (exists) throw new ConflictException('Fornecedor já cadastrado para este CNPJ/CPF.');

    return this.prisma.supplier.create({
      data: {
        tenantId,
        legalName: dto.legalName.trim(),
        tradeName: dto.tradeName?.trim(),
        taxId: normalizedTaxId,
        email: dto.email?.trim().toLowerCase(),
        phone: dto.phone?.trim(),
        contactName: dto.contactName?.trim(),
        serviceAreas: dto.serviceAreas ?? [],
        notes: dto.notes,
      },
    });
  }

  list(tenantId: string) {
    return this.prisma.supplier.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { legalName: 'asc' },
      include: { _count: { select: { contracts: true, directWorkOrders: true, penalties: true } } },
    });
  }

  async get(tenantId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { _count: { select: { contracts: true, directWorkOrders: true, penalties: true } } },
    });
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado.');
    return supplier;
  }

  async update(tenantId: string, id: string, dto: UpdateSupplierDto) {
    const current = await this.get(tenantId, id);
    const normalizedTaxId = dto.taxId?.trim();
    if (normalizedTaxId && normalizedTaxId !== current.taxId) {
      const duplicate = await this.prisma.supplier.findFirst({
        where: { tenantId, taxId: normalizedTaxId, deletedAt: null, NOT: { id } },
        select: { id: true },
      });
      if (duplicate) throw new ConflictException('Fornecedor já cadastrado para este CNPJ/CPF.');
    }
    return this.prisma.supplier.update({
      where: { id },
      data: {
        ...dto,
        legalName: dto.legalName?.trim(),
        tradeName: dto.tradeName?.trim(),
        taxId: normalizedTaxId,
        phone: dto.phone?.trim(),
        contactName: dto.contactName?.trim(),
        notes: dto.notes?.trim(),
        email: dto.email?.trim().toLowerCase(),
        serviceAreas: dto.serviceAreas,
      },
    });
  }
}
