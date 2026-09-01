import Bars from "./ui/Bars";
import Lottie from "./ui/Lottie";

const steps = [
  {
    title: "Install the extension",
    body: "One Chrome extension, enrolled with the organization code. It runs on Gmail and on every other http and https page.",
    lottie: "/lottie/gZdvSWiPnLvNwfiBcP1ufyMhys.json",
  },
  {
    title: "Gmail sends are held",
    body: "Subject, body, recipients and attachments are scanned server-side, and the policy returns allow, warn, quarantine or block.",
    lottie: "/lottie/BPrTEXzHYloLgPqPs9jD7e48.json",
  },
  {
    title: "Every other text box is guarded",
    body: "Paste, keystroke, drop and autofill are checked inside the page against the same rule pack. Nothing typed is transmitted.",
    lottie: "/lottie/yZWHPh7weEFbhQunQjNjhZ5bDsk.json",
  },
  {
    title: "Reviewers see all of it",
    body: "Quarantined mail waits for an approver. Every verdict lands in an append-only audit log and in analytics split by channel.",
    lottie: "/lottie/ZY5DmucV16PbooPsEUrHlNv4bWU.json",
  },
];

export function Stripes() {
  return (
    <div
      className="relative flex h-[30px] w-full items-center justify-center overflow-clip bg-ink-2"
      aria-hidden
    >
      <Bars
        width={2880}
        height={30}
        stroke={1}
        gap={10}
        color="#7c7b77"
        className="shrink-0 opacity-50"
      />
    </div>
  );
}

export default function HowItWorks() {
  return (
    <>
      <section
        id="howitworks"
        className="flex w-full flex-col items-center justify-center gap-10 overflow-clip bg-ink-2 px-5 pb-10 pt-[90px] tab:pb-[60px] tab:pt-[110px] desk:px-10 desk:pb-[70px] desk:pt-[130px]"
      >
        <div className="flex w-full max-w-[1200px] flex-col items-center justify-center gap-4 overflow-clip tab:gap-8">
          <p className="eyebrow text-blue">How it works</p>
          <h3 className="display-140 whitespace-pre-wrap text-center text-cream">
            One extension. Two enforcement paths.
          </h3>
        </div>
      </section>

      <div className="w-full bg-ink-2">
        <div className="border-y border-stone/50">
          <div className="mx-auto grid max-w-[1440px] grid-cols-1 tab:grid-cols-2 desk:max-w-[1440px] desk:grid-cols-4 lg:max-w-[1800px]">
            {steps.map((s, i) => (
              <div
                key={s.title}
                className={`flex flex-col px-4 py-8 tab:px-6 tab:py-14 desk:px-8 ${
                  i > 0 ? "border-t border-stone/50 tab:border-t-0" : ""
                } ${
                  i % 2 === 1 ? "tab:border-l tab:border-stone/50" : ""
                } ${i >= 2 ? "tab:border-t tab:border-stone/50" : ""} ${
                  i > 0
                    ? "desk:border-l desk:border-stone/50"
                    : "desk:border-l-0"
                } ${i >= 2 ? "desk:border-t-0" : ""}`}
              >
                <div className="flex h-[76px] w-[94px] items-center">
                  <Lottie
                    src={s.lottie}
                    speed={1}
                    preserveAspectRatio="xMidYMid meet"
                    className="h-full w-full"
                  />
                </div>
                <div className="mt-10 flex flex-col gap-3 tab:gap-4">
                  <div className="font-rsm text-[24px] leading-[28.8px] tracking-[-0.72px] text-cream lg:text-[32px] lg:leading-[38.4px] lg:tracking-[-0.96px]">
                    {s.title}
                  </div>
                  <div className="font-rsr text-[16px] leading-[24px] tracking-[-0.32px] text-cream/60 lg:text-[20px] lg:leading-[30px] lg:tracking-[-0.4px]">
                    {s.body}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
