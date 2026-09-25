/** The text a code block copies: the source without its "$ " prompts. */
export function copyable(code: string): string {
  return code
    .split("\n")
    .map((line) => line.replace(/^\$ /, ""))
    .join("\n");
}
