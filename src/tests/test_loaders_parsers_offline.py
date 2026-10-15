"""The Docling preset uses the models on disk while the network is blocked."""

from __future__ import annotations

import sys
import types

from complydoc import offline
from complydoc.loaders import parsers


def test_the_hub_client_is_told_to_stay_offline_while_the_network_is_blocked(monkeypatch):
    hub = types.SimpleNamespace(constants=types.SimpleNamespace(HF_HUB_OFFLINE=False))
    monkeypatch.setitem(sys.modules, "huggingface_hub", hub)
    monkeypatch.delenv("HF_HUB_OFFLINE", raising=False)
    monkeypatch.setattr(offline, "_armed", True)
    parsers._use_downloaded_models()
    import os

    assert os.environ["HF_HUB_OFFLINE"] == "1"
    assert hub.constants.HF_HUB_OFFLINE is True


def test_nothing_is_changed_when_the_network_is_allowed(monkeypatch):
    monkeypatch.delenv("HF_HUB_OFFLINE", raising=False)
    monkeypatch.setattr(offline, "_armed", False)
    parsers._use_downloaded_models()
    import os

    assert "HF_HUB_OFFLINE" not in os.environ
