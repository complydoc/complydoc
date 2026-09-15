"""Use your own spaCy pipeline for names, with a second model for Portuguese pages."""

# requires: spacy

import tempfile
from pathlib import Path

import spacy

import complydoc as cd


def save_pipeline(folder: Path, lang: str, label: str) -> str:
    """A stand-in for a trained model: a pipeline with an entity ruler, saved to disk."""
    nlp = spacy.blank(lang)
    nlp.add_pipe("entity_ruler").add_patterns([{"label": label, "pattern": "Maria Silva"}])
    nlp.to_disk(folder / lang)
    return str(folder / lang)


with tempfile.TemporaryDirectory() as folder:
    english = save_pipeline(Path(folder), "en", "PERSON")
    portuguese = save_pipeline(Path(folder), "pt", "PER")

    config = cd.load_config().override(
        {
            "sensitive.categories.person_name.model": {
                "name": english,
                "entity_labels": ["PERSON"],
                "by_language": {"pt": {"name": portuguese, "entity_labels": ["PER"]}},
            }
        }
    )

    text = (
        "O contrato foi assinado por Maria Silva em nome do fornecedor, e a fatura foi "
        "aprovada pela equipa financeira antes do final do mês."
    )
    for match in cd.scan_text(text, config=config).matches:
        print(match.label, match.masked, match.evidence)
