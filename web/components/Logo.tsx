import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span
        lang="dv"
        className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#2E382D] font-thaana text-[22px] leading-none text-[#97FE33]"
        aria-hidden
      >
        ހ
      </span>
      <span className="font-display text-lg font-bold">MyAkuru</span>
    </Link>
  );
}
