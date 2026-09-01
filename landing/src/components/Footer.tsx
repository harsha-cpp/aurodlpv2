import Link from "next/link";
import { links as appLinks } from "@/lib/links";
import Button from "./ui/Button";
import Lottie from "./ui/Lottie";
import BladeMark from "./ui/BladeMark";

const primary: [string, string, string][] = [
  ["How it works", "#howitworks", "01"],
  ["Why Blade", "#features", "02"],
  ["Use cases", "#usecase", "03"],
  ["Get started", appLinks.getStarted, "04"],
];

export default function Footer() {
  return (
    <footer className="w-full">
      <div className="flex w-full flex-col items-center justify-center gap-10 overflow-clip bg-ink px-5 py-16 tab:px-10 tab:py-20">
        <div className="relative z-[2] grid w-full max-w-[1720px] grid-cols-1 justify-center gap-y-10 overflow-clip desk:grid-cols-3">
          <div className="flex flex-col items-start justify-start gap-[70px] overflow-clip">
            <div className="flex w-full flex-col items-start justify-between gap-10 desk:min-h-[314px] desk:gap-0 desk:pr-10">
              <div className="flex flex-col items-start justify-center gap-10">
                <div className="flex items-center justify-start gap-4">
                  <div className="relative h-[90px] w-[90px] overflow-hidden">
                    <BladeMark size={90} color="#7c7b77" />
                  </div>
                </div>
                <p className="body-20 max-w-[310px] whitespace-pre-wrap text-stone">
                  Blade checks outgoing email and web input for patient data in
                  the browser, before anything leaves the machine.
                </p>
              </div>
              <p className="body-20 whitespace-pre-wrap text-stone">Blade</p>
            </div>
          </div>

          <div className="flex flex-col items-start justify-start gap-[70px] overflow-clip desk:px-10 desk:shadow-[inset_1px_0_0_rgba(124,123,119,0.5),inset_-1px_0_0_rgba(124,123,119,0.5)]">
            <div className="flex w-full flex-col items-center justify-between">
              {primary.map(([label, href, n], i) => (
                <div
                  key={label}
                  className={`flex w-full items-start justify-between ${i === 0 ? "pb-4" : "py-4"} ${
                    i < primary.length - 1
                      ? "shadow-[inset_0_-1px_0_rgba(124,123,119,0.5)]"
                      : ""
                  }`}
                >
                  <h3 className="max-w-[505px] whitespace-pre-wrap font-rsm text-[40px] leading-[36px] tracking-[-1.2px] text-cream tab:text-[56px] tab:leading-[50.4px] tab:tracking-[-1.68px]">
                    {href.startsWith("/") ? (
                      <Link href={href} className="footlink">
                        {label}
                      </Link>
                    ) : (
                      <a href={href} className="footlink">
                        {label}
                      </a>
                    )}
                  </h3>
                  <p className="eyebrow whitespace-pre-wrap text-stone">
                    <strong className="font-black">{n}</strong>
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-start justify-start gap-[70px] overflow-clip desk:pl-10 desk:pt-[13px]">
            <div className="flex w-full flex-col items-start justify-between gap-10 desk:min-h-[301px] desk:gap-0">
              <div className="flex flex-col items-start justify-center gap-4">
                <h5 className="whitespace-pre-wrap font-rsr text-[16px] font-normal leading-[14.4px] tracking-[-0.48px] text-stone">
                  Start protecting an inbox
                </h5>
                <p className="body-20 max-w-[310px] whitespace-pre-wrap text-stone">
                  Create an organization, link the Chrome extension with your
                  organization code, and the next message out is scanned.
                </p>
              </div>
              <div className="flex w-full max-w-[326px] flex-col items-start justify-center gap-4">
                <Button
                  href={appLinks.createAccount}
                  variant="primary"
                  size="md"
                  className="w-full"
                >
                  Create an account
                </Button>
                <Button
                  href={appLinks.signIn}
                  variant="outline"
                  size="md"
                  className="w-full"
                >
                  Sign in
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex w-full flex-col items-center justify-center gap-10 overflow-clip bg-ink px-5 pb-10 pt-12 tab:px-10">
        <div
          className="absolute left-1/2 top-0 z-0 h-[423px] w-[2376px] -translate-x-1/2 opacity-50"
          aria-hidden
        >
          <Lottie
            src="/lottie/5fDlPxJcjgMheil2cpUT0707U.json"
            mode="once"
            threshold={0.05}
            className="h-full w-full"
          />
        </div>
        <div className="relative z-[1] w-full max-w-[1720px]">
          <img
            src="/img/footer-shape.svg"
            alt=""
            width={1380}
            height={340}
            className="h-auto w-full"
          />
        </div>
      </div>
    </footer>
  );
}
