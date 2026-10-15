import type { Project, GeoJSONPolygon } from "@/lib/supabase/types";
import type { SavedOfficialWatercourseReach } from "@/lib/watercourse-reach.functions";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import { validateProjectPolygon } from "@/services/geo-service";
import {
  startStreamInspection,
  type StreamInspectionDependencies,
  type StreamInspectionOptions,
} from "./stream-inspection-start";
import { droneIntakeBaselinePeriod } from "./drone-intake-run";

export interface DroneIntakePrepareInput {
  actorId: string;
  project: Project;
  savedReference: SavedOfficialWatercourseReach | null;
  proposedPolygon: GeoJSONPolygon | null;
  useProposedArea: boolean;
  referenceId: string;
  recordingDate: string;
}
export interface DroneIntakePrepareDependencies {
  getProject(projectId: string): Promise<Project | null>;
  getReference(projectId: string): Promise<SavedOfficialWatercourseReach | null>;
  persistBoundary(projectId: string, polygon: GeoJSONPolygon): Promise<unknown>;
  saveReference(projectId: string, referenceId: string): Promise<SavedOfficialWatercourseReach>;
  inspection: StreamInspectionDependencies;
}
async function referencePin(reference: SavedOfficialWatercourseReach | null) {
  return reference
    ? [
        reference.id,
        reference.zoneId,
        reference.sourceProvider ?? null,
        await baselineSha256(reference.geometry),
      ].join(":")
    : null;
}
/** Only an explicit confirmation calls this. Current saved geography must still match the displayed choice. */
export async function prepareConfirmedDroneIntake(
  input: DroneIntakePrepareInput,
  deps: DroneIntakePrepareDependencies,
  options: StreamInspectionOptions,
) {
  const current = () => {
    if (!options.isCurrent())
      throw new Error("Bruger, sag eller dit valg er ændret. Bekræft stedet igen.");
  };
  const wait = async <T>(promise: Promise<T>): Promise<T> => {
    current();
    const result = await promise;
    current();
    return result;
  };
  const authorize = async () => {
    const access = await wait(deps.inspection.getAccess({ data: { projectId: input.project.id } }));
    if (
      access.userId !== input.actorId ||
      access.projectId !== input.project.id ||
      !access.canPersist
    )
      throw new Error(
        "En projektleder eller redaktør skal bekræfte stedet og forberede undersøgelsen.",
      );
  };
  current();
  const period = droneIntakeBaselinePeriod(input.recordingDate);
  const selected = validateProjectPolygon(
    input.useProposedArea ? input.proposedPolygon : input.project.geometry_polygon,
  );
  if (!selected.valid || !input.referenceId)
    throw new Error("Vælg både et bekræftet område og et vandløb.");
  await authorize();
  const [fresh, freshReference] = await wait(
    Promise.all([deps.getProject(input.project.id), deps.getReference(input.project.id)]),
  );
  if (
    !fresh ||
    fresh.id !== input.project.id ||
    (await wait(baselineSha256(fresh.geometry_polygon))) !==
      (await wait(baselineSha256(input.project.geometry_polygon))) ||
    (await wait(referencePin(freshReference))) !== (await wait(referencePin(input.savedReference)))
  )
    throw new Error("Sagens sted eller reference er ændret. Genindlæs valget, før du fortsætter.");
  const targetHash = await wait(baselineSha256(selected.polygon));
  if (
    input.useProposedArea &&
    targetHash !== (await wait(baselineSha256(fresh.geometry_polygon)))
  ) {
    await authorize();
    current();
    await wait(deps.persistBoundary(input.project.id, selected.polygon));
  }
  if (!freshReference || freshReference.id !== input.referenceId) {
    await authorize();
    current();
    await wait(deps.saveReference(input.project.id, input.referenceId));
  }
  await authorize();
  const [confirmedProject, confirmedReference] = await wait(
    Promise.all([deps.getProject(input.project.id), deps.getReference(input.project.id)]),
  );
  if (
    !confirmedProject ||
    confirmedProject.id !== input.project.id ||
    !confirmedReference ||
    confirmedReference.id !== input.referenceId ||
    (await wait(baselineSha256(confirmedProject.geometry_polygon))) !== targetHash
  )
    throw new Error("Det gemte område og vandløb blev ikke bekræftet. Genindlæs sagen.");
  return wait(
    startStreamInspection(
      {
        actorId: input.actorId,
        projectId: input.project.id,
        projectName: confirmedProject.name,
        geometrySha256: targetHash,
        reference: {
          id: confirmedReference.id,
          zoneId: confirmedReference.zoneId,
          geometrySha256: await wait(baselineSha256(confirmedReference.geometry)),
          ...(confirmedReference.sourceProvider
            ? { sourceProvider: confirmedReference.sourceProvider }
            : {}),
        },
        baselinePeriod: period,
        recordingPeriod: { dateFrom: input.recordingDate, dateTo: input.recordingDate },
      },
      deps.inspection,
      options,
    ),
  );
}
