import type { ReactNode } from "react";

const DOTS = [
  { fill: "#ff5f57", ring: "#e0443e" },
  { fill: "#febc2e", ring: "#d89e24" },
  { fill: "#28c840", ring: "#1aab29" },
];

function LockIcon() {
  return (
    <svg
      width="9"
      height="11"
      viewBox="0 0 9 11"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <path
        d="M2.1 4.4V3a2.4 2.4 0 0 1 4.8 0v1.4"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <rect
        x="0.9"
        y="4.4"
        width="7.2"
        height="5.7"
        rx="1.3"
        fill="currentColor"
      />
    </svg>
  );
}

export default function WindowFrame({
  children,
  title,
  className,
}: {
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[12px] border border-white/12 bg-white/[0.03] ${className ?? ""}`}
    >
      <div className="flex h-[34px] items-center gap-2 border-b border-white/10 bg-white/[0.06] px-3.5">
        <div className="flex items-center gap-[7px]">
          {DOTS.map((d) => (
            <span
              key={d.fill}
              className="block h-[11px] w-[11px] rounded-full"
              style={{
                backgroundColor: d.fill,
                boxShadow: `inset 0 0 0 0.5px ${d.ring}`,
              }}
              aria-hidden
            />
          ))}
        </div>
        {title ? (
          <div className="flex min-w-0 flex-1 justify-center">
            <span className="pointer-events-none flex h-[21px] min-w-0 max-w-[260px] items-center gap-[6px] rounded-[5px] border border-white/[0.07] bg-black/25 px-[9px] text-stone">
              <LockIcon />
              <span className="truncate text-[11px] leading-[14px] lowercase tracking-[0.01em]">
                {title}
              </span>
            </span>
          </div>
        ) : null}
        <span className="w-[47px] shrink-0" aria-hidden />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
