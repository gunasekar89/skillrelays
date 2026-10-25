import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";
import { applyDisplay, loadProfile, standardLabel } from "../lib/profile";

export type NavItem = { to: string; label: string; icon: ReactNode; end?: boolean };

export function AppShell({ nav, user, context }: { nav: NavItem[]; user: { name: string; role: string }; context: string }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const [, refresh] = useState(0);

  // Student display settings (text size, contrast) apply only inside the student workspace.
  useEffect(() => applyDisplay(), [location.pathname]);
  useEffect(() => {
    const onChange = () => refresh((n) => n + 1);
    window.addEventListener("sr-profile", onChange);
    return () => window.removeEventListener("sr-profile", onChange);
  }, []);
  if (context === "Student") {
    const p = loadProfile();
    user = { name: p.name || user.name, role: `${standardLabel(p.standard)}${p.standard === "college" ? "" : ` · ${p.board}`}` };
  }
  const sidebar = (
    <nav className="flex flex-col gap-1 p-3">
      {nav.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive ? "bg-brand-50 text-brand" : "text-slate-600 hover:bg-slate-100 hover:text-navy"
            }`
          }
        >
          <span className="h-4 w-4 [&>svg]:h-4 [&>svg]:w-4">{n.icon}</span>
          {n.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-6">
        <div className="flex items-center gap-3">
          <button className="rounded-md p-1.5 hover:bg-slate-100 md:hidden" onClick={() => setOpen(!open)} aria-label="Toggle navigation">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Logo />
          <span className="hidden rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 sm:inline">{context}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right leading-tight">
            <div className="text-sm font-semibold">{user.name}</div>
            <div className="text-xs text-slate-500">{user.role}</div>
          </div>
          <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand to-teal text-sm font-bold text-white">
            {user.name[0]}
          </div>
        </div>
      </header>
      <div className="flex">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-slate-200 bg-white md:block">{sidebar}</aside>
        {open && <aside className="fixed inset-x-0 top-16 z-20 border-b border-slate-200 bg-white shadow-lg md:hidden">{sidebar}</aside>}
        <main className="min-w-0 flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
