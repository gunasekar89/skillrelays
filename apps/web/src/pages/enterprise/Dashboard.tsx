import { Link } from "react-router-dom";
import { BookOpen, CheckCircle2, Clock, Mic, Users } from "lucide-react";
import { PageHeader, StatCard } from "../../components/ui";
import { org, type KtSession } from "../../lib/demo";
import { load } from "../../lib/storage";

export default function OrgDashboard() {
  const session = load<KtSession | null>("sr.kt", null);
  const activity = session ? [{ title: session.title, status: session.approved ? "Published" : "Awaiting review", people: 0, when: "Just now" }, ...org.activity] : org.activity;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Organization overview"
        subtitle={<>Sample data for {org.name}. Your own sessions appear at the top of recent activity.</>}
        actions={
          <Link to="/enterprise/kt" className="btn-teal">
            <Mic className="h-4 w-4" /> New KT session
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total employees" value={org.stats.employees} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Active training programs" value={org.stats.programs} icon={<BookOpen className="h-4 w-4" />} />
        <StatCard label="Completion rate" value={`${org.stats.completion}%`} icon={<CheckCircle2 className="h-4 w-4" />} />
        <StatCard label="Knowledge assets" value={org.stats.assets + (session?.approved ? 5 : 0)} icon={<BookOpen className="h-4 w-4" />} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="card p-6">
          <div className="font-semibold">Training completion trend</div>
          <TrendChart />
        </div>
        <div className="card p-6">
          <div className="font-semibold">Skill readiness</div>
          <div className="mt-4 flex items-center gap-6">
            <Donut />
            <ul className="space-y-2 text-sm">
              {org.readiness.map((r) => (
                <li key={r.label} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                  <span className="w-24 text-slate-600">{r.label}</span>
                  <span className="font-semibold">{r.pct}%</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="card mt-6 p-6">
        <div className="font-semibold">Recent training activity</div>
        <ul className="mt-4 divide-y divide-slate-100">
          {activity.map((a) => (
            <li key={a.title} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-50 text-teal-600">
                  <Mic className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Clock className="h-3 w-3" /> {a.when}
                    {a.people ? ` · ${a.people} employees` : ""}
                  </div>
                </div>
              </div>
              <span
                className={`chip ${
                  a.status === "Completed" || a.status === "Published"
                    ? "bg-teal-50 text-teal-700"
                    : a.status === "Not started"
                      ? "bg-slate-100 text-slate-600"
                      : "bg-amber-50 text-amber-700"
                }`}
              >
                {a.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function TrendChart() {
  const w = 520;
  const h = 180;
  const pad = 28;
  const pts = org.trend.map((p, i) => [pad + (i * (w - pad * 2)) / (org.trend.length - 1), h - pad - (p.v / 100) * (h - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0]},${h - pad} L${pts[0][0]},${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 w-full" role="img" aria-label="Completion rose from 32% in January to 76% in June">
      <defs>
        <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2563EB" stopOpacity="0.18" />
          <stop offset="1" stopColor="#2563EB" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map((g) => {
        const y = h - pad - (g / 100) * (h - pad * 2);
        return (
          <g key={g}>
            <line x1={pad} x2={w - pad} y1={y} y2={y} stroke="#E2E8F0" />
            <text x={pad - 6} y={y} textAnchor="end" dominantBaseline="central" className="fill-slate-400 text-[10px]">
              {g}
            </text>
          </g>
        );
      })}
      <path d={area} fill="url(#fill)" />
      <path d={line} fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinejoin="round" />
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="4" fill="#fff" stroke="#2563EB" strokeWidth="2" />
          <text x={x} y={h - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">
            {org.trend[i].m}
          </text>
        </g>
      ))}
      <text x={pts[pts.length - 1][0]} y={pts[pts.length - 1][1] - 12} textAnchor="middle" className="fill-navy text-[11px] font-semibold">
        {org.trend[org.trend.length - 1].v}%
      </text>
    </svg>
  );
}

function Donut() {
  const r = 46;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Skill readiness breakdown">
      {org.readiness.map((s) => {
        const len = (s.pct / 100) * c;
        const el = (
          <circle
            key={s.label}
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="16"
            strokeDasharray={`${len - 2} ${c - len + 2}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 60 60)"
          />
        );
        offset += len;
        return el;
      })}
    </svg>
  );
}
