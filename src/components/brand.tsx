import { Link } from "@tanstack/react-router";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 19V7.5A2.5 2.5 0 0 1 7.5 5H15l4 4v10a0 0 0 0 1 0 0" strokeLinejoin="round" />
        <path d="M9 12h6M9 16h4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Wordmark({ to = "/" }: { to?: "/" | "/dashboard" }) {
  return (
    <Link to={to} className="flex items-center gap-2.5">
      <Logo />
      <span className="font-display text-[15px] font-semibold tracking-tight">JobGenesis</span>
    </Link>
  );
}
