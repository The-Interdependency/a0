import { Shield } from "lucide-react";

export default function HmmmDoctrine() {
  return (
    <div className="border-t border-border bg-card/50 px-4 py-3" data-testid="hmmm-doctrine">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
            hmmm doctrine
          </span>
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground font-mono">
          When uncertain, pause. When conflicted, disclose. When the system cannot determine safe
          disposition, it halts — no silent fallback, no degraded mode, no implicit continuation.
          Every action flows through the hash chain. Every operator vector is measured. Every
          sentinel must pass. If any gate fails, the answer is always the same: <span className="text-foreground font-bold">hmmm</span>.
          The system does not guess. The system does not assume. The system stops and asks.
          That is the invariant. That is the doctrine. That is a0p.
        </p>
      </div>
    </div>
  );
}
