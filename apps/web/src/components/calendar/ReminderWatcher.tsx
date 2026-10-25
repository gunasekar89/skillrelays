import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BellRing, X } from "lucide-react";
import { deliver, inQuietHours, loadCalendar, saveCalendar, type Reminder } from "../../lib/calendar";

/**
 * Checks for due reminders once a minute while the student side is open. Each reminder is shown once (the
 * delivery log in the calendar prevents repeats), as an in-app toast and, if allowed, a browser notification
 * outside quiet hours. There is no server push yet, so nothing arrives while the app is closed.
 */
export function ReminderWatcher() {
  const [toasts, setToasts] = useState<Reminder[]>([]);
  useEffect(() => {
    const check = () => {
      const cal = loadCalendar();
      const push = typeof Notification !== "undefined" && Notification.permission === "granted" && !inQuietHours(cal.reminders);
      const { cal: next, fresh } = deliver(cal, push ? "browser" : "in-app");
      if (!fresh.length) return;
      saveCalendar(next);
      setToasts((t) => [...t, ...fresh].slice(-3));
      // Toasts step aside after a while; the reminders stay listed on the calendar's day view.
      window.setTimeout(() => setToasts((t) => t.filter((x) => !fresh.includes(x))), 12_000);
      if (push) for (const r of fresh) new Notification(r.title, { body: r.body, tag: r.id, icon: "/logo.svg" });
    };
    check();
    const id = window.setInterval(check, 60_000);
    window.addEventListener("sr-calendar", check);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("sr-calendar", check);
    };
  }, []);

  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {toasts.map((r) => (
        <div key={r.id} className="flex items-start gap-3 rounded-xl bg-white p-3 shadow-card ring-1 ring-slate-200">
          <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <Link to={`/student/calendar?item=${encodeURIComponent(r.eventId)}`} onClick={() => setToasts((t) => t.filter((x) => x.id !== r.id))} className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{r.title}</div>
            {r.body && <div className="text-xs text-slate-500">{r.body}</div>}
          </Link>
          <button onClick={() => setToasts((t) => t.filter((x) => x.id !== r.id))} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Dismiss reminder">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
