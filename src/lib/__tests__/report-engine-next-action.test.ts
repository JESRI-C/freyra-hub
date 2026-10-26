import { describe, expect, it } from "vitest";
import { getRecommendedNextAction } from "@/lib/report-engine";
import type { Action, Indicator, Project } from "@/lib/supabase/types";
import type { ProjectMediaItem } from "@/lib/platform/media-types";
import type { IoTSensor } from "@/services/iot-simulation-service";

const project = { id: "synthetic-project" } as Project;
const photo: ProjectMediaItem = {
  id: "synthetic-photo",
  projectId: project.id,
  title: "Syntetisk dronefoto",
  category: "drone_image",
  source: "drone",
  url: "",
  uploadedAt: "2026-10-14T08:00:00Z",
  coordinates: { lat: 55.2, lng: 9.4 },
  isReportReady: false,
  status: "uploaded",
  tags: [],
};

function indicator(key: string, value: number): Indicator {
  return {
    id: `synthetic-${key}`,
    project_id: project.id,
    key,
    label: key,
    category: null,
    value,
    unit: "%",
    trend: "flat",
    status: "ok",
    updated_at: "2026-10-14T08:00:00Z",
  };
}

describe("next action when saved investigation progress is unavailable", () => {
  it("directs an empty media overview to the investigation without claiming the whole case has no photos", () => {
    const next = getRecommendedNextAction(project, [], []);
    expect(next).toContain("samlede undersøgelse");
    expect(next).toContain("datagrundlag og fotoimport");
    expect(next).toContain("ingen fotos i denne oversigt");
  });

  it("asks for a location review without treating an upload as evidence of the stream's position", () => {
    const next = getRecommendedNextAction(project, [], [], [{ ...photo, coordinates: undefined }]);
    expect(next).toContain("placering og usikkerhed");
    expect(next).toContain("samlede undersøgelse");
    expect(next).toContain("ikke sammenfald med vandløbet");
    expect(next).not.toContain("Tilføj placering");
  });

  it("requires investigation and professional review for located photos", () => {
    const next = getRecommendedNextAction(project, [], [], [photo]);
    expect(next).toContain("samlede undersøgelse");
    expect(next).toContain("spørgsmål og faglig gennemgang");
    expect(next).not.toContain("Markér");
    expect(next).not.toContain("rapportklar");
    expect(next).not.toContain("klar til næste rapporteringscyklus");
  });

  it("does not let a legacy report-ready flag advance or finish the workflow", () => {
    const unmarked = Object.freeze({ ...photo });
    const marked = Object.freeze({
      ...photo,
      isReportReady: true,
      status: "report_ready" as const,
    });
    const next = getRecommendedNextAction(project, [], [], [unmarked]);
    expect(getRecommendedNextAction(project, [], [], [marked])).toBe(next);
    expect(unmarked.isReportReady).toBe(false);
    expect(marked.isReportReady).toBe(true);
  });

  it.each([0, 69, 100])("does not infer workflow progress from legacy scores of %i", (score) => {
    const scores = [
      indicator("report_readiness", score),
      indicator("data_quality", score),
      indicator("data_confidence", score),
    ];
    expect(getRecommendedNextAction(project, scores, [], [photo])).toBe(
      getRecommendedNextAction(project, [], [], [photo]),
    );
  });

  it("does not send users on field maintenance based on simulated sensor states", () => {
    const sensors = [
      { status: "offline", batteryPercent: 100, simulated: true },
      { status: "online", batteryPercent: 1, simulated: true },
    ] as IoTSensor[];
    expect(getRecommendedNextAction(project, [], [], [photo], sensors)).toBe(
      getRecommendedNextAction(project, [], [], [photo]),
    );
  });

  it("asks for review of actual open high-priority actions without executing their titles as instructions", () => {
    const actions = [
      { priority: "Høj", status: "Lukket", title: "Afsluttet opgave" },
      { priority: "Høj", status: "Åben", title: "Markér foto rapportklart" },
    ] as Action[];
    const previous = JSON.stringify(actions);
    const next = getRecommendedNextAction(project, [], actions, [photo]);
    expect(next).toContain("åbne handlinger med høj prioritet");
    expect(next).toContain("dokumentation og opfølgning");
    expect(next).toContain("samlede undersøgelse");
    expect(next).not.toContain("Markér");
    expect(JSON.stringify(actions)).toBe(previous);
    expect(getRecommendedNextAction(project, [], [actions[0]], [photo])).toBe(
      getRecommendedNextAction(project, [], [], [photo]),
    );
  });
});
