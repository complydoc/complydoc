"""Text a model reads that a person reading the document does not see, and text
that reads as an instruction to a model.

Two questions, answered separately and reported together.

Visibility is measured. A PDF page is drawn and each character in its text
layer is checked for ink underneath (`visibility.py`); a Word or Excel file is
read for the formatting that hides text (`office.py`); any text is searched for
characters that carry content without displaying it (`unicode.py`).

Instruction is estimated, from phrasing patterns in `hidden.yaml` and, when one
is registered, a classifier (`instructions.py`).

`check.py` combines the two into `ContentFinding`s.
"""

from complydoc.hidden.check import ContentCheck, check_content, severity_of
from complydoc.hidden.instructions import register_instruction_classifier

__all__ = ["ContentCheck", "check_content", "register_instruction_classifier", "severity_of"]
