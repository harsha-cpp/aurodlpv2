"use client";

import { useEffect, useRef, useState } from "react";

const CAPTION = [
  "Email was the only way out.",
  "Now a browser text box is",
  "the second one, and no email",
  "control can see it.",
];

const SERIES = [
  {
    d: "M20 250 C 180 246, 340 238, 500 224 S 760 196, 812 184",
    color: "var(--color-stone)",
    label: "Email volume",
  },
  {
    d: "M20 252 C 180 244, 340 224, 520 176 S 760 74, 812 34",
    color: "var(--color-cream)",
    label: "Text pasted into browser tools",
  },
  {
    d: "M20 254 C 180 252, 340 246, 520 226 S 760 176, 812 146",
    color: "var(--color-blue)",
    label: "Sends a control actually inspects",
  },
];

export default function LeakChart({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      <svg
        viewBox="0 0 840 300"
        fill="none"
        className="h-full w-full"
        role="img"
        aria-label="Outgoing text grows faster than the share any email control inspects"
      >
        <g stroke="var(--color-stone)" strokeOpacity="0.35" strokeWidth="1">
          {[70, 130, 190, 250].map((y) => (
            <line key={y} x1="20" y1={y} x2="812" y2={y} />
          ))}
        </g>
        {SERIES.map((s, i) => (
          <path
            key={s.d}
            d={s.d}
            stroke={s.color}
            strokeWidth="2"
            strokeLinecap="round"
            style={{
              strokeDasharray: 1200,
              strokeDashoffset: shown ? 0 : 1200,
              transition: `stroke-dashoffset 1.8s var(--ease-expo) ${0.15 * i}s`,
            }}
          />
        ))}
        <g className="font-sysmono" fill="var(--color-stone)" fontSize="10.5">
          {CAPTION.map((line, i) => (
            <text key={line} x="20" y={28 + i * 14}>
              {line}
            </text>
          ))}
        </g>
      </svg>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 pl-[20px]">
        {SERIES.map((s) => (
          <span key={s.label} className="flex items-center gap-2">
            <span
              className="block h-[7px] w-[7px] shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
              aria-hidden
            />
            <span className="font-sysmono text-[10.5px] uppercase leading-none tracking-[0.02em] text-stone">
              {s.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
