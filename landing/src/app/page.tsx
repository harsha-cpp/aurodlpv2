import Bottleneck from "@/components/Bottleneck";
import CoordinationLayer from "@/components/CoordinationLayer";
import Dashboard from "@/components/Dashboard";
import Features from "@/components/Features";
import FinalCta from "@/components/FinalCta";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import HowItWorks, { Stripes } from "@/components/HowItWorks";
import Integrations from "@/components/Integrations";
import LogoStrip from "@/components/LogoStrip";
import Nav from "@/components/Nav";
import Roi from "@/components/Roi";
import UseCases from "@/components/UseCases";

export default function Home() {
  return (
    <div
      id="main"
      className="relative flex w-full flex-col items-center overflow-clip bg-ink"
    >
      <Nav />
      <Hero />
      <Dashboard />
      <LogoStrip />
      <Bottleneck />
      <Stripes />
      <HowItWorks />
      <Features />
      <Roi />
      <CoordinationLayer />
      <UseCases />
      <Integrations />
      <FinalCta />
      <Footer />
    </div>
  );
}
