import { Link } from "react-router-dom";
import depedLogo from "@/assets/deped-logo.png";

export const Logo = ({ variant = "dark" }: { variant?: "dark" | "light" }) => {
  const text = variant === "light" ? "text-white" : "text-foreground";
  return (
    <Link to="/" className="group flex items-center gap-2">
      <div className="relative flex h-10 w-10 items-center justify-center">
        <img
          src={depedLogo}
          alt="DepEd seal"
          className="h-10 w-10 object-contain drop-shadow-sm transition-transform group-hover:scale-105"
        />
      </div>
      <div className="leading-none">
        <div className={`font-display text-base font-extrabold ${text}`}>ALAM</div>
        <div className={`text-[10px] uppercase tracking-widest ${variant === "light" ? "text-white/70" : "text-muted-foreground"}`}>DepEd - AI</div>
      </div>
    </Link>
  );
};