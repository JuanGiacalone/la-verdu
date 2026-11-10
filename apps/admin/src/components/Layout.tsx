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

  const current = nav.find((item) => item.to === location.pathname);
  const today = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long" }).format(
    new Date(),
  );

  return (
    <div className="min-h-screen flex text-slate-900">
      <aside className="w-60 bg-brand-900 text-white flex flex-col shrink-0">
        <div className="h-1 bg-gradient-to-r from-brand-500 via-accent-600 to-highlight-500" />
        <div className="px-4 py-5 flex items-center gap-3">
          <TomatoMark size={30} />
          <span className="text-lg font-extrabold">La Verdu · Administración</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-1">
          {nav.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`block border-l-4 border-transparent px-4 py-2.5 text-sm hover:bg-white/5 hover:text-white ${
                  active
                    ? "bg-white/10 text-white font-semibold border-brand-500"
                    : "text-brand-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-3 border-t border-white/20 text-xs space-y-1">
          <div className="text-white font-semibold">{user?.username}</div>
          <div className="text-brand-100">{user?.role}</div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-2 w-full text-left text-xs px-2.5 py-1.5 rounded-lg font-semibold bg-white/10 text-brand-50 hover:bg-white/20"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="bg-gradient-to-r from-brand-50 via-brand-50 to-accent-50 border-b border-slate-300 px-8 py-5">
          <div className="text-xs font-bold uppercase tracking-widest text-brand-700">
            Todas las sucursales
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
            {current?.label ?? "Inicio"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">Hoy, {today}</p>
        </div>
        <div className="max-w-[1200px] mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
