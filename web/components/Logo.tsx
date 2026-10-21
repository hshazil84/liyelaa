import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-tile.svg" alt="" width={36} height={36} className="h-9 w-9" />
      <span className="font-display text-lg font-bold">MyAkuru</span>
    </Link>
  );
}
