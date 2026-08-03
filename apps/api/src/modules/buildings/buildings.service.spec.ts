import type { PrismaService } from '../../prisma/prisma.service';
import type { ConfigService } from '@nestjs/config';
import type { GeocodingService } from '../geocoding/geocoding.service';
import { BuildingsService } from './buildings.service';

const buildingRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'building-1',
  tenantId: 'tenant-1',
  code: 'EDF-001',
  name: 'Edificio Sede',
  type: null,
  status: 'ACTIVE',
  managerUserId: null,
  addressLine1: 'Avenida Paulista, 1000',
  addressLine2: null,
  district: null,
  city: 'Sao Paulo',
  state: 'SP',
  postalCode: '01310-100',
  country: 'BR',
  latitude: -23.5614,
  longitude: -46.6559,
  geocodedAt: new Date(),
  geocodingProvider: 'nominatim',
  geocodingAccuracy: 'building',
  geocodingPlaceId: 'place-123',
  geocodingConfirmedAt: new Date(),
  geocodingConfirmedByUserId: 'user-1',
  grossAreaM2: null,
  constructionYear: null,
  floors: null,
  metadata: {
    geocoding: {
      source: 'PROVIDER',
      lookupId: '11111111-1111-4111-8111-111111111111',
      candidateId: 'a'.repeat(64),
    },
  },
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  _count: { workOrders: 0, contracts: 0, assets: 0 },
  ...overrides,
});

function makeService(prisma: Partial<PrismaService>, verifyConfirmation = jest.fn()) {
  const geocoding = { verifyConfirmation } as unknown as GeocodingService;
  const config = { get: jest.fn() } as unknown as ConfigService;
  return {
    service: new BuildingsService(prisma as PrismaService, geocoding, config),
    verifyConfirmation,
  };
}

describe('BuildingsService geocoding hardening', () => {
  it('persiste somente a procedência validada pelo servidor e normaliza country', async () => {
    const create = jest.fn().mockImplementation(({ data }) =>
      buildingRecord({
        ...data,
        id: 'building-1',
        metadata: data.metadata ?? null,
        geocodingConfirmedAt: data.geocodingConfirmedAt ?? null,
      }),
    );
    const auditCreate = jest.fn().mockResolvedValue({});
    const prisma = {
      building: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation((callback: (tx: unknown) => unknown) =>
        callback({ building: { create }, auditLog: { create: auditCreate } }),
      ),
    } as unknown as PrismaService;
    const verified = {
      source: 'PROVIDER' as const,
      provider: 'nominatim',
      accuracy: 'building',
      providerAccuracy: 'building',
      placeId: 'trusted-place',
      lookupId: '11111111-1111-4111-8111-111111111111',
      candidateId: 'a'.repeat(64),
      originalLatitude: -23.5614,
      originalLongitude: -46.6559,
    };
    const { service, verifyConfirmation } = makeService(
      prisma,
      jest.fn().mockResolvedValue(verified),
    );

    const result = await service.create('tenant-1', 'user-1', {
      code: 'edf-001',
      name: 'Edificio Sede',
      addressLine1: 'Avenida Paulista, 1000',
      city: 'Sao Paulo',
      state: 'sp',
      postalCode: '01310-100',
      country: 'br',
      latitude: -23.5614,
      longitude: -46.6559,
      geocodingConfirmed: true,
      geocodingProvider: 'cliente-adulterado',
      geocodingPlaceId: 'place-adulterado',
    });

    expect(verifyConfirmation).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ country: 'br' }),
      expect.objectContaining({ geocodingProvider: 'cliente-adulterado' }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          country: 'BR',
          geocodingProvider: 'nominatim',
          geocodingPlaceId: 'trusted-place',
          metadata: expect.objectContaining({
            geocoding: expect.objectContaining({ source: 'PROVIDER' }),
          }),
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        geocodingConfirmed: true,
        geocodingSource: 'PROVIDER',
        geocodingLookupId: verified.lookupId,
      }),
    );
    expect(auditCreate).toHaveBeenCalled();
  });

  it('deriva geocodingConfirmed e os identificadores na listagem', async () => {
    const prisma = {
      building: { findMany: jest.fn().mockResolvedValue([buildingRecord()]) },
    } as unknown as PrismaService;

    const result = await makeService(prisma).service.list('tenant-1');

    expect(result[0]).toEqual(
      expect.objectContaining({
        geocodingConfirmed: true,
        geocodingSource: 'PROVIDER',
        geocodingLookupId: '11111111-1111-4111-8111-111111111111',
        geocodingCandidateId: 'a'.repeat(64),
      }),
    );
  });

  it('não revalida lookup expirado ao editar outros campos sem mudar endereço/ponto', async () => {
    const current = buildingRecord();
    const update = jest.fn().mockImplementation(({ data }) => ({ ...current, ...data }));
    const auditCreate = jest.fn();
    const prisma = {
      building: { findFirst: jest.fn().mockResolvedValue(current) },
      $transaction: jest.fn().mockImplementation((callback: (tx: unknown) => unknown) =>
        callback({ building: { update }, auditLog: { create: auditCreate } }),
      ),
    } as unknown as PrismaService;
    const { service, verifyConfirmation } = makeService(prisma);

    await service.update('tenant-1', 'user-1', 'building-1', {
      name: 'Novo nome',
      addressLine1: current.addressLine1,
      city: current.city,
      state: current.state,
      postalCode: current.postalCode,
      country: current.country,
      latitude: Number(current.latitude),
      longitude: Number(current.longitude),
      geocodingConfirmed: true,
      geocodingLookupId: '11111111-1111-4111-8111-111111111111',
      geocodingCandidateId: 'a'.repeat(64),
      geocodingSource: 'PROVIDER',
    });

    expect(verifyConfirmation).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          latitude: undefined,
          longitude: undefined,
          geocodingProvider: undefined,
        }),
      }),
    );
  });

  it('limpa coordenadas e procedência quando o endereço muda sem novo ponto', async () => {
    const current = buildingRecord({ metadata: { keep: 'value', geocoding: { source: 'PROVIDER' } } });
    const update = jest.fn().mockImplementation(({ data }) => ({
      ...current,
      ...data,
      metadata: data.metadata,
    }));
    const auditCreate = jest.fn().mockResolvedValue({});
    const prisma = {
      building: { findFirst: jest.fn().mockResolvedValue(current) },
      $transaction: jest.fn().mockImplementation((callback: (tx: unknown) => unknown) =>
        callback({ building: { update }, auditLog: { create: auditCreate } }),
      ),
    } as unknown as PrismaService;

    await makeService(prisma).service.update('tenant-1', 'user-1', 'building-1', {
      city: 'Campinas',
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          latitude: null,
          longitude: null,
          geocodingProvider: null,
          geocodingConfirmedAt: null,
          metadata: { keep: 'value' },
        }),
      }),
    );
    expect(auditCreate).toHaveBeenCalled();
  });

  it('calcula o impacto da exclusão somente dentro do tenant autenticado', async () => {
    const buildingFindFirst = jest.fn().mockResolvedValue({
      id: 'building-1',
      code: 'EDF-001',
      name: 'Edifício Sede',
      _count: {
        contracts: 2,
        workOrders: 4,
        maintenancePlans: 1,
        assets: 3,
        attachments: 2,
        inspections: 1,
      },
    });
    const workOrderCount = jest.fn().mockResolvedValue(2);
    const maintenancePlanCount = jest.fn().mockResolvedValue(1);
    const prisma = {
      building: { findFirst: buildingFindFirst },
      workOrder: { count: workOrderCount },
      maintenancePlan: { count: maintenancePlanCount },
    } as unknown as PrismaService;

    const result = await makeService(prisma).service.deletionImpact('tenant-1', 'building-1');

    expect(buildingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'building-1', tenantId: 'tenant-1', deletedAt: null } }),
    );
    expect(workOrderCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1', buildingId: 'building-1' }) }),
    );
    expect(maintenancePlanCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-1', buildingId: 'building-1' }) }),
    );
    expect(result.counts).toEqual(expect.objectContaining({ openWorkOrders: 2, activeMaintenancePlans: 1 }));
    expect(result.recordsPreserved).toBe(true);
  });

  it('não revela impacto de edificação pertencente a outro tenant', async () => {
    const prisma = {
      building: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;

    await expect(
      makeService(prisma).service.deletionImpact('tenant-b', 'building-tenant-a'),
    ).rejects.toThrow('Edificação não encontrada.');
  });
});
