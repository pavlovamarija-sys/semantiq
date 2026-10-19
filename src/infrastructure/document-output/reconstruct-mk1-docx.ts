import JSZip from "jszip";

export type ReconstructionSegment = { id: string; index: number; sourceText: string; targetText: string };
export type ReconstructionResult = { bytes: Uint8Array; mappedSegmentIds: string[]; paragraphCount: number };
export type ReconstructionValidation = { translationUnits:number;paragraphs:number;tables:number;rows:number;cells:number;pageBreaks:number;sections:number };

function decodeXml(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
function encodeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function normalize(value: string) { return decodeXml(value).replace(/\s+/g, " ").trim(); }
function paragraphText(xml: string) {
  const content = xml.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/)?.[0] ?? xml;
  return [...content.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\b[^>]*\/?\s*>/g)]
    .map((match) => match[1] === undefined ? "\n" : decodeXml(match[1]))
    .join("");
}

export function rewriteParagraphTarget(paragraph:string,targetText:string){
  const tokens=[...paragraph.matchAll(/<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\b[^>]*\/?\s*>/g)];
  const breaks=tokens.filter(token=>token[0].startsWith("<w:br"));
  if(breaks.some(token=>/w:type\s*=\s*["']page["']/.test(token[0])))throw Error("MK1 target paragraph contains a page break and cannot be rewritten safely");
  const parts=targetText.split("\n");
  if(parts.some(part=>part.length===0))throw Error("MK1 target contains an ambiguous adjacent or terminal line break");
  if(breaks.length!==parts.length-1)throw Error(`MK1 target/source line-break mismatch: source ${breaks.length}, target ${parts.length-1}`);
  const replacements=new Map<number,string>();let segment=0,textInSegment=0;
  for(const token of tokens){if(token[0].startsWith("<w:br")){if(textInSegment===0)throw Error("MK1 source contains an ambiguous adjacent line break");segment++;textInSegment=0;continue;}const replacement=textInSegment++===0?encodeXml(parts[segment]):"";replacements.set(token.index!,`<w:t${token[1]??""}>${replacement}</w:t>`);}
  if(segment!==parts.length-1||textInSegment===0||replacements.size===0)throw Error("MK1 paragraph has no deterministic writable text around its line breaks");
  let rewritten=paragraph;for(const token of [...tokens].reverse()){if(!replacements.has(token.index!))continue;rewritten=rewritten.slice(0,token.index!)+replacements.get(token.index!)+rewritten.slice(token.index!+token[0].length);}return rewritten;
}

export async function reconstructMk1Docx(templateBytes: Uint8Array, inputSegments: ReconstructionSegment[]): Promise<ReconstructionResult> {
  const ordered = [...inputSegments].sort((a, b) => a.index - b.index);
  if (ordered.some((s, i) => !s.id || !s.targetText.trim() || (i > 0 && s.index <= ordered[i - 1].index))) {
    throw new Error("MK1 reconstruction requires non-empty, strictly ordered segments.");
  }
  const ids = new Set(ordered.map((s) => s.id));
  if (ids.size !== ordered.length) throw new Error("MK1 reconstruction contains duplicate segment IDs.");

  const zip = await JSZip.loadAsync(templateBytes);
  const document = zip.file("word/document.xml");
  if (!document) throw new Error("The DOCX has no word/document.xml part.");
  let xml = await document.async("string");
  const paragraphs = [...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)];
  const used = new Set<string>();
  let cursor = 0;
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  for (const match of paragraphs) {
    const paragraph = match[0];
    const source = normalize(paragraphText(paragraph));
    if (!source) continue;
    const segment = ordered.slice(cursor).find((candidate) => normalize(candidate.sourceText) === source && !used.has(candidate.id));
    if (!segment) continue;
    const textNodes = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)];
    if (!textNodes.length) throw new Error(`Segment ${segment.id} maps to a paragraph without writable text.`);
    const rewritten = rewriteParagraphTarget(paragraph,segment.targetText);
    replacements.push({ start: match.index!, end: match.index! + paragraph.length, value: rewritten });
    used.add(segment.id);
    cursor = ordered.findIndex((candidate) => candidate.id === segment.id) + 1;
  }
  if (used.size !== ordered.length) {
    const missing = ordered.filter((s) => !used.has(s.id)).map((s) => `${s.index}:${s.id}`).join(", ");
    throw new Error(`MK1 reconstruction could not map every segment exactly once. Missing: ${missing}`);
  }
  for (const replacement of replacements.reverse()) xml = xml.slice(0, replacement.start) + replacement.value + xml.slice(replacement.end);
  zip.file("word/document.xml", xml);
  return { bytes: await zip.generateAsync({ type: "uint8array" }), mappedSegmentIds: ordered.map((s) => s.id), paragraphCount: paragraphs.length };
}

export async function validateReconstructedMk1Docx(templateBytes:Uint8Array,outputBytes:Uint8Array,inputSegments:ReconstructionSegment[]):Promise<ReconstructionValidation>{
  const [template,output]=await Promise.all([JSZip.loadAsync(templateBytes,{checkCRC32:true}),JSZip.loadAsync(outputBytes,{checkCRC32:true})]),required=["[Content_Types].xml","_rels/.rels","word/document.xml","word/styles.xml","word/_rels/document.xml.rels"];
  for(const part of required)if(!output.file(part))throw Error(`Corrected MK1 DOCX is missing ${part}`);
  const [sourceXml,targetXmlValue]=await Promise.all([template.file("word/document.xml")!.async("string"),output.file("word/document.xml")!.async("string")]),paragraphs=(xml:string)=>[...xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)].map(match=>match[0]),sourceParagraphs=paragraphs(sourceXml),targetParagraphs=paragraphs(targetXmlValue);
  if(sourceParagraphs.length!==targetParagraphs.length)throw Error("Corrected MK1 DOCX paragraph count changed");
  const ordered=[...inputSegments].sort((a,b)=>a.index-b.index);let cursor=0,mapped=0;
  for(let index=0;index<sourceParagraphs.length;index++){const source=normalize(paragraphText(sourceParagraphs[index]));if(!source)continue;const offset=ordered.slice(cursor).findIndex(segment=>normalize(segment.sourceText)===source);if(offset<0)continue;const segment=ordered[cursor+offset],actual=paragraphText(targetParagraphs[index]);if(actual!==segment.targetText)throw Error(`Corrected MK1 DOCX target mismatch at ${segment.index}:${segment.id}`);const sourceProperties=sourceParagraphs[index].match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0]??"",targetProperties=targetParagraphs[index].match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0]??"";if(sourceProperties!==targetProperties)throw Error(`Corrected MK1 DOCX paragraph formatting changed at ${segment.index}:${segment.id}`);mapped++;cursor+=offset+1;}
  if(mapped!==ordered.length)throw Error("Corrected MK1 DOCX does not cover every translation unit");
  for(const [name,file] of Object.entries(template.files)){if(name==="word/document.xml"||file.dir)continue;const other=output.file(name);if(!other)throw Error(`Corrected MK1 DOCX lost package part ${name}`);const [left,right]=await Promise.all([file.async("uint8array"),other.async("uint8array")]);if(left.length!==right.length||left.some((byte,index)=>byte!==right[index]))throw Error(`Corrected MK1 DOCX changed package part ${name}`);}
  const count=(xml:string,pattern:RegExp)=>[...xml.matchAll(pattern)].length,metrics=(xml:string)=>({paragraphs:paragraphs(xml).length,tables:count(xml,/<w:tbl>/g),rows:count(xml,/<w:tr(?:\s|>)/g),cells:count(xml,/<w:tc(?:\s|>)/g),pageBreaks:count(xml,/<w:br\b[^>]*w:type=["']page["']/g),sections:count(xml,/<w:sectPr(?:\s|>)/g)}),sourceMetrics=metrics(sourceXml),targetMetrics=metrics(targetXmlValue);
  if(JSON.stringify(sourceMetrics)!==JSON.stringify(targetMetrics))throw Error("Corrected MK1 DOCX structural metrics changed");return{translationUnits:mapped,...targetMetrics};
}
