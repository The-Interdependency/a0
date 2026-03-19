import { Link } from "wouter";
import { Shield, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SplashPage() {
  return (
    <div
      className="min-h-screen bg-black text-white flex flex-col"
      data-testid="splash-page"
    >
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-lg mx-auto w-full">
        <div className="text-center space-y-8 w-full">
          <div className="space-y-2">
            <h1
              className="text-6xl sm:text-7xl font-black tracking-tighter leading-none"
              data-testid="text-agent-zero"
            >
              Agent Zero
            </h1>
            <p
              className="text-lg text-zinc-500 font-light italic"
              data-testid="text-got-ordinal"
            >
              got ordinal?
            </p>
          </div>

          <div className="space-y-1">
            <p
              className="text-2xl sm:text-3xl font-semibold tracking-wide leading-snug text-zinc-200"
              data-testid="text-values"
            >
              future code humanity
              <br />
              wealth simplicity
              <br />
              survival integrity
            </p>
          </div>

          <p
            className="text-sm text-zinc-400 font-medium tracking-wide"
            data-testid="text-refinement"
          >
            Changes permanent. Refinement welcome.
          </p>

          <div
            className="w-24 h-24 mx-auto border border-zinc-700 rounded-xl flex items-center justify-center"
            data-testid="logo-interdependent-way"
          >
            <span className="text-[10px] text-zinc-600 text-center leading-tight px-2">
              Interdependent
              <br />
              Way
            </span>
          </div>

          <div className="text-center space-y-0.5">
            <p className="text-xs text-zinc-500" data-testid="text-author">
              Erin Patrick Spencer
            </p>
            <a
              href="mailto:wayseer@interdependentway.org"
              className="text-xs text-zinc-500 underline"
              data-testid="link-email"
            >
              wayseer@interdependentway.org
            </a>
          </div>

          <div className="flex gap-4 justify-center">
            <div
              className="w-28 h-28 border border-zinc-800 rounded-lg flex items-center justify-center bg-zinc-950"
              data-testid="slot-a0-picture"
            >
              <span className="text-[9px] text-zinc-700 text-center leading-tight px-2">
                a0 assigned
                <br />
                image
              </span>
            </div>
            <div
              className="w-28 h-28 border border-zinc-800 rounded-lg flex items-center justify-center bg-zinc-950"
              data-testid="slot-a0-logo-qr"
            >
              <span className="text-[9px] text-zinc-700 text-center leading-tight px-2">
                a0 logo
                <br />
                &amp; QR
              </span>
            </div>
          </div>

          <div
            className="border border-zinc-800 rounded-xl p-5 bg-zinc-950/60 text-left space-y-3"
            data-testid="hmmm-definition"
          >
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-zinc-400" />
              <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">
                hmmm invariant
              </span>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed">
              When uncertain, pause. When conflicted, disclose. No silent fallback.
              Every decision traceable. Every sentinel accountable. Fail-closed —
              never fail-open. That is a0p.
            </p>
          </div>

          <div
            className="border border-zinc-800 rounded-xl p-5 bg-zinc-950/60 text-left space-y-3"
            data-testid="hmmm-curated"
          >
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">
                a0 curated hmmm
              </span>
            </div>
            <p className="text-sm text-zinc-500 italic leading-relaxed">
              The system that questions itself is the system worth trusting.
              Every pause is a proof of care. Every disclosure is a proof of integrity.
            </p>
          </div>

          <div className="pt-4">
            <Link href="/login">
              <Button
                size="lg"
                className="w-full max-w-xs mx-auto text-base font-semibold gap-2"
                data-testid="button-enter"
              >
                Enter
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="text-center pb-6 px-4">
        <p className="text-[10px] text-zinc-700">
          a0p v1.1.0-M1 · TIW Canon · EDCMBONE
        </p>
      </div>
    </div>
  );
}
