"""Shipped policy packs: finance, legal and hr, run on the sample documents."""

from __future__ import annotations

from pathlib import Path

import pytest
from typer.testing import CliRunner

import complydoc as cd
from complydoc.cli import app
from complydoc.config.loader import ConfigError
from complydoc.report.policy import PACKS, check_policy, read_policy

SAMPLE = Path(cd.__file__).parent / "sample"
RUNNER = CliRunner()

# The categories the pack is for. The file may list more; these are the ones a
# rename or a deletion would quietly drop.
MUST_INCLUDE = {
    "finance": {"iban", "card_number", "sort_code", "bank_account_number", "vat_number", "utr"},
    "legal": {"ni_number", "us_ssn", "es_dni", "fr_nir", "it_codice_fiscale"},
    "hr": {"person_name", "date_of_birth", "ni_number", "email_address"},
}


@pytest.fixture(scope="module")
def report(config):  # type: ignore[no-untyped-def]
    return cd.full_audit(SAMPLE, ocr=False, config=config)


def test_the_pack_files_are_the_names():
    folder = Path(cd.__file__).parent / "policies"
    assert {path.stem for path in folder.glob("*.yaml")} == set(PACKS)


@pytest.mark.parametrize("name", PACKS)
def test_a_pack_parses_and_names_real_categories(name, config):  # type: ignore[no-untyped-def]
    policy = read_policy(name)
    assert policy.version == 1
    categories = policy.parameters("no_identifiers")["categories"]
    assert categories
    assert len(categories) == len(set(categories))
    known = set(config.sensitive.categories)
    unknown = set(categories) - known
    assert not unknown, unknown
    assert MUST_INCLUDE[name] <= set(categories)
    # The name resolves to the file in the package, and that file parses as the same policy.
    shipped = Path(cd.__file__).parent / "policies" / f"{name}.yaml"
    assert read_policy(shipped).rules == policy.rules


@pytest.mark.parametrize("name", PACKS)
def test_a_pack_runs_against_the_sample_documents(name, report):  # type: ignore[no-untyped-def]
    policy = read_policy(name)
    result = check_policy(report, policy)
    assert [rule.rule for rule in result.rules] == policy.active
    assert report.documents
    failed_to_run = [(rule.rule, rule.error) for rule in result.rules if rule.error]
    assert not failed_to_run


def test_a_file_is_read_and_the_bare_name_is_the_pack(tmp_path, monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.chdir(tmp_path)
    (tmp_path / "finance.yaml").write_text("version: 1\nrules:\n  no_network: true\n")
    assert list(read_policy("finance.yaml").rules) == ["no_network"]
    assert "no_identifiers" in read_policy("finance").rules
    assert "no_identifiers" in read_policy("./legal").rules


def test_an_unknown_name_is_not_a_pack(tmp_path, monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.chdir(tmp_path)
    with pytest.raises(ConfigError, match="cannot read"):
        read_policy("no-such-pack")
    with pytest.raises(ConfigError, match="cannot read"):
        read_policy("legal.yaml")


def test_the_check_command_accepts_a_pack_name(tmp_path):  # type: ignore[no-untyped-def]
    result = RUNNER.invoke(
        app,
        [
            "check",
            str(SAMPLE / "invoice-de.pdf"),
            "--policy",
            "finance",
            "--no-ocr",
            "--out",
            str(tmp_path / "out"),
        ],
    )
    assert result.exit_code in (0, 1), result.output
    assert "no_identifiers" in result.output
