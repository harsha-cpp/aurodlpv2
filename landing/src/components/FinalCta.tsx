import Button from "./ui/Button";
import Lottie from "./ui/Lottie";
import { links } from "@/lib/links";

export default function FinalCta() {
  return (
    <section className="relative flex w-full flex-col items-center justify-center gap-10 overflow-clip bg-ink-4 px-5 pb-[110px] pt-[96px] tab:px-10 tab:pb-[168px] tab:pt-[148px]">
      <div className="relative z-[2] flex w-full max-w-[856px] flex-col items-start justify-start gap-[70px] overflow-clip">
        <div className="flex w-full flex-col items-center justify-center gap-[50px]">
          <div className="flex w-full flex-col items-center justify-center gap-10">
            <h4 className="max-w-[586px] whitespace-pre-wrap text-center font-rsm text-[40px] tab:text-[68px] desk:text-[100px] leading-[1.06] desk:leading-[90px] tracking-[-1px] desk:tracking-[-3px] text-cream">
              Stop the accidental send
            </h4>
            <p className="body-24 max-w-[505px] whitespace-pre-wrap text-center text-cream">
              One Chrome extension, two enforcement paths, one policy and one
              audit log.
            </p>
          </div>
          <div className="flex flex-col tab:flex-row w-full items-center justify-center gap-4 tab:gap-5 overflow-clip">
            <Button
              href={links.createAccount}
              variant="primary"
              size="lg"
              className="w-full max-w-[326px]"
            >
              Get started
            </Button>
            <Button
              href={links.signIn}
              variant="outline"
              size="lg"
              className="w-full max-w-[326px]"
            >
              Sign in
            </Button>
          </div>
        </div>
      </div>

      <div
        className="absolute inset-y-0 left-[-360px] right-[-360px] z-[1] flex flex-col items-center justify-center overflow-clip"
        aria-hidden
      >
        <div
          className="relative z-[1] h-[728px] w-[1920px] shrink-0"
          style={{ marginTop: -2 }}
        >
          <Lottie
            src="/lottie/lRDnbXTITkiBDc2ph76DTQM39g.json"
            speed={0.5}
            className="h-full w-full"
          />
        </div>
      </div>
    </section>
  );
}
