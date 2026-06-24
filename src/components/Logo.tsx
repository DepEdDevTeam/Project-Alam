import { Link } from "react-router-dom";
import depedLogo from "@/assets/deped-logo.png";

export const Logo = ({ variant = "dark" }: { variant?: "dark" | "light" }) => {
  const text = variant === "light" ? "text-white" : "text-foreground";
  return (
    <Link to="/" className="flex items-center gap-2 group">
      <div className="relative h-10 w-10 flex items-center justify-center">
        <img
          src={depedLogo}
          alt="DepEd seal"
          className="h-10 w-10 object-contain drop-shadow-sm group-hover:scale-105 transition-transform"
        />
      </div>
      <div className="leading-none">
        <div className={`font-display font-extrabold text-base ${text}`}>ALAM</div>
        <div className={`text-[10px] uppercase tracking-widest ${variant === "light" ? "text-white/70" : "text-muted-foreground"}`}>DepEd · AI</div>
      </div>
    </Link>
  );
};
