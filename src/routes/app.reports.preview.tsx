import { createFileRoute } from "@tanstack/react-router";
import { ReportWorkspace, reportSearch } from "@/components/reports/ReportWorkspace";
export const Route = createFileRoute("/app/reports/preview")({
  validateSearch: reportSearch,
  component: () => <ReportWorkspace mode="preview" />,
});
