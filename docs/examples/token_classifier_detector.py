"""Detect names with a Hugging Face token-classification model saved on disk."""

# requires: transformers

import os
import sys

from transformers import pipeline

import complydoc as cd

model_path = os.environ.get("COMPLYDOC_NER_MODEL")
if not model_path:
    print("set COMPLYDOC_NER_MODEL to a local token-classification model directory")
    sys.exit(0)

classify = pipeline("token-classification", model=model_path, aggregation_strategy="simple")


class TokenClassifierDetector:
    id = "token_classifier"

    def find(self, text, context):
        wanted = set(context.config.model.entity_labels)
        return [
            cd.Finding(start=entity["start"], end=entity["end"], confidence=float(entity["score"]))
            for entity in classify(text)
            if entity["entity_group"] in wanted
        ]


cd.register_detector(TokenClassifierDetector())
config = cd.load_config().override(
    {
        "sensitive.categories.person_name.detector": "token_classifier",
        "sensitive.categories.person_name.model.entity_labels": ["PER"],
        "sensitive.categories.person_name.min_confidence": 0.8,
    }
)
for match in cd.scan_text("The agreement was signed by Maria Silva.", config=config).matches:
    print(match.label, match.masked, match.confidence)
