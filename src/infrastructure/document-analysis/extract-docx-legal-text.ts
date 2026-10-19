import JSZip from "jszip";

const XML_ENTITY = /&(?:#(\d+)|#x([\da-f]+)|(amp|apos|gt|lt|quot));/gi;
function decodeXml(value: string) {
  return value.replace(XML_ENTITY, (_match, decimal: string | undefined, hexadecimal: string | undefined, named: string | undefined) => {
    if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
    if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
    return { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' }[named?.toLowerCase() ?? ""] ?? "";
  });
}

/** Extracts accepted/current visible Word paragraphs in document order. */
export async function extractDocxLegalParagraphs(bytes: Uint8Array): Promise<string[]> {
  const archive = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const documentPart = archive.file("word/document.xml");
  if (!documentPart) throw new Error("DOCX is missing word/document.xml.");
  const xml = await documentPart.async("string");
  const paragraphs: string[] = [];
  for (const paragraph of xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const accepted = paragraph[1].replace(/<w:del(?:\s[^>]*)?>[\s\S]*?<\/w:del>/g, "");
    let text = "";
    const tokens = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br(?:\s[^>]*)?\/>/g;
    for (const token of accepted.matchAll(tokens)) {
      if (token[1] !== undefined) text += decodeXml(token[1]);
      else if (token[0].startsWith("<w:tab")) text += "\t";
      else text += "\n";
    }
    const normalized = text.replace(/[\t ]+/g, " ").replace(/ *\n */g, "\n").trim();
    if (normalized) paragraphs.push(normalized);
  }
  return paragraphs;
}

export async function extractDocxLegalText(bytes: Uint8Array): Promise<string> {
  return (await extractDocxLegalParagraphs(bytes)).join("\n");
}
