import { ConflictException, NotFoundException } from '@nestjs/common';

export type ResolvableSlaPolicy = {
  id: string;
  contractId: string | null;
  categoryId: string | null;
};

export function selectSlaPolicy<T extends ResolvableSlaPolicy>(
  policies: T[],
  scope: { contractId?: string; categoryId?: string },
): T {
  const ranked = policies
    .map((policy) => ({ policy, rank: policyRank(policy, scope) }))
    .filter((candidate) => candidate.rank >= 0);

  if (!ranked.length) {
    throw new NotFoundException(
      'Nenhuma política de SLA ativa atende à prioridade e ao escopo informados.',
    );
  }

  const bestRank = Math.max(...ranked.map((candidate) => candidate.rank));
  const best = ranked.filter((candidate) => candidate.rank === bestRank);
  if (best.length > 1) {
    throw new ConflictException(
      'Há mais de uma política de SLA ativa para o mesmo escopo e prioridade.',
    );
  }
  return best[0].policy;
}

function policyRank(
  policy: ResolvableSlaPolicy,
  scope: { contractId?: string; categoryId?: string },
): number {
  const exactContract = Boolean(scope.contractId) && policy.contractId === scope.contractId;
  const exactCategory = Boolean(scope.categoryId) && policy.categoryId === scope.categoryId;

  if (exactContract && exactCategory) return 3;
  if (exactContract && policy.categoryId === null) return 2;
  if (exactCategory && policy.contractId === null) return 1;
  if (policy.contractId === null && policy.categoryId === null) return 0;
  return -1;
}
