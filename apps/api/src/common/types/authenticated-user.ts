import type { MembershipRole } from '../../generated/prisma/client';

export type AuthenticatedUser = {
  userId: string;
  membershipId: string;
  tenantId: string;
  tenantSlug: string;
  role: MembershipRole;
  email: string;
  name: string;
};
