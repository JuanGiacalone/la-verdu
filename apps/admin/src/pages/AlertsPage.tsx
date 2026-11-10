import { useEffect, useState } from "react";
import { acknowledgeAlert, listOpsStatus } from "../api/endpoints.js";
import type { Alert } from "../api/types.js";

export function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const ops = await listOpsStatus();
      setAlerts(ops.alerts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function handleAck(id: string) {
    try {
      await acknowledgeAlert(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div className="space-y-6">
      {error && <div className="text-red-600">{error}</div>}
      <div className="bg-white border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2">Tipo</th>
              <th className="text-left p-2">Mensaje</th>
              <th className="text-left p-2">Sucursal</th>
              <th className="text-left p-2">Estado</th>
              <th className="text-left p-2">Creada</th>
              <th className="text-left p-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="p-2">{a.kind}</td>
                <td className="p-2">{a.message}</td>
                <td className="p-2">{a.branchId ?? "—"}</td>
                <td className="p-2">{a.status}</td>
                <td className="p-2">{new Date(a.createdAt).toLocaleString()}</td>
                <td className="p-2">
                  {a.status === "OPEN" && (
                    <button
                      type="button"
                      onClick={() => handleAck(a.id)}
                      className="text-xs px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-brand-700 font-medium"
                    >
                      Reconocer
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
