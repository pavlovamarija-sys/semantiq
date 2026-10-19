import { batches, hashText, validateBatch, type CanonicalMk1Unit, type Mk1BatchCheckpoint } from "./canonical-mk1.ts";

export interface PersistedMk1Checkpoint {
  batchOrdinal: number;
  firstOrdinal: number;
  lastOrdinal: number;
  canonicalTuIds: string[];
  sourceHashes: string[];
  translations: Array<{ id: string; ordinal: number; targetText: string; targetHash: string }>;
  model: string;
  promptVersion: string;
  responseId: string;
  inputTokens: number | null;
  outputTokens: number | null;
  status: string;
}

export interface PersistedMk1Translation {
  canonicalTuId: string;
  ordinal: number;
  sourceSha256: string;
  targetText: string;
  targetSha256: string;
  batchOrdinal: number;
  qaStatus: string;
}

export function recoverCanonicalMk1(
  units: CanonicalMk1Unit[], checkpoints: PersistedMk1Checkpoint[], translations: PersistedMk1Translation[],
  expected: { model: string; promptVersion: string },
) {
  const groups = batches(units);
  if (checkpoints.length !== groups.length) throw Error("MK1 recovery checkpoint coverage mismatch");
  if (translations.length !== units.length) throw Error("MK1 recovery translation coverage mismatch");
  const translationByOrdinal = new Map(translations.map((item) => [item.ordinal, item]));
  if (translationByOrdinal.size !== units.length) throw Error("MK1 recovery contains duplicate translation ordinals");
  const recovered: Mk1BatchCheckpoint[] = [];
  const targets: Mk1BatchCheckpoint["targets"] = [];
  for (let batchOrdinal = 0; batchOrdinal < groups.length; batchOrdinal++) {
    const group = groups[batchOrdinal]; const checkpoint = checkpoints[batchOrdinal];
    if (!checkpoint || checkpoint.batchOrdinal !== batchOrdinal || checkpoint.status !== "PASS"
      || checkpoint.firstOrdinal !== group[0].ordinal || checkpoint.lastOrdinal !== group.at(-1)!.ordinal
      || checkpoint.model !== expected.model || checkpoint.promptVersion !== expected.promptVersion
      || !checkpoint.responseId || checkpoint.translations.length !== group.length
      || checkpoint.canonicalTuIds.length !== group.length || checkpoint.sourceHashes.length !== group.length) {
      throw Error(`MK1 recovery checkpoint identity mismatch at batch ${batchOrdinal}`);
    }
    for (let index = 0; index < group.length; index++) {
      if (checkpoint.canonicalTuIds[index] !== group[index].id || checkpoint.sourceHashes[index] !== group[index].sourceHash) {
        throw Error(`MK1 recovery source lineage mismatch at batch ${batchOrdinal}`);
      }
    }
    const validated = validateBatch(group, { responseId: checkpoint.responseId,
      targets: checkpoint.translations.map((item) => ({ id:item.id,ordinal:item.ordinal,targetText:item.targetText })),
      usage: { inputTokens:checkpoint.inputTokens,outputTokens:checkpoint.outputTokens } });
    for (const target of validated) {
      const persisted = translationByOrdinal.get(target.ordinal);
      if (target.targetHash !== checkpoint.translations.find((item) => item.id === target.id)?.targetHash
        || !persisted || persisted.canonicalTuId !== target.id || persisted.sourceSha256 !== units[target.ordinal].sourceHash
        || persisted.targetText !== target.targetText || persisted.targetSha256 !== target.targetHash
        || persisted.batchOrdinal !== batchOrdinal || persisted.qaStatus !== "PASS") {
        throw Error(`MK1 recovery persisted translation mismatch at TU ${target.ordinal}`);
      }
    }
    recovered.push({ batchOrdinal,firstOrdinal:checkpoint.firstOrdinal,lastOrdinal:checkpoint.lastOrdinal,
      responseId:checkpoint.responseId,inputTokens:checkpoint.inputTokens,outputTokens:checkpoint.outputTokens,targets:validated });
    targets.push(...validated);
  }
  if (targets.length !== units.length || targets.some((target, ordinal) => target.ordinal !== ordinal)) {
    throw Error("MK1 recovery ordered coverage mismatch");
  }
  return { targets, batches:recovered, targetUnitsSha256:hashText(JSON.stringify(targets.map((target) =>
    ({ id:target.id,ordinal:target.ordinal,targetHash:target.targetHash })))) };
}
