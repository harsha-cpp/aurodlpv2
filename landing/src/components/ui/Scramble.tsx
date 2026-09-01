"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";

type Props = {
  text: string;
  speed?: number;
  from?: "left" | "right" | "center";
  className?: string;
  style?: CSSProperties;
};

function order(length: number, from: Props["from"]) {
  const idx = Array.from({ length }, (_, i) => i);
  if (from === "left") return idx;
  if (from === "right") return idx.reverse();
  const mid = (length - 1) / 2;
  return idx.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
}

export default function Scramble({
  text,
  speed = 80,
  from = "right",
  className,
  style,
}: Props) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let done = false;

    const run = () => {
      const s = Math.min(100, Math.max(1, speed));
      const duration = 2500 - ((s - 1) / 99) * 2200;
      const seq = order(text.length, from);
      const t0 = performance.now();
      const tick = (now: number) => {
        if (done) return;
        const p = Math.min(1, (now - t0) / duration);
        const revealed = new Set(seq.slice(0, Math.floor(p * seq.length)));
        let out = "";
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (ch === " ") out += " ";
          else if (revealed.has(i)) out += ch;
          else out += CHARS[Math.floor(Math.random() * CHARS.length)];
        }
        setDisplay(out);
        if (p < 1) raf = requestAnimationFrame(tick);
        else setDisplay(text);
      };
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          io.disconnect();
          run();
        }
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => {
      done = true;
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [text, speed, from]);

  return (
    <p
      ref={ref}
      className={className}
      style={{ margin: 0, whiteSpace: "pre-wrap", width: "100%", ...style }}
    >
      {display}
    </p>
  );
}
