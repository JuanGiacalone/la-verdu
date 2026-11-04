import { apiFetch } from "./client.js";
import type {
  AuditEntry,
  Branch,
  Business,
  Conversation,
  Customer,
  OpsStatus,
  Order,
  OrderSummary,
  PaymentMethod,
  PrintJob,
  Product,
  Staff,
} from "./types.js";

// Branches
export const listBranches = () => apiFetch<Branch[]>("/admin/branches");
export const getBranch = (id: string) => apiFetch<Branch>(`/admin/branches/${id}`);
export const createBranch = (b: Partial<Branch>) =>
  apiFetch<Branch>("/admin/branches", { method: "POST", body: JSON.stringify(b) });
export const updateBranch = (id: string, b: Partial<Branch>) =>
  apiFetch<Branch>(`/admin/branches/${id}`, { method: "PUT", body: JSON.stringify(b) });
export const deleteBranch = (id: string) =>
  apiFetch<{ ok: boolean }>(`/admin/branches/${id}`, { method: "DELETE" });

// Staff
export const listStaff = () => apiFetch<Staff[]>("/admin/staff");
export const getStaff = (id: string) => apiFetch<Staff>(`/admin/staff/${id}`);
export const createStaff = (s: Partial<Staff> & { branchIds?: string[] }) =>
  apiFetch<Staff>("/admin/staff", { method: "POST", body: JSON.stringify(s) });
export const updateStaff = (id: string, s: Partial<Staff> & { branchIds?: string[] }) =>
  apiFetch<Staff>(`/admin/staff/${id}`, { method: "PUT", body: JSON.stringify(s) });
export const deleteStaff = (id: string) =>
  apiFetch<{ ok: boolean }>(`/admin/staff/${id}`, { method: "DELETE" });

// Products
export const getBusiness = () => apiFetch<Business>("/admin/business");
export const getBusinessName = () => apiFetch<{ name: string }>("/business");
export const updateBusiness = (b: {
  name: string;
  ownerName?: string | null;
  phoneE164?: string | null;
  addressText?: string | null;
  agentNotes?: string | null;
}) => apiFetch<Business>("/admin/business", { method: "PUT", body: JSON.stringify(b) });

export const listProducts = () => apiFetch<Product[]>("/admin/products");
export const getProduct = (id: string) => apiFetch<Product>(`/admin/products/${id}`);
export const createProduct = (p: { officialName: string; unit: string; active?: boolean }) =>
  apiFetch<Product>("/admin/products", { method: "POST", body: JSON.stringify(p) });
export const updateProduct = (id: string, p: Partial<Product>) =>
  apiFetch<Product>(`/admin/products/${id}`, { method: "PUT", body: JSON.stringify(p) });
export const deleteProduct = (id: string) =>
  apiFetch<{ ok: boolean }>(`/admin/products/${id}`, { method: "DELETE" });
export const addAlias = (productId: string, textNormalized: string) =>
  apiFetch<unknown>(`/admin/products/${productId}/aliases`, {
    method: "POST",
    body: JSON.stringify({ textNormalized }),
  });
export const deleteAlias = (productId: string, alias: string) =>
  apiFetch<{ ok: boolean }>(`/admin/products/${productId}/aliases/${encodeURIComponent(alias)}`, {
    method: "DELETE",
  });

// Payment methods
export const listPaymentMethods = (branchId: string) =>
  apiFetch<PaymentMethod[]>(`/admin/branches/${branchId}/payment-methods`);
export const updatePaymentMethods = (
  branchId: string,
  items: { paymentMethodId: string; enabled: boolean }[],
) =>
  apiFetch<{ ok: boolean }>(`/admin/branches/${branchId}/payment-methods`, {
    method: "PUT",
    body: JSON.stringify(items),
  });

// Orders
export const listOrders = (q: Record<string, string | undefined> = {}) => {
  const params = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  const qs = params.toString();
  return apiFetch<Order[]>(`/admin/orders${qs ? `?${qs}` : ""}`);
};
export const getOrder = (id: string) => apiFetch<Order>(`/admin/orders/${id}`);
export const getOrderSummary = (branchId?: string) =>
  apiFetch<OrderSummary>(`/admin/orders/summary${branchId ? `?branchId=${branchId}` : ""}`);
export const cancelOrder = (id: string) =>
  apiFetch<{ ok: boolean }>(`/admin/orders/${id}/cancel`, { method: "POST" });
export const updatePaymentStatus = (id: string, status: "TO_COLLECT" | "PAID") =>
  apiFetch<Order>(`/admin/orders/${id}/payment-status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
export const updatePrepStatus = (
  id: string,
  status: "PENDING" | "IN_PREPARATION" | "READY" | "DELIVERED",
) =>
  apiFetch<Order>(`/admin/orders/${id}/prep-status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });

// Printing
export const listPrintJobs = (q: Record<string, string | undefined> = {}) => {
  const params = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  const qs = params.toString();
  return apiFetch<PrintJob[]>(`/admin/print-jobs${qs ? `?${qs}` : ""}`);
};
export const getPrintJob = (id: string) => apiFetch<PrintJob>(`/admin/print-jobs/${id}`);
export const reprintJob = (id: string) =>
  apiFetch<{ jobId: string }>(`/admin/print-jobs/${id}/reprint`, { method: "POST" });
export const retryJob = (id: string) =>
  apiFetch<{ ok: boolean }>(`/admin/print-jobs/${id}/retry`, { method: "POST" });

// Alerts
export const listOpsStatus = () => apiFetch<OpsStatus>("/admin/ops/status");
export const acknowledgeAlert = (id: string) =>
  apiFetch<{ ok: boolean }>(`/admin/ops/alerts/${id}/acknowledge`, { method: "PUT" });

// Audit
export const listAudit = (q: { entity?: string; action?: string; limit?: number } = {}) => {
  const params = new URLSearchParams();
  if (q.entity) params.set("entity", q.entity);
  if (q.action) params.set("action", q.action);
  if (q.limit) params.set("limit", String(q.limit));
  const qs = params.toString();
  return apiFetch<AuditEntry[]>(`/admin/audit-log${qs ? `?${qs}` : ""}`);
};

// Customers
export const listCustomers = (search?: string) =>
  apiFetch<Customer[]>(`/admin/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`);
export const getCustomer = (id: string) => apiFetch<Customer>(`/admin/customers/${id}`);
export const updateCustomer = (id: string, c: Partial<Customer>) =>
  apiFetch<Customer>(`/admin/customers/${id}`, { method: "PUT", body: JSON.stringify(c) });
export const exportCustomer = (id: string) => apiFetch<unknown>(`/admin/privacy/export/${id}`);
export const rectifyCustomer = (
  id: string,
  c: { name?: string; addressText?: string; usualFulfillment?: "PICKUP" | "DELIVERY" },
) =>
  apiFetch<{ ok: boolean }>(`/admin/privacy/rectify/${id}`, {
    method: "PUT",
    body: JSON.stringify(c),
  });
export const suppressCustomer = (id: string) =>
  apiFetch<{ ok: boolean }>(`/admin/privacy/suppress/${id}`, { method: "DELETE" });
export const purgeData = (retentionMonths: number) =>
  apiFetch<unknown>("/admin/privacy/purge", {
    method: "POST",
    body: JSON.stringify({ retentionMonths }),
  });

// Conversations
export const listConversations = () => apiFetch<Conversation[]>("/admin/conversations");
export const getConversation = (id: string) => apiFetch<Conversation>(`/admin/conversations/${id}`);
export const resolveConversation = (id: string) =>
  apiFetch<{ ok: boolean }>(`/admin/conversations/${id}/resolve`, { method: "POST" });

// Availability / prices (branch_product, branch_product_day)
export interface BranchProduct {
  branchId: string;
  productId: string;
  officialName?: string;
  unit?: string;
  priceAmount: string | null;
  priceUnit: string | null;
  updatedAt: string | null;
}
export const listBranchProducts = (branchId: string) =>
  apiFetch<BranchProduct[]>(`/admin/branches/${branchId}/products`);
export const updateBranchProduct = (
  branchId: string,
  productId: string,
  priceAmount: number | null,
  priceUnit: string | null,
) =>
  apiFetch<BranchProduct>(`/admin/branches/${branchId}/products/${productId}`, {
    method: "PUT",
    body: JSON.stringify({ priceAmount, priceUnit }),
  });

export interface BranchProductDay {
  id: string;
  branchId: string;
  productId: string;
  businessDate: string;
  availability: "AVAILABLE" | "UNAVAILABLE" | "PENDING_CHECK";
  createdAt: string;
  updatedAt: string;
}
export const listBranchProductDays = (branchId: string, date: string) =>
  apiFetch<BranchProductDay[]>(`/admin/branches/${branchId}/availability?date=${date}`);
export const updateBranchProductDay = (
  branchId: string,
  productId: string,
  date: string,
  availability: string,
) =>
  apiFetch<BranchProductDay>(`/admin/branches/${branchId}/availability/${productId}`, {
    method: "PUT",
    body: JSON.stringify({ businessDate: date, availability }),
  });

// CSV import
export const importCsv = async (text: string) => {
  const res = await fetch("/admin/products/import-csv", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "text/plain; charset=utf-8" },
    body: text,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
  }
  return (await res.json()) as {
    imported: number;
    skipped: number;
    errors: string[];
    total: number;
  };
};
