import Link from "next/link";
import type { ReactNode } from "react";
import { APP_URL } from "@/lib/links";

type Props = {
  href: string;
  variant?: "primary" | "outline" | "bare" | "navcta" | "ghost";
  size?: "lg" | "md" | "sm" | "nav" | "navsm";
  className?: string;
  children: ReactNode;
};

export default function Button({
  href,
  variant = "primary",
  size = "lg",
  className = "",
  children,
}: Props) {
  const cls = `btn btn-${variant} btn-${size} ${className}`;
  const inner = <span className="relative">{children}</span>;

  if (href.startsWith("/") || href.startsWith("#")) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }

  const external = /^https?:/.test(href) && !href.startsWith(APP_URL);
  return (
    <a
      href={href}
      className={cls}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {inner}
    </a>
  );
}
