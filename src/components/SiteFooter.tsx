import Link from "next/link";

export function SiteFooter() {
  return (
   <footer className="border-t border-[#D8D0BE] bg-[#F7F1E6]">
  <div className="site-container flex flex-col items-center gap-5 py-8 text-center">
    <div className="flex flex-col items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#A3A878] bg-[#EEF0DC]">
        <span className="text-xl text-[#49633B]">🌿</span>
      </div>

      <div>
        <p className="font-display text-lg font-semibold tracking-wide text-[#354B2B]">
          Conciencia Alimentaria
        </p>

        <p className="mt-1 text-sm leading-relaxed text-[#6F745E]">
          Una mirada curiosa sobre lo que comemos.
        </p>
      </div>
    </div>
  </div>
</footer>
  );
}
