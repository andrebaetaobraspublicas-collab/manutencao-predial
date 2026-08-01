export type CurrentSession = {
  user: { id: string; name: string; email: string; phone?: string | null; status: string };
  tenant: { id: string; name: string; slug: string; status: string; trialEndsAt?: string | null };
  role: string;
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
  grossAreaM2?: string | number | null;
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
  rating?: string | number | null;
  _count?: { contracts: number; directWorkOrders: number; penalties: number };
};

export type Contract = {
  id: string;
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
  supplier: { id: string; legalName: string; tradeName?: string | null };
  manager?: { id: string; name: string } | null;
  inspector?: { id: string; name: string } | null;
  buildings?: Array<{ building: { id: string; code: string; name: string } }>;
};

export type WorkOrder = {
  id: string;
  number: string;
  title: string;
  description: string;
  locationDetail?: string | null;
  status: string;
  priority: string;
  openedAt: string;
  dueAt?: string | null;
  slaResolutionDeadline?: string | null;
  hasOpenPendency: boolean;
  finalCost?: string | number | null;
  building: { id: string; code: string; name: string; city?: string; state?: string };
  supplier?: { id: string; legalName: string; tradeName?: string | null } | null;
  requester: { id: string; name: string; email: string };
  assignedTo?: { id: string; name: string; email: string } | null;
  contracts: Array<{ isPrimary: boolean; contract: { id: string; code: string; object: string; status: string } }>;
  pendencies?: Array<{ id: string; reason: string; dueAt?: string | null; status: string }>;
  _count?: { attachments: number; statusHistory: number };
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
