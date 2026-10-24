import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, GraduationCap } from "lucide-react";
import { Logo } from "../components/Logo";

export default function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"student" | "enterprise">("enterprise");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email, or leave it blank to use the demo account.");
      return;
    }
    nav(mode === "student" ? "/student" : "/enterprise");
  };

  return (
    <div className="grid min-h-screen place-items-center bg-canvas p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <form onSubmit={submit} className="card p-8">
          <h1 className="text-xl font-bold">Sign in to the demo</h1>
          <p className="mt-1 text-sm text-slate-500">Accounts are not live yet. Pick a workspace to explore.</p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {(
              [
                ["student", "Student", <GraduationCap key="s" className="h-5 w-5" />],
                ["enterprise", "Enterprise", <Building2 key="e" className="h-5 w-5" />],
              ] as const
            ).map(([value, label, icon]) => (
              <button
                type="button"
                key={value}
                onClick={() => setMode(value)}
                className={`flex flex-col items-center gap-2 rounded-xl p-4 text-sm font-semibold ring-1 transition ${
                  mode === value ? "bg-brand-50 text-brand ring-brand" : "text-slate-600 ring-slate-200 hover:bg-slate-50"
                }`}
                aria-pressed={mode === value}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          <label className="mt-6 block text-sm font-medium" htmlFor="email">
            Email <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="email"
            type="text"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            placeholder="you@company.com"
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}

          <button type="submit" className="btn-primary mt-6 w-full py-3">
            Continue to {mode === "student" ? "Student" : "Enterprise"} workspace
          </button>
        </form>
      </div>
    </div>
  );
}
