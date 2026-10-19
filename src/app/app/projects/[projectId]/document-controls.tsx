"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/app/ui/brand";
import { deleteSourceDocument, deleteWorkingDocument, transformPdfToWorkingDocument, uploadSourceDocument, type DocumentActionState } from "./document-actions";
import { generateTranslationReport, reconstructCompletedMk1Docx, translateCompleteDocument } from "./translation-actions";

const initialState: DocumentActionState = { status: "idle" };

export function SourceDocumentUpload({ projectId, pdfOnly = false, showOpenAction = false }: { projectId: string; pdfOnly?: boolean; showOpenAction?: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(uploadSourceDocument, initialState);

  useEffect(() => {
    if (state.status !== "success") return;
    formRef.current?.reset();
    router.refresh();
  }, [router, state.status]);

  return <form ref={formRef} action={formAction} className="source-upload-form">
    <input type="hidden" name="projectId" value={projectId} />
    <label className="source-file-field">
      <span>Изворен документ</span>
      <input name="sourceFile" type="file" accept={pdfOnly?".pdf,application/pdf":".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"} required disabled={pending} />
      <small>{pdfOnly?"PDF до 50 MB.":"PDF или DOCX, до 50 MB."} Оригиналната датотека се зачувува непроменета.</small>
    </label>
    <button className="button button-primary" type="submit" disabled={pending}><Icon name="plus" className="h-4 w-4" />{pending ? "Се поставува…" : "Постави документ"}</button>
    {state.message && <p className={`document-action-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}
    {showOpenAction&&state.status==="success"&&state.documentId&&<Link className="button button-outline" href={`/app/projects/${projectId}?document=${state.documentId}`}>Отвори го увезениот документ</Link>}
  </form>;
}

export function DeleteDocumentButton({ projectId, documentId, filename }: { projectId: string; documentId: string; filename: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(deleteSourceDocument, initialState);

  useEffect(() => {
    if (state.status !== "success" && !state.refresh) return;
    if (state.status === "success") dialogRef.current?.close();
    router.refresh();
  }, [router, state.refresh, state.status]);

  return <>
    <button className="project-delete-button" type="button" aria-label={`Delete ${filename}`} title="Delete document" onClick={() => dialogRef.current?.showModal()}>
      <Icon name="trash" className="h-4 w-4" />
    </button>
    <dialog ref={dialogRef} className="delete-project-dialog" onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current.close(); }}>
      <form action={formAction} className="delete-project-dialog-content">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="documentId" value={documentId} />
        <h2>Да се избрише овој документ?</h2>
        <p>Ова дејство не може да се врати. Ќе се избрише и оригиналната изворна датотека.</p>
        {state.status === "error" && <p className="delete-project-error" role="alert">{state.message}</p>}
        <div className="delete-project-dialog-actions">
          <button className="button delete-project-cancel" type="button" disabled={pending} onClick={() => dialogRef.current?.close()}>Откажи</button>
          <button className="button delete-project-confirm" type="submit" disabled={pending}>{pending ? "Се брише…" : "Избриши"}</button>
        </div>
      </form>
    </dialog>
  </>;
}

export function DeleteWorkingDocumentButton({ projectId, documentId, filename }: { projectId: string; documentId: string; filename: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(deleteWorkingDocument, initialState);

  useEffect(() => {
    if (state.status !== "success" && !state.refresh) return;
    if (state.status === "success") dialogRef.current?.close();
    router.refresh();
  }, [router, state.refresh, state.status]);

  return <>
    <button className="project-delete-button" type="button" aria-label={`Delete working document ${filename}`} title="Delete working document" onClick={() => dialogRef.current?.showModal()}>
      <Icon name="trash" className="h-4 w-4" />
    </button>
    <dialog ref={dialogRef} className="delete-project-dialog" onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current.close(); }}>
      <form action={formAction} className="delete-project-dialog-content">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="documentId" value={documentId} />
        <h2>Да се избрише овој работен документ?</h2>
        <p>Ова дејство не може да се врати. Генерираниот DOCX ќе се избрише. Изворниот PDF и неговите исправки ќе останат непроменети.</p>
        {state.status === "error" && <p className="delete-project-error" role="alert">{state.message}</p>}
        <div className="delete-project-dialog-actions">
          <button className="button delete-project-cancel" type="button" disabled={pending} onClick={() => dialogRef.current?.close()}>Откажи</button>
          <button className="button delete-project-confirm" type="submit" disabled={pending}>{pending ? "Се брише…" : "Избриши"}</button>
        </div>
      </form>
    </dialog>
  </>;
}

export function TransformDocumentButton({
  projectId,
  documentId,
  transformationStatus,
  buttonLabel,
}: {
  projectId: string;
  documentId: string;
  transformationStatus?: "processing" | "ready" | "failed" | "needs_review";
  buttonLabel?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(transformPdfToWorkingDocument, initialState);

  useEffect(() => {
    if (!state.refresh) return;
    router.refresh();
  }, [router, state.refresh]);

  const processing = pending || transformationStatus === "processing";
  const regenerate = transformationStatus === "ready" || transformationStatus === "failed" || transformationStatus === "needs_review";
  return <form action={formAction} className="document-transform-control">
    <input type="hidden" name="projectId" value={projectId} />
    <input type="hidden" name="documentId" value={documentId} />
    {regenerate && <input type="hidden" name="regenerate" value="true" />}
      <button className="button button-secondary" type="submit" disabled={processing}>
      <Icon name="fileText" />
      {processing ? "Се обработува…" : buttonLabel ?? (regenerate ? "Повторно генерирај Word" : "Претвори во Word")}
    </button>
    {state.status === "error" && <span className="document-transform-error" role="alert">{state.message}</span>}
  </form>;
}

export function RecoverConvertedDocxButton({ projectId, documentId }: { projectId: string; documentId: string }) {
  const [state, formAction, pending] = useActionState(transformPdfToWorkingDocument, initialState);
  return <form action={formAction} className="document-transform-control">
    <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="documentId" value={documentId} />
    <input type="hidden" name="regenerate" value="true" /><input type="hidden" name="recover" value="true" />
    <button className="button button-secondary" type="submit" disabled={pending}><Icon name="fileText" />{pending ? "Се обновува…" : "Обнови DOCX"}</button>
    {state.status === "error" && <span className="document-transform-error" role="alert">{state.message}</span>}
  </form>;
}

export function TranslateDocumentButton({ projectId, documentId, run, currentQaStatus, artifact, report }: {
  projectId: string;
  documentId: string;
  run?: { status: string; total_segments: number; translated_segments: number; document_qa: Record<string, unknown>; error_message: string | null } | null;
  currentQaStatus?: string | null;
  artifact?: { filename: string; url: string } | null;
  report?: { filename: string; url: string } | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(translateCompleteDocument, initialState);
  const [artifactState, artifactAction, artifactPending] = useActionState(reconstructCompletedMk1Docx, initialState);
  const [reportState, reportAction, reportPending] = useActionState(generateTranslationReport, initialState);
  useEffect(() => { if (state.refresh) router.refresh(); }, [router, state.refresh]);
  const active = pending || ["pending", "segmenting", "translating", "document_qa"].includes(run?.status ?? "");
  const progress = run?.total_segments ? Math.round((run.translated_segments / run.total_segments) * 100) : 0;
  const qaStatus = typeof run?.document_qa?.status === "string" ? run.document_qa.status : null;
  return <div className="document-translation-control" aria-label="Дејства за превод на документот">
    <div className="document-action-cell"><form action={formAction}><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="documentId" value={documentId} /><button className="button button-primary" type="submit" disabled={active}><Icon name="spark" />{active ? `Се преведува ${progress}%` : run?.status === "completed" ? "Преведи повторно" : "Преведи"}</button></form></div>
    <div className="document-action-cell">{run?.status === "completed" && artifact?.url ? <a className="button button-secondary" href={artifact.url} target="_blank" rel="noreferrer"><Icon name="download" />Прегледај/преземи MK1</a> : <button className="button button-secondary" type="button" disabled><Icon name="download" />Прегледај/преземи MK1</button>}</div>
    <div className="document-action-cell document-report-actions">{report?.url && <a className="button button-secondary" href={report.url} target="_blank" rel="noreferrer">View Report</a>}<form action={reportAction}><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="documentId" value={documentId} /><button className="button button-secondary" type="submit" disabled={reportPending}>{reportPending ? "Generating…" : report ? "Regenerate Report" : "Generate Report"}</button></form></div>
    <div className="document-action-cell">{run?.status === "completed" && <span className={`document-qa-state qa-${String(currentQaStatus ?? qaStatus ?? "pass").toLowerCase()}`}>QA {currentQaStatus ?? qaStatus ?? "PASS"}</span>}</div>
    <div className="document-action-cell">{run?.status === "completed" && <form action={artifactAction}><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="documentId" value={documentId} /><button className="button button-secondary" type="submit" disabled={artifactPending}><Icon name="refresh" />{artifactPending ? "Preparing MK1…" : artifact ? "Regenerate MK1 DOCX" : "Create MK1 DOCX"}</button></form>}</div>
    <div className="document-action-cell"><button className="button button-secondary" type="button" disabled title="Trados package export is not implemented yet"><Icon name="package" />Trados package</button></div>
    {artifactState.message && <span className={`document-translation-message ${artifactState.status}`} role={artifactState.status === "error" ? "alert" : "status"}>{artifactState.message}</span>}
    {reportState.message && <span className={`document-translation-message ${reportState.status}`} role={reportState.status === "error" ? "alert" : "status"}>{reportState.message}</span>}
    {run?.status === "failed" && <span className="document-translation-error" title={run.error_message ?? undefined}>Stopped at {run.translated_segments}/{run.total_segments}</span>}
    {state.message && <span className={`document-translation-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</span>}
  </div>;
}
