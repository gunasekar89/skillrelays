import { Link } from "react-router-dom";
import { brand } from "../lib/brand";

export function Logo({ light = false, to = "/" }: { light?: boolean; to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2" aria-label={`${brand.name} ${brand.suffix} home`}>
      <img src="/logo.svg" alt="" className="h-8 w-8" />
      <span className={`text-lg font-bold tracking-tight ${light ? "text-white" : "text-navy"}`}>
        {brand.name} <span className={light ? "text-teal" : "text-brand"}>{brand.suffix}</span>
      </span>
    </Link>
  );
}
