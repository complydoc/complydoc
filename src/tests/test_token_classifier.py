"""Names from a token-classification model.

The model is an optional extra, so everything that needs it is skipped without
it. What does not need it is checked everywhere: a page is cut into windows
before it reaches a model that reads a few hundred tokens at a time, and a
window that lost track of its offset would report a name at the wrong place.
"""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys

import pytest

from complydoc.sensitive.base import DetectorContext
from complydoc.sensitive.detectors import token_classifier
from complydoc.sensitive.detectors.token_classifier import (
    TokenClassifierDetector,
    _windows,
    configured_models,
    model_available,
    use_server,
)
from complydoc.sensitive.registry import detector_by_id

MODEL = "Babelscape/wikineural-multilingual-ner"

requires_model = pytest.mark.skipif(
    importlib.util.find_spec("transformers") is None or not model_available(MODEL)[0],
    reason="the multilingual-names extra and a local copy of the model are not installed",
)


def test_the_detector_is_registered():
    """Pointing a category at it in YAML has to find it by name."""
    assert detector_by_id(TokenClassifierDetector.id) is not None


def test_a_short_page_is_one_window():
    text = "Signed by Jane Doe.\n"
    assert _windows(text) == [(0, text)]


def test_a_long_page_is_cut_into_windows_that_still_know_where_they_are():
    page = "\n".join(f"Line {index}: some contract text." for index in range(400))
    pieces = _windows(page)

    assert len(pieces) > 1, "a page this long has to be read in pieces"
    assert "".join(text for _, text in pieces) == page, "no text may be dropped"
    for offset, text in pieces:
        assert page[offset : offset + len(text)] == text, "an offset that slipped"


def test_windows_are_cut_at_line_boundaries():
    """An entity split across two windows is lost, so the cut goes where one ends."""
    page = "\n".join(f"Line {index}: some contract text." for index in range(400))
    for _, text in _windows(page)[:-1]:
        assert text.endswith("\n")


def test_this_detector_is_what_the_shipped_configuration_prefers(config):
    """And spaCy is the fallback, so a plain install still finds names."""
    assert configured_models(config.sensitive) == [MODEL]
    for category in ("person_name", "organisation_name"):
        chain = config.sensitive.categories[category].chain()
        assert [detector for detector, _ in chain] == ["token_classifier", "ner"]
        assert chain[-1][1].model is not None
        assert chain[-1][1].model.name == "en_core_web_sm"


@pytest.fixture
def served():
    """A stand-in for the audit's model: "Jane Doe" is a person, "Acme" an organisation."""
    requests: list[list[str]] = []

    def read(model_name, windows):
        requests.append(list(windows))
        found = []
        for window in windows:
            entities = []
            for word, label in (("Jane Doe", "PER"), ("Acme", "ORG")):
                start = window.find(word)
                if start >= 0:
                    entities.append((label, start, start + len(word), 0.99))
            found.append(entities)
        return found

    token_classifier._entities_by_page.clear()
    use_server(read)
    yield requests
    use_server(None)
    token_classifier._entities_by_page.clear()


def _context(config, category):
    return DetectorContext(category, config.sensitive.categories[category])


def test_a_page_is_read_once_for_people_and_organisations(config, served):
    """Both categories name the same model, which used to read every page twice."""
    text = "Signed by Jane Doe for Acme.\n"
    detector = TokenClassifierDetector()
    people = detector.find(text, _context(config, "person_name"))
    organisations = detector.find(text, _context(config, "organisation_name"))

    assert [text[f.start : f.end] for f in people] == ["Jane Doe"]
    assert [text[f.start : f.end] for f in organisations] == ["Acme"]
    assert len(served) == 1


def test_a_document_is_read_ahead_in_one_request(config, served):
    long_page = "\n".join(f"Line {index}: some contract text." for index in range(400))
    long_page += "\nSigned by Jane Doe.\n"
    pages = ["Acme invoice.\n", long_page]
    detector = TokenClassifierDetector()
    detector.prepare(pages, _context(config, "person_name"))

    assert len(served) == 1, "every window of every page in one batch"
    assert len(served[0]) == 1 + len(_windows(long_page))
    found = detector.find(long_page, _context(config, "person_name"))
    assert [long_page[f.start : f.end] for f in found] == ["Jane Doe"], "an offset that slipped"
    assert len(served) == 1, "the page was already read"


def test_a_worker_reads_with_the_cpu(monkeypatch):
    """Metal cannot compile a kernel in a process forked without a fresh start."""
    assert token_classifier._device() is None, "the audit's own process uses the best device"
    monkeypatch.setattr(token_classifier, "parent_process", lambda: object())
    assert token_classifier._device() == "cpu"


@requires_model
def test_it_finds_names_in_a_language_the_shipped_model_does_not_read(config):
    from complydoc.sensitive.scanner import scan_text

    settings = config.override(
        {
            "sensitive.categories.person_name.detector": "token_classifier",
            "sensitive.categories.person_name.model.name": MODEL,
            "sensitive.categories.person_name.model.entity_labels": ["PER"],
        }
    )
    text = "O contrato foi assinado por Maria Ferreira em Lisboa.\n"
    matches, unavailable = scan_text(text, settings.sensitive)

    assert not unavailable
    found = [m for m in matches if m.category == "person_name"]
    assert found, "the Portuguese name should be found"
    assert found[0].confidence is not None, "a score the confidence floor can read"
    assert found[0].evidence == "model"


@requires_model
def test_a_name_past_the_token_ceiling_is_still_found(config):
    """What the windows are for: a model reads a few hundred tokens at a time."""
    from complydoc.sensitive.scanner import scan_text

    settings = config.override(
        {
            "sensitive.categories.person_name.detector": "token_classifier",
            "sensitive.categories.person_name.model.name": MODEL,
            "sensitive.categories.person_name.model.entity_labels": ["PER"],
        }
    )
    filler = "\n".join(
        f"Line {index}: routine text with nothing of interest." for index in range(60)
    )
    page = f"{filler}\nThe final signatory is Giulia Bianchi.\n"
    matches, _ = scan_text(page, settings.sensitive)

    assert [m for m in matches if m.category == "person_name"], (
        "a name after the first few hundred tokens was missed"
    )


def test_a_missing_model_is_reported_rather_than_downloaded():
    """A scan runs inside the network guard, so nothing is fetched to fix this.

    There are two ways to be unavailable and each has its own thing to say: the
    extra is not installed, or it is and the model is not on the machine. Which
    exception the library raises for a model it cannot find varies, so what is
    checked is that the reason tells the reader what to do about it.
    """
    ok, reason = model_available("complydoc/no-such-model-exists")

    assert not ok
    assert reason
    if importlib.util.find_spec("transformers") is None:
        assert "multilingual-names" in reason, "say which extra is missing"
    else:
        assert "complydoc/no-such-model-exists" in reason, "say which model to fetch"


@requires_model
def test_the_offline_switch_is_set_before_the_library_is_imported(tmp_path):
    """The bug this guards: a scan reached the hub and the guard stopped it.

    `huggingface_hub` reads its offline setting once, as it is imported, so a
    value set afterwards is never seen. The weights come from the cache either
    way; what went to the network was the tokenizer asking for its templates.

    It has to be a fresh process. By the time this suite reaches here another
    test may have imported the library already, and then the ordering under
    test no longer happens.
    """
    import subprocess
    import sys

    script = """
import sys
from complydoc import offline
from complydoc.sensitive.detectors.token_classifier import model_available

offline.arm()                      # armed first, exactly as an audit does
assert "transformers" not in sys.modules, "the library must not be imported yet"
ok, reason = model_available("Babelscape/wikineural-multilingual-ner")
print("OK" if ok else f"FAILED {reason}")
"""
    import os

    # The real HOME: the model cache lives under it, and a fresh HOME would
    # hide the weights and pass this test for the wrong reason.
    environment = dict(os.environ)
    environment["PYTHONPATH"] = ":".join(sys.path)
    result = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
        cwd=str(tmp_path),
        env=environment,
    )
    unavailable = ("not on this machine", "needs the optional extra")
    if "FAILED" in result.stdout and any(text in result.stdout for text in unavailable):
        pytest.skip("the extra or the model is not installed in the subprocess")
    assert "OK" in result.stdout, f"{result.stdout}\n{result.stderr[-2000:]}"


@requires_model
def test_the_model_loads_when_transformers_was_imported_first():
    """What happens under LangChain, which imports `transformers` before complydoc.

    The offline switches are read as the library is imported, so they came too
    late: the load reached for the network, the scan's guard stopped it, and the
    scan fell back to the small English model while reporting the multilingual
    one as missing. It found "John Smith" and lost "Jane Doe" and "Acme Holdings
    Ltd". A fresh process is the only way to import in that order.
    """
    script = """
import transformers
import complydoc as cd
text = "EMPLOYEE RECORD\\nName: Jane Doe\\nEmployer: Acme Holdings Ltd\\n"
found = cd.scan_text(text)
print(sorted(m.category for m in found.matches))
"""
    # As a user's shell has it. Loading the model in this process, which the skip
    # check above does, sets the offline switches, and a child would inherit them
    # and never import in the order that went wrong.
    env = {
        k: v for k, v in os.environ.items() if k not in ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE")
    }
    result = subprocess.run(
        [sys.executable, "-c", script], capture_output=True, text=True, timeout=300, env=env
    )
    assert result.returncode == 0, result.stderr[-2000:]
    found = result.stdout.strip().splitlines()[-1]
    assert "person_name" in found, "Jane Doe"
    assert "organisation_name" in found, "Acme Holdings Ltd"


def test_a_name_starting_a_line_loses_the_line_break_before_it(monkeypatch):
    # A SentencePiece tokenizer hands a word's token the line break before it.
    page = "Invoice to:\nMaria Santos\n"
    start = page.index("\nMaria")

    def classify(windows, batch_size):
        return [
            [{"entity_group": "PER", "start": start, "end": start + 13, "score": 0.99}]
            for _ in windows
        ]

    monkeypatch.setattr(token_classifier, "_load", lambda _name: classify)
    [[(label, begin, end, _score)]] = token_classifier.classify_windows("any", [page])
    assert (label, page[begin:end]) == ("PER", "Maria Santos")


# A BIOES model, as Veil's are: O, then B, I, E and S for each label.
BIOES = ["O"] + [f"{prefix}-{label}" for label in ("PERSON", "ADDRESS") for prefix in "BIES"]


def _rows(page, tokens, tag_of):
    """Log-probabilities that put almost all the weight on each token's tag."""
    import math

    rows, offsets = [], []
    position = 0
    for token in tokens:
        start = page.index(token, position)
        position = start + len(token)
        offsets.append((start, position))
        wanted = BIOES.index(tag_of.get(token, "O"))
        rows.append(
            [math.log(0.96 if k == wanted else 0.04 / (len(BIOES) - 1)) for k in range(len(BIOES))]
        )
    return rows, offsets


def test_a_model_that_marks_last_and_single_tokens_is_read_as_bioes():
    assert token_classifier._is_bioes(BIOES)
    assert not token_classifier._is_bioes(["O", "B-PER", "I-PER", "B-ORG", "I-ORG"])
    assert token_classifier._is_bioes(["O", "B-PER", "I-PER", "L-PER", "U-PER"]), "BILOU too"


def test_a_name_ending_on_its_last_token_comes_back_whole():
    """The leak this guards: E- was a group of its own, and "Gome|s" left the "s" on the page."""
    page = "Senhorio: Helena Carvalho Gomes, NIF 211813427."
    tokens = ["Senhorio", ":", "Helena", "Carvalho", "Go", "mes", ",", "NIF"]
    tags = {"Helena": "B-PERSON", "Carvalho": "I-PERSON", "Go": "I-PERSON", "mes": "E-PERSON"}
    rows, offsets = _rows(page, tokens, tags)

    found = token_classifier._bioes_entities(page, rows, offsets, BIOES)

    assert [(e["entity_group"], page[e["start"] : e["end"]]) for e in found] == [
        ("PERSON", "Helena Carvalho Gomes")
    ]
    assert 0.9 < found[0]["score"] <= 1.0


def test_a_one_token_name_is_found():
    """S- was dropped as a label no category asks for, and "SOFIA" stayed visible."""
    page = "SOFIA MARTINS PINTO\n"
    tags = {"SOFIA": "S-PERSON"}
    rows, offsets = _rows(page, ["SOFIA"], tags)

    found = token_classifier._bioes_entities(page, rows, offsets, BIOES)
    assert [page[e["start"] : e["end"]] for e in found] == ["SOFIA"]


def test_a_tag_sequence_that_cannot_happen_is_read_as_the_likeliest_one_that_can():
    """B, then O, then E is a name with a hole in it. The decoder takes the legal path instead."""
    page = "Titular: Nelson Valente\n"
    import math

    tokens = ["Nelson", "Valent", "e"]
    rows, offsets = _rows(page, tokens, {"Nelson": "B-PERSON", "e": "E-PERSON"})
    # "Valent" leans O, but I-PERSON is close behind.
    rows[1] = [math.log(0.04 / (len(BIOES) - 1))] * len(BIOES)
    rows[1][BIOES.index("O")] = math.log(0.55)
    rows[1][BIOES.index("I-PERSON")] = math.log(0.41)

    found = token_classifier._bioes_entities(page, rows, offsets, BIOES)
    assert [page[e["start"] : e["end"]] for e in found] == ["Nelson Valente"]


def test_pieces_of_one_address_are_one_span_and_a_lone_comma_is_dropped():
    page = "residente em Rua de Cedofeita, 360, 4100-130 Porto, email"
    tokens = ["Rua", "de", "Cedofeita", ",", "360", ",", "4100-130", "Porto", ",", "email"]
    tags = {
        "Rua": "B-ADDRESS",
        "de": "I-ADDRESS",
        "Cedofeita": "I-ADDRESS",
        "360": "E-ADDRESS",
        "4100-130": "B-ADDRESS",
        "Porto": "E-ADDRESS",
    }
    rows, offsets = _rows(page, tokens, tags)
    # The first comma sits inside the address: a model that has it as I- keeps it.
    rows[3] = rows[1]

    found = token_classifier._bioes_entities(page, rows, offsets, BIOES)
    assert [page[e["start"] : e["end"]] for e in found] == [
        "Rua de Cedofeita, 360",
        "4100-130 Porto",
    ]


def test_two_names_with_punctuation_between_them_stay_two():
    page = "Maria Santos, Pedro Costa"
    tokens = ["Maria", "Santos", ",", "Pedro", "Costa"]
    tags = {"Maria": "B-PERSON", "Santos": "E-PERSON", "Pedro": "B-PERSON", "Costa": "E-PERSON"}
    rows, offsets = _rows(page, tokens, tags)

    found = token_classifier._bioes_entities(page, rows, offsets, BIOES)
    assert [page[e["start"] : e["end"]] for e in found] == ["Maria Santos", "Pedro Costa"]


def test_a_span_that_stops_inside_a_word_takes_the_whole_word():
    """Whatever the model, a mask that ends mid-word leaves the rest of it readable."""
    page = "Contact: Chloe Adeyemi, telephone"
    start, end = page.index("Chloe"), page.index("mi,")
    assert page[slice(*token_classifier._trimmed(page, start, end))] == "Chloe Adeyemi"
    start = page.index("hloe")
    assert page[slice(*token_classifier._trimmed(page, start, end))] == "Chloe Adeyemi"


@pytest.mark.skipif(
    importlib.util.find_spec("transformers") is None or importlib.util.find_spec("torch") is None,
    reason="the multilingual-names extra is not installed",
)
def test_a_bioes_model_is_loaded_with_its_own_reader(tmp_path, monkeypatch):
    """A tiny BIOES model on disk: the reader batches, pads a short window and maps offsets back."""
    import torch
    from transformers import BertConfig, BertForTokenClassification, BertTokenizerFast

    words = ["[PAD]", "[UNK]", "[CLS]", "[SEP]", "maria", "santos", "lives", "in", "porto", "."]
    (tmp_path / "vocab.txt").write_text("\n".join(words) + "\n")
    BertTokenizerFast(vocab_file=str(tmp_path / "vocab.txt")).save_pretrained(tmp_path)
    config = BertConfig(
        vocab_size=len(words),
        hidden_size=16,
        num_hidden_layers=1,
        num_attention_heads=2,
        intermediate_size=16,
        id2label=dict(enumerate(BIOES)),
        label2id={tag: k for k, tag in enumerate(BIOES)},
    )
    torch.manual_seed(0)
    model = BertForTokenClassification(config)
    with torch.no_grad():  # whatever the input, every token reads as S-PERSON
        model.classifier.weight.zero_()
        model.classifier.bias.zero_()
        model.classifier.bias[BIOES.index("S-PERSON")] = 5.0
    model.save_pretrained(tmp_path)
    token_classifier._load_once.cache_clear()

    reader = token_classifier._load(str(tmp_path))
    assert isinstance(reader, token_classifier._BioesReader)
    pages = ["maria santos lives in porto.", "porto."]
    entities = token_classifier.classify_windows(str(tmp_path), pages)

    assert len(entities) == 2
    # Every token is S-PERSON, and one-token entities a space apart are one span.
    for page, found in zip(pages, entities, strict=True):
        assert [(label, page[start:end]) for label, start, end, _ in found] == [("PERSON", page)]
    token_classifier._load_once.cache_clear()
