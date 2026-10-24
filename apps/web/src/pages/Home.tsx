import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Brain,
  CheckCircle2,
  ClipboardCheck,
  FileAudio,
  FileText,
  GraduationCap,
  Lightbulb,
  Mic,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Wand2,
} from "lucide-react";
import { Logo } from "../components/Logo";
import { brand } from "../lib/brand";

const flow = [
  { icon: <Mic />, title: "Record KT session", text: "Trainer records with visible consent, or uploads audio." },
  { icon: <Brain />, title: "AI processes", text: "Speech becomes a transcript, topics and Q&A." },
  { icon: <FileText />, title: "Training material", text: "Notes, runbooks, FAQs and quizzes, linked to the source." },
  { icon: <Users />, title: "Employees learn", text: "Quizzes and a voice coach measure readiness." },
];

const generated = ["Session summary", "Training document", "Runbook", "FAQ", "Assessment quiz", "Key takeaways"];

export default function Home() {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_80%_20%,rgba(20,184,166,0.35),transparent_60%),radial-gradient(50%_60%_at_10%_90%,rgba(37,99,235,0.35),transparent_60%)]" />
        <nav className="relative mx-auto flex max-w-7xl items-center justify-between px-4 py-5 md:px-6">
          <Logo light />
          <div className="hidden items-center gap-8 text-sm text-slate-200 md:flex">
            <a href="#products" className="hover:text-white">Products</a>
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#trust" className="hover:text-white">Trust</a>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/login" className="btn rounded-lg px-4 py-2 text-white ring-1 ring-white/30 hover:bg-white/10">Sign in</Link>
            <Link to="/login" className="btn-primary hidden sm:inline-flex">Get started</Link>
          </div>
        </nav>

        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-20 pt-10 md:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-16">
          <div>
            <span className="chip bg-white/10 text-teal ring-1 ring-white/15">
              <Sparkles className="h-3 w-3" /> AI knowledge intelligence
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Transform Knowledge
              <br />
              <span className="bg-gradient-to-r from-teal to-cyan-300 bg-clip-text text-transparent">into Capability.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-slate-300">
              AI-powered interview preparation for individuals, and knowledge transfer that turns every expert session into training for organizations.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/student" className="btn-primary px-5 py-3 text-base">
                Explore for Students <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/enterprise" className="btn bg-white px-5 py-3 text-base text-navy hover:bg-slate-100">
                Explore for Enterprise <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-10 grid max-w-xl grid-cols-2 gap-4 text-sm text-slate-300 sm:grid-cols-4">
              {[
                [<Brain key="a" />, "AI-powered learning"],
                [<Mic key="b" />, "Voice-first practice"],
                [<BookOpenCheck key="c" />, "Knowledge intelligence"],
                [<BarChart3 key="d" />, "Measurable outcomes"],
              ].map(([icon, text]) => (
                <div key={String(text)} className="flex items-center gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
                  <span className="leading-tight">{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Product cards */}
          <div id="products" className="grid gap-5 sm:grid-cols-2">
            <ProductCard
              tag="For individuals"
              name="Student"
              tagline="Practice Smarter. Interview Better. Get Hired."
              features={["AI mock interviews by voice", "Resume analysis", "Personalized learning", "Instant coaching"]}
              cta="Start practicing"
              to="/student"
              accent="brand"
              icon={<GraduationCap />}
            />
            <ProductCard
              tag="For organizations"
              name="Enterprise"
              tagline="Capture. Organize. Train. Measure."
              features={["Voice KT session capture", "Auto training content", "Assessments & learning", "Employee skill analytics"]}
              cta="See the KT demo"
              to="/enterprise/kt"
              accent="teal"
              icon={<Users />}
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-7xl px-4 py-20 md:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="label text-teal-600">Enterprise knowledge transfer</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">From conversations to capability</h2>
            <p className="mt-4 text-slate-600">
              Your senior engineers already explain how things work in KT calls. {brand.name} listens with everyone's consent, writes it up as reviewed
              training, and checks that new people actually understood it.
            </p>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2">
              {flow.map((f, i) => (
                <li key={f.title} className="card flex gap-3 p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-600 [&>svg]:h-5 [&>svg]:w-5">{f.icon}</span>
                  <div>
                    <div className="text-sm font-semibold">
                      {i + 1}. {f.title}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{f.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Product preview */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div className="text-sm font-semibold">Kubernetes Production Support · Initial KT</div>
              <span className="chip bg-red-50 text-red-600">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Recording 24:15
              </span>
            </div>
            <div className="grid gap-0 sm:grid-cols-[1.2fr_1fr]">
              <div className="bg-gradient-to-br from-navy to-navy-700 p-6 text-white">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <FileAudio className="h-4 w-4" /> Audio only · consent confirmed
                </div>
                <div className="mt-6 flex h-20 items-center justify-center gap-[3px]">
                  {Array.from({ length: 36 }, (_, i) => (
                    <span key={i} className="wave-bar w-1.5 rounded-full bg-teal" style={{ height: `${30 + ((i * 37) % 70)}%`, animationDelay: `${(i % 9) * 0.1}s` }} />
                  ))}
                </div>
                <div className="mt-6 rounded-lg bg-white/10 p-3 text-xs leading-relaxed text-slate-200">
                  <span className="font-semibold text-teal">Live transcript · </span>
                  “When you see CrashLoopBackOff, first run kubectl describe pod and check the events…”
                </div>
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-400/15 p-3 text-xs text-amber-100">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" /> Suggested question: “What memory limits do we set for the API pods?”
                </div>
              </div>
              <div className="p-5">
                <div className="label">Generated content</div>
                <ul className="mt-3 space-y-2.5">
                  {generated.map((g) => (
                    <li key={g} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-teal" /> {g}
                    </li>
                  ))}
                </ul>
                <Link to="/enterprise/kt" className="btn-teal mt-6 w-full">
                  Try it with your voice <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-canvas py-20">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight">One platform, two experiences</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">Shared AI foundation, separate workspaces, permissions and plans.</p>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              { icon: <Mic />, title: "Voice mock interviews", text: "An AI interviewer asks questions out loud, listens to your answer and follows up like a real person." },
              { icon: <Target />, title: "Transparent scoring", text: "Technical, communication and completeness scores from a rubric you can read. Never a hiring decision." },
              { icon: <Wand2 />, title: "KT to training, automatically", text: "Summaries, runbooks, FAQs and quizzes drafted from the session, each traceable to the transcript." },
              { icon: <ClipboardCheck />, title: "Trainer approval", text: "Nothing is published until a trainer reviews and approves it." },
              { icon: <BarChart3 />, title: "Readiness analytics", text: "See completion, skill readiness and knowledge gaps across teams." },
              { icon: <ShieldCheck />, title: "Private by design", text: "Each organization's knowledge is isolated. Recording always needs visible consent." },
            ].map((f) => (
              <div key={f.title} className="card p-6">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand [&>svg]:h-5 [&>svg]:w-5">{f.icon}</span>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section id="trust" className="mx-auto max-w-7xl px-4 py-20 md:px-6">
        <div className="card grid gap-8 bg-gradient-to-br from-navy to-navy-700 p-8 text-white md:grid-cols-[1.4fr_1fr] md:p-12">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Built for honest, consented learning</h2>
            <p className="mt-3 text-slate-300">
              We never record silently, and we never help anyone misrepresent their own performance in a real interview. Generated content is labeled as a
              draft until a human approves it.
            </p>
          </div>
          <div className="flex flex-col justify-center gap-3">
            <Link to="/enterprise/kt" className="btn bg-teal px-5 py-3 text-base text-navy hover:bg-teal-50">
              Try the KT demo <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/student/interview" className="btn px-5 py-3 text-base text-white ring-1 ring-white/30 hover:bg-white/10">
              Try a voice interview
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-slate-500 md:px-6">
          <Logo />
          <span>
            © {new Date().getFullYear()} {brand.name} {brand.suffix}. Demo build: AI results are simulated and labeled.
          </span>
        </div>
      </footer>
    </div>
  );
}

function ProductCard(props: {
  tag: string;
  name: string;
  tagline: string;
  features: string[];
  cta: string;
  to: string;
  accent: "brand" | "teal";
  icon: React.ReactNode;
}) {
  const teal = props.accent === "teal";
  return (
    <div className="flex flex-col rounded-2xl bg-white p-6 text-navy shadow-2xl ring-1 ring-white/20">
      <span className={`chip w-fit ${teal ? "bg-navy text-white" : "bg-brand-50 text-brand ring-1 ring-brand/20"}`}>{props.tag}</span>
      <div className="mt-4 flex items-start justify-between">
        <h3 className="text-2xl font-bold leading-tight">
          {brand.name}
          <br />
          <span className={teal ? "text-teal-600" : "text-brand"}>{props.name}</span>
        </h3>
        <span className={`grid h-12 w-12 place-items-center rounded-2xl ${teal ? "bg-teal-50 text-teal-600" : "bg-brand-50 text-brand"} [&>svg]:h-6 [&>svg]:w-6`}>
          {props.icon}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-500">{props.tagline}</p>
      <ul className="mt-5 flex-1 space-y-2.5">
        {props.features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm">
            <CheckCircle2 className={`h-4 w-4 ${teal ? "text-teal" : "text-brand"}`} /> {f}
          </li>
        ))}
      </ul>
      <Link to={props.to} className={`${teal ? "btn-teal" : "btn-primary"} mt-6 w-full`}>
        {props.cta}
      </Link>
    </div>
  );
}
