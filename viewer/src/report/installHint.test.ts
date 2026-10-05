import { installHint } from "./installHint";

const REASON =
  "names need the ner extra and the spaCy model 'en_core_web_sm'. With pip: pip install \"complydoc[ner]\" && " +
  'python -m spacy download en_core_web_sm. With uv: uv tool install --force "complydoc[ner]" --with ' +
  "https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl. " +
  "Keep any extras you already use in the brackets";

describe("installHint", () => {
  it("splits what is missing from the commands that install it", () => {
    const hint = installHint(REASON);
    expect(hint.summary).toBe("Names need the ner extra and the spaCy model 'en_core_web_sm'.");
    expect(hint.pip).toBe('pip install "complydoc[ner]" && python -m spacy download en_core_web_sm');
    expect(hint.uv).toMatch(/^uv tool install --force "complydoc\[ner\]" --with https:\/\/.*\.whl$/);
  });

  it("keeps a reason with no commands whole", () => {
    expect(installHint("it was switched off in the categories file.")).toEqual({
      summary: "It was switched off in the categories file.",
      pip: null,
      uv: null,
    });
  });
});
