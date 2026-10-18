import { Link } from "@tanstack/react-router";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <img
      src="/jobgenesis-mark.png"
      alt=""
      aria-hidden="true"
      className={`size-8 object-contain ${className}`}
    />
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
