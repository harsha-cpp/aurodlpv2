"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type Props = {
  children: ReactNode;
  mode?: "view" | "mount";
  delay?: number;
  duration?: number;
  distance?: number;
  ease?: string;
  threshold?: number;
  className?: string;
  style?: CSSProperties;
};

export default function Reveal({
  children,
  mode = "view",
  delay = 0,
  duration = 1,
  distance = 24,
  ease = "var(--ease-expo)",
  threshold = 0.15,
  className,
  style,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (mode === "mount") {
      const t = setTimeout(() => setShown(true), 30);
      return () => clearTimeout(t);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mode, threshold]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0px)" : `translateY(${distance}px)`,
        transition: `opacity ${duration}s ${ease}, transform ${duration}s ${ease}`,
        transitionDelay: `${delay}s`,
        willChange: "opacity, transform",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
