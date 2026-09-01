import LeakChart from "./ui/LeakChart";

export default function Bottleneck() {
  return (
    <section
      id="coordination"
      className="relative flex w-full flex-col items-center justify-center gap-10 overflow-clip px-5 pb-[70px] pt-20 tab:px-5 tab:py-[120px] desk:px-10 lg:py-40"
    >
      <div className="flex w-full max-w-[1360px] flex-col justify-center gap-[30px] overflow-clip desk:grid desk:grid-cols-2 desk:gap-x-10 desk:gap-y-[10px] lg:max-w-[1720px] lg:grid-cols-[660px_660px] lg:justify-center">
        <div className="flex max-w-[700px] flex-col items-start justify-center gap-[30px] overflow-clip tab:gap-10 desk:gap-16 lg:gap-10">
          <div className="flex w-full flex-col items-start justify-center gap-4 tab:gap-8">
            <p className="eyebrow text-blue">The surface changed</p>
            <h2 className="h2-72 whitespace-pre-wrap text-cream">
              Email was the leak. Now the text box is one too.
            </h2>
          </div>
          <p className="body-24 max-w-[460px] whitespace-pre-wrap text-sand desk:max-w-[410px] lg:max-w-[460px]">
            Hospitals run on Gmail and cannot switch it off. The same staff now
            paste discharge notes and lab reports into browser AI tools to
            summarise them. No email control sees that text leave.
          </p>
        </div>

        <div
          className="relative w-full self-start desk:self-start"
          style={{ aspectRatio: "840 / 490" }}
        >
          <LeakChart className="absolute inset-0" />
        </div>
      </div>
    </section>
  );
}
