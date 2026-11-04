import { useEffect, useState } from "react";
import {
  addAlias,
  createProduct,
  deleteAlias,
  deleteProduct,
  importCsv,
  listProducts,
  updateProduct,
} from "../api/endpoints.js";
import type { Product } from "../api/types.js";

export function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<"KG" | "UNIT" | "BUNCH">("KG");
  const [aliasInputs, setAliasInputs] = useState<Record<string, string>>({});
  const [csvResult, setCsvResult] = useState<string | null>(null);

  async function load() {
    try {
      setProducts(await listProducts());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createProduct({ officialName: name.trim(), unit });
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleToggle(p: Product) {
    try {
      await updateProduct(p.id, { active: !p.active });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleDelete(p: Product) {
    if (!confirm(`Desactivar ${p.officialName}?`)) return;
    try {
      await deleteProduct(p.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleAddAlias(p: Product) {
    const text = (aliasInputs[p.id] ?? "").trim();
    if (!text) return;
    try {
      await addAlias(p.id, text);
      setAliasInputs((s) => ({ ...s, [p.id]: "" }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleDeleteAlias(p: Product, alias: string) {
    try {
      await deleteAlias(p.id, alias);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // POS exports are ISO-8859-1; decode as Latin-1 to keep accents.
    const buffer = await file.arrayBuffer();
    let text: string;
    try {
      text = new TextDecoder("iso-8859-1").decode(buffer);
    } catch {
      text = await file.text();
    }
    try {
      const r = await importCsv(text);
      setCsvResult(
        `Importados ${r.imported}, saltados ${r.skipped}, errores ${r.errors.length}, total ${r.total}`,
      );
      if (r.errors.length > 0) {
        console.error("Errores de importación CSV:", r.errors);
      }
      await load();
    } catch (err) {
      console.error("Error al importar CSV:", err);
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Catálogo</h1>
      {error && (
        <div className="text-xs px-1.5 py-0.5 rounded border border-red-200 bg-white text-red-600 hover:bg-red-50 font-bold leading-none">
          {error}
        </div>
      )}
      {csvResult && <div className="text-green-700">{csvResult}</div>}

      <form onSubmit={handleCreate} className="bg-white border rounded p-4 flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-sm mb-1">Nombre oficial</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Unidad</label>
          <select
            className="border rounded px-3 py-2"
            value={unit}
            onChange={(e) => setUnit(e.target.value as "KG" | "UNIT" | "BUNCH")}
          >
            <option value="KG">KG</option>
            <option value="UNIT">Unidad</option>
            <option value="BUNCH">Atado</option>
          </select>
        </div>
        <button type="submit" className="bg-brand-600 text-white rounded px-4 py-2">
          Agregar
        </button>
      </form>

      <div className="bg-white border rounded p-4">
        <label className="block text-sm font-medium mb-2">Importar CSV (export POS)</label>
        <input type="file" accept=".csv,text/csv" onChange={handleCsv} />
      </div>

      <div className="bg-white border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2">Nombre</th>
              <th className="text-left p-2">Unidad</th>
              <th className="text-left p-2">Activo</th>
              <th className="text-left p-2">Sinónimos</th>
              <th className="text-left p-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-2 font-medium">{p.officialName}</td>
                <td className="p-2">{p.unit}</td>
                <td className="p-2">{p.active ? "Sí" : "No"}</td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1 mb-1">
                    {p.aliases.map((a) => (
                      <span
                        key={a}
                        className="bg-slate-200 rounded px-2 py-0.5 text-xs flex items-center gap-1"
                      >
                        {a}
                        <button
                          type="button"
                          onClick={() => handleDeleteAlias(p, a)}
                          className="text-xs px-1.5 py-0.5 rounded border border-red-200 bg-white text-red-600 hover:bg-red-50 font-bold leading-none"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <input
                      className="border rounded px-2 py-1 text-xs"
                      placeholder="nuevo sinónimo"
                      value={aliasInputs[p.id] ?? ""}
                      onChange={(e) => setAliasInputs((s) => ({ ...s, [p.id]: e.target.value }))}
                    />
                    <button
                      type="button"
                      onClick={() => handleAddAlias(p)}
                      className="text-xs px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="p-2 space-x-2">
                  <button
                    type="button"
                    onClick={() => handleToggle(p)}
                    className="text-xs px-2 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-brand-700 font-medium"
                  >
                    {p.active ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
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
