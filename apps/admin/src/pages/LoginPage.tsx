import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import bgImage from "../../fyv.jpg";
import { getBusinessName } from "../api/endpoints.js";
import { useAuth } from "../auth/AuthContext.js";
import { TomatoMark } from "../components/TomatoMark.js";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [businessName, setBusinessName] = useState("La Verdu");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getBusinessName()
      .then((b) => {
        setBusinessName(b.name);
        document.title = `${b.name} · Administración`;
      })
      .catch(() => {
        /* keep default */
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden text-slate-900">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${bgImage})`, filter: "brightness(0.55) saturate(1.1)" }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-brand-900/55 to-slate-900/65" />
      <div className="relative min-h-screen flex items-center justify-center p-6">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm bg-white/90 backdrop-blur-md border border-white/60 rounded-2xl p-8 shadow-2xl space-y-4"
        >
          <div className="flex items-center gap-3 mb-1">
            <TomatoMark size={40} />
            <h1 className="text-xl font-bold text-slate-900">{businessName} · Administración</h1>
          </div>
          <p className="text-sm text-slate-500">Iniciá sesión para continuar</p>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Usuario</label>
            <input
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Contraseña</label>
            <input
              type="password"
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-700 hover:bg-brand-900 text-white rounded-lg py-2.5 font-semibold disabled:opacity-50 transition-colors"
          >
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
          <p className="text-center text-xs text-slate-500 pt-2">
            Asistente de WhatsApp para{" "}
            <span className="text-brand-700 font-medium">fruterías y verdulerías</span>
          </p>
        </form>
      </div>
    </div>
  );
}
