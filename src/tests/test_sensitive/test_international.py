"""Identifiers outside the UK.

Valid numbers are published examples or synthetic numbers built with each
identifier's own check rule; each invalid number changes one digit.
"""

from __future__ import annotations

import pytest

import complydoc as cd
from complydoc.sensitive import validators as v


def change_last_digit(value: str) -> str:
    index = max(i for i, c in enumerate(value) if c.isdigit())
    return value[:index] + str((int(value[index]) + 1) % 10) + value[index + 1 :]


VALID = [
    (v.it_codice_fiscale, "RSSMRA85T10A562S"),
    (v.be_national_number, "85.07.30-033.28"),
    (v.pl_pesel, "44051401359"),
    (v.se_personnummer, "811228-9874"),
    (v.ch_ahv, "756.1234.5678.97"),
    (v.br_cpf, "529.982.247-25"),
    (v.br_cnpj, "11.222.333/0001-81"),
    (v.ca_sin, "130 692 544"),
    (v.au_tfn, "123 456 782"),
]


@pytest.mark.parametrize(("checker", "value"), VALID, ids=lambda x: getattr(x, "__name__", x))
def test_published_examples_pass_and_a_changed_digit_fails(checker, value):
    assert checker(value) is True
    assert checker(change_last_digit(value)) is False


def test_verhoeff_rejects_a_single_digit_change():
    number = "234123412346"
    assert v.verhoeff(number) is True
    assert v.in_aadhaar(number) is True
    assert v.in_aadhaar(change_last_digit(number)) is False
    assert v.in_aadhaar("134123412346") is False, "Aadhaar never starts with 0 or 1"


@pytest.mark.parametrize(
    ("checker", "value", "expected"),
    [
        (v.e164_phone, "+351 21 123 4567", True),
        (v.e164_phone, "+44 20 7946 0958", False),
        (v.e164_phone, "+1 23", False),
        (v.nanp_phone, "(415) 555-0172", True),
        (v.nanp_phone, "(115) 555-0172", False),
        (v.ca_sin, "046 454 286", False),
        (v.dk_cpr, "010190-1234", True),
        (v.dk_cpr, "320190-1234", False),
        (v.in_pan, "ABCPE1234F", True),
        (v.in_pan, "ABCXE1234F", False),
        (v.se_personnummer, "811268-9874", False),
        (v.br_cpf, "111.111.111-11", False),
    ],
)
def test_format_rules(checker, value, expected):
    assert checker(value) is expected


@pytest.mark.parametrize(
    ("category", "text"),
    [
        ("international_phone", "Contacto: +351 21 123 4567."),
        ("us_phone", "Phone: (415) 555-0172"),
        ("us_zip_code", "Springfield, IL, ZIP code 62704"),
        ("ca_postal_code", "Ottawa ON K1A 0B1"),
        ("eu_postal_code", "Código postal 1100-148 Lisboa"),
        ("eu_postal_code", "PLZ 10115 Berlin"),
        ("br_cep", "CEP: 01310-100 São Paulo"),
        ("it_codice_fiscale", "Codice fiscale RSSMRA85T10A562S"),
        ("be_national_number", "Rijksregisternummer: 85.07.30-033.28"),
        ("pl_pesel", "PESEL: 44051401359"),
        ("se_personnummer", "Personnummer 811228-9874"),
        ("dk_cpr", "CPR-nummer: 010190-1234"),
        ("ch_ahv", "AHV-Nr. 756.1234.5678.97"),
        ("br_cpf", "CPF 529.982.247-25"),
        ("br_cnpj", "CNPJ 11.222.333/0001-81"),
        ("in_aadhaar", "Aadhaar: 2341 2341 2346"),
        ("in_pan", "PAN number ABCPE1234F"),
        ("ca_sin", "Social insurance number 130 692 544"),
        ("au_tfn", "Tax file number: 123 456 782"),
        ("street_address", "Morada: Rua Augusta, 12"),
        ("street_address", "Adresse : 12 rue de la Paix"),
        ("street_address", "Anschrift: Hauptstraße 5"),
        ("date_of_birth", "Data de nascimento: 15/03/1985"),
        ("date_of_birth", "Geburtsdatum 1985-03-15"),
    ],
)
def test_each_identifier_is_found_in_text(category, text):
    found = {m.category for m in cd.scan_text(text).matches}
    assert category in found, found


@pytest.mark.parametrize(
    "text",
    [
        "Order 44051401359 shipped on 2026-03-15.",
        "Invoice total 12345 units.",
        "Reference 046 454 286 for the delivery.",
        "Room 2341 2341 2346 is booked.",
    ],
)
def test_bare_numbers_without_a_label_are_not_reported(text):
    found = {m.category for m in cd.scan_text(text).matches}
    assert not found & {
        "pl_pesel",
        "eu_postal_code",
        "ca_sin",
        "au_tfn",
        "in_aadhaar",
        "us_zip_code",
    }
