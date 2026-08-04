import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  MembershipStatus,
  Prisma,
  UserStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInspectorProfileDto } from './dto/create-inspector-profile.dto';
import { UpdateInspectorProfileDto } from './dto/update-inspector-profile.dto';

@Injectable()
export class InspectorsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const profiles = await this.prisma.inspectorProfile.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      include: {
        user: { select: { id: true, name: true, email: true } },
        contractAssignments: {
          where: { deletedAt: null, OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
          include: { contract: { select: { id: true, code: true, currentValue: true, status: true } } },
        },
      },
    });
    return profiles.map((profile) => ({
      ...profile,
      activeAssignments: profile.contractAssignments.length,
      assignedContractValue: profile.contractAssignments.reduce(
        (total, assignment) => total.plus(assignment.contract.currentValue),
        new Prisma.Decimal(0),
      ),
    }));
  }

  async get(tenantId: string, id: string) {
    const profile = await this.prisma.inspectorProfile.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        user: { select: { id: true, name: true, email: true } },
        contractAssignments: {
          where: { deletedAt: null },
          include: { contract: { select: { id: true, code: true, object: true, status: true } } },
          orderBy: { startsAt: 'desc' },
        },
      },
    });
    if (!profile) throw new NotFoundException('Fiscal não encontrado.');
    return profile;
  }

  async create(tenantId: string, actorUserId: string, dto: CreateInspectorProfileDto) {
    await this.ensureLinkedUser(tenantId, dto.userId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const profile = await tx.inspectorProfile.create({
          data: this.data(tenantId, actorUserId, dto),
          include: { user: { select: { id: true, name: true, email: true } } },
        });
        await this.audit(tx, tenantId, actorUserId, AuditAction.CREATE, profile.id, {
          name: profile.name,
          registrationNumber: profile.registrationNumber,
          specialty: profile.specialty,
        });
        return profile;
      });
    } catch (error: unknown) {
      if (this.isUniqueError(error)) {
        throw new ConflictException('Já existe fiscal com essa matrícula na organização.');
      }
      throw error;
    }
  }

  async update(
    tenantId: string,
    actorUserId: string,
    id: string,
    dto: UpdateInspectorProfileDto,
  ) {
    const current = await this.get(tenantId, id);
    await this.ensureLinkedUser(tenantId, dto.userId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const profile = await tx.inspectorProfile.update({
          where: { id },
          data: this.data(undefined, undefined, dto),
          include: { user: { select: { id: true, name: true, email: true } } },
        });
        await tx.auditLog.create({ data: {
          tenantId,
          actorUserId,
          action: AuditAction.UPDATE,
          entityType: 'InspectorProfile',
          entityId: id,
          beforeData: { name: current.name, status: current.status, specialty: current.specialty },
          afterData: { name: profile.name, status: profile.status, specialty: profile.specialty },
        } });
        return profile;
      });
    } catch (error: unknown) {
      if (this.isUniqueError(error)) {
        throw new ConflictException('Já existe fiscal com essa matrícula na organização.');
      }
      throw error;
    }
  }

  async archive(tenantId: string, actorUserId: string, id: string) {
    const current = await this.get(tenantId, id);
    const activeAssignments = await this.prisma.contractInspectionTeamMember.count({
      where: { tenantId, inspectorProfileId: id, deletedAt: null, OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] },
    });
    if (activeAssignments) {
      throw new BadRequestException(
        `O fiscal possui ${activeAssignments} designação(ões) ativa(s). Encerre as designações antes de excluí-lo.`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const archived = await tx.inspectorProfile.update({
        where: { id },
        data: { status: 'INACTIVE', deletedAt: new Date() },
      });
      await this.audit(tx, tenantId, actorUserId, AuditAction.DELETE, id, {
        name: current.name,
        registrationNumber: current.registrationNumber,
        archived: true,
      });
      return archived;
    });
  }

  private data(
    tenantId: string,
    createdByUserId: string,
    dto: CreateInspectorProfileDto,
  ): Prisma.InspectorProfileUncheckedCreateInput;
  private data(
    tenantId: undefined,
    createdByUserId: undefined,
    dto: UpdateInspectorProfileDto,
  ): Prisma.InspectorProfileUncheckedUpdateInput;
  private data(
    tenantId: string | undefined,
    createdByUserId: string | undefined,
    dto: UpdateInspectorProfileDto,
  ): Prisma.InspectorProfileUncheckedCreateInput | Prisma.InspectorProfileUncheckedUpdateInput {
    return {
      tenantId,
      createdByUserId,
      userId: dto.userId,
      name: dto.name?.trim(),
      registrationNumber: dto.registrationNumber?.trim(),
      cpf: dto.cpf?.replace(/\D/g, ''),
      jobTitle: dto.jobTitle?.trim(),
      professionalEducation: dto.professionalEducation?.trim(),
      professionalCouncil: dto.professionalCouncil?.trim(),
      department: dto.department?.trim(),
      phone: dto.phone?.trim(),
      email: dto.email?.trim().toLowerCase(),
      specialty: dto.specialty?.trim(),
      status: dto.status,
      availableHours: dto.availableHours,
      maxProcesses: dto.maxProcesses,
      baseLatitude: dto.baseLatitude,
      baseLongitude: dto.baseLongitude,
      restrictedCompanies: dto.restrictedCompanies?.trim(),
      designationOrdinance: dto.designationOrdinance?.trim(),
      notes: dto.notes?.trim(),
    };
  }

  private async ensureLinkedUser(tenantId: string, userId?: string) {
    if (!userId) return;
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        tenantId,
        userId,
        status: MembershipStatus.ACTIVE,
        user: { status: UserStatus.ACTIVE, deletedAt: null },
      },
      select: { id: true },
    });
    if (!membership) throw new BadRequestException('O usuário vinculado não pertence à organização.');
  }

  private audit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    action: AuditAction,
    entityId: string,
    afterData: Prisma.InputJsonValue,
  ) {
    return tx.auditLog.create({ data: {
      tenantId,
      actorUserId,
      action,
      entityType: 'InspectorProfile',
      entityId,
      afterData,
    } });
  }

  private isUniqueError(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
