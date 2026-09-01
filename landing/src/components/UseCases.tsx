"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Button from "./ui/Button";
import { links } from "@/lib/links";

const rows = [
  {
    number: "01/",
    role: "Clinicians",
    eyebrow: "Doctors and nurses",
    title: "Keep working in Gmail. The check happens at send.",
    body: "Subject, body and attachments are scanned the moment send is pressed. A clean mail goes straight out. A risky one returns a warning that names the identifier types it found.",
  },
  {
    number: "02/",
    role: "Billing",
    eyebrow: "Billing and insurance desks",
    title: "Attachments are opened, not trusted by their name.",
    body: "PDF, DOCX, XLSX, PPTX, ZIP and EML are extracted and read, and scanned pages go through OCR. Files are classified by content signature, so renaming one does not skip the scan.",
  },
  {
    number: "03/",
    role: "Compliance",
    eyebrow: "Security and compliance",
    title: "An audit log that shows when a row goes missing.",
    body: "Every verdict is appended and each entry hash covers the one before it, so an edited or deleted row breaks the chain. Only masked values are stored: an Aadhaar number is kept as **********7460.",
  },
  {
    number: "04/",
    role: "IT",
    eyebrow: "IT administration",
    title: "One policy, edited with a live preview.",
    body: "Ordered first-match rules over recipient class, risk score, severity, entity type and distinct patient count. The editor shows the verdict a draft rule would return before it is saved.",
  },
];

export default function UseCases() {
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

  const reveal = (i: number): CSSProperties => ({
    opacity: shown ? 1 : 0,
    transform: shown ? "translateY(0px)" : "translateY(24px)",
    transition:
      "opacity 1s cubic-bezier(0.16, 1, 0.3, 1), transform 1s cubic-bezier(0.16, 1, 0.3, 1)",
    transitionDelay: `${i * 90}ms`,
  });

  return (
    <section
      id="usecase"
      className="no-ft flex w-full flex-col items-center justify-center overflow-clip pt-[200px]"
    >
      <div ref={ref} className="relative w-full overflow-hidden bg-ink-5">
        <div
          className="pointer-events-none absolute right-[-7px] top-[81px] h-[243px] w-[72px] select-none whitespace-nowrap font-pixel text-[80px] leading-[72px] tracking-[-2.4px] text-blue"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          aria-hidden
        >
          CASES
        </div>

        <div className="mx-auto grid max-w-[1800px] grid-cols-1 items-start gap-x-20 gap-y-10 px-5 tab:px-10 lg:grid-cols-[416px_392px_392px] lg:gap-y-0">
          <div className="pb-6 lg:row-start-1 lg:pb-10 lg:[grid-column:1/span_3]">
            <p className="font-mono text-[20px] uppercase leading-[20px] tracking-[-0.6px] text-blue">
              Built for hospital teams
            </p>
            <h2 className="mt-4 font-rsm text-[44px] tab:text-[86px] desk:text-[160px] leading-[1.02] desk:leading-[160px] tracking-[-1.2px] desk:tracking-[-4.8px] text-cream">
              Set once, enforced everywhere
            </h2>
          </div>
          <div className="flex w-full max-w-[282px] flex-col self-start pb-10 text-left lg:row-start-1 lg:self-end lg:pb-14 lg:[grid-column:3/span_1]">
            <p className="font-rsm text-[24px] font-normal leading-[33.6px] text-stone">
              Identifier types: 21
            </p>
            <p className="font-rsm text-[24px] font-normal leading-[33.6px] text-stone">
              Enforcement paths: 2
            </p>
          </div>

          {rows.map((r, i) => {
            const last = i === rows.length - 1;
            const pad = last ? "pt-[30px]" : "pb-20 pt-[30px]";
            return [
              <div
                key={`d${i}`}
                className="-mx-10 h-px bg-white/10 lg:[grid-column:1/span_3]"
              />,
              <div
                key={`a${i}`}
                className={`flex items-start gap-4 tab:gap-[54px] ${pad}`}
                style={reveal(i)}
              >
                <span className="pt-[6px] font-rsm text-[22px] leading-[26px] text-stone tab:pt-[10px] tab:text-[36px] tab:leading-[36px]">
                  {r.number}
                </span>
                <span className="font-rsm text-[34px] leading-[36px] tracking-[-0.9px] text-cream tab:whitespace-nowrap tab:text-[64px] tab:leading-[64px] tab:tracking-[-1.92px]">
                  {r.role}
                </span>
              </div>,
              <div
                key={`b${i}`}
                className={`max-w-[456px] ${pad}`}
                style={reveal(i)}
              >
                <p className="font-mono text-[16px] uppercase leading-[16px] tracking-[-0.48px] text-blue">
                  {r.eyebrow}
                </p>
                <h4 className="mt-4 font-rsm text-[26px] leading-[30px] tracking-[-0.5px] text-cream tab:text-[40px] tab:leading-[44px] tab:tracking-[-0.8px]">
                  {r.title}
                </h4>
              </div>,
              <div
                key={`c${i}`}
                className={`relative pr-0 lg:pr-12 ${pad}`}
                style={reveal(i)}
              >
                <div className="max-w-[410px]">
                  <p className="font-rsr text-[20px] leading-[30px] text-sand">
                    {r.body}
                  </p>
                </div>
                <span
                  className="absolute right-0 top-[30px] block h-5 w-5 rounded-full bg-stone"
                  aria-hidden
                />
              </div>,
            ];
          })}
        </div>
      </div>

      <div className="flex w-full flex-col items-center justify-center gap-10 overflow-clip px-10 pt-16">
        <Button
          href={links.createAccount}
          variant="primary"
          size="lg"
          className="w-full max-w-[1720px]"
        >
          Get started
        </Button>
      </div>
    </section>
  );
}
