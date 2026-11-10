import { useEffect, useState } from "react";
import {
  exportCustomer,
  listCustomers,
  purgeData,
  rectifyCustomer,
  suppressCustomer,
  updateCustomer,
} from "../api/endpoints.js";
import type { Customer } from "../api/types.js";

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({
    name: "",
    addressText: "",
    usualFulfillment: "PICKUP" as "PICKUP" | "DELIVERY",
  });

  async function load() {
    try {
      setCustomers(await listCustomers(search || undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }
  useEffect(() => {
    load();
  }, [search]);

  function startEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name ?? "",
      addressText: c.addressText ?? "",
      usualFulfillment: c.usualFulfillment,
    });
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      await updateCustomer(editing.id, {
        name: form.name,
        addressText: form.addressText,
        usualFulfillment: form.usualFulfillment,
      });
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleExport(c: Customer) {
    try {
      const data = await exportCustomer(c.id);
      alert(JSON.stringify(data, null, 2).slice(0, 2000));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleRectify(c: Customer) {
    const name = prompt("Nuevo nombre (vacío para mantener)", c.name ?? "") ?? undefined;
    try {
      await rectifyCustomer(c.id, { name: name || undefined });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleSuppress(c: Customer) {
    if (!confirm("Suprimir datos del cliente? (anonimiza)")) return;
    try {
      await suppressCustomer(c.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handlePurge() {
    const months = prompt("Meses de retención", "12");
    if (!months) return;
    try {
      const r = await purgeData(Number(months));
      alert(JSON.stringify(r));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div className="space-y-6">
      {error && <div className="text-red-600">{error}</div>}
      <div className="flex gap-3">
        <input
          className="border rounded px-3 py-2 flex-1"
          placeholder="Buscar por nombre o teléfono"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          onClick={handlePurge}
          className="bg-slate-200 rounded px-4 py-2 text-sm"
        >
          Purgar datos
        </button>
      </div>

      {editing && (
        <form onSubmit={handleUpdate} className="bg-white border rounded p-4 space-y-3">
          <h2 className="font-semibold">Editar {editing.phoneE164}</h2>
          <input
            className="border rounded px-3 py-2 w-full"
            placeholder="Nombre"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="border rounded px-3 py-2 w-full"
            placeholder="Dirección"
            value={form.addressText}
            onChange={(e) => setForm({ ...form, addressText: e.target.value })}
          />
          <select
            className="border rounded px-3 py-2"
            value={form.usualFulfillment}
            onChange={(e) =>
              setForm({ ...form, usualFulfillment: e.target.value as "PICKUP" | "DELIVERY" })
            }
          >
            <option value="PICKUP">Retiro</option>
            <option value="DELIVERY">Envío</option>
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              className="bg-brand-700 hover:bg-brand-900 text-white rounded px-4 py-2"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="bg-slate-200 rounded px-4 py-2"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2">Nombre</th>
              <th className="text-left p-2">Teléfono</th>
              <th className="text-left p-2">Pedidos</th>
              <th className="text-left p-2">Consentimiento</th>
              <th className="text-left p-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="p-2">{c.name ?? "—"}</td>
                <td className="p-2">{c.phoneE164}</td>
                <td className="p-2">{c.orderCount}</td>
                <td className="p-2">
                  {c.consentAt ? new Date(c.consentAt).toLocaleDateString() : "—"}
                </td>
                <td className="p-2 space-x-2">
                  <button
                    type="button"
                    onClick={() => startEdit(c)}
                    className="text-xs px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-brand-700 font-medium"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport(c)}
                    className="text-xs px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium"
                  >
                    Exportar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRectify(c)}
                    className="text-xs px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium"
                  >
                    Rectificar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSuppress(c)}
                    className="text-xs px-2 py-1 rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50 font-medium"
                  >
                    Suprimir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
