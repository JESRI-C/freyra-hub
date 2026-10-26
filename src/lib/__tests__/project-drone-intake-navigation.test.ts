import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const connectLayout = readFileSync(resolve(process.cwd(), "src/routes/app.connect.tsx"), "utf8");
const projectRoute = readFileSync(
  resolve(process.cwd(), "src/routes/app.projects.$slug.tsx"),
  "utf8",
);
const geometryRoute = readFileSync(
  resolve(process.cwd(), "src/routes/app.projects.geometry.$slug.tsx"),
  "utf8",
);
const mapRoute = readFileSync(
  resolve(process.cwd(), "src/routes/app.projects.map.$slug.tsx"),
  "utf8",
);
const projectsIndexRoute = readFileSync(
  resolve(process.cwd(), "src/routes/app.projects.index.tsx"),
  "utf8",
);
const uploadRoute = readFileSync(
  resolve(process.cwd(), "src/routes/app.connect.upload.tsx"),
  "utf8",
);

describe("project-bound drone intake navigation", () => {
  it("exposes the upload center in the Connect tab navigation", () => {
    expect(connectLayout).toContain('{ to: "/app/connect/upload", label: "Upload", icon: Images }');
    expect(connectLayout).toContain("search={(previous) => previous as never}");
  });

  it("guides a project through boundary before a project-scoped BEFORE upload", () => {
    expect(projectsIndexRoute).toContain('"Vandløbsmonitorering"');
    expect(projectRoute).toContain("<DroneBeforeIntakeCard");
    expect(projectRoute).toContain('to="/app/projects/geometry/$slug"');
    expect(projectRoute).toContain('to="/app/connect/upload"');
    expect(projectRoute).toContain("search={{ project: projectId } as never}");
    expect(projectRoute).toContain("selectOrg(organizationId)");
    expect(projectRoute).toContain("Upload FØR-dronefotos");
    expect(projectRoute).toContain("validateProjectPolygon(project?.geometry_polygon).valid");
  });

  it("keeps RLS-protected project routes on the authenticated browser client", () => {
    for (const routeSource of [projectRoute, geometryRoute, mapRoute]) {
      expect(routeSource).toContain("ssr: false,");
      expect(routeSource).not.toContain('if (typeof window === "undefined") return null;');
    }
  });

  it("offers only project-scoped, finalized monitoring upload downloads", () => {
    expect(uploadRoute).toContain("isUploadDownloadAvailable(upload)");
    expect(uploadRoute).toContain("getUploadDownloadUrl({ uploadId, projectId })");
    expect(uploadRoute).toContain('link.referrerPolicy = "no-referrer"');
    expect(uploadRoute).not.toContain("upload.storage_path");
  });
});
