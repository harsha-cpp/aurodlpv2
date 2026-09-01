import Bars from "./ui/Bars";
import Button from "./ui/Button";
import Lottie from "./ui/Lottie";
import Scramble from "./ui/Scramble";
import { links } from "@/lib/links";

const rows: [string, string][] = [
  ["0.9826", "entity f1 across 175 labelled spans"],
  ["0.9936", "document f1 across 119 documents"],
  ["0", "false alarms on the 40 clean mail samples"],
];

export default function Roi() {
  return (
    <section
      id="roi"
      className="relative flex w-full flex-col items-center justify-center gap-10 overflow-clip px-5 tab:px-10"
    >
      <div className="flex w-full max-w-[1720px] flex-col items-stretch justify-center gap-x-10 gap-y-10 overflow-clip lg:flex-row lg:items-end">
        {/* left column */}
        <div className="flex w-full flex-col items-start justify-center gap-12 pt-10 lg:w-[660px] lg:shrink-0 lg:gap-24 lg:pt-[102px]">
          <div className="flex w-full flex-col items-center justify-center gap-20 overflow-clip">
            <div className="flex w-full flex-col items-start justify-center gap-8">
              <p className="eyebrow text-blue">measured accuracy</p>
              <h3 className="display-140 whitespace-pre-wrap text-cream">
                Measured, not asserted
              </h3>
            </div>
            <div className="flex w-full flex-col items-center justify-center overflow-clip">
              {rows.map(([label, value], i) => (
                <div
                  key={label}
                  className={`flex w-full items-start justify-between py-2 ${i < rows.length - 1 ? "shadow-[inset_0_-1px_0_#7c7b77]" : ""}`}
                >
                  <div className="flex items-center pr-4">
                    <p className="mono-16 whitespace-pre text-cream">{label}</p>
                  </div>
                  <div className="flex min-w-0 flex-1 opacity-70">
                    <Scramble
                      text={value}
                      className="font-mono text-right text-[16px] leading-[19.2px] text-sand"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex w-full flex-col items-start justify-center gap-[30px]">
            <div className="flex flex-col items-start gap-[11px]">
              <h2 className="pixel-100 -ml-[2px] text-stone">119</h2>
              <p className="eyebrow text-stone">documents</p>
            </div>
            <Bars width={673} height={50} stroke={1} gap={10} color="#faf9f5" />
          </div>
        </div>

        {/* right column */}
        <div className="relative flex w-full flex-col items-start justify-end self-stretch lg:w-[660px] lg:shrink-0 lg:items-end">
          <div
            className="absolute left-[95px] top-[45px] z-[1] h-[787px] w-[432px]"
            aria-hidden
          >
            <Lottie
              src="/lottie/SIDxpN657ABYwDArLR875v4sCI.json"
              speed={0.5}
              className="h-full w-full"
            />
          </div>
          <div className="relative z-[2] flex flex-col items-end gap-[11px]">
            <h2 className="pixel-100 text-blue">175</h2>
            <p className="eyebrow text-blue">labelled spans</p>
          </div>
          <div
            id="wpqs9h"
            className="relative z-[2] mt-[30px] w-full overflow-hidden"
          >
            <div className="relative flex items-stretch gap-[30px] bg-blue px-5 py-7">
              <span className="absolute left-5 top-7 block h-5 w-5 rounded-full bg-ink" />
              <span className="absolute right-5 top-7 block h-5 w-5 rounded-full bg-ink" />
              <span className="absolute bottom-7 left-5 block h-5 w-5 rounded-full bg-ink" />
              <span className="absolute bottom-7 right-5 block h-5 w-5 rounded-full bg-ink" />
              <div
                className="no-ft w-auto shrink-0 whitespace-nowrap pl-4 text-[84px] font-normal leading-[84px] tracking-[-2.5px] text-ink tab:w-[428px] tab:pl-8 tab:text-[164px] tab:leading-[131.2px] tab:tracking-[-4.92px]"
                style={{ fontFamily: "var(--font-rsm)" }}
              >
                100%
              </div>
              <div className="flex flex-col items-start justify-start pr-9">
                <div className="no-ft whitespace-pre-line font-sysmono text-[13px] font-semibold uppercase leading-[15.6px] tracking-[-0.39px] text-ink">
                  {"Precision\non 175 spans"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Button
        href={links.signIn}
        variant="outline"
        size="lg"
        className="w-full max-w-[1720px]"
      >
        Get started
      </Button>
    </section>
  );
}
