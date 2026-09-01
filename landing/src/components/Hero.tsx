import LogoHeading from "./LogoHeading";
import Button from "./ui/Button";
import Reveal from "./ui/Reveal";
import { links } from "@/lib/links";

export default function Hero() {
  return (
    <section
      id="hero"
      className="relative flex w-full max-w-[2560px] flex-col items-start justify-center gap-8 px-4 pb-[80px] pt-[130px] tab:px-4 tab:pt-[150px] lg:px-5"
    >
      <div className="w-full max-w-[860px]">
        <LogoHeading text="Nothing leaves without a check" align="left" />
      </div>

      <Reveal
        mode="mount"
        delay={0.4}
        duration={1.2}
        distance={0}
        ease="var(--ease-framer)"
        className="flex w-full max-w-[620px] flex-col"
      >
        <p className="body-20 whitespace-pre-wrap text-left text-sand">
          Patient identifiers do not leave the browser. Gmail sends are scanned
          before they go, and every other text box is guarded as it is typed
          into.
        </p>
      </Reveal>

      <Reveal
        mode="mount"
        delay={0.6}
        duration={1.2}
        distance={0}
        ease="var(--ease-framer)"
        className="flex w-full flex-col items-start gap-3 tab:flex-row tab:gap-4"
      >
        <Button
          href={links.createAccount}
          variant="primary"
          size="sm"
          className="w-full tab:w-auto"
        >
          Get started
        </Button>
        <Button
          href={links.signIn}
          variant="outline"
          size="sm"
          className="w-full tab:w-auto"
        >
          Sign in
        </Button>
      </Reveal>
    </section>
  );
}
