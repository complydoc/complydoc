"""What a name model reads as a person or an organisation, held to the shape of one.

The small English fallback reads Portuguese, Spanish and German pages badly: on the
pilot corpus most of its "names" were a street, a clause, a form label or half a
sentence. These are the shapes it got wrong, and the names that have to survive.
"""

from __future__ import annotations

import pytest

from complydoc.sensitive.base import not_a_name, not_an_organisation
from tests.helpers import requires_ner


@pytest.mark.parametrize(
    "span",
    [
        "transferência para",
        "Rua Augusta",
        "Cláusula Terceira",
        "Fatura Simplificada",
        "Referência Multibanco",
        "Ribeira Software",
        "Tribunal da Comarca",
        "Rechnung RE-2026-0188",
        "Subtotal 4,250.00",
        "CONTRATO",
        "FICHA DE COLABORADOR DO DEPARTAMENTO",
    ],
)
def test_spans_that_cannot_be_a_persons_name(span):
    assert not_a_name(span)


@pytest.mark.parametrize(
    "span",
    [
        "Catarina Carvalho Martins",
        "Maria da Silva",
        "Jan van der Berg",
        "Ana",
        "RITA ALMEIDA SOUSA",
        "Dr. Hannah Collins",
    ],
)
def test_names_keep_their_shape(span):
    assert not not_a_name(span)


def test_a_lone_word_needs_a_second_when_asked():
    assert not_a_name("Porto", min_words=2)
    assert not not_a_name("Inês Marques", min_words=2)


@pytest.mark.parametrize(
    "span",
    [
        "aprovada em conselho de administração",
        "Construção de pipelines de dados em Python para o cliente",
        "Ticket OPS-21674",
        "CAE 89692",
        "MEDICAL LETTER",
        "FORMAÇÃO",
    ],
)
def test_spans_that_cannot_be_an_organisation(span):
    assert not_an_organisation(span)


@pytest.mark.parametrize(
    "span",
    ["Ribeira Software", "Bluefin Retail Ltd", "ACME LTD", "Müller Maschinenbau GmbH", "Channel 4"],
)
def test_organisations_keep_their_shape(span):
    assert not not_an_organisation(span)


@requires_ner
def test_the_fallback_model_no_longer_reports_a_street_as_a_person(config):
    from complydoc.sensitive.scanner import scan_text

    text = "Morada: Rua Augusta, 120, 1100-053 Lisboa\nContacto: Catarina Carvalho Martins"
    matches, _ = scan_text(text, config.sensitive, reveal=True)
    people = [m.revealed for m in matches if m.category == "person_name"]
    assert not any(p and p.startswith("Rua") for p in people)
