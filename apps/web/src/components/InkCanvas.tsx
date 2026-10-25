import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser, Pen, Trash2, Undo2 } from "lucide-react";

export type InkCanvasHandle = { toImage: () => string | null; isEmpty: () => boolean };

const COLORS = ["#0B1B3F", "#2563EB", "#DC2626", "#0D9488"];
const WIDTH = 1200;
const HEIGHT = 1500;
const LINE_GAP = 50;

/** A lined notebook page you can write on with a finger, pen or mouse. Saves itself as a PNG data URL. */
export const InkCanvas = forwardRef<InkCanvasHandle, { pageKey: string; value?: string; onChange: (png: string | undefined) => void }>(function InkCanvas(
  { pageKey, value, onChange },
  ref,
) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const history = useRef<ImageData[]>([]);
  const dirty = useRef(Boolean(value));
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(4);
  const [eraser, setEraser] = useState(false);

  const ctx = () => canvas.current?.getContext("2d") ?? null;

  const paper = (c: CanvasRenderingContext2D) => {
    c.fillStyle = "#FFFFFF";
    c.fillRect(0, 0, WIDTH, HEIGHT);
    c.strokeStyle = "#DBEAFE";
    c.lineWidth = 2;
    for (let y = LINE_GAP * 2; y < HEIGHT; y += LINE_GAP) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(WIDTH, y);
      c.stroke();
    }
  };

  // Draw the saved page (or a blank one) whenever a different note is opened.
  useEffect(() => {
    const c = ctx();
    if (!c) return;
    history.current = [];
    paper(c);
    dirty.current = Boolean(value);
    if (value) {
      const img = new Image();
      img.onload = () => c.drawImage(img, 0, 0, WIDTH, HEIGHT);
      img.src = value;
    }
    // Only reload when another note is opened, not after our own strokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]);

  useImperativeHandle(ref, () => ({
    toImage: () => (dirty.current ? (canvas.current?.toDataURL("image/png") ?? null) : null),
    isEmpty: () => !dirty.current,
  }));

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * WIDTH, y: ((e.clientY - r.top) / r.height) * HEIGHT };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ctx();
    if (!c) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    history.current = [...history.current.slice(-19), c.getImageData(0, 0, WIDTH, HEIGHT)];
    drawing.current = true;
    last.current = point(e);
    move(e);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ctx();
    if (!c || !drawing.current || !last.current) return;
    const p = point(e);
    const pressure = e.pointerType === "pen" && e.pressure > 0 ? 0.5 + e.pressure : 1;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.strokeStyle = eraser ? "#FFFFFF" : color;
    c.lineWidth = (eraser ? size * 6 : size) * pressure;
    c.beginPath();
    c.moveTo(last.current.x, last.current.y);
    c.lineTo(p.x + 0.01, p.y);
    c.stroke();
    last.current = p;
  };

  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    dirty.current = true;
    onChange(canvas.current?.toDataURL("image/png"));
  };

  const undo = () => {
    const c = ctx();
    const prev = history.current.pop();
    if (!c || !prev) return;
    c.putImageData(prev, 0, 0);
    onChange(canvas.current?.toDataURL("image/png"));
  };

  const clear = () => {
    const c = ctx();
    if (!c || !confirm("Clear the handwritten page?")) return;
    history.current = [...history.current.slice(-19), c.getImageData(0, 0, WIDTH, HEIGHT)];
    paper(c);
    dirty.current = false;
    onChange(undefined);
  };

  const tool = (active: boolean) => `grid h-8 w-8 place-items-center rounded-lg ${active ? "bg-brand-50 text-brand ring-1 ring-brand/30" : "text-slate-500 hover:bg-slate-100"}`;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <button className={tool(!eraser)} onClick={() => setEraser(false)} aria-label="Pen" title="Pen">
          <Pen className="h-4 w-4" />
        </button>
        <button className={tool(eraser)} onClick={() => setEraser(true)} aria-label="Eraser" title="Eraser">
          <Eraser className="h-4 w-4" />
        </button>
        <span className="mx-1 h-6 w-px bg-slate-200" />
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => (setColor(c), setEraser(false))}
            className={`h-6 w-6 rounded-full ring-offset-2 ${color === c && !eraser ? "ring-2 ring-brand" : ""}`}
            style={{ background: c }}
            aria-label={`Ink colour ${c}`}
          />
        ))}
        <span className="mx-1 h-6 w-px bg-slate-200" />
        {[3, 5, 8].map((s) => (
          <button key={s} onClick={() => setSize(s)} className={tool(size === s)} aria-label={`Pen size ${s}`}>
            <span className="rounded-full bg-current" style={{ width: s + 2, height: s + 2 }} />
          </button>
        ))}
        <span className="flex-1" />
        <button className={tool(false)} onClick={undo} aria-label="Undo" title="Undo">
          <Undo2 className="h-4 w-4" />
        </button>
        <button className={tool(false)} onClick={clear} aria-label="Clear page" title="Clear page">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <canvas
        ref={canvas}
        width={WIDTH}
        height={HEIGHT}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        className="aspect-[4/5] w-full cursor-crosshair touch-none rounded-xl bg-white ring-1 ring-slate-200"
        aria-label="Handwriting page"
      />
    </div>
  );
});
