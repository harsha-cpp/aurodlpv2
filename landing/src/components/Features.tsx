"use client";

import { useEffect, useRef, useState } from "react";
import Button from "./ui/Button";
import { links } from "@/lib/links";
import { CARD_PANELS } from "./ui/CardPanels";

const cards = [
  {
    number: "01/",
    eyebrow: "Detection",
    title: "21 identifier types, validated by checksum where one exists",
  },
  {
    number: "02/",
    eyebrow: "Attachments",
    title: "Every attachment opened, scanned pages read by OCR",
  },
  {
    number: "03/",
    eyebrow: "Policy",
    title: "Ordered rules that return allow, warn, quarantine or block",
  },
  {
    number: "04/",
    eyebrow: "Audit",
    title: "A hash-chained log in which a removed row shows",
  },
];

function FeatureGrid() {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full bg-ink-2">
      <div className="grid grid-cols-1 gap-[30px] lg:grid-cols-[665px_665px]">
        {cards.map((c, n) => (
          <div
            key={c.number}
            id={`card-${n}-wrapper`}
            className="no-ft relative flex flex-col items-stretch overflow-hidden tab:flex-row"
            style={{
              opacity: shown ? 1 : 0,
              transform: shown ? "translateY(0px)" : "translateY(24px)",
              transition:
                "opacity 1s cubic-bezier(0.16, 1, 0.3, 1), transform 1s cubic-bezier(0.16, 1, 0.3, 1)",
              transitionDelay: `${n * 90}ms`,
            }}
          >
            <div className="relative w-full max-w-[323px] shrink-0 overflow-hidden pb-[30px] tab:w-[323px] tab:min-w-[323px]">
              <div
                className="relative z-[2] block w-full"
                style={{ aspectRatio: "323 / 320" }}
              >
                <div className="absolute inset-0">
                  {(() => {
                    const Panel = CARD_PANELS[n % CARD_PANELS.length];
                    return <Panel />;
                  })()}
                </div>
              </div>
              <div
                className="absolute left-0 top-0 z-[1] h-full w-full bg-ink-3"
                style={{ marginTop: 50, marginLeft: 30 }}
              />
            </div>

            <div
              className="relative flex min-w-0 flex-1 flex-col gap-[10px] self-stretch overflow-hidden bg-ink-3 px-5 pb-[30px] pt-8 tab:pl-[30px] tab:pr-[30px] tab:pt-10"
              style={{ marginTop: 0 }}
            >
              <div className="absolute bottom-5 right-5 top-5 z-[2] flex flex-col justify-between">
                {Array.from({ length: n + 1 }, (_, d) => (
                  <span
                    key={d}
                    className="block h-5 w-5 shrink-0 rounded-full bg-ink-2"
                  />
                ))}
              </div>
              <div
                className="font-rsm text-[32px] leading-none tracking-[-0.64px] text-stone"
                style={{ marginBottom: 60 }}
              >
                {c.number}
              </div>
              <div className="font-sysmono text-[16px] uppercase leading-[1.1] tracking-[0.03em] text-blue">
                {c.eyebrow}
              </div>
              <div className="max-w-[360px] font-rsm text-[32px] leading-[1.2] tracking-[-0.03em] text-cream">
                {c.title}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Features() {
  return (
    <section
      id="features"
      className="flex w-full flex-col items-center justify-center gap-[100px] overflow-clip bg-ink-2 px-5 tab:px-10 pb-20 pt-[140px]"
    >
      <div className="flex w-full max-w-[1720px] items-end justify-between">
        <div className="flex max-w-[700px] flex-col items-start justify-center gap-8">
          <p className="eyebrow text-blue">Core features</p>
          <h2 className="h2-72 whitespace-pre-wrap text-cream">
            Four parts, one verdict
          </h2>
        </div>
        <div className="flex w-full max-w-[391px] flex-col items-start justify-center overflow-clip">
          <p className="body-24 whitespace-pre-wrap text-sand">
            Detection finds the identifiers. Extractors open the attachments.
            Policy turns the findings into a verdict. The audit log records what
            was decided.
          </p>
        </div>
      </div>

      <FeatureGrid />

      <div className="grid w-full max-w-[1720px] grid-cols-1 items-center justify-center gap-x-[30px] gap-y-10 lg:grid-cols-[665px_665px] lg:gap-y-[88px]">
        <div className="flex items-center justify-center gap-6">
          <h2 className="pixel-80 -ml-[2px] text-blue">PHI</h2>
          <div className="h-px flex-1 bg-stone" />
        </div>
        <div className="flex max-w-[1220px] flex-col items-start justify-between gap-8 tab:flex-row tab:gap-0 overflow-clip">
          <p className="mono-16 max-w-[265px] whitespace-pre-wrap text-stone">
            Corpus [119 documents]: measured
            <br />
            0.9826 entity F1, 0 false alarms on clean mail
          </p>
          <Button
            href={links.createAccount}
            variant="bare"
            size="lg"
            className="w-[400px] max-w-full shrink-0"
          >
            Get started
          </Button>
        </div>
      </div>
    </section>
  );
}
