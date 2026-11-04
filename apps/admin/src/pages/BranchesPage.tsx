import { useEffect, useState } from "react";
import {
  createBranch,
  deleteBranch,
  listBranches,
  listPaymentMethods,
  updatePaymentMethods,
} from "../api/endpoints.js";
import type { Branch, PaymentMethod } from "../api/types.js";

const emptyForm = {
  shortName: "",
  fullName: "",
  address: "",
  timezone: "America/Argentina/Buenos_Aires",
  opensAt: "08:00",
  closesAt: "18:00",
  dayStartAt: "08:00",
  deliveryEnabled: true,
  priority: 0,
  printerAddress: "",
  active: true,
};

export function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);

  async function load() {
    try {
      setBranches(await listBranches());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createBranch({
        shortName: form.shortName,
        fullName: form.fullName,
        address: form.address || undefined,
        timezone: form.timezone,
        opensAt: form.opensAt,
        closesAt: form.closesAt,
        dayStartAt: form.dayStartAt,
        deliveryEnabled: form.deliveryEnabled,
        priority: form.priority,
        printerAddress: form.printerAddress || undefined,
        active: form.active,
      });
      setForm(emptyForm);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Desactivar sucursal?")) return;
    try {
      await deleteBranch(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function loadMethods(branchId: string) {
    setSelectedBranch(branchId);
    try {
      setMethods(await listPaymentMethods(branchId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function toggleMethod(m: PaymentMethod) {
    if (!selectedBranch) return;
    const updated = methods.map((x) => (x.id === m.id ? { ...x, enabled: !x.enabled } : x));
    setMethods(updated);
    try {
      await updatePaymentMethods(
        selectedBranch,
        updated.map((x) => ({ paymentMethodId: x.id, enabled: x.enabled })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Sucursales</h1>
      {error && <div className="text-red-600">{error}</div>}

      <form
        onSubmit={handleCreate}
        className="bg-white border rounded p-4 grid grid-cols-1 md:grid-cols-3 gap-3"
      >
        <input
          className="border rounded px-3 py-2"
          placeholder="Nombre corto"
          value={form.shortName}
          onChange={(e) => setForm({ ...form, shortName: e.target.value })}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Nombre completo"
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Dirección"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Abre (HH:MM)"
          value={form.opensAt}
          onChange={(e) => setForm({ ...form, opensAt: e.target.value })}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Cierra (HH:MM)"
          value={form.closesAt}
          onChange={(e) => setForm({ ...form, closesAt: e.target.value })}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Inicio jornada (HH:MM)"
          value={form.dayStartAt}
          onChange={(e) => setForm({ ...form, dayStartAt: e.target.value })}
        />
        <input
          className="border rounded px-3 py-2"
          placeholder="Impresora (opcional)"
          value={form.printerAddress}
          onChange={(e) => setForm({ ...form, printerAddress: e.target.value })}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.deliveryEnabled}
            onChange={(e) => setForm({ ...form, deliveryEnabled: e.target.checked })}
          />
          Envío habilitado
        </label>
        <button type="submit" className="bg-brand-600 text-white rounded px-4 py-2">
          Crear sucursal
        </button>
      </form>

      <div className="bg-white border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2">Código</th>
              <th className="text-left p-2">Nombre</th>
              <th className="text-left p-2">Horario</th>
              <th className="text-left p-2">Envío</th>
              <th className="text-left p-2">Activa</th>
              <th className="text-left p-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="p-2 font-medium">{b.shortName}</td>
                <td className="p-2">{b.fullName}</td>
                <td className="p-2">
                  {b.opensAt}–{b.closesAt}
                </td>
                <td className="p-2">{b.deliveryEnabled ? "Sí" : "No"}</td>
                <td className="p-2">{b.active ? "Sí" : "No"}</td>
                <td className="p-2 space-x-2">
                  <button
                    type="button"
                    onClick={() => loadMethods(b.id)}
                    className="text-xs px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-brand-700 font-medium"
                  >
                    Métodos de pago
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(b.id)}
                    className="text-xs px-2 py-1 rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50 font-medium"
                  >
                    Baja
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedBranch && (
        <div className="bg-white border rounded p-4">
          <h2 className="font-semibold mb-2">Métodos de pago</h2>
          <div className="space-y-1">
            {methods.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={m.enabled} onChange={() => toggleMethod(m)} />
                {m.label} ({m.code})
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
