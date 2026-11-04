import { useEffect, useState } from "react";
import {
  cancelOrder,
  getOrderSummary,
  listBranches,
  listOrders,
  updatePaymentStatus,
  updatePrepStatus,
} from "../api/endpoints.js";
import type { Branch, Order } from "../api/types.js";

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ branchId: "", status: "", fulfillment: "" });
  const [summary, setSummary] = useState<{ today: number; month: number } | null>(null);

  async function load() {
    try {
      const q: Record<string, string | undefined> = {};
      if (filters.branchId) q.branchId = filters.branchId;
      if (filters.status) q.status = filters.status;
      if (filters.fulfillment) q.fulfillment = filters.fulfillment;
      const [o, b, s] = await Promise.all([
        listOrders(q),
        listBranches(),
        getOrderSummary(filters.branchId || undefined),
      ]);
      setOrders(o);
      setBranches(b);
      setSummary({ today: s.today, month: s.month });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }
  useEffect(() => {
    load();
  }, [filters]);

  async function handleCancel(id: string) {
    if (!confirm("Cancelar pedido?")) return;
    try {
      await cancelOrder(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handlePayment(id: string, status: "TO_COLLECT" | "PAID") {
    try {
      await updatePaymentStatus(id, status);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handlePrep(
    id: string,
    status: "PENDING" | "IN_PREPARATION" | "READY" | "DELIVERED",
  ) {
    try {
      await updatePrepStatus(id, status);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pedidos</h1>
      {error && <div className="text-red-600">{error}</div>}
      {summary && (
        <div className="flex gap-4 text-sm">
          <span>
            Hoy: <strong>{summary.today}</strong>
          </span>
          <span>
            Mes: <strong>{summary.month}</strong>
          </span>
        </div>
      )}

      <div className="bg-white border rounded p-4 flex flex-wrap gap-3">
        <select
          className="border rounded px-3 py-2"
          value={filters.branchId}
          onChange={(e) => setFilters({ ...filters, branchId: e.target.value })}
        >
          <option value="">Todas las sucursales</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.shortName}
            </option>
          ))}
        </select>
        <select
          className="border rounded px-3 py-2"
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="">Todos los estados</option>
          <option value="DRAFT">Borrador</option>
          <option value="CONFIRMED">Confirmado</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
        <select
          className="border rounded px-3 py-2"
          value={filters.fulfillment}
          onChange={(e) => setFilters({ ...filters, fulfillment: e.target.value })}
        >
          <option value="">Todas las modalidades</option>
          <option value="PICKUP">Retiro</option>
          <option value="DELIVERY">Envío</option>
        </select>
      </div>

      <div className="bg-white border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2">#</th>
              <th className="text-left p-2">Estado</th>
              <th className="text-left p-2">Modalidad</th>
              <th className="text-left p-2">Pago</th>
              <th className="text-left p-2">Prep.</th>
              <th className="text-left p-2">Versión</th>
              <th className="text-left p-2">Creado</th>
              <th className="text-left p-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t">
                <td className="p-2 font-medium">{o.orderNumber}</td>
                <td className="p-2">{o.status}</td>
                <td className="p-2">{o.fulfillment}</td>
                <td className="p-2">
                  <select
                    className="border rounded px-1 py-0.5 text-xs"
                    value={o.paymentStatus ?? ""}
                    onChange={(e) => handlePayment(o.id, e.target.value as "TO_COLLECT" | "PAID")}
                  >
                    <option value="">—</option>
                    <option value="TO_COLLECT">A cobrar</option>
                    <option value="PAID">Pagado</option>
                  </select>
                </td>
                <td className="p-2">
                  <select
                    className="border rounded px-1 py-0.5 text-xs"
                    value={o.prepStatus ?? ""}
                    onChange={(e) =>
                      handlePrep(
                        o.id,
                        e.target.value as "PENDING" | "IN_PREPARATION" | "READY" | "DELIVERED",
                      )
                    }
                  >
                    <option value="">—</option>
                    <option value="PENDING">Pendiente</option>
                    <option value="IN_PREPARATION">En prep.</option>
                    <option value="READY">Listo</option>
                    <option value="DELIVERED">Entregado</option>
                  </select>
                </td>
                <td className="p-2">{o.version}</td>
                <td className="p-2">{new Date(o.createdAt).toLocaleString()}</td>
                <td className="p-2">
                  {o.status !== "CANCELLED" && (
                    <button
                      type="button"
                      onClick={() => handleCancel(o.id)}
                      className="text-xs px-2 py-1 rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50 font-medium"
                    >
                      Cancelar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
