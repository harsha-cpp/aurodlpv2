const formats = [
  "PDF",
  "DOCX",
  "XLSX",
  "XLS",
  "PPTX",
  "RTF",
  "CSV",
  "TXT",
  "EML",
  "ZIP",
  "JPG",
];

export default function Integrations() {
  return (
    <section
      id="integrations"
      className="flex w-full flex-col items-center justify-center gap-10 overflow-clip px-5 tab:px-10 pb-[200px] pt-[180px]"
    >
      <div className="flex w-full max-w-[1175px] flex-col items-start justify-start gap-[70px] overflow-clip">
        <div className="flex w-full items-start justify-center gap-8">
          <h4 className="whitespace-pre-wrap text-center font-rsm text-[48px] leading-[57.6px] tracking-[-1.44px] text-cream">
            Blade reads the subject, the body and every attachment. Scanned
            pages go through OCR, and a file is classified by its content
            signature rather than by its name.
          </h4>
        </div>
        <div className="flex w-full items-center justify-center gap-6 overflow-clip">
          {formats.map((f) => (
            <div
              key={f}
              className="relative flex h-14 w-14 shrink-0 items-center justify-center"
            >
              <span className="mono-16 whitespace-pre text-sand">{f}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
