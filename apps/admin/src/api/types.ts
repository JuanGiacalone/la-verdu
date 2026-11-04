export interface Branch {
  id: string;
  shortName: string;
  fullName: string;
  address: string | null;
  timezone: string;
  opensAt: string;
  closesAt: string;
  dayStartAt: string;
  deliveryEnabled: boolean;
  priority: number;
  active: boolean;
  printerAddress: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Staff {
  id: string;
  phoneE164: string;
  name: string;
  role: "OWNER" | "SELLER";
  active: boolean;
  branchIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  officialName: string;
  unit: "KG" | "UNIT" | "BUNCH";
  referencePrice: string | null;
  active: boolean;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Business {
  id: string;
  name: string;
  ownerName: string | null;
  phoneE164: string | null;
  addressText: string | null;
  agentNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentMethod {
  id: string;
  code: string;
  label: string;
  active: boolean;
  enabled: boolean;
}

export interface Order {
  id: string;
  orderNumber: number;
  customerId: string;
  preferredBranchId: string | null;
  fulfillingBranchId: string | null;
  derived: boolean;
  fulfillment: "PICKUP" | "DELIVERY";
  pickupTime: string | null;
  deliveryAddressSnapshot: string | null;
  deliveryTime: string | null;
  paymentMethodId: string | null;
  paymentStatus: "TO_COLLECT" | "PAID" | null;
  prepStatus: "PENDING" | "IN_PREPARATION" | "READY" | "DELIVERED" | null;
  notes: string | null;
  status: "DRAFT" | "CONFIRMED" | "CANCELLED";
  version: number;
  source: "CUSTOMER" | "STAFF";
  createdByStaffId: string | null;
  waMessageId: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: string;
  unit: "KG" | "UNIT" | "BUNCH";
  requestedText: string | null;
}

export interface PrintJob {
  id: string;
  orderId: string;
  orderVersion: number;
  branchId: string;
  kind: "NEW" | "MODIFICATION" | "CANCELLATION";
  status: "QUEUED" | "HELD" | "DISPATCHED" | "PRINTED" | "FAILED" | "ABANDONED" | "SUPERSEDED";
  attempts: number;
  lastError: string | null;
  previewText: string | null;
  createdAt: string;
  releasedAt: string | null;
  printedAt: string | null;
}

export interface Alert {
  id: string;
  branchId: string | null;
  kind: string;
  orderId: string | null;
  message: string;
  status: "OPEN" | "ACKNOWLEDGED";
  createdAt: string;
  acknowledgedAt: string | null;
}

export interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  entity: string;
  entityId: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  createdAt: string;
}

export interface AgentSession {
  branchId: string;
  version: string | null;
  lastSeen: string | null;
  printerStatus: string | null;
}

export interface OpsStatus {
  printQueue: { queued: number; failed: number; abandoned: number; held: number };
  alerts: Alert[];
  agents: AgentSession[];
  escalatedConversations: number;
  draftOrders: number;
}

export interface OrderStats {
  // flexible
  [key: string]: unknown;
}

export interface OrderSummary {
  today: number;
  month: number;
  year: number;
  allTime: number;
}

export interface Customer {
  id: string;
  phoneE164: string;
  name: string | null;
  addressText: string | null;
  usualFulfillment: "PICKUP" | "DELIVERY";
  preferredBranchId: string | null;
  consentAt: string | null;
  orderCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  phoneE164: string;
  actorType: "CUSTOMER" | "STAFF";
  state: "BOT" | "ESCALATED" | "CLOSED";
  draftOrderId: string | null;
  contextJson: unknown;
  lastInboundAt: string | null;
  createdAt: string;
  updatedAt: string;
}
