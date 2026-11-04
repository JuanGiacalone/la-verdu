import { useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { getBusinessName } from "../api/endpoints.js";
import { useAuth } from "../auth/AuthContext.js";
import { TomatoMark } from "./TomatoMark.js";

const nav = [
  { to: "/", label: "Inicio" },
  { to: "/catalog", label: "Catálogo" },
  { to: "/branches", label: "Sucursales" },
  { to: "/staff", label: "Personal" },
  { to: "/orders", label: "Pedidos" },
  { to: "/availability", label: "Disponibilidad y precios" },
  { to: "/conversations", label: "Conversaciones" },
  { to: "/customers", label: "Clientes" },
  { to: "/printing", label: "Impresión" },
  { to: "/alerts", label: "Alertas" },
  { to: "/audit", label: "Auditoría" },
  { to: "/config", label: "Configuración técnica" },
];

export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    getBusinessName()
      .then((b) => {
        document.title = `${b.name} · Administración`;
      })
      .catch(() => {
        /* keep default */
      });
  }, []);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-slate-900 text-slate-100 flex flex-col shrink-0">
        <div className="px-4 py-5 border-b border-slate-700 flex items-center gap-3">
          <TomatoMark size={28} />
          <span className="text-lg font-bold">La Verdu · Administración</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {nav.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`block px-4 py-2 text-sm border-l-4 border-transparent hover:bg-slate-800 ${
                  active
                    ? "bg-slate-800 text-white font-semibold border-brand-500"
                    : "text-slate-300"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-3 border-t border-slate-700 text-xs space-y-1">
          <div className="text-slate-300 font-semibold">{user?.username}</div>
          <div className="text-slate-500">{user?.role}</div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-2 w-full text-left text-xs px-2 py-1.5 rounded-md border border-slate-700 bg-slate-800/40 text-slate-300 hover:bg-slate-800 hover:text-white font-medium"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
