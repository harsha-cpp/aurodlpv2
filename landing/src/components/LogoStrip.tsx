const systems: string[] = [
  "Chrome MV3",
  "Google Workspace",
  "Gmail",
  "ABDM / ABHA",
  "ICD-10-CM",
  "Aadhaar Verhoeff",
  "GSTIN mod-36",
];

export default function LogoStrip() {
  return (
    <section className="flex w-full flex-col items-center justify-center gap-10 overflow-clip px-0 py-8 tab:px-5 lg:p-10">
      <div className="flex w-full max-w-[1720px] flex-col items-center justify-center gap-5 overflow-clip tab:gap-8 lg:flex-row lg:items-center lg:gap-16 lg:pr-10">
        <p className="mono-16 shrink-0 whitespace-pre text-stone">
          works with:
        </p>

        {/* phone: a marquee, since the row can't fit. tablet+: a static spread. */}
        <div className="w-full overflow-clip tab:hidden">
          <div className="flex w-max animate-[marquee_28s_linear_infinite] items-center gap-10 opacity-50">
            {[0, 1].map((copy) => (
              <div
                key={copy}
                className="flex shrink-0 items-center gap-10"
                aria-hidden={copy === 1}
              >
                {systems.map((s) => (
                  <span
                    key={s}
                    className="mono-16 shrink-0 whitespace-pre text-cream"
                  >
                    {s}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 items-center justify-between overflow-clip rounded-[10px] opacity-50 tab:flex">
          {systems.map((s) => (
            <span key={s} className="mono-16 whitespace-pre text-cream">
              {s}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
