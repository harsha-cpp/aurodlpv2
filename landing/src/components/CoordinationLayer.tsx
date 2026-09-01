import Button from "./ui/Button";
import Lottie from "./ui/Lottie";
import { links } from "@/lib/links";

function Label({
  line1,
  line2,
  align = "left",
}: {
  line1: string;
  line2: string;
  align?: "left" | "right";
}) {
  return (
    <div
      className={`flex w-[100px] flex-col ${align === "right" ? "text-right" : ""}`}
    >
      <p className="font-mono text-[16px] leading-[17.6px] tracking-[-0.48px] text-stone">
        {line1}
      </p>
      <p className="font-mono text-[16px] leading-[17.6px] tracking-[-0.48px] text-stone">
        {line2}
      </p>
    </div>
  );
}

const Dot = () => (
  <span className="block h-5 w-5 rounded-full bg-stone" aria-hidden />
);

export default function CoordinationLayer() {
  return (
    <>
      <section
        id="coordination-layer"
        className="flex w-full max-w-[1800px] flex-col items-center justify-center gap-10 overflow-clip px-5 tab:px-10 pt-40"
      >
        <div className="flex w-full max-w-[1720px] items-end justify-start gap-x-10 gap-y-[10px] overflow-clip">
          <div className="flex w-full flex-col items-start justify-center gap-8 pb-[76px]">
            <p className="eyebrow text-blue">the honest edge</p>
            <h3 className="max-w-[1360px] whitespace-pre-wrap font-rsm text-[40px] tab:text-[68px] desk:text-[104px] leading-[1.05] desk:leading-[104px] tracking-[-3.12px] text-cream">
              Text with no identifier in it is not detected
            </h3>
          </div>
        </div>
      </section>

      <div className="relative grid w-full grid-cols-1 justify-center overflow-clip lg:grid-cols-[720px_720px]">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-stone"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-stone"
          aria-hidden
        />

        {/* left cell */}
        <div className="relative flex max-w-[900px] items-end justify-start overflow-clip p-10">
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-px bg-stone"
            aria-hidden
          />
          <div className="flex w-full flex-col items-center justify-center gap-40">
            <div className="flex w-full items-start justify-center gap-20">
              <p className="body-24 w-[280px] max-w-[350px] whitespace-pre-wrap text-sand">
                Detection matches spans. A note saying the patient in bed 7
                became oliguric overnight carries no Aadhaar number, no MRN and
                no name. It scores 0.0 and it is allowed.
              </p>
              <p className="body-24 w-[280px] max-w-[350px] whitespace-pre-wrap text-sand">
                The extension is a deterrent against an accidental send, not a
                guarantee. Mobile Gmail, a second browser and a disabled
                extension all route around it.
              </p>
            </div>
            <div className="w-full">
              <div className="grid grid-cols-1 items-start justify-center gap-x-20 gap-y-8 tab:grid-cols-[280px_280px]">
                <h4 className="whitespace-pre-wrap font-rsm text-[32px] leading-[28.8px] tracking-[-0.96px] text-stone">
                  {"Known\nlimits"}
                </h4>
                <p className="mono-16 max-w-[200px] whitespace-pre-wrap text-stone">
                  {"Documented up front,\nnot discovered later"}
                </p>
              </div>
              <Button
                href={links.createAccount}
                variant="primary"
                size="md"
                className="mt-[64px] w-full max-w-[1360px]"
              >
                Get started
              </Button>
            </div>
          </div>
        </div>

        {/* right cell */}
        <div className="relative flex items-center justify-start p-10">
          <div className="relative z-[4] flex w-full flex-col items-center overflow-clip">
            <div className="relative z-[1] h-[410px] w-[410px]">
              <Lottie
                src="/lottie/A8mAuTrWvh01u3LYmDSoNcsQAvA.json"
                speed={0.5}
                className="h-full w-full"
              />
            </div>
          </div>

          <div className="absolute inset-y-0 left-0 z-[3] flex w-[240px] flex-col overflow-clip p-10">
            <div className="flex w-[160px] flex-1 flex-col items-start justify-between">
              <Label line1="Clinical" line2="narrative" />
              <Dot />
              <Dot />
              <Label line1="Mobile" line2="Gmail" />
            </div>
          </div>
          <div className="absolute inset-0 z-[3] flex flex-col overflow-clip p-10">
            <div className="flex w-full flex-1 flex-col items-end justify-between">
              <Label line1="chrome://" line2="pages" align="right" />
              <Dot />
              <Dot />
              <Label line1="A second" line2="browser" align="right" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
