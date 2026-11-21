import type {
  ConfidenceLevel,
  CrowdLevel,
  QueueCalculationResult,
  QueueEngineConfig,
  QueueReport,
  ReportableCrowdLevel,
} from '../types/domain';

export const DEFAULT_QUEUE_ENGINE_CONFIG: QueueEngineConfig = {
  maxAgeMinutes: 120,
  tier1Minutes: 15,
  tier1Weight: 1.0,
  tier2Minutes: 30,
  tier2Weight: 0.75,
  tier3Minutes: 60,
  tier3Weight: 0.45,
  tier4Weight: 0.2,
  highConfidenceMinReports: 4,
  highConfidenceMinRecent30m: 2,
  highConfidenceMaxStdDev: 0.9,
  mediumConfidenceMinReports: 2,
  mediumConfidenceMinWeight: 1.1,
  mediumConfidenceMaxStdDev: 1.2,
};

export const CROWD_SCORE_MAP: Record<ReportableCrowdLevel, number> = {
  very_low: 1,
  low: 2,
  moderate: 3,
  high: 4,
  very_high: 5,
};

export function scoreToCrowdLevel(score: number): ReportableCrowdLevel {
  if (score < 1.5) return 'very_low';
  if (score < 2.5) return 'low';
  if (score < 3.5) return 'moderate';
  if (score < 4.5) return 'high';
  return 'very_high';
}

export function getRecencyWeight(
  ageMinutes: number,
  config: QueueEngineConfig = DEFAULT_QUEUE_ENGINE_CONFIG
): number {
  if (ageMinutes < 0) return config.tier1Weight;
  if (ageMinutes > config.maxAgeMinutes) return 0;
  if (ageMinutes <= config.tier1Minutes) return config.tier1Weight;
  if (ageMinutes <= config.tier2Minutes) return config.tier2Weight;
  if (ageMinutes <= config.tier3Minutes) return config.tier3Weight;
  return config.tier4Weight;
}

/**
 * Deterministic Queue Intelligence Engine.
 * Mirrors PostgreSQL `recalculate_office_aggregate` logic exactly so client verification,
 * unit tests, and server recalculations stay 100% consistent.
 *
 * Rules:
 * - Only `active` reports within `config.maxAgeMinutes` (default 120m) are included.
 * - Multiple reports from the same user within the window are deduplicated (latest wins)
 *   so one contributor cannot artificially inflate confidence.
 * - Recent reports receive higher recency weights; contradictory reports increase standard
 *   deviation and reduce confidence.
 */
export function calculateQueueAggregate(
  reports: QueueReport[],
  now: Date = new Date(),
  config: QueueEngineConfig = DEFAULT_QUEUE_ENGINE_CONFIG
): QueueCalculationResult {
  const nowMs = now.getTime();
  const maxAgeMs = config.maxAgeMinutes * 60 * 1000;

  // 1. Filter to active, non-expired reports
  const validReports = reports.filter((r) => {
    if (r.report_status !== 'active') return false;
    const submittedMs = new Date(r.submitted_at).getTime();
    if (Number.isNaN(submittedMs)) return false;
    const ageMs = nowMs - submittedMs;
    return ageMs <= maxAgeMs && ageMs >= -60_000; // allow small clock drift up to 60s
  });

  if (validReports.length === 0) {
    return {
      current_crowd_level: 'unknown',
      estimated_waiting_minutes: null,
      reported_waiting_range: null,
      average_queue_size: null,
      confidence_level: 'no_data',
      recent_report_count: 0,
      total_weight: 0,
      crowd_std_dev: 0,
      last_report_at: null,
      display_mode: 'no_data',
      calculated_at: now.toISOString(),
    };
  }

  // 2. Deduplicate per user (keep latest report per user_id if present; anonymous reports stay distinct by id)
  const sortedDesc = [...validReports].sort(
    (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
  );

  const deduped: QueueReport[] = [];
  const seenUsers = new Set<string>();

  for (const report of sortedDesc) {
    const key = report.user_id ? `u:${report.user_id}` : `r:${report.id}`;
    if (!seenUsers.has(key)) {
      seenUsers.add(key);
      deduped.push(report);
    }
  }

  let totalWeight = 0;
  let weightedWaitSum = 0;
  let weightedQueueSum = 0;
  let weightedCrowdSum = 0;
  let recent30mCount = 0;
  const crowdScores: number[] = [];

  for (const r of deduped) {
    const ageMinutes = Math.max(0, (nowMs - new Date(r.submitted_at).getTime()) / 60_000);
    const weight = getRecencyWeight(ageMinutes, config);
    if (weight <= 0) continue;

    if (ageMinutes <= config.tier2Minutes) {
      recent30mCount += 1;
    }

    const waitMid = (r.waiting_time_min + r.waiting_time_max) / 2;
    const queueMid = (r.queue_size_min + r.queue_size_max) / 2;
    const crowdScore = CROWD_SCORE_MAP[r.crowd_level];

    totalWeight += weight;
    weightedWaitSum += waitMid * weight;
    weightedQueueSum += queueMid * weight;
    weightedCrowdSum += crowdScore * weight;
    crowdScores.push(crowdScore);
  }

  const count = crowdScores.length;
  if (count === 0 || totalWeight === 0) {
    return {
      current_crowd_level: 'unknown',
      estimated_waiting_minutes: null,
      reported_waiting_range: null,
      average_queue_size: null,
      confidence_level: 'no_data',
      recent_report_count: 0,
      total_weight: 0,
      crowd_std_dev: 0,
      last_report_at: null,
      display_mode: 'no_data',
      calculated_at: now.toISOString(),
    };
  }

  const meanCrowd = crowdScores.reduce((acc, v) => acc + v, 0) / count;
  const variance =
    crowdScores.reduce((acc, v) => acc + Math.pow(v - meanCrowd, 2), 0) / count;
  const stdDev = Math.sqrt(variance);

  const estimatedWait = Math.round((weightedWaitSum / totalWeight) * 10) / 10;
  const averageQueue = Math.round((weightedQueueSum / totalWeight) * 10) / 10;
  const crowdLevel: CrowdLevel = scoreToCrowdLevel(weightedCrowdSum / totalWeight);

  let confidence: ConfidenceLevel;
  if (
    count >= config.highConfidenceMinReports &&
    recent30mCount >= config.highConfidenceMinRecent30m &&
    stdDev <= config.highConfidenceMaxStdDev
  ) {
    confidence = 'high';
  } else if (
    count >= config.mediumConfidenceMinReports &&
    totalWeight >= config.mediumConfidenceMinWeight &&
    stdDev <= config.mediumConfidenceMaxStdDev
  ) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  const latestReport = deduped[0];

  return {
    current_crowd_level: crowdLevel,
    estimated_waiting_minutes: estimatedWait,
    reported_waiting_range:
      count === 1
        ? { min: latestReport.waiting_time_min, max: latestReport.waiting_time_max }
        : null,
    average_queue_size: averageQueue,
    confidence_level: confidence,
    recent_report_count: count,
    total_weight: Math.round(totalWeight * 100) / 100,
    crowd_std_dev: Math.round(stdDev * 100) / 100,
    last_report_at: latestReport.submitted_at,
    display_mode: count === 1 ? 'single_report' : 'estimated',
    calculated_at: now.toISOString(),
  };
}

/**
 * Formats waiting time transparently, distinguishing:
 * - No data
 * - User-reported range (single recent report)
 * - System-calculated weighted estimate (multiple consistent reports)
 */
export function formatWaitingTimeSummary(
  calc: QueueCalculationResult,
  lang: 'en' | 'hi' = 'en'
): { headline: string; subtext: string; sourceType: 'none' | 'user_reported' | 'system_estimated' } {
  if (calc.display_mode === 'no_data' || calc.recent_report_count === 0) {
    return {
      headline:
        lang === 'hi'
          ? 'प्रतीक्षा समय उपलब्ध नहीं है।'
          : 'Waiting time unavailable.',
      subtext:
        lang === 'hi'
          ? 'पहली रिपोर्ट साझा करने वाले बनें।'
          : 'Be the first to report.',
      sourceType: 'none',
    };
  }

  if (calc.display_mode === 'single_report' && calc.reported_waiting_range) {
    const { min, max } = calc.reported_waiting_range;
    const rangeLabel = formatRangeLabel(min, max, lang);
    return {
      headline:
        lang === 'hi'
          ? `नागरिक द्वारा रिपोर्ट समय: ${rangeLabel}`
          : `Reported waiting time: ${rangeLabel}`,
      subtext:
        lang === 'hi'
          ? '1 हालिया रिपोर्ट पर आधारित (निश्चित समय नहीं)'
          : 'Based on 1 recent report (not guaranteed)',
      sourceType: 'user_reported',
    };
  }

  const roundedMinutes = Math.round(calc.estimated_waiting_minutes ?? 0);
  const formatted = formatMinutesReadable(roundedMinutes, lang);
  return {
    headline:
      lang === 'hi'
        ? `अनुमानित प्रतीक्षा समय: ${formatted}`
        : `Estimated waiting time: ${formatted}`,
    subtext:
      lang === 'hi'
        ? `${calc.recent_report_count} हालिया रिपोर्ट पर आधारित प्रणाली गणना`
        : `System-calculated from ${calc.recent_report_count} recent reports`,
    sourceType: 'system_estimated',
  };
}

export function formatRangeLabel(min: number, max: number, lang: 'en' | 'hi' = 'en'): string {
  if (min === 0 && max <= 15) {
    return lang === 'hi' ? '15 मिनट से कम' : 'Less than 15 minutes';
  }
  if (min >= 120) {
    return lang === 'hi' ? '2 घंटे से अधिक' : 'More than 2 hours';
  }
  if (min >= 60 && max >= 120) {
    return lang === 'hi' ? '1–2 घंटे' : '1–2 hours';
  }
  return lang === 'hi' ? `${min}–${max} मिनट` : `${min}–${max} minutes`;
}

export function formatMinutesReadable(minutes: number, lang: 'en' | 'hi' = 'en'): string {
  if (minutes < 60) {
    return lang === 'hi' ? `${minutes} मिनट` : `${minutes} minutes`;
  }
  const hrs = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) {
    return lang === 'hi' ? `${hrs} घंटे` : `${hrs} ${hrs === 1 ? 'hour' : 'hours'}`;
  }
  return lang === 'hi' ? `${hrs} घं ${rem} मि` : `${hrs}h ${rem}m`;
}
