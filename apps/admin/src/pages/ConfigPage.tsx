import { useEffect, useState } from "react";
import { getBusiness, listOpsStatus, updateBusiness } from "../api/endpoints.js";
import type { Business, OpsStatus } from "../api/types.js";

export function ConfigPage() {
  const [ops, setOps] = useState<OpsStatus | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [addressText, setAddressText] = useState("");
  const [agentNotes, setAgentNotes] = useState("");

  useEffect(() => {
    listOpsStatus()
      .then(setOps)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
    getBusiness()
      .then((b) => {
        setBusiness(b);
        setName(b.name);
        setOwnerName(b.ownerName ?? "");
        setPhoneE164(b.phoneE164 ?? "");
        setAddressText(b.addressText ?? "");
        setAgentNotes(b.agentNotes ?? "");
      })
      .catch(() => {
        // No business configured yet; leave form empty
      });
  }, []);

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateBusiness({
        name,
        ownerName: ownerName || null,
        phoneE164: phoneE164 || null,
        addressText: addressText || null,
        agentNotes: agentNotes || null,
      });
      setBusiness(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  if (error) return <div className="text-red-600">{error}</div>;
  if (!ops) return <div>Cargando…</div>;

  return (
    <div className="space-y-6">
      <section className="bg-white border rounded p-4 space-y-4">
        <h2 className="text-lg font-semibold">Configuración del negocio</h2>
        <p className="text-sm text-slate-500">
          Estos datos se usan en los mensajes del asistente y en la hoja impresa. Las notas del
          agente se suman a sus guardrails e instrucciones.
        </p>
        <form onSubmit={handleSaveBusiness} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Nombre del negocio</label>
            <input
              className="w-full border rounded p-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Nombre del dueño</label>
            <input
              className="w-full border rounded p-2"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Teléfono del negocio</label>
            <input
              className="w-full border rounded p-2"
              value={phoneE164}
              onChange={(e) => setPhoneE164(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Dirección</label>
            <input
              className="w-full border rounded p-2"
              value={addressText}
              onChange={(e) => setAddressText(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Notas para el agente (guardrails e instrucciones)
            </label>
            <textarea
              className="w-full border rounded p-2"
              rows={4}
              value={agentNotes}
              onChange={(e) => setAgentNotes(e.target.value)}
              placeholder="Ej.: No mencionar precios sin confirmar con el vendedor. El tomate perita se vende por kilo."
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-brand-700 hover:bg-brand-900 text-white rounded disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
            {saved && <span className="text-green-600 text-sm">Guardado</span>}
            {business && (
              <span className="text-xs text-slate-400">
                Última actualización: {new Date(business.updatedAt).toLocaleString()}
              </span>
            )}
          </div>
        </form>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Agentes de impresión</h2>
        <table className="w-full text-sm bg-white border rounded">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2">Sucursal</th>
              <th className="text-left p-2">Versión</th>
              <th className="text-left p-2">Último visto</th>
              <th className="text-left p-2">Impresora</th>
            </tr>
          </thead>
          <tbody>
            {ops.agents.map((a) => (
              <tr key={a.branchId} className="border-t">
                <td className="p-2">{a.branchId}</td>
                <td className="p-2">{a.version ?? "—"}</td>
                <td className="p-2">{a.lastSeen ? new Date(a.lastSeen).toLocaleString() : "—"}</td>
                <td className="p-2">{a.printerStatus ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2 className="text-lg font-semibold mb-2">Cola de impresión</h2>
        <pre className="bg-white border rounded p-4 text-sm">
          {JSON.stringify(ops.printQueue, null, 2)}
        </pre>
      </section>
      <p className="text-sm text-slate-500">
        Rotación de tokens y estado de proveedores (LLM, STT, WhatsApp) se gestionan por variables
        de entorno del servidor.
      </p>
    </div>
  );
}
