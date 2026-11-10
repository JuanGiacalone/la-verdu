import { useEffect, useState } from "react";
import type { BranchProduct, BranchProductDay } from "../api/endpoints.js";
import {
  listBranches,
  listBranchProductDays,
  listBranchProducts,
  updateBranchProduct,
  updateBranchProductDay,
} from "../api/endpoints.js";
import type { Branch as BranchType } from "../api/types.js";

export function AvailabilityPage() {
  const [branches, setBranches] = useState<BranchType[]>([]);
  const [branchId, setBranchId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [products, setProducts] = useState<BranchProduct[]>([]);
  const [days, setDays] = useState<BranchProductDay[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadBranches() {
    try {
      const b = await listBranches();
      setBranches(b);
      if (!branchId && b.length > 0) {
        const first = b[0];
        if (first) setBranchId(first.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }
  useEffect(() => {
    loadBranches();
  }, []);

  async function load() {
    if (!branchId) return;
    try {
      const [p, d] = await Promise.all([
        listBranchProducts(branchId),
        listBranchProductDays(branchId, date),
      ]);
      setProducts(p);
      setDays(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }
  useEffect(() => {
    load();
  }, [branchId, date]);

  async function handlePrice(productId: string, value: string) {
    const num = value === "" ? null : Number(value);
    try {
      await updateBranchProduct(branchId, productId, num, null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleAvailability(productId: string, availability: string) {
    try {
      await updateBranchProductDay(branchId, productId, date, availability);
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
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.shortName}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="border rounded px-3 py-2"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className="bg-white border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left p-2">Producto</th>
              <th className="text-left p-2">Precio</th>
              <th className="text-left p-2">Disponibilidad ({date})</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const d = days.find((x) => x.productId === p.productId);
              return (
                <tr key={p.productId} className="border-t">
                  <td className="p-2 font-medium">{p.officialName}</td>
                  <td className="p-2">
                    <input
                      type="number"
                      step="0.01"
                      className="border rounded px-2 py-1 w-24"
                      defaultValue={p.priceAmount ?? ""}
                      onBlur={(e) => handlePrice(p.productId, e.target.value)}
                    />
                  </td>
                  <td className="p-2">
                    <select
                      className="border rounded px-2 py-1"
                      value={d?.availability ?? ""}
                      onChange={(e) => handleAvailability(p.productId, e.target.value)}
                    >
                      <option value="">Sin definir</option>
                      <option value="AVAILABLE">Disponible</option>
                      <option value="UNAVAILABLE">No disponible</option>
                      <option value="PENDING_CHECK">A confirmar</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
