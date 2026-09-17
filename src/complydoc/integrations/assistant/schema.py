from pydantic import BaseModel, Field


class QuickWin(BaseModel):
    """A fast informational way for the user or for the model to improve a given document"""

    justification: str = Field(description="Reasoning for why this quick win was added")

    quick_win: str = Field(description="Identified win")


class AssistantMessage(BaseModel):
    """Information returned by the assistant for a given report"""

    quick_wins: list[QuickWin]
