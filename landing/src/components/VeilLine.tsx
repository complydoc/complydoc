import type { Piece } from "@/pages/industries";
import { cn } from "@/lib/utils";

/** One line of a document as the model receives it: people's details covered, companies kept. */
export function VeilLine({ pieces, className }: { pieces: Piece[]; className?: string }) {
  return (
    <p className={cn("font-mono text-sm leading-8 text-pretty md:text-base md:leading-9", className)}>
      {pieces.map((piece, i) =>
        typeof piece === "string" ? (
          <span key={i}>{piece}</span>
        ) : piece.owner === "person" ? (
          <span key={i} className="relative inline-block rounded-[3px] bg-foreground leading-[1.45] whitespace-nowrap text-transparent">
            {piece.text}
            <span className="absolute inset-0 flex items-center overflow-hidden pl-2 text-[10px] leading-none text-background">
              {piece.kind}
            </span>
          </span>
        ) : (
          <span key={i} className="underline decoration-primary decoration-2 underline-offset-[6px]">
            {piece.text}
          </span>
        ),
      )}
    </p>
  );
}
