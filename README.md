<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/duartecaldascardoso/complydoc/main/.github/images/logo-dark.svg">
    <img alt="complydoc" src="https://raw.githubusercontent.com/duartecaldascardoso/complydoc/main/.github/images/logo-light.svg" width="42%">
  </picture>

  <p>Offline analysis of documents before they reach an LLM.</p>

  <a href="https://pypi.org/project/complydoc/"><img src="https://img.shields.io/pypi/v/complydoc?color=1a7f4b" alt="PyPI"></a>
  <a href="https://github.com/duartecaldascardoso/complydoc/actions/workflows/checks.yml"><img src="https://github.com/duartecaldascardoso/complydoc/actions/workflows/checks.yml/badge.svg?branch=main" alt="Tests"></a>
  <a href="https://duartecaldascardoso.github.io/complydoc/"><img src="https://img.shields.io/badge/docs-complydoc-1a7f4b" alt="Docs"></a>
  <img src="https://img.shields.io/badge/license-MIT-1a7f4b" alt="MIT">
</div>

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/duartecaldascardoso/complydoc/main/.github/images/complydoc-architecture-dark.svg">
  <img alt="complydoc architecture" src="https://raw.githubusercontent.com/duartecaldascardoso/complydoc/main/.github/images/complydoc-architecture.svg" width="100%">
</picture>

Reports token cost, extraction readiness, personal identifiers, and hidden text or prompt
injection, for files or the output of a LangChain or LlamaIndex loader. No network access.

```bash
uv tool install complydoc
complydoc audit ./documents
```

```python
import complydoc as cd

report = cd.full_audit("./documents")
report = cd.inspect_documents(loader)
cd.write_html(report, "report.html")
```

[Documentation](https://duartecaldascardoso.github.io/complydoc/) · [Changelog](src/complydoc/CHANGELOG.md) · MIT
