import type { MembershipRole } from '../../generated/prisma/client';

export type AuthenticatedUser = {
  workSessionId?: string;
  userId: string;
  membershipId: string;
  tenantId: string;
  tenantSlug: string;
  role: MembershipRole;
  email: string;
  name: string;
  maintenanceAccess?: boolean;
};
