import { useState } from "react";

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  total: number;
}

export function App() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    if (!file) {
      setError("Seleccioná un archivo CSV primero.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Read as Latin-1 so the POS export (ISO-8859) keeps its accents.
      const text = await file.text();
      const response = await fetch("/admin/products/import-csv", {
        method: "POST",
        headers: { "content-type": "text/plain; charset=utf-8" },
        body: text,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Error ${response.status}`);
      }

      setResult((await response.json()) as ImportResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "2rem auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>La Verdu - Administración</h1>
      <h2>Cargar productos desde CSV</h2>
      <p>
        El archivo debe ser un export del POS con las columnas{" "}
        <code>Descripción</code> y <code>Tipo de Venta</code>. Se aceptan
        archivos en ISO-8859 o UTF-8.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button onClick={handleImport} disabled={!file || loading}>
          {loading ? "Importando..." : "Importar"}
        </button>
      </div>

      {error && (
        <div style={{ color: "#b00020", marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ border: "1px solid #ccc", padding: "1rem", borderRadius: 4 }}>
          <p>
            <strong>Importados:</strong> {result.imported} &nbsp;
            <strong>Saltados (duplicados):</strong> {result.skipped} &nbsp;
            <strong>Errores:</strong> {result.errors.length} &nbsp;
            <strong>Total:</strong> {result.total}
          </p>
          {result.errors.length > 0 && (
            <ul style={{ color: "#b00020" }}>
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}