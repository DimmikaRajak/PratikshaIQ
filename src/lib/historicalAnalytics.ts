import type {
  HistoricalAnalyticsResult,
  QueueReport,
  TimeBucketStat,
  WeekdayStat,
} from '../types/domain';
import { CROWD_SCORE_MAP, scoreToCrowdLevel } from './queueEngine';

export const DEFAULT_MIN_HISTORICAL_OBSERVATIONS = 10;
export const DEFAULT_MIN_BUCKET_OBSERVATIONS = 2;

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// Two-hour civic service windows (IST / local hour buckets)
const TIME_BUCKETS = [
  { index: 0, startHour: 8, endHour: 10, label: '08:00 – 10:00' },
  { index: 1, startHour: 10, endHour: 12, label: '10:00 – 12:00' },
  { index: 2, startHour: 12, endHour: 14, label: '12:00 – 14:00' },
  { index: 3, startHour: 14, endHour: 16, label: '14:00 – 16:00' },
  { index: 4, startHour: 16, endHour: 18, label: '16:00 – 18:00' },
  { index: 5, startHour: 18, endHour: 20, label: '18:00 – 20:00' },
];

/**
 * Calculates genuine historical crowd patterns strictly from real active observations.
 * Refuses to manufacture peak hours or recommendations when sample size is below threshold.
 */
export function calculateHistoricalAnalytics(
  reports: QueueReport[],
  minObservations: number = DEFAULT_MIN_HISTORICAL_OBSERVATIONS,
  minBucketObservations: number = DEFAULT_MIN_BUCKET_OBSERVATIONS
): HistoricalAnalyticsResult {
  const activeReports = reports.filter((r) => r.report_status === 'active');

  if (activeReports.length === 0) {
    return {
      hasSufficientData: false,
      minimumRequiredObservations: minObservations,
      totalObservations: 0,
      dateRangeStart: null,
      dateRangeEnd: null,
      historicalAverageWaitingMinutes: null,
      busiestWeekdays: [],
      weekdayStats: [],
      timeBucketStats: [],
      busiestTimePeriods: [],
      leastCrowdedTimePeriods: [],
    };
  }

  const timestamps = activeReports
    .map((r) => new Date(r.submitted_at).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);

  const dateRangeStart = timestamps.length > 0 ? new Date(timestamps[0]).toISOString() : null;
  const dateRangeEnd =
    timestamps.length > 0 ? new Date(timestamps[timestamps.length - 1]).toISOString() : null;

  const totalWaitSum = activeReports.reduce(
    (sum, r) => sum + (r.waiting_time_min + r.waiting_time_max) / 2,
    0
  );
  const historicalAverageWaitingMinutes =
    Math.round((totalWaitSum / activeReports.length) * 10) / 10;

  if (activeReports.length < minObservations) {
    return {
      hasSufficientData: false,
      minimumRequiredObservations: minObservations,
      totalObservations: activeReports.length,
      dateRangeStart,
      dateRangeEnd,
      historicalAverageWaitingMinutes,
      busiestWeekdays: [],
      weekdayStats: [],
      timeBucketStats: [],
      busiestTimePeriods: [],
      leastCrowdedTimePeriods: [],
    };
  }

  // Group by weekday
  const weekdayMap = new Map<number, { waitSum: number; crowdSum: number; count: number }>();
  // Group by 2-hour window
  const bucketMap = new Map<number, { waitSum: number; crowdSum: number; count: number }>();

  for (const r of activeReports) {
    const dt = new Date(r.submitted_at);
    if (Number.isNaN(dt.getTime())) continue;

    const waitMid = (r.waiting_time_min + r.waiting_time_max) / 2;
    const crowdScore = CROWD_SCORE_MAP[r.crowd_level];

    const day = dt.getDay();
    const wEntry = weekdayMap.get(day) ?? { waitSum: 0, crowdSum: 0, count: 0 };
    wEntry.waitSum += waitMid;
    wEntry.crowdSum += crowdScore;
    wEntry.count += 1;
    weekdayMap.set(day, wEntry);

    const hour = dt.getHours();
    const matchedBucket = TIME_BUCKETS.find((b) => hour >= b.startHour && hour < b.endHour);
    if (matchedBucket) {
      const bEntry = bucketMap.get(matchedBucket.index) ?? {
        waitSum: 0,
        crowdSum: 0,
        count: 0,
      };
      bEntry.waitSum += waitMid;
      bEntry.crowdSum += crowdScore;
      bEntry.count += 1;
      bucketMap.set(matchedBucket.index, bEntry);
    }
  }

  const weekdayStats: WeekdayStat[] = [];
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const stat = weekdayMap.get(dayIndex);
    if (stat && stat.count >= minBucketObservations) {
      const avgCrowd = Math.round((stat.crowdSum / stat.count) * 100) / 100;
      weekdayStats.push({
        dayIndex,
        dayName: WEEKDAY_NAMES[dayIndex],
        avgWaitingMinutes: Math.round((stat.waitSum / stat.count) * 10) / 10,
        avgCrowdScore: avgCrowd,
        crowdLevel: scoreToCrowdLevel(avgCrowd),
        observations: stat.count,
      });
    }
  }

  const timeBucketStats: TimeBucketStat[] = [];
  for (const bucket of TIME_BUCKETS) {
    const stat = bucketMap.get(bucket.index);
    if (stat && stat.count >= minBucketObservations) {
      const avgCrowd = Math.round((stat.crowdSum / stat.count) * 100) / 100;
      timeBucketStats.push({
        bucketIndex: bucket.index,
        label: bucket.label,
        startHour: bucket.startHour,
        endHour: bucket.endHour,
        avgWaitingMinutes: Math.round((stat.waitSum / stat.count) * 10) / 10,
        avgCrowdScore: avgCrowd,
        crowdLevel: scoreToCrowdLevel(avgCrowd),
        observations: stat.count,
      });
    }
  }

  const sortedWeekdaysDesc = [...weekdayStats].sort(
    (a, b) => b.avgWaitingMinutes - a.avgWaitingMinutes || b.avgCrowdScore - a.avgCrowdScore
  );
  const sortedBucketsDesc = [...timeBucketStats].sort(
    (a, b) => b.avgWaitingMinutes - a.avgWaitingMinutes || b.avgCrowdScore - a.avgCrowdScore
  );
  const sortedBucketsAsc = [...timeBucketStats].sort(
    (a, b) => a.avgWaitingMinutes - b.avgWaitingMinutes || a.avgCrowdScore - b.avgCrowdScore
  );

  return {
    hasSufficientData: timeBucketStats.length > 0 || weekdayStats.length > 0,
    minimumRequiredObservations: minObservations,
    totalObservations: activeReports.length,
    dateRangeStart,
    dateRangeEnd,
    historicalAverageWaitingMinutes,
    busiestWeekdays: sortedWeekdaysDesc.slice(0, 2),
    weekdayStats,
    timeBucketStats,
    busiestTimePeriods: sortedBucketsDesc.slice(0, 2),
    leastCrowdedTimePeriods: sortedBucketsAsc.slice(0, 2),
  };
}

export interface VisitPlanEvaluation {
  hasSlotData: boolean;
  slotObservations: number;
  slotAverageWaitingMinutes: number | null;
  slotCrowdLevel: string | null;
  recommendedAlternative: TimeBucketStat | null;
  explanation: string;
}

/**
 * Evaluates a user's preferred visit date & hour strictly against historical reports.
 * Never promises a short queue and never fabricates data for sparse slots.
 */
export function evaluatePlannedVisit(
  reports: QueueReport[],
  preferredDateStr: string,
  preferredHour: number,
  minSlotObservations: number = 3
): VisitPlanEvaluation {
  const analytics = calculateHistoricalAnalytics(reports);
  if (!analytics.hasSufficientData) {
    return {
      hasSlotData: false,
      slotObservations: analytics.totalObservations,
      slotAverageWaitingMinutes: null,
      slotCrowdLevel: null,
      recommendedAlternative: null,
      explanation: `Only ${analytics.totalObservations} historical observation(s) recorded so far. At least ${analytics.minimumRequiredObservations} real citizen reports are required before identifying historical crowd patterns.`,
    };
  }

  const dateObj = new Date(`${preferredDateStr}T12:00:00`);
  const dayOfWeek = dateObj.getDay();

  // Match reports near the selected hour (±1 hour window)
  const matchingHourReports = reports.filter((r) => {
    if (r.report_status !== 'active') return false;
    const d = new Date(r.submitted_at);
    if (Number.isNaN(d.getTime())) return false;
    return Math.abs(d.getHours() - preferredHour) <= 1;
  });

  const matchingDayAndHour = matchingHourReports.filter(
    (r) => new Date(r.submitted_at).getDay() === dayOfWeek
  );

  const chosenSample =
    matchingDayAndHour.length >= minSlotObservations ? matchingDayAndHour : matchingHourReports;

  const bestBucket = analytics.leastCrowdedTimePeriods[0] ?? null;

  if (chosenSample.length < minSlotObservations) {
    return {
      hasSlotData: false,
      slotObservations: chosenSample.length,
      slotAverageWaitingMinutes: null,
      slotCrowdLevel: null,
      recommendedAlternative: bestBucket,
      explanation: bestBucket
        ? `Insufficient historical observations for your exact selected hour (${chosenSample.length} found; need at least ${minSlotObservations}). Across all observed hours, ${bestBucket.label} has historically averaged ${Math.round(bestBucket.avgWaitingMinutes)} minutes across ${bestBucket.observations} observations.`
        : `Insufficient historical observations for the selected time slot (${chosenSample.length} found).`,
    };
  }

  const avgWait =
    Math.round(
      (chosenSample.reduce((s, r) => s + (r.waiting_time_min + r.waiting_time_max) / 2, 0) /
        chosenSample.length) *
        10
    ) / 10;
  const avgCrowd =
    chosenSample.reduce((s, r) => s + CROWD_SCORE_MAP[r.crowd_level], 0) / chosenSample.length;
  const crowdLevel = scoreToCrowdLevel(avgCrowd);

  const isDaySpecific = matchingDayAndHour.length >= minSlotObservations;
  const scopeDesc = isDaySpecific
    ? `${WEEKDAY_NAMES[dayOfWeek]} around ${String(preferredHour).padStart(2, '0')}:00`
    : `this time of day (${String(preferredHour).padStart(2, '0')}:00 ±1h across weekdays)`;

  let explanation = `Based on ${chosenSample.length} historical citizen reports for ${scopeDesc}, the historical average waiting time has been ~${Math.round(avgWait)} minutes. Actual conditions on your visit date may vary.`;

  if (bestBucket && bestBucket.avgWaitingMinutes + 10 < avgWait) {
    explanation += ` Historically, ${bestBucket.label} recorded lower waiting times (~${Math.round(bestBucket.avgWaitingMinutes)} minutes over ${bestBucket.observations} observations), though quieter queues cannot be guaranteed.`;
  }

  return {
    hasSlotData: true,
    slotObservations: chosenSample.length,
    slotAverageWaitingMinutes: avgWait,
    slotCrowdLevel: crowdLevel,
    recommendedAlternative:
      bestBucket && bestBucket.avgWaitingMinutes + 5 < avgWait ? bestBucket : null,
    explanation,
  };
}
