import { Injectable } from '@nestjs/common';
import { ContractStatus, Prisma, WorkOrderStatus } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OPEN_WORK_ORDER_STATUSES } from '../work-orders/work-order-state-machine';

const startOfMonthUtc = (date = new Date()) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

const subtractDays = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(tenantId: string) {
    const now = new Date();
    const monthStart = startOfMonthUtc(now);

    const [
      openCount,
      pendingCount,
      overdueCount,
      closedThisMonth,
      createdThisMonth,
      ageBuckets,
      bySupplier,
      byBuilding,
      byRequester,
      oldest,
      contractAggregate,
      activeContracts,
      expiringContracts,
      satisfaction,
      buildingsOnMap,
    ] = await Promise.all([
      this.prisma.workOrder.count({
        where: { tenantId, deletedAt: null, status: { in: OPEN_WORK_ORDER_STATUSES } },
      }),
      this.prisma.workOrder.count({
        where: {
          tenantId,
          deletedAt: null,
          OR: [{ status: WorkOrderStatus.PENDING }, { hasOpenPendency: true }],
        },
      }),
      this.prisma.workOrder.count({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: OPEN_WORK_ORDER_STATUSES },
          slaResolutionDeadline: { lt: now },
        },
      }),
      this.prisma.workOrder.count({
        where: {
          tenantId,
          deletedAt: null,
          status: WorkOrderStatus.CLOSED,
          closedAt: { gte: monthStart },
        },
      }),
      this.prisma.workOrder.count({
        where: { tenantId, deletedAt: null, openedAt: { gte: monthStart } },
      }),
      this.getAgeBuckets(tenantId),
      this.prisma.workOrder.groupBy({
        by: ['supplierId'],
        where: {
          tenantId,
          deletedAt: null,
          status: { in: OPEN_WORK_ORDER_STATUSES },
        },
        _count: { _all: true },
        orderBy: { _count: { supplierId: 'desc' } },
        take: 10,
      }),
      this.prisma.workOrder.groupBy({
        by: ['buildingId'],
        where: {
          tenantId,
          deletedAt: null,
          status: { in: OPEN_WORK_ORDER_STATUSES },
        },
        _count: { _all: true },
        orderBy: { _count: { buildingId: 'desc' } },
        take: 10,
      }),
      this.prisma.workOrder.groupBy({
        by: ['requesterUserId'],
        where: {
          tenantId,
          deletedAt: null,
          status: { in: OPEN_WORK_ORDER_STATUSES },
        },
        _count: { _all: true },
        orderBy: { _count: { requesterUserId: 'desc' } },
        take: 10,
      }),
      this.prisma.workOrder.findMany({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: OPEN_WORK_ORDER_STATUSES },
        },
        orderBy: { openedAt: 'asc' },
        take: 10,
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          priority: true,
          openedAt: true,
          slaResolutionDeadline: true,
          building: { select: { code: true, name: true } },
          supplier: { select: { legalName: true, tradeName: true } },
          requester: { select: { name: true } },
        },
      }),
      this.prisma.contract.aggregate({
        where: { tenantId, deletedAt: null, status: ContractStatus.ACTIVE },
        _sum: { currentValue: true, measuredValue: true, paidValue: true },
      }),
      this.prisma.contract.count({
        where: { tenantId, deletedAt: null, status: ContractStatus.ACTIVE },
      }),
      this.prisma.contract.count({
        where: {
          tenantId,
          deletedAt: null,
          status: { in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING] },
          endDate: { gte: now, lte: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.satisfactionResponse.aggregate({
        where: {
          workOrder: {
            tenantId,
            deletedAt: null,
            status: { in: [WorkOrderStatus.COMPLETED, WorkOrderStatus.CLOSED] },
          },
        },
        _avg: { score: true, npsScore: true },
        _count: { _all: true },
      }),
      this.prisma.building.findMany({
        where: {
          tenantId,
          deletedAt: null,
          latitude: { not: null },
          longitude: { not: null },
        },
        select: {
          id: true,
          code: true,
          name: true,
          latitude: true,
          longitude: true,
          city: true,
          state: true,
          _count: {
            select: {
              workOrders: {
                where: { status: { in: OPEN_WORK_ORDER_STATUSES }, deletedAt: null },
              },
            },
          },
        },
      }),
    ]);

    const supplierIds = bySupplier.flatMap((row) => (row.supplierId ? [row.supplierId] : []));
    const buildingIds = byBuilding.map((row) => row.buildingId);
    const requesterIds = byRequester.map((row) => row.requesterUserId);

    const [suppliers, buildings, requesters] = await Promise.all([
      this.prisma.supplier.findMany({
        where: { tenantId, id: { in: supplierIds } },
        select: { id: true, legalName: true, tradeName: true },
      }),
      this.prisma.building.findMany({
        where: { tenantId, id: { in: buildingIds } },
        select: { id: true, code: true, name: true },
      }),
      this.prisma.user.findMany({
        where: {
          id: { in: requesterIds },
          memberships: { some: { tenantId } },
        },
        select: { id: true, name: true },
      }),
    ]);

    const supplierMap = new Map(suppliers.map((item) => [item.id, item.tradeName || item.legalName]));
    const buildingMap = new Map(buildings.map((item) => [item.id, `${item.code} — ${item.name}`]));
    const requesterMap = new Map(requesters.map((item) => [item.id, item.name]));

    const currentValue = Number(contractAggregate._sum.currentValue ?? 0);
    const measuredValue = Number(contractAggregate._sum.measuredValue ?? 0);
    const paidValue = Number(contractAggregate._sum.paidValue ?? 0);

    return {
      workOrders: {
        open: openCount,
        pending: pendingCount,
        overdue: overdueCount,
        createdThisMonth,
        closedThisMonth,
        ageBuckets,
        bySupplier: bySupplier.map((row) => ({
          id: row.supplierId,
          label: row.supplierId ? supplierMap.get(row.supplierId) ?? 'Fornecedor' : 'Sem fornecedor',
          count: row._count._all,
        })),
        byBuilding: byBuilding.map((row) => ({
          id: row.buildingId,
          label: buildingMap.get(row.buildingId) ?? 'Edificação',
          count: row._count._all,
        })),
        byRequester: byRequester.map((row) => ({
          id: row.requesterUserId,
          label: requesterMap.get(row.requesterUserId) ?? 'Demandante',
          count: row._count._all,
        })),
        oldest: oldest.map((item) => ({
          ...item,
          ageDays: Math.floor((now.getTime() - item.openedAt.getTime()) / 86_400_000),
          overdue: Boolean(item.slaResolutionDeadline && item.slaResolutionDeadline < now),
        })),
      },
      contracts: {
        active: activeContracts,
        expiringIn90Days: expiringContracts,
        currentValue,
        measuredValue,
        paidValue,
        unmeasuredBalance: currentValue - measuredValue,
        unpaidMeasuredBalance: measuredValue - paidValue,
        executionPercent: currentValue > 0 ? (measuredValue / currentValue) * 100 : 0,
      },
      satisfaction: {
        averageScore: satisfaction._avg.score ?? null,
        averageNps: satisfaction._avg.npsScore ?? null,
        responses: satisfaction._count._all,
      },
      map: buildingsOnMap.map((building) => ({
        ...building,
        latitude: Number(building.latitude),
        longitude: Number(building.longitude),
        openWorkOrders: building._count.workOrders,
      })),
      generatedAt: now.toISOString(),
    };
  }

  private async getAgeBuckets(tenantId: string) {
    const base: Prisma.WorkOrderWhereInput = {
      tenantId,
      deletedAt: null,
      status: { in: OPEN_WORK_ORDER_STATUSES },
    };

    const [d0to2, d3to7, d8to15, d16to30, over30] = await Promise.all([
      this.prisma.workOrder.count({
        where: { ...base, openedAt: { gte: subtractDays(3) } },
      }),
      this.prisma.workOrder.count({
        where: { ...base, openedAt: { gte: subtractDays(8), lt: subtractDays(3) } },
      }),
      this.prisma.workOrder.count({
        where: { ...base, openedAt: { gte: subtractDays(16), lt: subtractDays(8) } },
      }),
      this.prisma.workOrder.count({
        where: { ...base, openedAt: { gte: subtractDays(31), lt: subtractDays(16) } },
      }),
      this.prisma.workOrder.count({
        where: { ...base, openedAt: { lt: subtractDays(31) } },
      }),
    ]);

    return [
      { label: '0–2 dias', count: d0to2 },
      { label: '3–7 dias', count: d3to7 },
      { label: '8–15 dias', count: d8to15 },
      { label: '16–30 dias', count: d16to30 },
      { label: 'Acima de 30 dias', count: over30 },
    ];
  }
}
