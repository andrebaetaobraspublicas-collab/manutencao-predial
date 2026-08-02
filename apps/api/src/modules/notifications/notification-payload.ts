import type { Prisma } from '../../generated/prisma/client';

export type NotificationPayload = {
  title: string;
  message: string;
  actionUrl?: string;
  workOrderId?: string;
};

export class InvalidNotificationPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = InvalidNotificationPayloadError.name;
  }
}

export function parseNotificationPayload(payload: Prisma.JsonValue): NotificationPayload {
  if (!isRecord(payload)) {
    throw new InvalidNotificationPayloadError('Payload da notificação deve ser um objeto.');
  }

  const title = requiredString(payload.title, 'title', 220);
  const message = requiredString(payload.message, 'message', 10_000);
  const actionUrl = optionalString(payload.actionUrl, 'actionUrl', 500);
  const workOrderId = optionalString(payload.workOrderId, 'workOrderId', 36);

  if (actionUrl && (!actionUrl.startsWith('/') || actionUrl.startsWith('//'))) {
    throw new InvalidNotificationPayloadError(
      'actionUrl da notificação deve ser um caminho interno iniciado por /.',
    );
  }

  return {
    title,
    message,
    ...(actionUrl ? { actionUrl } : {}),
    ...(workOrderId ? { workOrderId } : {}),
  };
}

export function toNotificationJson(payload: NotificationPayload): Prisma.InputJsonValue {
  return {
    title: requiredString(payload.title, 'title', 220),
    message: requiredString(payload.message, 'message', 10_000),
    ...(payload.actionUrl
      ? { actionUrl: validateActionUrl(payload.actionUrl) }
      : {}),
    ...(payload.workOrderId
      ? { workOrderId: requiredString(payload.workOrderId, 'workOrderId', 36) }
      : {}),
  };
}

function validateActionUrl(value: string): string {
  const actionUrl = requiredString(value, 'actionUrl', 500);
  if (!actionUrl.startsWith('/') || actionUrl.startsWith('//')) {
    throw new InvalidNotificationPayloadError(
      'actionUrl da notificação deve ser um caminho interno iniciado por /.',
    );
  }
  return actionUrl;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new InvalidNotificationPayloadError(`${field} da notificação é obrigatório.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new InvalidNotificationPayloadError(
      `${field} da notificação excede ${maxLength} caracteres.`,
    );
  }
  return normalized;
}

function optionalString(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredString(value, field, maxLength);
}
