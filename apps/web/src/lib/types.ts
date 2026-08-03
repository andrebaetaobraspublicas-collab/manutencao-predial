export type CurrentSession = {
  user: { id: string; name: string; email: string; phone?: string | null; status: string; emailVerifiedAt?: string | null };
  tenant: { id: string; name: string; slug: string; status: string; trialEndsAt?: string | null };
  role: string;
};

export type WorkOrderPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' | 'CRITICAL';
export type WorkOrderStatus =
  | 'OPEN'
  | 'TRIAGED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'PENDING'
  | 'WAITING_APPROVAL'
  | 'COMPLETED'
  | 'CLOSED'
  | 'CANCELED';

export type CatalogKind = 'CATEGORY' | 'SPECIALTY' | 'ENVIRONMENT' | 'CAUSE';

export type CatalogItem = {
  id: string;
  kind: CatalogKind;
  code: string;
  name: string;
  description?: string | null;
  active: boolean;
  sortOrder?: number;
  defaultPriority?: WorkOrderPriority | null;
  parentId?: string | null;
  parent?: { id: string; code: string; name: string; kind: CatalogKind } | null;
  requirePhotoBefore?: boolean;
  requirePhotoDuring?: boolean;
  requirePhotoAfter?: boolean;
  requireChecklist?: boolean;
  requireFinalCost?: boolean;
  requireAcceptance?: boolean;
  _count?: { workOrders?: number };
};

export type WorkOrderCatalogs = {
  categories: CatalogItem[];
  specialties: CatalogItem[];
  environments: CatalogItem[];
  failureCauses: CatalogItem[];
};

export type WeeklyScheduleDay = {
  weekday: number;
  active: boolean;
  periods: Array<{ start: string; end: string }>;
};

export type BusinessCalendar = {
  id: string;
  code: string;
  name: string;
  timezone: string;
  timeMode: 'CALENDAR' | 'BUSINESS';
  businessDays: number[];
  workdayStart?: string | null;
  workdayEnd?: string | null;
  active: boolean;
  weeklySchedule?: WeeklyScheduleDay[];
  shifts?: Array<{ days: number[]; start: string; end: string }>;
  holidays: Array<{ id?: string; date: string; name: string }>;
};

export type SlaPolicy = {
  id: string;
  code: string;
  name: string;
  priority: WorkOrderPriority;
  categoryId?: string | null;
  category?: Pick<CatalogItem, 'id' | 'code' | 'name'> | null;
  contractId?: string | null;
  contract?: { id: string; code: string; object: string } | null;
  calendarId: string;
  calendar?: Pick<BusinessCalendar, 'id' | 'name' | 'timezone'> | null;
  responseMinutes: number;
  resolutionMinutes: number;
  warningMinutesBefore?: number | null;
  warningMinutes?: number | null;
  pauseOnPendency?: boolean;
  active: boolean;
  precedence?: number;
};

export type SlaPreview = {
  policy?: Pick<SlaPolicy, 'id' | 'name' | 'responseMinutes' | 'resolutionMinutes' | 'pauseOnPendency'> | null;
  calendar?: Pick<BusinessCalendar, 'id' | 'name' | 'timezone'> | null;
  responseDeadline: string;
  resolutionDeadline: string;
  sourceLabel?: string;
  warning?: string | null;
};

export type GeocodingCandidate = {
  candidateId: string;
  placeId?: string | null;
  label: string;
  latitude: number;
  longitude: number;
  provider: string;
  accuracy?: string | null;
};

export type GeocodingPreview = {
  lookupId: string;
  expiresAt: string;
  query: string;
  provider: string;
  cached: boolean;
  candidates: GeocodingCandidate[];
};

export type BuildingLocationConfirmation = {
  latitude: number;
  longitude: number;
  source: 'PROVIDER' | 'ADJUSTED' | 'MANUAL';
  lookupId?: string | null;
  candidateId?: string | null;
  provider?: string | null;
  accuracy?: string | null;
  placeId?: string | null;
  label?: string | null;
  adjusted: boolean;
  confirmedAt: string;
};

export type Member = {
  id: string;
  role: string;
  status: string;
  effectiveStatus: string;
  invitedAt?: string | null;
  acceptedAt?: string | null;
  expiresAt?: string | null;
  activeSessions: number;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    status: string;
    emailVerifiedAt?: string | null;
    lastLoginAt?: string | null;
  };
};

export type TenantDirectoryMember = {
  id: string;
  role: string;
  user: { id: string; name: string; email: string };
};

export type TenantInvitation = {
  id: string;
  email: string;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  membership: { id: string; role: string; status: string };
  invitedBy: { id: string; name: string };
};

export type Building = {
  id: string;
  code: string;
  name: string;
  type?: string | null;
  status: string;
  addressLine1: string;
  addressLine2?: string | null;
  district?: string | null;
  city: string;
  state: string;
  postalCode: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  geocodedAt?: string | null;
  geocodingConfirmedAt?: string | null;
  geocodingProvider?: string | null;
  geocodingAccuracy?: string | null;
  geocodingPlaceId?: string | null;
  geocodingLookupId?: string | null;
  geocodingCandidateId?: string | null;
  geocodingSource?: 'PROVIDER' | 'ADJUSTED' | 'MANUAL' | null;
  geocodingConfirmed?: boolean;
  grossAreaM2?: string | number | null;
  constructionYear?: number | null;
  floors?: number | null;
  _count?: { workOrders: number; contracts: number };
};

export type Supplier = {
  id: string;
  legalName: string;
  tradeName?: string | null;
  taxId: string;
  status: string;
  email?: string | null;
  phone?: string | null;
  contactName?: string | null;
  kind: 'COMPANY' | 'CONSORTIUM';
  addressLine1?: string | null;
  addressLine2?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  notes?: string | null;
  rating?: string | number | null;
  serviceAreaLinks?: Array<{ category: { id: string; code: string; name: string } }>;
  consortiumMembers?: Array<{ participationPercentage?: string | number | null; isLeader: boolean;
    member: { id: string; legalName: string; tradeName?: string | null; taxId: string } }>;
  penalties?: Array<{ id: string; type: string; description: string; administrativeCase?: string | null;
    amount?: string | number | null; appliedAt: string; startsAt?: string | null; endsAt?: string | null; status: string }>;
  _count?: { contracts: number; directWorkOrders: number; penalties: number };
};

export type Contract = {
  id: string;
  supplierId: string;
  code: string;
  object: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  originalValue: string | number;
  currentValue: string | number;
  measuredValue: string | number;
  paidValue: string | number;
  adjustmentBaseDate?: string | null;
  adjustmentIndex?: string | null;
  administrativeProcess?: string | null;
  notes?: string | null;
  supplier: { id: string; legalName: string; tradeName?: string | null };
  manager?: { id: string; name: string } | null;
  inspector?: { id: string; name: string } | null;
  buildings?: Array<{ building: { id: string; code: string; name: string } }>;
  amendments?: Array<Record<string, unknown>>;
  adjustments?: Array<Record<string, unknown>>;
  subcontractors?: Array<Record<string, unknown>>;
  penalties?: Array<Record<string, unknown>>;
  commitments?: Array<Record<string, unknown>>;
  measurements?: Array<Record<string, unknown>>;
  workOrders?: Array<{ workOrder: { id: string; number: string; title: string; status: string } }>;
  _count?: { workOrders: number; measurements: number; amendments: number; adjustments: number;
    subcontractors: number; penalties: number; commitments: number };
};

export type WorkOrder = {
  id: string;
  number: string;
  title: string;
  description: string;
  locationDetail?: string | null;
  status: string;
  priority: string;
  origin?: string;
  openedAt: string;
  dueAt?: string | null;
  slaResolutionDeadline?: string | null;
  hasOpenPendency: boolean;
  finalCost?: string | number | null;
  solution?: string | null;
  measurementEligible?: boolean | null;
  measurementIneligibilityReason?: string | null;
  reopenCount?: number;
  reopenedAt?: string | null;
  lastReopenedAt?: string | null;
  category?: Pick<CatalogItem, 'id' | 'code' | 'name'> | null;
  specialty?: Pick<CatalogItem, 'id' | 'code' | 'name'> | null;
  environment?: Pick<CatalogItem, 'id' | 'code' | 'name'> | null;
  cause?: Pick<CatalogItem, 'id' | 'code' | 'name'> | null;
  failureCause?: Pick<CatalogItem, 'id' | 'code' | 'name'> | null;
  slaPolicy?: { id: string; name: string; calendar?: { id: string; name: string; timezone: string; timeMode?: string } } | null;
  building: { id: string; code: string; name: string; city?: string; state?: string };
  supplier?: { id: string; legalName: string; tradeName?: string | null } | null;
  requester: { id: string; name: string; email: string };
  assignedTo?: { id: string; name: string; email: string } | null;
  contracts: Array<{ isPrimary: boolean; contract: { id: string; code: string; object: string; status: string } }>;
  pendencies?: Array<{ id: string; reason: string; dueAt?: string | null; status: string }>;
  _count?: { attachments: number; statusHistory: number };
};

export type WorkOrderComment = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; email?: string; role?: string };
  mentions: Array<{ user: { id: string; name: string; email?: string } }>;
};

export type WorkOrderChecklistItem = {
  id: string;
  label: string;
  description?: string | null;
  required: boolean;
  sortOrder: number;
  responses: Array<{
    id: string;
    checked: boolean;
    note?: string | null;
    createdAt: string;
    respondedBy: { id: string; name: string };
  }>;
};

export type ChecklistItemType = 'BOOLEAN' | 'TEXT' | 'NUMBER' | 'CHOICE';

export type ChecklistTemplateItem = {
  id: string;
  label: string;
  description?: string | null;
  type: ChecklistItemType;
  required: boolean;
  options?: string[] | null;
  evidenceKind?: string | null;
  sortOrder: number;
};

export type ChecklistTemplateSection = {
  id: string;
  title: string;
  description?: string | null;
  sortOrder: number;
  items: ChecklistTemplateItem[];
};

export type ChecklistTemplate = {
  id: string;
  name: string;
  version: number;
  active: boolean;
  categoryId: string;
  sections: ChecklistTemplateSection[];
  evidencePolicy?: EvidencePolicy | null;
};

export type ChecklistResponseValue = boolean | string | number | null;

export type ChecklistSubmission = {
  id: string;
  revision: number;
  submittedAt: string;
  submittedBy: { id: string; name: string };
  responses: Array<{
    itemId: string;
    value: ChecklistResponseValue;
    notApplicable: boolean;
    notApplicableReason?: string | null;
  }>;
};

export type WorkOrderChecklist = {
  id: string;
  template: ChecklistTemplate;
  requiredItems: number;
  completedRequiredItems: number;
  latestSubmission?: ChecklistSubmission | null;
  submissions?: ChecklistSubmission[];
};

export type EvidencePolicy = {
  requireBefore: boolean;
  requireDuring: boolean;
  requireAfter: boolean;
  minimumBefore: number;
  minimumDuring: number;
  minimumAfter: number;
  requireTechnicalReport?: boolean;
};

export type ClosureReadinessCheck = {
  code: string;
  label: string;
  detail?: string | null;
  status: 'MET' | 'MISSING' | 'NOT_APPLICABLE';
  section?: 'summary' | 'execution' | 'activity' | 'documents';
};

export type ClosureReadiness = {
  ready: boolean;
  blockers: string[];
  checks: Record<string, boolean>;
  canComplete?: boolean;
  canClose?: boolean;
};

export type WorkOrderCapabilities = {
  allowedTransitions: WorkOrderStatus[];
  canEdit: boolean;
  canComment: boolean;
  canAddPendency: boolean;
  canSubmitChecklist: boolean;
  canComplete: boolean;
  canClose: boolean;
  canRejectCompletion: boolean;
  canReopen: boolean;
  allowedAttachmentKinds: string[];
};

export type AppNotification = {
  id: string;
  eventType: string;
  title: string;
  message: string;
  body?: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  workOrderId?: string | null;
  actionUrl?: string | null;
  entityType?: 'WORK_ORDER' | 'CONTRACT' | 'BUILDING' | null;
  entityId?: string | null;
  readAt?: string | null;
  createdAt: string;
  actor?: { id: string; name: string } | null;
};

export type NotificationPage = Paginated<AppNotification> & { unreadCount: number };

export type NotificationPreference = {
  eventType: string;
  label?: string;
  description?: string;
  inApp: boolean;
  email: boolean;
  inAppEnabled?: boolean;
  emailEnabled?: boolean;
  emailAvailable?: boolean;
};

export type Paginated<T> = {
  items: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export type DashboardOverview = {
  generatedAt: string;
  workOrders: {
    open: number;
    pending: number;
    overdue: number;
    createdThisMonth: number;
    closedThisMonth: number;
    ageBuckets: Array<{ label: string; count: number }>;
    byBuilding: Array<{ id: string; label: string; count: number }>;
    bySupplier: Array<{ id: string | null; label: string; count: number }>;
    byRequester: Array<{ id: string; label: string; count: number }>;
    oldest: Array<{
      id: string;
      number: string;
      title: string;
      status: string;
      priority: string;
      openedAt: string;
      slaResolutionDeadline?: string | null;
      ageDays: number;
      overdue: boolean;
      building: { code: string; name: string };
      supplier?: { legalName: string; tradeName?: string | null } | null;
      requester: { name: string };
    }>;
  };
  contracts: {
    active: number;
    expiringIn90Days: number;
    currentValue: number;
    measuredValue: number;
    paidValue: number;
    unmeasuredBalance: number;
    unpaidMeasuredBalance: number;
    executionPercent: number;
  };
  satisfaction: {
    averageScore: number | null;
    averageNps: number | null;
    responses: number;
  };
  map: Array<{
    id: string;
    code: string;
    name: string;
    city: string;
    state: string;
    latitude: number;
    longitude: number;
    openWorkOrders: number;
  }>;
};
