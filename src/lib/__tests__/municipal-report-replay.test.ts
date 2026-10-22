import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { baselineSha256 } from "@/services/baseline/public-baseline-service";
import { makeMunicipalReportFixture } from "@/services/monitoring/__tests__/municipal-report.fixtures";
import {
  compileMunicipalReportV1,
  MUNICIPAL_REPORT_GENERATOR,
  MUNICIPAL_REPORT_GENERATOR_V2,
} from "@/services/monitoring/municipal-report";
import type { MunicipalReportVersion } from "@/services/monitoring/municipal-report-persistence";
import { buildMunicipalReportPdf } from "../municipal-report-pdf";
import { buildMunicipalReportPackage } from "../municipal-report-package";

// Captured before adding v3. These bytes intentionally retain the historical
// compiler and renderer, including original model prose. No artifact is saved.
it("preserves the frozen v1/v2 manifest, PDF and ZIP bytes when new generators are added", async () => {
  const f = await makeMunicipalReportFixture();
  const hashes = [];
  for (const generatorVersion of [MUNICIPAL_REPORT_GENERATOR, MUNICIPAL_REPORT_GENERATOR_V2]) {
    const manifest = await compileMunicipalReportV1({ ...f.input, generatorVersion });
    const version: MunicipalReportVersion = {
      id: "d1000000-0000-4000-8000-000000000001",
      version: 1,
      projectId: f.input.projectId,
      baselineId: f.baseline.id,
      baselineSha256: f.baseline.manifestSha256,
      planId: f.plan.id,
      planSha256: f.plan.manifestSha256,
      roundVersionId: f.round.id,
      roundSha256: f.round.manifestSha256,
      generatorVersion,
      status: "draft_unreviewed",
      reportEligible: false,
      professionallyReviewed: false,
      municipalScopeApproved: false,
      generatedAt: manifest.generatedAt,
      createdAt: manifest.generatedAt,
      createdBy: f.note.createdBy,
      requestId: "d1000000-0000-4000-8000-000000000002",
      manifest,
      manifestSha256: await baselineSha256(manifest),
    };
    const pdf = await buildMunicipalReportPdf(version);
    const zip = await buildMunicipalReportPackage(version, pdf);
    const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
    hashes.push({
      generatorVersion,
      manifest: version.manifestSha256,
      pdf: hash(pdf),
      zip: hash(zip),
    });
  }
  expect(hashes).toMatchInlineSnapshot(`
    [
      {
        "generatorVersion": "municipal-evidence-report/v1",
        "manifest": "581387fdb4516b42889bea84c17ff9eb96fade071eb74e85d5ae960727fee649",
        "pdf": "9fdc450e10a74411997903b5f498544265a95570b2ffc143cbd03d6535a9ef6e",
        "zip": "a30c95e87a94fef7051e2359a2ce7a8f076b3d432fa1142cd0899ca8c50bd15a",
      },
      {
        "generatorVersion": "municipal-evidence-report/v2",
        "manifest": "cdd5e54406a547e56e66e4ee3571738d7f926088e8c96f00a082232962e193a3",
        "pdf": "bd74b9c49a1d17505e1aad0017ccd4246539cb5ee87aa0c12e56c5e44a56d167",
        "zip": "cfb754b8a6a5898a444b966cd8a9408cb8e88639a17a88f6464c9b55a38d54ce",
      },
    ]
  `);
});
