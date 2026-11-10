import { useEffect, useState } from "react";
import { listBranches, listPrintJobs, reprintJob, retryJob } from "../api/endpoints.js";
import type { Branch, PrintJob } from "../api/types.js";

export function PrintingPage() {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [branchId, setBranchId] = useState("");

  async function load() {
    try {
      const q: Record<string, string | undefined> = {};
      if (status) q.status = status;
      if (branchId) q.branchId = branchId;
      const [j, b] = await Promise.all([listPrintJobs(q), listBranches()]);
      setJobs(j);
      setBranches(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }
  useEffect(() => {
    load();
  }, [status, branchId]);

  async function handleReprint(id: string) {
    try {
      await reprintJob(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }
  async function handleRetry(id: string) {
    try {
      await retryJob(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div className="space-y-6">
      {error && <div className="text-red-600">{error}</div>}
      <div className="bg-white border rounded p-4 flex gap-3">
        <select
          className="border rounded px-3 py-2"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todos los estados</option>
          <option value="QUEUED">En cola</option>
          <option value="HELD">Retenido</option>
          <option value="PRINTED">Impreso</option>
          <option value="FAILED">Fallido</option>
          <option value="ABANDONED">Abandonado</option>
          <option value="SUPERSEDED">Supersedido</option>
        </select>
        <select
          className="border rounded px-3 py-2"
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
        >
          <option value="">Todas las sucursales</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.shortName}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2">Pedido</th>
              <th className="text-left p-2">Tipo</th>
              <th className="text-left p-2">Estado</th>
              <th className="text-left p-2">Intentos</th>
              <th className="text-left p-2">Creado</th>
              <th className="text-left p-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-t">
                <td className="p-2">{j.orderId}</td>
                <td className="p-2">{j.kind}</td>
                <td className="p-2">{j.status}</td>
                <td className="p-2">{j.attempts}</td>
                <td className="p-2">{new Date(j.createdAt).toLocaleString()}</td>
                <td className="p-2 space-x-2">
                  {(j.status === "ABANDONED" || j.status === "FAILED") && (
                    <button
                      type="button"
                      onClick={() =>
                        j.status === "FAILED" ? handleRetry(j.id) : handleReprint(j.id)
                      }
                      className="text-xs px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-brand-700 font-medium"
                    >
                      {j.status === "FAILED" ? "Reintentar" : "Reimprimir"}
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
