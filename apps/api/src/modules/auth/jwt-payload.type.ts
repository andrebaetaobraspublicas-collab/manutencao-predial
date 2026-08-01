import type { MembershipRole } from '../../generated/prisma/client';

export type JwtPayload = {
  sub: string;
  membershipId: string;
  tenantId: string;
  tenantSlug: string;
  role: MembershipRole;
  email: string;
  name: string;
};
