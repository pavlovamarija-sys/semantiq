"use client";

import { useActionState, useEffect, useState } from "react";
import type { LegalQaFinding, LegalQaStatus } from "@/application/translation/deterministic-legal-qa";
import { approveTranslatorDraftAction, generateMk1Action, saveEditedDraftAction, type TranslatorActionState } from "./actions";

const initialState: TranslatorActionState = { status: "idle" };

export function WorkspaceEditor({ projectId, segmentId, initialTarget, versionKey, qaFindings, qaStatus, versionOrigin, versionReviewStatus, approvedAt }: {
  projectId: string;
  segmentId: string;
  initialTarget: string;
  versionKey: string;
  qaFindings: LegalQaFinding[];
  qaStatus: LegalQaStatus;
  versionOrigin: "ai" | "translator" | "reviewer" | null;
  versionReviewStatus: string | null;
  approvedAt: string | null;
}) {
  const [targetText, setTargetText] = useState(initialTarget);
  const [generateState, generateAction, generating] = useActionState(generateMk1Action, initialState);
  const [saveState, saveAction, saving] = useActionState(saveEditedDraftAction, initialState);
  const [approvalState, approvalAction, approving] = useActionState(approveTranslatorDraftAction, initialState);
  useEffect(() => setTargetText(initialTarget), [initialTarget, versionKey]);
  const state = saveState.status !== "idle" ? saveState : generateState;

  const canApprove = versionOrigin === "translator" && versionReviewStatus === "translator_draft";
  const isApproved = versionReviewStatus === "approved";
  return <div className="translator-editor-column">
    <section className="translator-panel translator-target-panel">
      <div className="translator-panel-heading"><div><span className="translator-language">MK1</span><h2>Целен текст за уредување</h2></div><span className={`translator-draft-label ${isApproved ? "approved" : ""}`}>{isApproved ? "Одобрена MK2" : versionOrigin === "translator" ? "Нацрт на преведувачот" : "Неревидиран нацрт од ВИ"}</span></div>
      <form action={saveAction} className="translator-edit-form">
        <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="segmentId" value={segmentId} />
        <textarea name="targetText" value={targetText} onChange={(event) => setTargetText(event.target.value)} rows={14} placeholder="Генерирајте MK1 или внесете македонски нацрт…" aria-label="Македонски нацрт за уредување" />
        <div className="translator-actions">
          <button className="button button-secondary" type="submit" disabled={saving || !targetText.trim()}>{saving ? "Се зачувува…" : "Зачувај го уредениот нацрт"}</button>
        </div>
      </form>
      <form action={generateAction} className="translator-generate-form">
        <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="segmentId" value={segmentId} />
        <button className="button button-primary" type="submit" disabled={generating || saving}>{generating ? "Се генерира MK1…" : "Генерирај MK1"}</button>
      </form>
      {state.message && <p className={`translator-action-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}
      {isApproved && <p className="translator-approval-state">Одобрено {approvedAt ? new Intl.DateTimeFormat("mk-MK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(approvedAt)) : ""}. Оваа историска верзија е непроменета; дополнителните измени создаваат нов нацрт.</p>}
      {canApprove && <details className="translator-approval-confirmation">
        <summary className="button button-approve">Прегледај и одобри ја верзијата</summary>
        <div><strong>Да се одобри токму овој нацрт на преведувачот?</strong><p>Верзијата ќе се означи како одобрена и ќе се создаде повторно употребливо, човечки одобрено знаење во преведувачката меморија. Текстот нема да се измени.</p>{qaStatus === "ERROR" && <p className="approval-blocked">Одобрувањето е блокирано поради детерминистички грешки во контролата на квалитет.</p>}{qaStatus === "WARNING" && <p className="approval-warning">Остануваат предупредувања од контролата на квалитет. Тие може да се прифатат при одобрувањето.</p>}
          <form action={approvalAction}><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="segmentId" value={segmentId} /><input type="hidden" name="translationVersionId" value={versionKey} /><button className="button button-approve" type="submit" disabled={approving || qaStatus === "ERROR"}>{approving ? "Се одобрува…" : "Потврди одобрување"}</button></form>
        </div>
      </details>}
      {approvalState.message && <p className={`translator-action-message ${approvalState.status}`} role={approvalState.status === "error" ? "alert" : "status"}>{approvalState.message}</p>}
    </section>
    <section className="translator-panel translator-qa-panel">
      <div className="translator-panel-heading"><div><span className="translator-kicker">Детерминистички проверки</span><h2>Правна контрола на квалитет</h2></div><span className={`qa-overall qa-${qaStatus.toLowerCase()}`}>{qaStatus}</span></div>
      {qaFindings.length === 0 ? <p className="translator-empty-note">Генерирајте или зачувајте нацрт за да се извршат проверките на правните референци.</p> : <ul className="qa-findings">{qaFindings.map((finding, index) => <li key={`${finding.category}-${index}`} className={`qa-finding qa-${finding.status.toLowerCase()}`}><span>{finding.status}</span><div><strong>{finding.category.replaceAll("_", " ")}</strong><p>{finding.message}</p><small>{finding.sourceValue ?? "—"} → {finding.targetValue ?? "Недостасува"}</small></div></li>)}</ul>}
    </section>
  </div>;
}
