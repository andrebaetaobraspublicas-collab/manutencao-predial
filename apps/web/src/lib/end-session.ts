import { apiFetch } from './api';
import { exitDestination } from './product-config';

export async function endSession(fallback = '/login'): Promise<void> {
  await apiFetch<void>('/auth/logout', { method: 'POST' });
  window.location.replace(exitDestination(fallback));
}
