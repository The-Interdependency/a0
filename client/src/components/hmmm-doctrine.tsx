import { Shield } from "lucide-react";

export default function HmmmDoctrine() {
  return (
    <div className="border-t border-border bg-card/50 px-4 py-1.5 flex-shrink-0" data-testid="hmmm-doctrine">
      <div className="max-w-lg mx-auto flex items-center gap-2">
        <Shield className="w-3 h-3 text-primary flex-shrink-0" />
        <span className="text-[9px] text-muted-foreground truncate">
          <span className="font-bold text-primary uppercase tracking-wider">hmmm</span>
          {" "}When uncertain, pause. When conflicted, disclose. No silent fallback. That is a0p.
        </span>
      </div>
    </div>
  );
}
