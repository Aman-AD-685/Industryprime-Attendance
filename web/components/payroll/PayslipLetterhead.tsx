/** Industry Prime payslip letterhead — crisp logo + text + SVG (no low-res scans). */
export function PayslipLetterheadHeader() {
  return (
    <div className="flex items-center justify-between gap-4 px-5 pb-0.5 pt-3.5">
      <div className="flex min-w-0 items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element -- keep logo full-res, avoid optimizer soft blur */}
        <img
          src="/industryprime-logo.png"
          alt=""
          width={56}
          height={56}
          className="h-11 w-11 shrink-0 object-contain sm:h-12 sm:w-12"
          decoding="async"
        />
        <div className="leading-[0.95]">
          <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-zinc-500 sm:text-[11px]">Industry</div>
          <div className="text-[22px] font-extrabold uppercase tracking-tight text-zinc-800 sm:text-2xl">Prime</div>
        </div>
      </div>
      <a
        href="https://www.industryprime.com"
        target="_blank"
        rel="noreferrer"
        className="flex shrink-0 items-center gap-1.5 text-[11px] text-zinc-500 transition hover:text-zinc-700 sm:text-xs"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.8 2.5 15.2 0 18M12 3c-2.5 2.8-2.5 15.2 0 18" />
        </svg>
        www.industryprime.com
      </a>
    </div>
  );
}

const ACCENT = "#F15A24";

export function PayslipLetterheadFooter() {
  return (
    <div className="relative overflow-hidden bg-white px-5 pb-3 pt-2">
      <div className="relative z-10 max-w-[58%] pr-2">
        <div className="text-sm font-bold text-zinc-900">Industrify Technologies Pvt. Ltd.</div>
        <div className="mt-0.5 text-[11px] leading-snug text-zinc-600 sm:text-xs">
          2A, Ganesh Chandra Avenue, 4th Floor, Room No. 8C, Kolkata - 700001
        </div>
      </div>
      <svg
        className="pointer-events-none absolute bottom-3 right-3 h-[52px] w-[46%] sm:h-14"
        viewBox="0 0 320 72"
        fill="none"
        aria-hidden
      >
        <path
          d="M8 68 L28 68 L34 42 L42 42 L48 68 L68 68 L74 28 L86 28 L92 68 L118 68 L124 48 L136 48 L142 68 L168 68 L174 18 L188 18 L194 68 L220 68 L226 38 L240 38 L246 68 L270 68 L276 12 L290 12 L296 68 L312 68"
          stroke={ACCENT}
          strokeWidth="1.75"
          strokeLinejoin="miter"
          strokeLinecap="square"
        />
        <path d="M0 68 H320" stroke={ACCENT} strokeWidth="1.75" />
      </svg>
      <div className="mt-3 h-px w-full" style={{ backgroundColor: ACCENT }} aria-hidden />
    </div>
  );
}
