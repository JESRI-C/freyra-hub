import { useQueries, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSurveyRound } from "@/lib/survey-round.functions";
import { getProjectBaseline } from "@/lib/public-baseline.functions";
import { listSurveyRoundMedia } from "@/lib/survey-round-media.functions";
import { listPhotoPointReviews } from "@/lib/photo-point-review.functions";
import { listMunicipalReports } from "@/lib/municipal-report.functions";

/** Read-only presentation of persisted evidence. Never interprets a visited step as approval. */
export function useCaseProgress(actorId: string | undefined, projectId: string, roundId?: string) {
  const getRound = useServerFn(getSurveyRound);
  const getBaseline = useServerFn(getProjectBaseline);
  const listBindings = useServerFn(listSurveyRoundMedia);
  const listReviews = useServerFn(listPhotoPointReviews);
  const listReports = useServerFn(listMunicipalReports);
  const round = useQuery({
    queryKey: ["case-progress-round", actorId, projectId, roundId],
    queryFn: () => getRound({ data: { projectId, roundVersionId: roundId! } }),
    enabled: !!actorId && !!roundId,
    retry: false,
  });
  const selected =
    !round.error && !!round.data && round.data.id === roundId && round.data.projectId === projectId
      ? round.data
      : undefined;
  const baseline = useQuery({
    queryKey: ["case-progress-baseline", actorId, projectId, selected?.baselineId],
    queryFn: () => getBaseline({ data: { projectId, snapshotId: selected!.baselineId } }),
    enabled: !!actorId && !!selected,
    retry: false,
  });
  const snapshot =
    !baseline.error &&
    baseline.data?.id === selected?.baselineId &&
    baseline.data?.manifestSha256 === selected?.baselineSha256
      ? baseline.data
      : undefined;
  const baselineUnavailable =
    (!!roundId && (round.isError || (round.isSuccess && !selected))) ||
    (!!selected && (baseline.isError || (baseline.isSuccess && !snapshot)));
  const bindings = useQuery({
    queryKey: ["case-progress-bindings", actorId, projectId, roundId],
    queryFn: () => listBindings({ data: { projectId, roundVersionId: roundId!, limit: 30 } }),
    enabled: !!actorId && !!selected,
    retry: false,
    staleTime: 0,
  });
  const photos = bindings.error
    ? []
    : (bindings.data?.items ?? []).filter(
        (item) =>
          item.manifest.baselineId === snapshot?.id &&
          item.manifest.baselineSha256 === snapshot?.manifestSha256,
      );
  const reviews = useQueries({
    queries: photos.map((binding) => ({
      queryKey: ["photo-point-reviews", actorId, projectId, binding.id],
      queryFn: () => listReviews({ data: { projectId, bindingId: binding.id } }),
      retry: false,
    })),
  });
  const reviewError = reviews.some((item) => item.isError);
  const reviewed = reviews.filter(
    (item, i) =>
      !item.isError &&
      item.data?.items.some((record) => record.review.bindingSha256 === photos[i].manifestSha256),
  ).length;
  const reviewsComplete =
    !!photos.length &&
    !bindings.data?.nextBeforeVersion &&
    !bindings.isFetching &&
    !reviewError &&
    reviews.every((item) => item.isSuccess && !item.isFetching) &&
    reviewed === photos.length;
  const reports = useQuery({
    queryKey: ["case-progress-reports", actorId, projectId, roundId],
    queryFn: () => listReports({ data: { projectId, roundVersionId: roundId!, limit: 1 } }),
    enabled: !!actorId && !!selected,
    retry: false,
  });
  return {
    snapshot,
    baselineId: snapshot?.id,
    baselineUnavailable,
    hasRound: !!selected,
    reviewed,
    reviewsComplete,
    hasReport: !reports.error && !!reports.data?.items.length,
    isError: baselineUnavailable || !!bindings.error || reviewError || !!reports.error,
    isFetching:
      round.isFetching ||
      baseline.isFetching ||
      bindings.isFetching ||
      reports.isFetching ||
      reviews.some((item) => item.isFetching),
  };
}
