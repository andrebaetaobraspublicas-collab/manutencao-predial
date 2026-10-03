import { apiFetch, apiDownload, ApiError } from './api';

export type InfraAccess = { enabled: boolean; role: 'ADMIN' | 'USER'; userId: string; tenantId: string; name: string; email: string; csrfToken: string };
export type InfraCycle = { id: string; uf: string; ref: string; status: string; importStatus?: string; validation?: { status?: string; ok?: number; total?: number; ufs?: string[]; message?: string; [key: string]: unknown }; contentHash?: string; default?: boolean };
export type InfraProject = { id: string; name: string; cycleId: string; uf: string; regime: string; version: number; updatedAt?: string; data?: Record<string, unknown> };

export async function infraAccess() {
  return apiFetch<InfraAccess>('/infraestrutura/access');
}
export async function infraApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const mutating = !['GET', 'HEAD'].includes(init.method || 'GET');
  if (!mutating) return apiFetch<T>('/infraestrutura' + path, init);
  const send = async () => {
    const headers = new Headers(init.headers);
    const access = await infraAccess();
    if (!access.enabled) throw new ApiError('Seu acesso ao Infraestrutura ainda não está ativo.', 403);
    headers.set('X-Infra-CSRF', access.csrfToken);
    // CSRF is bound to gp_access. An automatic retry with old headers would
    // carry the previous session's token, so rebuild it after renewal.
    return apiFetch<T>('/infraestrutura' + path, { ...init, headers }, false);
  };
  try { return await send(); }
  catch (cause) { if (cause instanceof ApiError && cause.status === 401) return send(); throw cause; }
}
export function infraItems<T>(value: { items: T[] } | T[]): T[] { return Array.isArray(value) ? value : value.items; }

export async function infraDownload(path: string, filename: string) {
  await infraAccess();
  return apiDownload('/infraestrutura' + path, filename);
}
