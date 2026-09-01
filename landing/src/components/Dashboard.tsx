import DashboardDemo from "./demo/DashboardDemo";
import Lottie from "./ui/Lottie";
import WindowFrame from "./ui/WindowFrame";

export default function Dashboard() {
  return (
    <section className="relative z-[2] flex w-full flex-col items-center justify-center gap-10 overflow-x-clip bg-ink px-5 tab:px-0">
      {/* phone */}
      <div className="relative z-[2] hidden w-full max-w-[350px] items-start justify-center bg-ink">
        <img
          src="/img/dash-phone-l.svg"
          alt=""
          className="absolute right-full top-0 h-full w-[172px] max-w-none object-cover"
          aria-hidden
        />
        <WindowFrame title="tryblade.in">
          <DashboardDemo scale={0.3121} />
        </WindowFrame>
        <img
          src="/img/dash-phone-r.svg"
          alt=""
          className="absolute left-full top-0 h-full w-[172px] max-w-none object-cover"
          aria-hidden
        />
      </div>

      {/* tablet */}
      <div className="relative z-[2] hidden w-full max-w-[1440px] items-start justify-center tab:flex desk:hidden">
        <img
          src="/img/dash-tab-l.svg"
          alt=""
          className="absolute right-full top-0 h-full w-[178px] max-w-none object-cover"
          aria-hidden
        />
        <WindowFrame title="tryblade.in">
          <DashboardDemo scale={0.6491} />
        </WindowFrame>
        <img
          src="/img/dash-tab-r.svg"
          alt=""
          className="absolute left-full top-0 h-full w-[178px] max-w-none object-cover"
          aria-hidden
        />
      </div>

      {/* desktop */}
      <div className="relative hidden w-full max-w-[1440px] items-center justify-center gap-[10px] desk:flex">
        <div className="relative z-[2] w-full max-w-[1160px]">
          <WindowFrame title="tryblade.in">
            <DashboardDemo />
          </WindowFrame>
          <div
            className="pointer-events-none absolute left-[calc(100%+4px)] top-[2px] z-[1] h-[708px] w-[1039px]"
            aria-hidden
          >
            <Lottie
              src="/lottie/ZsD5vqROEsFOS7rGPiFym5Ty1QI.json"
              speed={0.5}
              className="h-full w-full"
            />
          </div>
          <div
            className="pointer-events-none absolute right-full top-[2px] z-[1] h-[708px] w-[1039px]"
            aria-hidden
          >
            <Lottie
              src="/lottie/sMAZuGRlCNtQuqNrSXnGS4fLNs.json"
              speed={0.5}
              className="h-full w-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
