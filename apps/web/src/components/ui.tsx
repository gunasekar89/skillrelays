import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

export function SimBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`chip bg-amber-50 text-amber-700 ring-1 ring-amber-200 ${className}`} title="Results come from a deterministic simulator, not a language model.">
      <Sparkles className="h-3 w-3" /> Simulated AI
    </span>
  );
}

export function StatCard({ label, value, icon, hint }: { label: string; value: ReactNode; icon?: ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {icon && <span className="text-brand">{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function ScoreRing({ value, label, size = 88, color = "#14B8A6" }: { value: number; label?: string; size?: number; color?: string }) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label ?? "Score"} ${value}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth="7" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 800ms ease" }}
        />
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-navy text-lg font-bold">
          {value}%
        </text>
      </svg>
      {label && <span className="text-xs font-medium text-slate-600">{label}</span>}
    </div>
  );
}

export function Waveform({ levels, active, color = "bg-brand" }: { levels: number[]; active: boolean; color?: string }) {
  return (
    <div className="flex h-16 items-center justify-center gap-[3px]" aria-hidden>
      {levels.map((l, i) => (
        <span
          key={i}
          className={`w-1.5 rounded-full ${color} transition-[height] duration-75`}
          style={{ height: `${Math.round((active ? l : 0.08) * 100)}%`, opacity: active ? 0.55 + l * 0.45 : 0.35 }}
        />
      ))}
    </div>
  );
}

/** Decorative animated bars used when the AI is speaking (no mic levels available). */
export function SpeakingBars({ active }: { active: boolean }) {
  return (
    <div className="flex h-10 items-center gap-1" aria-hidden>
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className={`h-full w-1 rounded-full bg-teal ${active ? "wave-bar" : "opacity-30"}`}
          style={{ animationDelay: `${(i % 6) * 0.12}s`, transform: active ? undefined : "scaleY(0.25)" }}
        />
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
