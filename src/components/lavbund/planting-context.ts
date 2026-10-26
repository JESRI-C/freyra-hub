import type {
  PublicBaselineSnapshot,
  PublicBaselineSummary,
} from "@/services/baseline/public-baseline-types";
import type { SurveyRoundVersion } from "@/services/baseline/survey-round-persistence";

export interface PlantingContextReaders {
  listBaselines(projectId: string): Promise<PublicBaselineSummary[]>;
  getBaseline(projectId: string, snapshotId: string): Promise<PublicBaselineSnapshot | null>;
  getRound(
    projectId: string,
    roundVersionId: string,
  ): Promise<Pick<SurveyRoundVersion, "id" | "projectId" | "baselineId" | "baselineSha256"> | null>;
}

/** A selected investigation never silently falls back to a newer baseline. Readers use caller RLS. */
export async function loadPlantingContext(
  projectId: string,
  selectedRoundId: string | undefined,
  readers: PlantingContextReaders,
): Promise<PublicBaselineSnapshot | null> {
  let baselineId: string;
  let baselineSha256: string;
  if (selectedRoundId !== undefined) {
    const round = await readers.getRound(projectId, selectedRoundId);
    if (!round || round.projectId !== projectId || round.id !== selectedRoundId)
      throw new Error("Undersøgelsens datagrundlag kunne ikke bekræftes.");
    baselineId = round.baselineId;
    baselineSha256 = round.baselineSha256;
  } else {
    const latest = (await readers.listBaselines(projectId))[0];
    if (!latest) return null;
    if (latest.projectId !== projectId) throw new Error("Datagrundlaget matcher ikke denne sag.");
    baselineId = latest.id;
    baselineSha256 = latest.manifestSha256;
  }
  const snapshot = await readers.getBaseline(projectId, baselineId);
  if (
    !snapshot ||
    snapshot.projectId !== projectId ||
    snapshot.id !== baselineId ||
    snapshot.manifestSha256 !== baselineSha256
  )
    throw new Error("Den gemte kildeversion kunne ikke bekræftes.");
  return snapshot;
}
