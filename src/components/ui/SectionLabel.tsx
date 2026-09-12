/**
 * SectionLabel — small caps label (login-page brand-name style).
 *
 * `text-[11px] font-medium uppercase tracking-[0.2em] text-muted`.
 *
 * Dipakai untuk section headers, form group labels, subtle brand markers.
 * Tidak buat body text — terlalu tight untuk paragraph.
 *
 * Rendered sebagai `<p>` by default; caller boleh override via `as` prop.
 */

import type { ElementType, ReactNode } from "react";

export type SectionLabelProps<T extends ElementType = "p"> = {
  as?: T;
  children: ReactNode;
  className?: string;
};

export default function SectionLabel<T extends ElementType = "p">({
  as,
  children,
  className,
}: SectionLabelProps<T>) {
  const Tag = (as ?? "p") as ElementType;
  return (
    <Tag
      className={`text-[11px] font-medium uppercase tracking-[0.2em] text-(--color-text-muted)${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </Tag>
  );
}
