"use client";

import { useEffect, useRef, useState } from "react";

function useReveal(threshold = 0.2) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, on };
}

const shell =
  "h-full w-full overflow-hidden rounded-[10px] border border-white/10 bg-ink-2 p-4";
const head =
  "flex items-center justify-between border-b border-white/10 pb-3 text-[12px] text-cream";
const label = "font-sysmono text-[10px] uppercase tracking-[0.06em] text-stone";

function step(on: boolean, i: number) {
  return {
    opacity: on ? 1 : 0,
    transform: on ? "translateY(0)" : "translateY(6px)",
    transition: `opacity .5s var(--ease-expo) ${0.25 + i * 0.22}s, transform .5s var(--ease-expo) ${0.25 + i * 0.22}s`,
  };
}

export function DetectionPanel() {
  const { ref, on } = useReveal();
  const hits = [
    ["Aadhaar number", "**********7460"],
    ["Medical record number", "UHID 00*****18"],
    ["Diagnosis code", "U09.9"],
    ["Date of birth", "**/**/1971"],
  ];
  return (
    <div ref={ref} className={shell}>
      <div className={head}>
        <span>Discharge summary</span>
        <span className="font-sysmono text-[10px] text-blue">SCANNING</span>
      </div>
      <div className="mt-3 flex flex-col gap-[7px]">
        {hits.map(([type, value], i) => (
          <div
            key={type}
            className="flex items-center justify-between rounded-[5px] bg-ink-3 px-2.5 py-[7px]"
            style={step(on, i)}
          >
            <span className="text-[11px] text-cream">{type}</span>
            <span className="font-sysmono text-[10px] text-stone">{value}</span>
          </div>
        ))}
      </div>
      <p className={`${label} mt-3`}>4 identifiers, masked before storage</p>
    </div>
  );
}

export function AttachmentPanel() {
  const { ref, on } = useReveal();
  const files = [
    ["discharge.pdf", 100],
    ["patients.xlsx", 100],
    ["scan.png", 72],
    ["records.zip", 40],
  ];
  return (
    <div ref={ref} className={shell}>
      <div className={head}>
        <span>4 attachments</span>
        <span className="font-sysmono text-[10px] text-stone">OCR ON</span>
      </div>
      <div className="mt-3 flex flex-col gap-[11px]">
        {files.map(([name, pct], i) => (
          <div key={name as string} style={step(on, i)}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-cream">{name}</span>
              <span className="font-sysmono text-[10px] text-stone">
                {on ? `${pct}%` : "0%"}
              </span>
            </div>
            <div className="mt-[6px] h-[3px] w-full overflow-hidden rounded-full bg-ink-3">
              <div
                className="h-full rounded-full bg-blue"
                style={{
                  width: on ? `${pct}%` : "0%",
                  transition: `width 1.1s var(--ease-expo) ${0.3 + i * 0.2}s`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PolicyPanel() {
  const { ref, on } = useReveal();
  const rules = [
    ["01", "blocked-recipient-domain", false],
    ["02", "unapproved-sender-with-phi", false],
    ["03", "high-risk-phi-to-public-email", true],
    ["04", "medium-risk-phi-external", false],
  ];
  return (
    <div ref={ref} className={shell}>
      <div className={head}>
        <span>Policy</span>
        <span className="font-sysmono text-[10px] text-stone">FIRST MATCH</span>
      </div>
      <div className="mt-3 flex flex-col gap-[7px]">
        {rules.map(([n, id, hit], i) => (
          <div
            key={id as string}
            className={`flex items-center gap-2 rounded-[5px] px-2.5 py-[7px] ${hit && on ? "bg-blue/15" : "bg-ink-3"}`}
            style={{
              ...step(on, i),
              transition: `${step(on, i).transition}, background-color .4s var(--ease-expo) 1.3s`,
            }}
          >
            <span className="font-sysmono text-[10px] text-stone">{n}</span>
            <span
              className={`flex-1 truncate font-sysmono text-[10px] ${hit && on ? "text-cream" : "text-stone"}`}
            >
              {id}
            </span>
            {hit && (
              <span
                className="font-sysmono text-[9px] uppercase text-blue"
                style={{
                  opacity: on ? 1 : 0,
                  transition: "opacity .4s var(--ease-expo) 1.4s",
                }}
              >
                quarantine
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AuditPanel() {
  const { ref, on } = useReveal();
  const rows = ["8f3c...a91e", "b207...4dd1", "e0df...b714", "df5f...5276"];
  return (
    <div ref={ref} className={shell}>
      <div className={head}>
        <span>Audit log</span>
        <span className="font-sysmono text-[10px] text-stone">APPEND ONLY</span>
      </div>
      <div className="relative mt-3 flex flex-col gap-[10px]">
        <span
          className="absolute left-[4px] top-[9px] w-px bg-white/15"
          style={{
            height: on ? "calc(100% - 16px)" : "0%",
            transition: "height 1.2s var(--ease-expo) .35s",
          }}
          aria-hidden
        />
        {rows.map((h, i) => (
          <div
            key={h}
            className="relative flex items-center gap-2 pl-5"
            style={step(on, i)}
          >
            <span className="absolute left-0 top-1/2 block h-[9px] w-[9px] -translate-y-1/2 rounded-full border border-blue bg-ink-2" />
            <span className="font-sysmono text-[10px] text-cream">{h}</span>
            <span className="ml-auto font-sysmono text-[9px] uppercase text-stone">
              linked
            </span>
          </div>
        ))}
      </div>
      <p className={`${label} mt-3`}>Each hash covers the row before it</p>
    </div>
  );
}

export const CARD_PANELS = [
  DetectionPanel,
  AttachmentPanel,
  PolicyPanel,
  AuditPanel,
];
