"""Credentials: API keys, access tokens, private keys and passwords.

Every key here is invented or a vendor's published example shape, and none of them works.
"""

from __future__ import annotations

import pytest

from complydoc.sensitive.scanner import scan_text
from complydoc.sensitive.validators import jwt_header, real_secret

JWT = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0."
    "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
)


# Names come from a model that may or may not be installed; these tests are about patterns.
_MODELS = {"person_name", "organisation_name"}


def _categories(text: str, config) -> list[str]:
    matches, _ = scan_text(text, config.sensitive)
    return [m.category for m in matches if m.category not in _MODELS]


@pytest.mark.parametrize(
    "line",
    [
        "AWS key: AKIA2E0A8F3B244C9986",
        "token ghp_9aB3dE6gH1jK4mN7pQ0rS2tU5vW8xY1zA3bC",
        "OPENAI_API_KEY=sk-proj-q8Fz2LmN4pR7tV0xB3dG6hJ9kM1nP5sW",
        "maps: AIzaSyD4k9Lm2Np7Qr0St3Uv6Wx9Yz1Ab4Cd7Ef",
        'api_key = "9f86d081884c7d659a2feaa0c55ad015"',
    ],
)
def test_api_keys_are_found(config, line):
    assert _categories(line, config) == ["api_key"]


@pytest.mark.parametrize(
    "line",
    [
        "api_key: your_api_key_here",
        "Set api_key=${API_KEY} in the environment.",
        'user_id = "AKIAIOSFODNN7EXAMPLE"',
        "api_key = os.environ['API_KEY']",
    ],
)
def test_placeholders_for_keys_are_not_keys(config, line):
    assert "api_key" not in _categories(line, config)


def test_a_jwt_is_confirmed_by_its_header(config):
    matches, _ = scan_text(f"Authorization: Bearer {JWT}", config.sensitive)
    found = [(m.category, m.evidence) for m in matches if m.category not in _MODELS]
    assert found == [("access_token", "confirmed")]


def test_three_base64_runs_without_a_token_header_are_not_a_jwt():
    assert jwt_header(JWT)
    assert not jwt_header("eyJub3RoaW5nIjoiaGVyZSJ9.eyJhIjoxfQ.c2lnbmF0dXJl")


def test_a_private_key_block_is_found(config):
    assert _categories("-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1r", config) == [
        "private_key"
    ]


def test_the_password_in_a_connection_string_is_a_password_and_no_email(config):
    text = "DATABASE_URL=postgres://admin:S3cr3tPa55w0rd@db.internal.net:5432/app"
    assert _categories(text, config) == ["password"]


@pytest.mark.parametrize(
    "line",
    [
        "postgres://user:password@localhost/app",
        "password: changeme",
        "Senha: 123456",
        "password = enforce_bytes(auth[1], name='password')",
        "username=a, password=auth_info[2]",
    ],
)
def test_placeholders_and_code_are_not_passwords(config, line):
    assert "password" not in _categories(line, config)


@pytest.mark.parametrize("line", ["password: hunter2abc9", "Senha: Xk9!pq2Lm, obrigado"])
def test_a_password_after_its_label_is_found(config, line):
    assert _categories(line, config) == ["password"]


def test_credentials_stay_masked_even_with_reveal(config):
    matches, _ = scan_text("AWS key: AKIA2E0A8F3B244C9986", config.sensitive, reveal=True)
    (match,) = matches
    assert match.revealed is None or "AKIA2E0A8F3B" not in match.revealed
    assert "AKIA2E0A8F3B" not in match.masked


@pytest.mark.parametrize(
    "value", ["your_key_here", "xxxxxxxxxxxx", "<API_KEY>", "${TOKEN}", "aaaaaaaaaaaa1"]
)
def test_real_secret_rejects_placeholders(value):
    assert not real_secret(value)
