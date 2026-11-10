import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getOrderSummary, listOpsStatus, listOrders } from "../api/endpoints.js";
import type { AgentSession, Alert, OpsStatus, Order, OrderSummary } from "../api/types.js";

export function DashboardPage() {
  const [ops, setOps] = useState<OpsStatus | null>(null);
  const [summary, setSummary] = useState<OrderSummary | null>(null);
  const [recent, setRecent] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listOpsStatus(), getOrderSummary(), listOrders()])
      .then(([o, s, r]) => {
        setOps(o);
        setSummary(s);
        setRecent(r.slice(0, 5));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, []);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!ops || !summary) return <div>Cargando…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Resumen de la jornada</h2>
        <Link
          to="/orders"
          className="bg-brand-700 hover:bg-brand-900 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm"
        >
          + Nuevo pedido
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Kpi label="Pedidos hoy" value={summary.today} delta="+3 vs ayer" />
        <Kpi label="Pedidos del mes" value={summary.month} delta="+12% vs mes anterior" />
        <Kpi
          label="Impresión en cola"
          value={ops.printQueue.queued}
          delta={`${ops.printQueue.failed} fallido${ops.printQueue.failed === 1 ? "" : "s"}`}
          deltaTone="muted"
        />
        <Kpi
          label="Borradores"
          value={ops.draftOrders}
          delta="pendientes de confirmar"
          deltaTone="muted"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section>
          <h2 className="text-lg font-bold mb-3">Agentes de impresión</h2>
          <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-brand-50">
                <tr>
                  <th className="text-left p-3 font-bold text-brand-900">Sucursal</th>
                  <th className="text-left p-3 font-bold text-brand-900">Versión</th>
                  <th className="text-left p-3 font-bold text-brand-900">Último visto</th>
                  <th className="text-left p-3 font-bold text-brand-900">Impresora</th>
                  <th className="text-left p-3 font-bold text-brand-900">Estado</th>
                </tr>
              </thead>
              <tbody>
                {ops.agents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-slate-500">
                      Sin agentes registrados.
                    </td>
                  </tr>
                ) : (
                  ops.agents.map((a: AgentSession) => (
                    <tr key={a.branchId} className="border-t border-slate-200 hover:bg-brand-50/50">
                      <td className="p-3 font-semibold">{a.branchId}</td>
                      <td className="p-3">{a.version ?? "—"}</td>
                      <td className="p-3">
                        {a.lastSeen ? new Date(a.lastSeen).toLocaleString() : "—"}
                      </td>
                      <td className="p-3">{a.printerStatus ?? "—"}</td>
                      <td className="p-3">
                        <StatusBadge agent={a} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-3">Alertas abiertas</h2>
          {ops.alerts.length === 0 ? (
            <p className="text-slate-500 text-sm">Sin alertas abiertas.</p>
          ) : (
            <div className="space-y-2">
              {ops.alerts.map((a: Alert) => (
                <div
                  key={a.id}
                  className="bg-white border border-slate-300 border-l-4 border-l-red-600 rounded-lg p-3 flex gap-3 items-start shadow-sm"
                >
                  <span className="w-2 h-2 rounded-full bg-red-600 mt-2 shrink-0" />
                  <div>
                    <div className="font-bold text-sm">{a.kind}</div>
                    <div className="text-slate-600 text-xs mt-0.5">{a.message}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section>
        <h2 className="text-lg font-bold mb-3">Pedidos recientes</h2>
        <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-brand-50">
              <tr>
                <th className="text-left p-3 font-bold text-brand-900">#</th>
                <th className="text-left p-3 font-bold text-brand-900">Cliente</th>
                <th className="text-left p-3 font-bold text-brand-900">Sucursal</th>
                <th className="text-left p-3 font-bold text-brand-900">Total</th>
                <th className="text-left p-3 font-bold text-brand-900">Estado</th>
                <th className="text-left p-3 font-bold text-brand-900">Hora</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-500">
                    Sin pedidos recientes.
                  </td>
                </tr>
              ) : (
                recent.map((o: Order) => (
                  <tr key={o.id} className="border-t border-slate-200 hover:bg-brand-50/50">
                    <td className="p-3">{o.orderNumber}</td>
                    <td className="p-3 font-semibold">{o.customerId}</td>
                    <td className="p-3">{o.fulfillingBranchId ?? o.preferredBranchId ?? "—"}</td>
                    <td className="p-3">—</td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                          o.status === "CONFIRMED"
                            ? "bg-brand-100 text-brand-700"
                            : o.status === "DRAFT"
                              ? "bg-accent-50 text-accent-700"
                              : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {o.status === "CONFIRMED"
                          ? "confirmado"
                          : o.status === "DRAFT"
                            ? "borrador"
                            : o.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="p-3">
                      {new Date(o.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  delta,
  deltaTone = "brand",
}: {
  label: string;
  value: number;
  delta: string;
  deltaTone?: "brand" | "muted";
}) {
  return (
    <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm">
      <div className="text-sm text-slate-600 mb-1.5">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
      <div
        className={`text-xs mt-1 font-semibold ${deltaTone === "brand" ? "text-brand-700" : "text-slate-500"}`}
      >
        {delta}
      </div>
    </div>
  );
}

function StatusBadge({ agent }: { agent: AgentSession }) {
  const stale =
    agent.lastSeen !== null &&
    Date.now() - new Date(agent.lastSeen).getTime() > 24 * 60 * 60 * 1000;
  if (stale) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
        desactualizado
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-brand-100 text-brand-700">
      ok
    </span>
  );
}
