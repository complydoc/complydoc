"""Teach complydoc a format it does not handle."""

from pathlib import Path

import complydoc as cd


class MarkdownLoader:
    extensions = (".md",)
    format = cd.DocumentFormat.OTHER

    def load(self, path: Path, options: cd.IngestOptions) -> cd.Document:
        document = cd.Document(path=path, sha256=cd.sha256_of(path), format=self.format)
        page = cd.Page(number=1, width_pt=595.0, height_pt=842.0)
        page.text = path.read_text(encoding="utf-8")
        page.text_source = "native"
        document.pages.append(page)
        return document


cd.register_loader(MarkdownLoader())
print(".md is now readable:", ".md" in cd.supported_extensions())
