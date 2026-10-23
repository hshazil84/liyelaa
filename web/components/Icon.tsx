import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

/** One place that sets how every Hugeicons icon looks: thin rounded line, follows the text colour. */
export function Icon({ icon, size = 20, className }: { icon: IconSvgElement; size?: number; className?: string }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.7} className={className} aria-hidden />;
}
