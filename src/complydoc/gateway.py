"""The document gateway: what stands between your documents and any model, agent or tool.

    import complydoc as cd

    gateway = cd.Gateway()
    safe = gateway.read("contracts/acme.pdf")   # a file
    safe = gateway.filter(tool_output)          # any text: a prompt, a retrieved chunk
    send(safe.text)

Every call does the same three things, whatever it is given: identifiers are masked,
hidden passages and text written as instructions to a model are taken out, and the
answer says what was done and how far the text can be trusted (`verdict`). Nothing is
sent anywhere: the network guard is armed for the whole of each call.

It is the gateway the MCP server reads with, so a document opened by an assistant and
one read in your own code come out the same. When an engine such as Veil is installed,
the gateway reads with it, as `complydoc mcp` does; `engine="none"` reads with
complydoc's own configuration.

With `block=True`, text that held an instruction to a model, and a file nothing could be
read from, raise `GatewayBlockedError` instead of being returned cleaned: for pipelines where
such a document should stop, not pass.

With `numbered=True`, each masked value carries a number, `[#12 IBAN ••••4521]`, so a model
can ask for one by it. `reveal` puts that request to a person, through a function of yours
that asks them, and gives the one value only if they allow it (see `complydoc.unmask`):

    gateway = cd.Gateway(numbered=True)
    safe = gateway.read("contracts/acme.pdf")
    value = gateway.reveal(safe, 12, reason="to fill in the payment", approve=ask_the_user)
"""

from __future__ import annotations

import os
import uuid
from collections import Counter, OrderedDict
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from functools import wraps
from pathlib import Path
from typing import TYPE_CHECKING, Literal, ParamSpec

from complydoc.unmask import (
    REVEAL_LOG,
    Approve,
    MaskedSpan,
    RevealLog,
    RevealRequest,
    UnmaskError,
    Values,
)

if TYPE_CHECKING:
    from complydoc.config.schema import Config
    from complydoc.extraction.extract import Placed
    from complydoc.mcp.reading import Findings, Reading

__all__ = [
    "Gateway",
    "GatewayBlockedError",
    "GatewayResult",
    "MaskedSpan",
    "RevealRequest",
    "UnmaskError",
    "Verdict",
]

KEPT_VALUES = 256
"""Results whose masked values a gateway keeps for `reveal`, the oldest let go first."""

Verdict = Literal["ready", "careful", "stop", "unread"]
"""How far the original could be trusted.

- `ready`: nothing found.
- `careful`: identifiers that are not sensitive, or a part that could not be read.
- `stop`: hidden text, or a sensitive identifier, in the original. The text returned has
  them masked or taken out: it is the original that should not go out as it was.
- `unread`: nothing could be read, so nothing was checked.
"""

REMOVED = "[hidden text removed]"
"""What stands in the text where a hidden passage was taken out."""

P = ParamSpec("P")


@dataclass(frozen=True, slots=True)
class GatewayResult:
    """Text that passed the gateway, and what the gateway did to it."""

    text: str
    """The text, identifiers masked and hidden passages replaced by `[hidden text removed]`."""
    verdict: Verdict
    masked: int
    """Identifiers masked."""
    removed: int
    """Hidden passages taken out."""
    invisible: int = 0
    """Invisible characters taken out of text given to `filter`, such as zero-width spaces
    or Unicode tag characters smuggling an instruction."""
    identifiers: dict[str, int] = field(default_factory=dict)
    """Identifiers found, by label, such as {"IBAN": 2}."""
    sensitive: tuple[str, ...] = ()
    """The labels among them that are sensitive (special-category or high-risk)."""
    hidden: int = 0
    """Hidden passages found, taken out or not."""
    instruction: bool = False
    """Whether any hidden passage was written as an instruction to a model."""
    unread: str | None = None
    """Why nothing could be read, when nothing could; or what part was left unread."""
    unscanned: tuple[str, ...] = ()
    """Categories that could not be scanned, such as `person_name` with no name model
    installed: none of their values were masked."""
    pages: tuple[tuple[int, str], ...] = ()
    """For a file, (page number, text) for each page; `text` is them joined."""
    source: str | None = None
    """The file read, when one was."""
    spans: tuple[MaskedSpan, ...] = ()
    """With `numbered=True`, each masked value's number, kind and the text around it."""
    key: str = field(default="", repr=False)
    """Which reading this is, for `Gateway.reveal`."""

    @property
    def clean(self) -> bool:
        """True when nothing at all was found: the text is the original."""
        return self.verdict == "ready"

    def summary(self) -> str:
        """What the gateway did, in one sentence for a person."""
        said: list[str] = []
        if self.verdict == "unread":
            return f"Nothing was checked: {self.unread}."
        if self.masked:
            said.append(f"{self.masked} identifier{'s' if self.masked != 1 else ''} masked")
        if self.removed:
            said.append(
                f"{self.removed} hidden passage{'s' if self.removed != 1 else ''} taken out"
            )
        if self.invisible:
            plural = "s" if self.invisible != 1 else ""
            said.append(f"{self.invisible} invisible character{plural} taken out")
        if self.hidden and not self.removed and not self.invisible:
            said.append("hidden text found that could not be located in the text")
        if self.instruction:
            said.append("one was written as an instruction to a model")
        if not said:
            said.append("nothing found")
        if self.unread:
            said.append(f"not checked: {self.unread}")
        if self.unscanned:
            said.append("not scanned for " + ", ".join(self.unscanned))
        return "; ".join(said) + "."


class GatewayBlockedError(Exception):
    """Raised by a gateway made with `block=True` instead of returning the text."""

    def __init__(self, result: GatewayResult) -> None:
        self.result = result
        where = f"{result.source}: " if result.source else ""
        super().__init__(f"{where}{result.summary()}")


class Gateway:
    """Masks identifiers and takes out hidden instructions in anything that passes it.

    `config` is a loaded configuration (`cd.load_config(...)`), `config_dir` a folder of
    one, and `engine` names an installed detection engine: "auto" (the default) reads with
    the first installed, as `complydoc mcp` does, and "none" with complydoc's own. The first
    of the three given wins.

    A file is read once and kept until it changes, so reading the same document again is
    free. Both calls run offline.
    """

    def __init__(
        self,
        *,
        config: Config | None = None,
        config_dir: str | os.PathLike[str] | None = None,
        engine: str | None = "auto",
        block: bool = False,
        numbered: bool = False,
        reveal_log: str | os.PathLike[str] | None = REVEAL_LOG,
    ) -> None:
        self.block = block
        self.numbered = numbered
        """Whether masked values carry a number, `[#12 IBAN ••••]`, a model can ask for."""
        self.log = RevealLog(reveal_log)
        """Every request to `reveal`, without the values; None as the path keeps no log."""
        self._values: OrderedDict[str, tuple[Values, str | None]] = OrderedDict()
        self.engine: str | None = None
        """The engine the gateway reads with, such as "Veil"; None for complydoc's own."""
        self.config_dir: Path | None = Path(config_dir).expanduser() if config_dir else None
        if config is None and self.config_dir is None and engine not in (None, "none"):
            from complydoc.mcp import engines

            found = engines.find(None if engine == "auto" else engine)
            if found is not None:
                self.engine, self.config_dir = found.name, found.config_dir
        self._config = config
        self._kept: dict[Path, tuple[tuple[float, int], Reading]] = {}

    @property
    def config(self) -> Config:
        if self._config is None:
            from complydoc.config.loader import load_config

            self._config = load_config(self.config_dir)
        return self._config

    def filter(self, text: str) -> GatewayResult:
        """`text` with identifiers masked and hidden or instruction-like passages taken out."""
        from complydoc import offline
        from complydoc.extraction.strings import find_hidden, mask_text, scan_text
        from complydoc.hidden.check import instruction_spans
        from complydoc.hidden.unicode import strip_invisible
        from complydoc.unmask import number, stretches

        config = self.config
        with offline.guarded():
            hidden = find_hidden(text, config=config)
            # Invisible characters out first, so `ig​nore previous instructions` is found.
            clean = strip_invisible(text)
            spans = instruction_spans(clean, config)
            for start, end in reversed(spans):
                clean = clean[:start] + REMOVED + clean[end:]
            matches = scan_text(clean, config=config).matches
            placed: list[Placed] = []
            masked = mask_text(clean, config=config, _placed=placed)
        found = stretches(None, clean, sorted(placed, key=lambda p: p.start))
        values = number([(None, masked.text)], found, config.sensitive.masking)
        identifiers = Counter(match.label for match in matches)
        sensitive = {match.label for match in matches if match.severity == "high"}
        instruction = any(finding.instruction != "none" for finding in hidden)
        if hidden or sensitive:
            verdict: Verdict = "stop"
        elif identifiers:
            verdict = "careful"
        else:
            verdict = "ready"
        return self._passed(
            self._kept_values(
                GatewayResult(
                    text=values.marked(None, masked.text) if self.numbered else masked.text,
                    verdict=verdict,
                    masked=masked.masked,
                    removed=len(spans),
                    invisible=len(text) - len(strip_invisible(text)),
                    identifiers=dict(sorted(identifiers.items())),
                    sensitive=tuple(sorted(sensitive)),
                    hidden=len(hidden),
                    instruction=instruction,
                    unscanned=tuple(sorted(masked.unscanned)),
                ),
                values,
            )
        )

    def read(self, path: str | os.PathLike[str]) -> GatewayResult:
        """A document's text, read the way an assistant reads it through `complydoc mcp`."""
        target = Path(path).expanduser()
        reading = self.reading(target)
        result = _result(reading, str(target), self.numbered)
        return self._passed(self._kept_values(result, reading.values))

    def __call__(self, text: str) -> str:
        """The filtered text alone: `gateway(text)` where a function of text is wanted."""
        return self.filter(text).text

    def guard(self, function: Callable[P, str]) -> Callable[P, str]:
        """A function returning text, whose every answer passes the gateway first.

        @gateway.guard
        def fetch_page(url: str) -> str: ...
        """

        @wraps(function)
        def guarded(*args: P.args, **kwargs: P.kwargs) -> str:
            return self.filter(function(*args, **kwargs)).text

        return guarded

    def reading(self, path: Path) -> Reading:
        """The document as the MCP server shows it, read once until the file changes."""
        from complydoc.mcp.reading import read_document

        stat = path.stat()
        stamp = (stat.st_mtime, stat.st_size)
        kept = self._kept.get(path)
        if kept and kept[0] == stamp:
            return kept[1]
        reading = read_document(path, self.config)
        self._kept[path] = (stamp, reading)
        return reading

    def reveal(
        self, result: GatewayResult, id: int, *, approve: Approve, reason: str = ""
    ) -> str | None:
        """One masked value of `result`, if the person allows it; None if they decline.

        `approve` is given a `RevealRequest`, whose `question()` says what is asked in plain
        words, and returns whether the person allowed it. It must ask the person: the model
        that wants the value cannot allow it. A category never revealed raises
        `UnmaskError` without asking. Every request is logged, without the value.
        """
        kept = self._values.get(result.key)
        if kept is None:
            raise UnmaskError(
                "That result was not made by this gateway, or is too old to reveal from."
            )
        values, source = kept
        span = values.span(id)
        request = RevealRequest(span=span, reason=reason, source=source)
        if not span.revealable:
            self.log.record(request, "refused", asker="gateway")
            raise UnmaskError(f"{span.label} values are never revealed.")
        allowed = bool(approve(request))
        self.log.record(request, "allowed" if allowed else "declined", asker="gateway")
        return values.value(id) if allowed else None

    def _kept_values(self, result: GatewayResult, values: Values) -> GatewayResult:
        if not len(values):
            return result
        key = uuid.uuid4().hex
        self._values[key] = (values, result.source)
        while len(self._values) > KEPT_VALUES:
            self._values.popitem(last=False)
        spans = values.spans if self.numbered else ()
        return replace(result, key=key, spans=spans)

    def _passed(self, result: GatewayResult) -> GatewayResult:
        if self.block and (result.instruction or result.verdict == "unread"):
            raise GatewayBlockedError(result)
        return result

    def __repr__(self) -> str:
        engine = self.engine or "complydoc"
        return f"Gateway(engine={engine!r}, block={self.block}, numbered={self.numbered})"


def _verdict(findings: Findings) -> Verdict:
    from complydoc.mcp.reading import CAREFUL, READY, STOP

    said = findings.verdict
    return (
        "ready"
        if said == READY
        else "careful"
        if said == CAREFUL
        else ("stop" if said == STOP else "unread")
    )


def _result(reading: Reading, source: str, numbered: bool) -> GatewayResult:
    found = reading.findings
    identifiers: Counter[str] = Counter()
    for (label, _), count in found.identifiers.items():
        identifiers[label] += count
    sensitive = {label for label, severity in found.identifiers if severity == "high"}
    unread = found.unread or ("; ".join(found.unread_parts) if found.unread_parts else None)
    return GatewayResult(
        text=reading.text(numbered),
        verdict=_verdict(found),
        masked=reading.masked,
        removed=reading.removed,
        identifiers=dict(sorted(identifiers.items())),
        sensitive=tuple(sorted(sensitive)),
        hidden=len(found.hidden),
        instruction=found.instructed,
        unread=unread,
        pages=tuple(reading.numbered_pages(numbered)),
        source=source,
    )
