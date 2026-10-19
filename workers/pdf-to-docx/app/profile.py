from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Margins(BaseModel):
    model_config = ConfigDict(extra="forbid")
    top: float = Field(2.54, ge=0.5, le=10)
    bottom: float = Field(2.54, ge=0.5, le=10)
    left: float = Field(3.17, ge=0.5, le=10)
    right: float = Field(3.17, ge=0.5, le=10)


class PageProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    columns: Literal[1] = 1
    marginsCm: Margins = Field(default_factory=Margins)


class ParagraphProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    alignment: Literal["justified"] = "justified"
    beforePt: float = Field(6, ge=0, le=72)
    afterPt: float = Field(6, ge=0, le=72)
    lineSpacing: Literal["single"] = "single"


class FootnoteProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fontSizePt: float = Field(9, ge=6, le=24)
    beforePt: float = Field(0, ge=0, le=72)
    afterPt: float = Field(0, ge=0, le=72)
    lineSpacing: Literal["single"] = "single"


class ConversionProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    output: Literal["docx"] = "docx"
    editableText: Literal[True] = True
    preserve: list[Literal["legal-structure", "tables", "footnotes"]]
    page: PageProfile = Field(default_factory=PageProfile)
    body: ParagraphProfile = Field(default_factory=ParagraphProfile)
    footnotes: FootnoteProfile = Field(default_factory=FootnoteProfile)
    literalLegalLabels: Literal[True] = True

