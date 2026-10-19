import JSZip from "jszip";

export type CharacterCounts = {
  charactersWithoutSpaces: number;
  charactersWithSpaces: number;
};

const WORD_TEXT_PART = /^word\/(?:document|footnotes|endnotes|header\d+|footer\d+)\.xml$/;
const XML_ENTITY = /&(?:#(\d+)|#x([\da-f]+)|(amp|apos|gt|lt|quot));/gi;

function decodeXmlText(value: string) {
  return value.replace(XML_ENTITY, (_match, decimal: string | undefined, hexadecimal: string | undefined, named: string | undefined) => {
    if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
    if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
    return { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' }[named?.toLowerCase() ?? ""] ?? "";
  });
}

export function countVisibleCharacters(text: string): CharacterCounts {
  let charactersWithoutSpaces = 0;
  let charactersWithSpaces = 0;
  for (const character of text) {
    if (/\s/u.test(character)) {
      if (character === " " || character === "\u00a0") charactersWithSpaces += 1;
      continue;
    }
    charactersWithoutSpaces += 1;
    charactersWithSpaces += 1;
  }
  return { charactersWithoutSpaces, charactersWithSpaces };
}

function addCounts(total: CharacterCounts, next: CharacterCounts) {
  total.charactersWithoutSpaces += next.charactersWithoutSpaces;
  total.charactersWithSpaces += next.charactersWithSpaces;
}

/** Counts visible Word text only, excluding package metadata and layout-only OOXML. */
export async function countDocxCharacters(bytes: Uint8Array): Promise<CharacterCounts> {
  const archive = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const parts = Object.values(archive.files).filter((part) => !part.dir && WORD_TEXT_PART.test(part.name));
  if (!parts.some((part) => part.name === "word/document.xml")) throw new Error("DOCX is missing word/document.xml.");

  const total: CharacterCounts = { charactersWithoutSpaces: 0, charactersWithSpaces: 0 };
  for (const part of parts) {
    const xml = await part.async("string");
    // w:t is rendered document text. Revision deletions use w:delText and are
    // intentionally excluded; footnote/endnote reference marks are not literal text.
    for (const match of xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)) {
      addCounts(total, countVisibleCharacters(decodeXmlText(match[1])));
    }
  }
  return total;
}

export function translationPages(counts: CharacterCounts) {
  return {
    pages1500NoSpaces: counts.charactersWithoutSpaces / 1500,
    pages1800WithSpaces: counts.charactersWithSpaces / 1800,
  };
}
