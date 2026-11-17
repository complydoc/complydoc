import { cn } from "@/lib/utils";

/**
 * Open source, as `git blame` shows it: the code is there to read, and every
 * line has the name of the person who wrote it. These are the real lines 37 to
 * 45 of `src/complydoc/loaders/parsers.py` and who wrote them, where two
 * contributors each added a parser. Decoration only.
 */
const LINES: { login: string; code: string }[] = [
  { login: "duartecaldascardoso", code: "__all__ = [" },
  { login: "duartecaldascardoso", code: '    "LoaderSpec",' },
  { login: "duartecaldascardoso", code: '    "azure_document_intelligence",' },
  { login: "duartecaldascardoso", code: '    "docling",' },
  { login: "duartecaldascardoso", code: '    "llamaparse",' },
  { login: "divya-o", code: '    "markitdown",' },
  { login: "himanshu748", code: '    "opendataloader_pdf",' },
  { login: "duartecaldascardoso", code: '    "unstructured",' },
  { login: "duartecaldascardoso", code: "]" },
];

const TONE: Record<string, string> = {
  "divya-o": "bg-blush/15 border-blush",
  himanshu748: "bg-primary/15 border-primary",
};

export function BlameArt({
  avatar,
}: {
  avatar: (login: string) => string | undefined;
}) {
  return (
    <div
      aria-hidden
      className="w-full max-w-lg overflow-hidden rounded-2xl border bg-card"
    >
      <div className="flex items-center gap-2 border-b px-4 py-2 font-mono text-xs text-muted-foreground">
        <span className="size-2 rounded-full bg-primary" />
        <span className="size-2 rounded-full bg-blush" />
        <span className="ml-2 truncate">src/complydoc/loaders/parsers.py</span>
      </div>
      <ol className="py-2 font-mono text-xs leading-7">
        {LINES.map((line, index) => {
          const first = index === 0 || LINES[index - 1]?.login !== line.login;
          return (
            <li
              key={index}
              className={cn(
                "grid grid-cols-[11rem_2rem_1fr] items-center border-l-2 border-transparent pr-4",
                TONE[line.login],
              )}
            >
              <span className="flex items-center gap-2 truncate pl-3 text-muted-foreground">
                {first && (
                  <>
                    <img
                      src={avatar(line.login)}
                      alt=""
                      className="size-5 rounded-full"
                    />
                    <span className="truncate">{line.login}</span>
                  </>
                )}
              </span>
              <span className="text-right text-muted-foreground/60 select-none">
                {37 + index}
              </span>
              <span className="pl-4 whitespace-pre">{line.code}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
