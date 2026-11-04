import { useEffect, useState } from "react";
import {
  createStaff,
  deleteStaff,
  listBranches,
  listStaff,
  updateStaff,
} from "../api/endpoints.js";
import type { Branch, Staff } from "../api/types.js";

export function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    phoneE164: "",
    name: "",
    role: "SELLER" as "OWNER" | "SELLER",
    active: true,
    branchIds: [] as string[],
  });
  const [editing, setEditing] = useState<Staff | null>(null);

  async function load() {
    try {
      const [s, b] = await Promise.all([listStaff(), listBranches()]);
      setStaff(s);
      setBranches(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }
  useEffect(() => {
    load();
  }, []);

  function toggleBranch(id: string) {
    setForm((f) => ({
      ...f,
      branchIds: f.branchIds.includes(id)
        ? f.branchIds.filter((x) => x !== id)
        : [...f.branchIds, id],
    }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createStaff(form);
      setForm({ phoneE164: "", name: "", role: "SELLER", active: true, branchIds: [] });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      await updateStaff(editing.id, {
        phoneE164: form.phoneE164,
        name: form.name,
        role: form.role,
        active: form.active,
        branchIds: form.branchIds,
      });
      setEditing(null);
      setForm({ phoneE164: "", name: "", role: "SELLER", active: true, branchIds: [] });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  function startEdit(s: Staff) {
    setEditing(s);
    setForm({
      phoneE164: s.phoneE164,
      name: s.name,
      role: s.role,
      active: s.active,
      branchIds: s.branchIds,
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Desactivar personal?")) return;
    try {
      await deleteStaff(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Personal</h1>
      {error && <div className="text-red-600">{error}</div>}

      <form
        onSubmit={editing ? handleUpdate : handleCreate}
        className="bg-white border rounded p-4 space-y-3"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            className="border rounded px-3 py-2"
            placeholder="Teléfono E.164"
            value={form.phoneE164}
            onChange={(e) => setForm({ ...form, phoneE164: e.target.value })}
          />
          <input
            className="border rounded px-3 py-2"
            placeholder="Nombre"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <select
            className="border rounded px-3 py-2"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as "OWNER" | "SELLER" })}
          >
            <option value="SELLER">Vendedor</option>
            <option value="OWNER">Dueño</option>
          </select>
        </div>
        <div>
          <div className="text-sm font-medium mb-1">Sucursales</div>
          <div className="flex flex-wrap gap-3">
            {branches.map((b) => (
              <label key={b.id} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={form.branchIds.includes(b.id)}
                  onChange={() => toggleBranch(b.id)}
                />
                {b.shortName}
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Activo
        </label>
        <div className="flex gap-2">
          <button type="submit" className="bg-brand-600 text-white rounded px-4 py-2">
            {editing ? "Actualizar" : "Crear"}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setForm({ phoneE164: "", name: "", role: "SELLER", active: true, branchIds: [] });
              }}
              className="bg-slate-200 rounded px-4 py-2"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="bg-white border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2">Nombre</th>
              <th className="text-left p-2">Teléfono</th>
              <th className="text-left p-2">Rol</th>
              <th className="text-left p-2">Sucursales</th>
              <th className="text-left p-2">Activo</th>
              <th className="text-left p-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="p-2 font-medium">{s.name}</td>
                <td className="p-2">{s.phoneE164}</td>
                <td className="p-2">{s.role}</td>
                <td className="p-2">
                  {s.branchIds
                    .map((id) => branches.find((b) => b.id === id)?.shortName ?? id)
                    .join(", ")}
                </td>
                <td className="p-2">{s.active ? "Sí" : "No"}</td>
                <td className="p-2 space-x-2">
                  <button
                    type="button"
                    onClick={() => startEdit(s)}
                    className="text-xs px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-brand-700 font-medium"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(s.id)}
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
    </div>
  );
}
