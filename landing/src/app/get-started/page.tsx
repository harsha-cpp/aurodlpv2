import type { Metadata } from "next";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import Button from "@/components/ui/Button";
import Reveal from "@/components/ui/Reveal";
import { links } from "@/lib/links";

export const metadata: Metadata = {
  title: "Get started with Blade",
  description:
    "Create an organization, link the Chrome extension with your organization code, classify your domains, and send a test message through Blade.",
};

type Step = {
  n: string;
  title: string;
  body: string;
  detail: string;
};

const steps: Step[] = [
  {
    n: "01",
    title: "Create your organization",
    body: "The signup form takes an organization name, your work email, and a password of at least 12 characters. One call creates the organization and its owner, signs you in, and lands you on the onboarding page.",
    detail:
      "Common passwords are rejected. If the email or the organization already exists, sign in instead.",
  },
  {
    n: "02",
    title: "Find your organization code",
    body: "The onboarding page shows the code as soon as the account exists. Afterwards it lives in the dashboard under Settings, in the Organization code card, with a copy button next to it.",
    detail:
      "It reads BLD- followed by the code, and it is visible to owners and admins only. Treat it as a credential: anything holding it can submit and read scan traffic for your organization. Regenerating it unlinks every install you have already set up.",
  },
  {
    n: "03",
    title: "Install the Chrome extension and link it",
    body: "Build the extension, open chrome://extensions, turn on Developer mode, choose Load unpacked, and select frontend/packages/extension/dist. Then click the Blade toolbar icon, paste the organization code under Organization code, and press Link.",
    detail:
      "Chrome 120 or newer. The manifest is generated at build time, so build before loading: VITE_BACKEND_URL=http://localhost:8000 pnpm --filter @bladedlp/extension build. The popup status card changes from Not linked yet to protection on for your organization, which is how you know the link took.",
  },
  {
    n: "04",
    title: "Classify your domains",
    body: "Open Approved domains and add a row for each domain that matters, with a direction of sender, recipient, or both, and a classification of internal, partner, or blocked. Recipient classification is what the policy rules react to.",
    detail:
      "The field accepts a full email address as well as a bare domain. Add the address you send from as a sender row classified internal, or every message carrying a detection is blocked by the unapproved sender rule before the rest of the policy is reached.",
  },
  {
    n: "05",
    title: "Send a test message and read the verdict",
    body: "Send a message with patient identifiers from the linked account. The same body gets three different answers: allowed to a recipient on your internal or partner list, held for review when it is high risk to a personal mailbox, and refused outright to a domain you classified as blocked.",
    detail:
      "Held messages wait in Quarantine until someone approves or rejects them, and the sending tab picks the decision up within a few seconds. Every scan shows up on the dashboard overview under Recent events, with its action and where it happened, and in the audit log.",
  },
];

const prerequisites: [string, string][] = [
  [
    "Dashboard and API",
    "The dashboard runs at " +
      links.appUrl +
      " and talks to the API on port 8000.",
  ],
  [
    "Chrome",
    "Chrome 120 or newer, with developer mode available for loading an unpacked extension.",
  ],
  [
    "Open signup",
    "The API has to allow open signup for you to create the first organization yourself.",
  ],
];

export default function GetStarted() {
  return (
    <div
      id="main"
      className="relative flex w-full flex-col items-center overflow-clip bg-ink"
    >
      <Nav />

      <section className="relative flex w-full max-w-[1460px] flex-col items-center justify-center gap-10 px-5 pb-[70px] pt-[140px] tab:px-10 tab:pt-[168px]">
        <div className="flex w-full max-w-[900px] flex-col items-center justify-center gap-4 tab:gap-8">
          <Reveal
            mode="mount"
            duration={1}
            distance={0}
            ease="var(--ease-framer)"
          >
            <p className="eyebrow text-blue">Get started</p>
          </Reveal>
          <Reveal
            mode="mount"
            delay={0.15}
            duration={1.2}
            distance={0}
            ease="var(--ease-framer)"
          >
            <h1 className="h2-72 whitespace-pre-wrap text-center text-cream">
              From nothing to a protected inbox
            </h1>
          </Reveal>
          <Reveal
            mode="mount"
            delay={0.3}
            duration={1.2}
            distance={0}
            ease="var(--ease-framer)"
            className="flex max-w-[720px] flex-col"
          >
            <p className="body-24 whitespace-pre-wrap text-center text-sand">
              Five steps. Create the organization, link one browser, tell Blade
              who you are allowed to email, then watch a message be scanned
              before it leaves.
            </p>
          </Reveal>
        </div>

        <Reveal
          mode="mount"
          delay={0.45}
          duration={1.2}
          distance={0}
          ease="var(--ease-framer)"
          className="flex w-full flex-col items-center justify-center gap-4 tab:flex-row tab:gap-5"
        >
          <Button
            href={links.createAccount}
            variant="primary"
            size="lg"
            className="w-full max-w-[326px]"
          >
            Create an account
          </Button>
          <Button
            href={links.signIn}
            variant="outline"
            size="lg"
            className="w-full max-w-[326px]"
          >
            Sign in
          </Button>
        </Reveal>
      </section>

      <div className="w-full bg-ink-2">
        <div className="border-y border-stone/50">
          <div className="mx-auto grid max-w-[1440px] grid-cols-1 tab:grid-cols-3 lg:max-w-[1800px]">
            {prerequisites.map(([label, body], i) => (
              <div
                key={label}
                className={`flex flex-col gap-3 px-5 py-8 tab:px-8 tab:py-12 ${
                  i > 0
                    ? "border-t border-stone/50 tab:border-l tab:border-t-0"
                    : ""
                }`}
              >
                <p className="mono-16 text-blue">{label}</p>
                <p className="font-rsr text-[16px] leading-[24px] tracking-[-0.32px] text-cream/60 lg:text-[20px] lg:leading-[30px] lg:tracking-[-0.4px]">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="flex w-full flex-col items-center justify-center gap-10 overflow-clip px-5 pb-[70px] pt-20 tab:px-5 tab:py-[120px] desk:px-10 lg:py-40">
        <div className="flex w-full max-w-[1360px] flex-col items-start justify-center gap-4 tab:gap-8 lg:max-w-[1720px]">
          <p className="eyebrow text-blue">The path</p>
          <h2 className="h2-72 whitespace-pre-wrap text-cream">
            What you actually do
          </h2>
        </div>

        <div className="flex w-full max-w-[1360px] flex-col lg:max-w-[1720px]">
          {steps.map((step, i) => (
            <Reveal key={step.n} delay={i * 0.05} duration={0.9} distance={16}>
              <div
                className={`flex w-full flex-col gap-6 py-10 tab:gap-10 desk:grid desk:grid-cols-[120px_1fr_1fr] desk:gap-10 ${
                  i > 0 ? "border-t border-stone/50" : ""
                }`}
              >
                <p className="eyebrow text-stone">{step.n}</p>
                <h3 className="max-w-[505px] whitespace-pre-wrap font-rsm text-[24px] leading-[28.8px] tracking-[-0.72px] text-cream lg:text-[32px] lg:leading-[38.4px] lg:tracking-[-0.96px]">
                  {step.title}
                </h3>
                <div className="flex max-w-[640px] flex-col gap-4">
                  <p className="body-20 whitespace-pre-wrap text-sand">
                    {step.body}
                  </p>
                  <p className="font-rsr text-[14px] leading-[22px] tracking-[-0.28px] text-stone lg:text-[16px] lg:leading-[26px] lg:tracking-[-0.32px]">
                    {step.detail}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="relative flex w-full flex-col items-center justify-center gap-10 overflow-clip bg-ink-4 px-5 pb-[120px] pt-[100px] tab:px-10 tab:pb-[168px] tab:pt-[148px]">
        <div className="flex w-full max-w-[856px] flex-col items-center justify-center gap-[50px]">
          <div className="flex w-full flex-col items-center justify-center gap-8">
            <h2 className="h2-72 max-w-[586px] whitespace-pre-wrap text-center text-cream">
              Start with one inbox
            </h2>
            <p className="body-24 max-w-[560px] whitespace-pre-wrap text-center text-sand">
              The account and the code take a minute. Everything after that
              happens in the browser, so nothing you send has to leave the
              machine to be checked.
            </p>
          </div>
          <div className="flex w-full flex-col items-center justify-center gap-4 tab:flex-row tab:gap-5">
            <Button
              href={links.createAccount}
              variant="primary"
              size="lg"
              className="w-full max-w-[326px]"
            >
              Create an account
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
      </section>

      <Footer />
    </div>
  );
}
