"use client";

import { startTransition, useActionState, useEffect, useMemo, useState, type ClipboardEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { importCelexDocuments, recognizeCelexScreenshot, resolveCelexDocuments, type ImportCelexState, type OcrCelexState, type ResolveCelexState } from "./celex-actions";

const initialResolve: ResolveCelexState = { status: "idle", results: [] };
const initialImport: ImportCelexState = { status: "idle" };
const initialOcr: OcrCelexState = { status: "idle", candidates: [] };
const CELEX_PATTERN = /^[0-9][0-9]{4}[A-Z]{1,2}[0-9A-Z]{1,8}(?:\([0-9]{2}\))?(?:-[0-9]{8})?$/;

function detect(value: string) {
  const values = [...new Set(value.split(/[\s,;]+/).filter(Boolean).map((item) => item.trim().toUpperCase().replace(/^CELEX:/, "")))];
  return { valid: values.filter((item) => item.length <= 30 && CELEX_PATTERN.test(item)), invalid: values.filter((item) => !(item.length <= 30 && CELEX_PATTERN.test(item))) };
}

export function CelexImport({ projectId, mode = "both" }: { projectId: string; mode?:"manual"|"screenshot"|"both" }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [pasteError, setPasteError] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const detected = useMemo(() => detect(input), [input]);
  const [ocrState, ocrAction, recognizing] = useActionState(recognizeCelexScreenshot, initialOcr);
  const [resolveState, resolveAction, resolving] = useActionState(resolveCelexDocuments, initialResolve);
  const [importState, importAction, importing] = useActionState(importCelexDocuments, initialImport);

  useEffect(() => {
    if (importState.status === "success") router.refresh();
  }, [importState.status, router]);

  useEffect(() => {
    if (ocrState.status !== "success" || ocrState.candidates.length === 0) return;
    setConfirmed(false);
    setInput((current) => {
      const additions = ocrState.candidates.map((candidate) => candidate.value);
      return [...new Set([...current.split(/[\s,;]+/).filter(Boolean), ...additions])].join("\n");
    });
  }, [ocrState]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function recognizeImage(file: File | undefined) {
    if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setPasteError("Залепете или повлечете PNG, JPG, JPEG или WebP слика.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPasteError("Сликата од екранот мора да биде помала од 10 MB.");
      return;
    }
    setPasteError(undefined);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("screenshot", file);
    startTransition(() => ocrAction(formData));
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!recognizing) recognizeImage([...event.clipboardData.files].find((file) => file.type.startsWith("image/")));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!recognizing) recognizeImage([...event.dataTransfer.files].find((file) => file.type.startsWith("image/")));
  }

  const titleId=`celex-import-title-${mode}`;
  return <section className="celex-import-panel" aria-labelledby={titleId}>
    <div><h2 id={titleId}>{mode==="manual"?"Внесете CELEX-број рачно":mode==="screenshot"?"Залепете слика од екранот за препознавање CELEX":"Увези од EUR-Lex"}</h2><p>{mode==="manual"?"Проверете еден или повеќе CELEX-броеви и преземете ги официјалните PDF-документи на англиски јазик од EUR-Lex.":mode==="screenshot"?"Залепете или повлечете слика од екранот, прегледајте ги препознаените CELEX-броеви, а потоа преземете ги официјалните PDF-документи.":"Залепете CELEX-броеви или прочитајте ги од слика, а потоа потврдете пред преземањето."}</p></div>
    {!confirmed ? <div className="celex-detect-form">
      {(mode!=="screenshot"||input)&&<label className="source-file-field"><span>CELEX-броеви</span><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="32016R0679, 32024L1234" rows={3} /><small>Одделете повеќе броеви со празни места, запирки, точки и запирки или нови редови.</small></label>}
      {mode!=="manual"&&<div
        className={`celex-paste-zone${dragging ? " dragging" : ""}${recognizing ? " processing" : ""}`}
        tabIndex={0}
        role="group"
        aria-label="Залепете или повлечете слика за препознавање CELEX"
        aria-disabled={recognizing}
        onClick={(event) => event.currentTarget.focus()}
        onPaste={handlePaste}
        onDragEnter={(event) => { event.preventDefault(); if (!recognizing) setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={handleDrop}
      >
        {previewUrl && <img src={previewUrl} alt="Преглед на сликата од екранот" />}
        <span className="celex-paste-copy"><strong>{recognizing ? "Се чита сликата…" : "Залепете слика од екранот тука"}</strong><small>{recognizing ? "Се откриваат CELEX-броеви" : "Користете Ctrl+V откако ќе направите слика од екранот"}</small></span>
        {!recognizing && <small className="celex-drop-hint">Може и да повлечете и пуштите слика</small>}
        {!recognizing && (pasteError || ocrState.message) && <span className={`celex-paste-status ${(pasteError || ocrState.status === "error") ? "error" : "success"}`} role={(pasteError || ocrState.status === "error") ? "alert" : "status"}>{pasteError ?? ocrState.message}</span>}
      </div>}
      {ocrState.candidates.some((candidate) => candidate.status === "review") && <div className="celex-review-warning" role="status">
        <strong>Прегледајте ги можните нејаснотии од OCR</strong>
        {ocrState.candidates.filter((candidate) => candidate.status === "review").map((candidate) => <p key={`${candidate.original}:${candidate.value}`}>OCR прочита <code>{candidate.original}</code>; додаден е можен CELEX <code>{candidate.value}</code>. Проверете го во полето или отстранете го пред потврдување.</p>)}
      </div>}
      {(detected.valid.length > 0 || detected.invalid.length > 0) && <div className="celex-detected" aria-live="polite">
        <strong>Откриено за потврда</strong>
        <div>{detected.valid.map((celex) => <span className="celex-chip" key={celex}>{celex}</span>)}</div>
        {detected.invalid.length > 0 && <p className="celex-invalid">Невалиден формат: {detected.invalid.join(", ")}</p>}
      </div>}
      <button type="button" className="button button-outline" disabled={detected.valid.length === 0 || detected.invalid.length > 0} onClick={() => setConfirmed(true)}>Потврди ги откриените броеви</button>
    </div> : <>
      <form action={resolveAction} className="celex-confirm-form">
        <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="celexNumbers" value={detected.valid.join(" ")} />
        <div className="celex-confirmed"><strong>Потврдено</strong><div>{detected.valid.map((celex) => <span className="celex-chip" key={celex}>{celex}</span>)}</div></div>
        <button className="button button-primary" type="submit" disabled={resolving}>{resolving ? "Се проверува…" : "Преземи"}</button>
        <button className="button button-outline" type="button" disabled={resolving || importing} onClick={() => setConfirmed(false)}>Уреди</button>
      </form>
      {resolveState.message && <p className={`document-action-message ${resolveState.status}`} role={resolveState.status === "error" ? "alert" : "status"}>{resolveState.message}</p>}
      {resolveState.results.length > 0 && <form action={importAction} className="celex-results">
        <input type="hidden" name="projectId" value={projectId} />
        {resolveState.results.map((result) => <input key={`resolved:${result.celex}`} type="hidden" name="resolvedPdf" value={JSON.stringify({ celex: result.celex, url: result.resolvedUrl ?? result.sourceUrl })} />)}
        <ul>{resolveState.results.map((result) => <li key={result.celex}>
          <label><input type="checkbox" name="celex" value={result.celex} defaultChecked={result.found} disabled={!result.found || importing} /><span><strong>{result.celex}</strong><small>{result.found ? "Official English PDF found" : result.error ?? "Not found"}</small>
            {result.corrigendumStatus && <small>{result.corrigendumStatus === "none" ? "No corrigendum" : result.corrigendumStatus === "non_english" ? "Corrigendum exists but does not affect English" : result.corrigendumStatus === "english" ? "English corrigendum exists" : "Corrigendum metadata unavailable"}</small>}
            {result.corrigenda?.map((corrigendum) => <span key={corrigendum.celex} className="celex-corrigendum">
              <input type="checkbox" name="corrigendum" value={`${result.celex}|${corrigendum.celex}`} defaultChecked={corrigendum.affectsEnglish} disabled={!result.found || !corrigendum.affectsEnglish || importing} />
              <small><strong>{corrigendum.celex}</strong> · {corrigendum.publicationDate ?? "Date unavailable"} · {corrigendum.affectedLanguages.length ? corrigendum.affectedLanguages.join(", ") : "Languages unavailable"} · {corrigendum.affectsEnglish ? "EN affected" : "EN not affected"} · <a href={corrigendum.sourceUrl} target="_blank" rel="noreferrer">Official source</a></small>
            </span>)}
          </span></label>
          <span className={`celex-status ${result.found ? "found" : "missing"}`}>{result.found ? "Found" : "Not found"}</span>
        </li>)}</ul>
        <button className="button button-primary" type="submit" disabled={importing || !resolveState.results.some((item) => item.found)}>{importing ? "Importing…" : "Import selected PDFs"}</button>
        {importState.message && <p className={`document-action-message ${importState.status}`} role={importState.status === "error" ? "alert" : "status"}>{importState.message}</p>}
        {importState.status==="success"&&importState.importedDocuments?.[0]&&<Link className="button button-outline" href={`/app/projects/${projectId}?document=${importState.importedDocuments[0].documentId}`}>Open imported document in Workspace</Link>}
      </form>}
    </>}
  </section>;
}
