import { useEffect, useState } from "react";
import { listAudit } from "../api/endpoints.js";
import type { AuditEntry } from "../api/types.js";

export function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");

  async function load() {
    try {
      setEntries(
        await listAudit({ entity: entity || undefined, action: action || undefined, limit: 100 }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }
  useEffect(() => {
    load();
  }, [entity, action]);

  return (
    <div className="space-y-6">
      {error && <div className="text-red-600">{error}</div>}
      <div className="bg-white border rounded p-4 flex gap-3">
        <input
          className="border rounded px-3 py-2"
          placeholder="Entidad"
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Acción"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
      </div>
      <div className="bg-white border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2">Fecha</th>
              <th className="text-left p-2">Actor</th>
              <th className="text-left p-2">Acción</th>
              <th className="text-left p-2">Entidad</th>
              <th className="text-left p-2">ID</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-2">{new Date(e.createdAt).toLocaleString()}</td>
                <td className="p-2">{e.actor}</td>
                <td className="p-2">{e.action}</td>
                <td className="p-2">{e.entity}</td>
                <td className="p-2">{e.entityId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
