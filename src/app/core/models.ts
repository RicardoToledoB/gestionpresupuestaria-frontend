export interface DashboardSummary {
  totalCurrentBudget: number;
  totalCdpIssued: number;
  totalExecutedByOc: number;
  totalAvailableBalance: number;
  totalPendingCdpBalance: number;
  totalPossibleRelease: number;
  cdpNormal: number;
  cdpFollowUp: number;
  cdpAlert: number;
  cdpReviewRelease: number;
  cdpClosed: number;
}

export interface ProgramSummary {
  programId: number;
  programName: string;
  subtitle?: string;
  currentBudget: number;
  cdpIssued: number;
  cdpPendingBalance: number;
  availableBalance: number;
  cdpFollowUp: number;
  cdpAlert: number;
  possibleRelease: number;
  commitmentPercent: number;
}

export interface BudgetProgram {
  id?: number;
  name: string;
  code?: string;
  subtitle?: string;
  description?: string;
  initialBudget: number;
  currentBudget: number;
  active: boolean;
  deletedAt?: string | null;
}

export interface Provider {
  id?: number;
  rut: string;
  businessName: string;
  fantasyName?: string;
  lineOfBusiness?: string;
  email?: string;
  phone?: string;
  active: boolean;
  deletedAt?: string | null;
}

export interface MasterOption {
  id: number;
  label: string;
  secondaryLabel?: string;
  value?: string | number | null;
}

export interface Cdp {
  id: number;
  cdpNumber: string;
  cdpDate: string;
  programId?: number;
  programName?: string;
  providerId?: number;
  providerRut?: string;
  providerName?: string;
  budgetItemId?: number;
  budgetItemCode?: string;
  budgetItemName?: string;
  cdpType: string;
  tenderOrContract?: string;
  description: string;
  coverageStart?: string;
  coverageEnd?: string;
  coverageMonths?: number;
  cdpAmount?: number;
  cdpAdjustment?: number;
  realCdpAmount: number;
  executedAmount: number;
  pendingBalance: number;
  executedPercent: number;
  expectedPercent?: number;
  deviation?: number;
  alertStatus: string;
  suggestedAction: string;
  possibleReleaseAmount: number;
  observation?: string;
  active?: boolean;
  deletedAt?: string | null;
}

export interface PurchaseOrder {
  id: number;
  orderNumber: string;
  orderDate: string;
  sigfeFolio: string;
  purchaseRequestId?: string;
  productServiceReceptionDate?: string;
  programId?: number;
  programName?: string;
  providerId?: number;
  providerRut?: string;
  providerName?: string;
  budgetItemId?: number;
  budgetItemCode?: string;
  budgetItemName?: string;
  cdpId?: number;
  cdpNumber?: string;
  committedAmount: number;
  adjustmentAmount?: number;
  realAmount: number;
  status: string;
  observation: string;
  subtitle?: string;
  active?: boolean;
  deletedAt?: string | null;
}

export interface ImportResult {
  importId: number;
  status: string;
  programsDetected: number;
  movementsDetected: number;
  cdpDetected: number;
  purchaseOrdersDetected: number;
  errorsDetected: number;
}

export interface ImportValidation {
  lastImportId?: number;
  lastImportFilename?: string;
  lastImportStatus: string;
  lastImportDate?: string;
  programsDetectedInImport: number;
  movementsDetectedInImport: number;
  cdpDetectedInImport: number;
  purchaseOrdersDetectedInImport: number;
  errorsDetectedInImport: number;
  programsInSystem: number;
  providersInSystem: number;
  budgetItemsInSystem: number;
  cdpInSystem: number;
  purchaseOrdersInSystem: number;
  cdpWithoutProgram: number;
  cdpWithoutProvider: number;
  purchaseOrdersWithoutCdp: number;
  totalCurrentBudget: number;
  totalCdpIssued: number;
  totalExecutedByPurchaseOrders: number;
  totalPendingCdpBalance: number;
  totalPossibleRelease: number;
  status: string;
  recommendation: string;
}

export interface AuditLog {
  id: number;
  createdAt: string;
  module: string;
  action: string;
  entityName: string;
  entityId: number;
  businessKey: string;
  username: string;
  previousValue: string;
  newValue: string;
  observation: string;
  ipAddress?: string;
  userAgent?: string;
  httpMethod?: string;
  requestPath?: string;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

export interface DashboardCharts {
  programs: { program: string; budget: number; issued: number; available: number; committedPercent: number }[];
  cdpByStatus: { status: string; count: number }[];
  topPendingCdps: { cdpNumber: string; description: string; pendingBalance: number; alertStatus: string }[];
  executionSlices: { label: string; value: number }[];
}

export interface FormalQuadrature {
  importId?: number;
  filename?: string;
  importedAt?: string;
  status: string;
  rows: { indicator: string; excelValue: number; systemValue: number; difference: number; status: string }[];
  recommendation: string;
}

export interface AuditStats {
  totalEvents: number;
  createEvents: number;
  updateEvents: number;
  deleteEvents: number;
  restoreEvents: number;
  loginEvents: number;
  importEvents: number;
}
