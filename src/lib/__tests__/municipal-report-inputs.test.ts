import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadMunicipalReportInputs,
  type MunicipalReportClient,
} from "../municipal-report.functions";
import { makeMunicipalReportFixture } from "@/services/monitoring/__tests__/municipal-report.fixtures";
import { baselineSha256, canonicalBaselineJson } from "@/services/baseline/public-baseline-service";
import {
  compileMunicipalReportV1,
  MUNICIPAL_REPORT_GENERATOR_V2,
} from "@/services/monitoring/municipal-report";
import {
  droneImageInspectionCanonicalText,
  droneImageInspectionAnswersCanonicalText,
  DRONE_IMAGE_INSPECTION_SELECT,
  DRONE_IMAGE_INSPECTION_ANSWERS_SELECT,
  type DroneImageInspectionRecord,
  type DroneImageInspectionAnswersRecord,
} from "@/services/monitoring/drone-image-inspection-persistence";

type Row = Record<string, unknown>;
type Result = { data: unknown; error: unknown };
type Query = ReturnType<MunicipalReportClient["from"]>;
type Fixture = Awaited<ReturnType<typeof makeMunicipalReportFixture>>;
interface QueryTrace {
  table: string;
  columns: string;
  equals: { column: string; value: unknown }[];
  included: { column: string; values: string[] }[];
  lessThan: { column: string; value: number }[];
  ordering: { column: string; ascending: boolean }[];
  cap: number | null;
}
type ReadFault = (query: QueryTrace, rows: Row[]) => Row[];
const OTHER_PROJECT = "d1000000-0000-4000-8000-000000000001";
const OTHER_BASELINE = "d2000000-0000-4000-8000-000000000001";
const NEW_INSPECTION = "d3000000-0000-4000-8000-000000000001";
const NEW_ANSWER = "d4000000-0000-4000-8000-000000000001";
const NEW_AT = "2026-10-15T10:00:00.000Z";

/** The fake applies actual SDK filters; faults deliberately simulate a bad read response. */
class ReadOnlyClient implements MunicipalReportClient {
  readonly queries: QueryTrace[] = [];
  readonly rpc = vi.fn(async (): Promise<Result> => {
    throw new Error("A report input read must never create a privileged write.");
  });

  constructor(
    readonly tables: Record<string, Row[]>,
    readonly fault?: ReadFault,
  ) {}

  from(table: string): Query {
    const trace: QueryTrace = {
      table,
      columns: "*",
      equals: [],
      included: [],
      lessThan: [],
      ordering: [],
      cap: null,
    };
    this.queries.push(trace);
    return new ReadQuery(this, trace);
  }

  result(trace: QueryTrace, single = false): Result {
    let rows = structuredClone(this.tables[trace.table] ?? []).filter(
      (row) =>
        trace.equals.every(({ column, value }) => row[column] === value) &&
        trace.included.every(({ column, values }) => values.includes(String(row[column]))) &&
        trace.lessThan.every(({ column, value }) => Number(row[column]) < value),
    );
    for (const { column, ascending } of trace.ordering)
      rows.sort((a, b) => {
        const order = String(a[column]).localeCompare(String(b[column]), undefined, {
          numeric: true,
        });
        return ascending ? order : -order;
      });
    if (trace.cap !== null) rows = rows.slice(0, trace.cap);
    if (trace.columns !== "*")
      rows = rows.map((row) =>
        Object.fromEntries(trace.columns.split(",").map((column) => [column, row[column]])),
      );
    rows = this.fault?.(trace, rows) ?? rows;
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  }
}

class ReadQuery implements Query {
  constructor(
    private readonly client: ReadOnlyClient,
    private readonly trace: QueryTrace,
  ) {}

  select(columns: string): this {
    this.trace.columns = columns;
    return this;
  }
  eq(column: string, value: unknown): this {
    this.trace.equals.push({ column, value });
    return this;
  }
  in(column: string, values: string[]): this {
    this.trace.included.push({ column, values: [...values] });
    return this;
  }
  order(column: string, options: { ascending: boolean }): this {
    this.trace.ordering.push({ column, ascending: options.ascending });
    return this;
  }
  limit(count: number): this {
    this.trace.cap = count;
    return this;
  }
  lt(column: string, value: number): this {
    this.trace.lessThan.push({ column, value });
    return this;
  }
  async maybeSingle(): Promise<Result> {
    return this.client.result(this.trace, true);
  }
  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.client.result(this.trace)).then(onfulfilled, onrejected);
  }
}

function inspectionRow(record: DroneImageInspectionRecord): Row {
  return {
    id: record.id,
    project_id: record.projectId,
    media_id: record.mediaId,
    created_by: record.createdBy,
    request_id: record.requestId,
    provider: record.provider,
    model_id: record.modelId,
    prompt_version: record.promptVersion,
    method_version: record.methodVersion,
    original_sha256: record.originalSha256,
    original_validation_sha256: record.originalValidationSha256,
    storage_object_id: record.storageObjectId,
    storage_object_version: record.storageObjectVersion,
    storage_object_updated_at: record.storageObjectUpdatedAt,
    source_snapshot_id: record.sourceSnapshotId,
    source_snapshot_sha256: record.sourceSnapshotHash,
    status: record.status,
    attempt_count: record.attemptCount,
    lease_expires_at: record.leaseExpiresAt,
    result: record.result,
    result_text: record.result ? droneImageInspectionCanonicalText(record.result) : null,
    result_sha256: record.resultSha256,
    failure_code: record.failureCode,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    completed_at: record.completedAt,
  };
}

function answerRow(record: DroneImageInspectionAnswersRecord): Row {
  return {
    id: record.id,
    project_id: record.projectId,
    inspection_id: record.inspectionId,
    inspection_result_sha256: record.inspectionResultSha256,
    created_by: record.createdBy,
    request_id: record.requestId,
    answers: record.answers,
    answers_text: droneImageInspectionAnswersCanonicalText(record.answers),
    answers_sha256: record.answersSha256,
    status: record.status,
    professionally_reviewed: record.professionallyReviewed,
    report_eligible: record.reportEligible,
    created_at: record.createdAt,
  };
}

function fixtureTables(f: Fixture): Record<string, Row[]> {
  return {
    survey_round_versions: [f.row],
    project_baseline_snapshots: [
      {
        id: f.baseline.id,
        project_id: f.baseline.projectId,
        version_no: f.baseline.version,
        created_at: f.baseline.createdAt,
        created_by: f.baseline.createdBy,
        request_id: f.baseline.requestId,
        manifest: f.baseline.manifest,
        manifest_sha256: f.baseline.manifestSha256,
      },
    ],
    verification_plan_versions: [f.planRow],
    survey_round_media_versions: [f.bindingRow],
    project_media: [f.media],
    uploads: [
      {
        id: f.media.source_upload_id,
        project_id: f.baseline.projectId,
        uploaded_by: f.validation.original.object.owner_id,
        file_name: "original.jpg",
        original_file_name: "original.jpg",
        file_size: f.media.file_size_bytes,
        mime_type: "image/jpeg",
        upload_type: "drone_photo",
        storage_path: f.media.file_path,
        intent_request_id: f.bindingInput.requestId,
        received_at: f.validation.original.receivedAt,
        original_validation: f.validation,
        original_validation_sha256: f.media.original_validation_sha256,
      },
    ],
    survey_round_note_versions: [f.noteRow],
    drone_image_inspections: [inspectionRow(f.inspection)],
    drone_image_inspection_answer_versions: [answerRow(f.answer)],
    municipal_report_latest_answers: [answerRow(f.answer)],
  };
}

async function newerAnswer(f: Fixture): Promise<DroneImageInspectionAnswersRecord> {
  const answers = [
    { ...f.answer.answers[0], note: "Et nyere svar må ikke ændre den allerede gemte rapport." },
  ];
  return {
    ...f.answer,
    id: NEW_ANSWER,
    requestId: NEW_ANSWER,
    createdAt: NEW_AT,
    answers,
    answersSha256: await baselineSha256(answers),
  };
}

function load(client: ReadOnlyClient, f: Fixture, frozen = false) {
  return loadMunicipalReportInputs(
    client,
    f.baseline.projectId,
    f.round.id,
    f.input.generatedAt,
    frozen ? f.manifest : undefined,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("No network in immutable replay."))),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("municipal report input graph reads", () => {
  it("freezes exact human decisions and replays them after a newer decision", async () => {
    const f = await makeMunicipalReportFixture();
    const tables = fixtureTables(f);
    const review = {
      schema: "freyra.photo-point-review/v1",
      projectId: f.input.projectId,
      bindingId: f.binding.id,
      bindingSha256: f.binding.manifestSha256,
      mediaId: f.binding.mediaId,
      originalSha256: f.binding.manifest.originalSha256,
      baselineId: f.baseline.id,
      baselineSha256: f.baseline.manifestSha256,
      decision: "confirmed",
      note: "Syntetisk vurdering til test",
      reviewerName: "Testperson",
      inspectionId: f.inspection.id,
      inspectionSha256: f.inspection.resultSha256,
    };
    const firstRow = {
      id: "d8000000-0000-4000-8000-000000000001",
      project_id: f.input.projectId,
      binding_id: f.binding.id,
      reviewed_by: f.note.createdBy,
      request_id: "d8000000-0000-4000-8000-000000000002",
      review,
      review_text: canonicalBaselineJson(review),
      review_sha256: await baselineSha256(review),
      created_at: "2026-10-15T08:00:00.000Z",
    };
    tables.photo_point_review_versions = [firstRow];
    const fresh = await load(new ReadOnlyClient(tables), f);
    const frozen = await compileMunicipalReportV1(fresh);
    expect(frozen.photoPointReviews?.[0].id).toBe(firstRow.id);
    const rejected = { ...review, decision: "rejected", note: "Senere syntetisk afvisning" };
    tables.photo_point_review_versions.push({
      ...firstRow,
      id: "d8000000-0000-4000-8000-000000000003",
      review: rejected,
      review_text: canonicalBaselineJson(rejected),
      review_sha256: await baselineSha256(rejected),
      created_at: "2026-10-15T08:30:00.000Z",
    });
    const newer = await load(new ReadOnlyClient(tables), f);
    expect(newer.photoPointReviews?.[0].review.decision).toBe("rejected");
    const replay = await loadMunicipalReportInputs(
      new ReadOnlyClient(tables),
      f.input.projectId,
      f.round.id,
      f.input.generatedAt,
      frozen,
    );
    expect(await compileMunicipalReportV1(replay)).toEqual(frozen);
    expect(replay.photoPointReviews?.[0].review.decision).toBe("confirmed");
    tables.photo_point_review_versions[0].review_sha256 = "0".repeat(64);
    await expect(
      loadMunicipalReportInputs(
        new ReadOnlyClient(tables),
        f.input.projectId,
        f.round.id,
        f.input.generatedAt,
        frozen,
      ),
    ).rejects.toThrow();
  });

  it("replays the complete canonical graph with real validators and matching hashes", async () => {
    const f = await makeMunicipalReportFixture();
    const client = new ReadOnlyClient(fixtureTables(f));
    const input = await load(client, f);

    expect(input).toEqual({
      ...f.input,
      generatorVersion: MUNICIPAL_REPORT_GENERATOR_V2,
      photoPointReviews: [],
    });
    const report = await compileMunicipalReportV1(input);
    expect(report.generatorVersion).toBe(MUNICIPAL_REPORT_GENERATOR_V2);
    expect(report.photos).toEqual(f.manifest.photos);
    expect(report.planting?.baselineSha256).toBe(f.baseline.manifestSha256);
    expect(
      client.queries.every((query) =>
        query.equals.some(
          ({ column, value }) => column === "project_id" && value === f.baseline.projectId,
        ),
      ),
    ).toBe(true);
    expect(
      client.queries
        .filter((query) => query.included.length > 0)
        .every((query) => query.included.every(({ values }) => values.length <= 30)),
    ).toBe(true);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["foreign project", "extra identity", "missing row"])(
    "rejects a batched canonical original response with %s",
    async (failure) => {
      const f = await makeMunicipalReportFixture();
      const client = new ReadOnlyClient(fixtureTables(f), (query, rows) => {
        if (query.table !== "project_media") return rows;
        if (failure === "foreign project") return [{ ...rows[0], project_id: OTHER_PROJECT }];
        if (failure === "extra identity") return [...rows, { ...rows[0], id: NEW_INSPECTION }];
        return [];
      });

      await expect(load(client, f)).rejects.toThrow();
      expect(client.queries.some((query) => query.table === "drone_image_inspections")).toBe(false);
      expect(client.rpc).not.toHaveBeenCalled();
    },
  );

  it("uses the latest-answer view without reading or capping an old 450-version history", async () => {
    const f = await makeMunicipalReportFixture();
    const latest = await newerAnswer(f);
    const tables = fixtureTables(f);
    tables.drone_image_inspection_answer_versions = Array.from({ length: 450 }, (_, index) => ({
      ...answerRow(f.answer),
      id: `d5000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
    }));
    tables.drone_image_inspection_answer_versions.push(answerRow(latest));
    tables.municipal_report_latest_answers = [answerRow(latest)];
    const client = new ReadOnlyClient(tables);

    const input = await load(client, f);

    expect(input.answers).toEqual([latest]);
    expect(
      client.queries.some((query) => query.table === "drone_image_inspection_answer_versions"),
    ).toBe(false);
    const answerQuery = client.queries.find(
      (query) => query.table === "municipal_report_latest_answers",
    );
    expect(answerQuery).toMatchObject({ columns: DRONE_IMAGE_INSPECTION_ANSWERS_SELECT, cap: 401 });
    expect(answerQuery?.included).toEqual([{ column: "inspection_id", values: [f.inspection.id] }]);
  });

  it("filters completed inspections by the exact baseline before decoding source-bound drafts", async () => {
    const f = await makeMunicipalReportFixture();
    const tables = fixtureTables(f);
    const otherResult = structuredClone(f.inspection.result!);
    otherResult.sourceContext!.snapshotId = OTHER_BASELINE;
    const other = inspectionRow({
      ...f.inspection,
      id: NEW_INSPECTION,
      sourceSnapshotId: OTHER_BASELINE,
      result: otherResult,
      resultSha256: await baselineSha256(otherResult),
      completedAt: NEW_AT,
    });
    const pending = inspectionRow({
      ...f.inspection,
      id: NEW_ANSWER,
      status: "pending",
      leaseExpiresAt: NEW_AT,
      result: null,
      resultSha256: null,
      completedAt: null,
    });
    tables.drone_image_inspections.push(other, pending);
    const client = new ReadOnlyClient(tables);

    const input = await load(client, f);

    expect(input.inspections).toEqual([f.inspection]);
    expect(input.answers).toEqual([f.answer]);
    const query = client.queries.find((item) => item.table === "drone_image_inspections");
    expect(query?.columns).toBe(DRONE_IMAGE_INSPECTION_SELECT);
    expect(query?.equals).toEqual(
      expect.arrayContaining([
        { column: "status", value: "completed" },
        { column: "source_snapshot_id", value: f.baseline.id },
      ]),
    );
  });

  it("reopens a frozen report with its pinned old answers despite a newer view and assessment", async () => {
    const f = await makeMunicipalReportFixture();
    const tables = fixtureTables(f);
    const latest = await newerAnswer(f);
    tables.drone_image_inspection_answer_versions.push(answerRow(latest));
    tables.municipal_report_latest_answers = [answerRow(latest)];
    tables.drone_image_inspections.push(
      inspectionRow({
        ...f.inspection,
        id: NEW_INSPECTION,
        completedAt: NEW_AT,
      }),
    );
    tables.project_baseline_snapshots.push({
      ...tables.project_baseline_snapshots[0],
      id: OTHER_BASELINE,
      version_no: 2,
    });
    const client = new ReadOnlyClient(tables);

    const input = await load(client, f, true);

    expect(input.baseline.id).toBe(f.baseline.id);
    expect(input.inspections).toEqual([f.inspection]);
    expect(input.answers).toEqual([f.answer]);
    expect(await compileMunicipalReportV1(input)).toEqual(f.manifest);
    expect(client.queries.some((query) => query.table === "municipal_report_latest_answers")).toBe(
      false,
    );
    expect(
      client.queries.find((query) => query.table === "drone_image_inspection_answer_versions")
        ?.included,
    ).toEqual([{ column: "id", values: [f.answer.id] }]);
    expect(
      client.queries.find((query) => query.table === "drone_image_inspections")?.included,
    ).toEqual([{ column: "id", values: [f.inspection.id] }]);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
