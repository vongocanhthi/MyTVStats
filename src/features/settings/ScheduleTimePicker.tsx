import { ChevronDown, Clock } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

interface ScheduleTimePickerProps {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
}

export function ScheduleTimePicker({ hour, minute, onChange }: ScheduleTimePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const hourEl = hourListRef.current?.querySelector<HTMLElement>(`[data-value="${hour}"]`);
    const minuteEl = minuteListRef.current?.querySelector<HTMLElement>(`[data-value="${minute}"]`);
    hourEl?.scrollIntoView({ block: "center" });
    minuteEl?.scrollIntoView({ block: "center" });
  }, [open, hour, minute]);

  const display = `${pad2(hour)}:${pad2(minute)}`;

  return (
    <div ref={rootRef} className="relative mt-1.5">
      <button
        type="button"
        aria-labelledby={labelId}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-left text-sm text-white outline-none ring-sky-500/30 hover:border-white/20 focus:ring-2"
      >
        <span className="inline-flex items-center gap-2">
          <Clock size={16} className="text-sky-300" />
          <span className="font-medium tabular-nums">{display}</span>
          <span className="text-slate-400">Asia/Ho_Chi_Minh</span>
        </span>
        <ChevronDown
          size={16}
          className={`text-slate-400 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      <p id={labelId} className="mt-1.5 text-xs text-slate-500">
        Mỗi ngày lúc <span className="tabular-nums text-slate-300">{display}</span> (giờ Việt Nam) —
        click để mở bảng chọn giờ / phút.
      </p>

      {open ? (
        <div
          role="dialog"
          aria-label="Chọn giờ gửi báo cáo"
          className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-xl shadow-black/40"
        >
          <div className="border-b border-white/10 px-3 py-2 text-xs text-slate-400">
            Chọn giờ gửi · múi giờ{" "}
            <span className="text-slate-200">Asia/Ho_Chi_Minh (UTC+7)</span>
          </div>

          <div className="grid grid-cols-2 gap-0">
            <div className="border-r border-white/10">
              <p className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500">
                Giờ
              </p>
              <div ref={hourListRef} className="h-48 overflow-y-auto px-1.5 pb-2">
                {HOURS.map((value) => {
                  const selected = value === hour;
                  return (
                    <button
                      key={value}
                      type="button"
                      data-value={value}
                      onClick={() => onChange(value, minute)}
                      className={`mb-0.5 flex w-full items-center justify-center rounded-lg px-2 py-1.5 text-sm tabular-nums ${
                        selected
                          ? "bg-sky-500 text-white"
                          : "text-slate-300 hover:bg-white/5"
                      }`}
                    >
                      {pad2(value)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wide text-slate-500">
                Phút
              </p>
              <div ref={minuteListRef} className="h-48 overflow-y-auto px-1.5 pb-2">
                {MINUTES.map((value) => {
                  const selected = value === minute;
                  return (
                    <button
                      key={value}
                      type="button"
                      data-value={value}
                      onClick={() => onChange(hour, value)}
                      className={`mb-0.5 flex w-full items-center justify-center rounded-lg px-2 py-1.5 text-sm tabular-nums ${
                        selected
                          ? "bg-sky-500 text-white"
                          : "text-slate-300 hover:bg-white/5"
                      }`}
                    >
                      {pad2(value)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-2">
            <p className="text-xs text-slate-400">
              Đã chọn{" "}
              <span className="font-medium tabular-nums text-sky-200">{display}</span>
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-400"
            >
              Xong
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
