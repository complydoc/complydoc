import { Fragment } from "react";
import { cn } from "@/lib/utils";

interface Line {
  n: number;
  login: string;
  code: string;
}

/**
 * Open source, as `git blame` shows it: the code is there to read, and every
 * line has the name of the person who wrote it. These are real lines of two
 * files and who wrote them: the parsers two contributors added, and the
 * Norwegian identity number a third one taught the scanner. Decoration only.
 */
const FILES: { path: string; lines: Line[] }[] = [
  {
    path: "src/complydoc/loaders/parsers.py",
    lines: [
      { n: 40, login: "duartecaldascardoso", code: '    "docling",' },
      { n: 41, login: "duartecaldascardoso", code: '    "llamaparse",' },
      { n: 42, login: "divya-o", code: '    "markitdown",' },
      { n: 43, login: "himanshu748", code: '    "opendataloader_pdf",' },
      { n: 44, login: "duartecaldascardoso", code: '    "unstructured",' },
    ],
  },
  {
    path: "src/complydoc/config/sensitive.yaml",
    lines: [
      { n: 577, login: "ace-ify", code: "  no_fnr:" },
      { n: 579, login: "ace-ify", code: "    label: Norwegian identity number" },
      { n: 580, login: "ace-ify", code: "    region: 'NO'" },
      { n: 582, login: "ace-ify", code: "    severity: high" },
      { n: 585, login: "ace-ify", code: "    validators: [no_fnr]" },
    ],
  },
];

const TONE: Record<string, string> = {
  "divya-o": "bg-blush/15 border-blush",
  himanshu748: "bg-primary/15 border-primary",
  "ace-ify": "bg-blush/15 border-blush",
};

export function BlameArt({ avatar }: { avatar: (login: string) => string | undefined }) {
  return (
    <div aria-hidden className="w-full max-w-lg overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <span className="size-2 rounded-full bg-primary" />
        <span className="size-2 rounded-full bg-blush" />
        <span className="ml-2 font-mono text-xs text-muted-foreground">git blame</span>
      </div>
      {FILES.map((file) => (
        <Fragment key={file.path}>
          <p className="truncate border-b bg-muted/40 px-4 py-1.5 font-mono text-xs text-muted-foreground">
            {file.path}
          </p>
          <ol className="py-1 font-mono text-xs leading-7">
            {file.lines.map((line, index) => {
              const first = index === 0 || file.lines[index - 1]?.login !== line.login;
              return (
                <li
                  key={line.n}
                  className={cn(
                    "grid grid-cols-[9rem_2.5rem_1fr] items-center border-l-2 border-transparent pr-4",
                    TONE[line.login],
                  )}
                >
                  <span className="flex items-center gap-2 truncate pl-3 text-muted-foreground">
                    {first && (
                      <>
                        <img src={avatar(line.login)} alt="" className="size-5 rounded-full" />
                        <span className="truncate">{line.login}</span>
                      </>
                    )}
                  </span>
                  <span className="text-right text-muted-foreground/60 select-none">{line.n}</span>
                  <span className="truncate pl-3 whitespace-pre">{line.code}</span>
                </li>
              );
            })}
          </ol>
        </Fragment>
      ))}
    </div>
  );
}
