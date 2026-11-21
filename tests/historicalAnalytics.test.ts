import { describe, expect, it } from 'vitest';
import {
  calculateHistoricalAnalytics,
  evaluatePlannedVisit,
} from '../src/lib/historicalAnalytics';
import type { QueueReport } from '../src/types/domain';

function buildHistoricalReport(
  id: string,
  isoDate: string,
  waitMin: number,
  waitMax: number,
  crowd: QueueReport['crowd_level']
): QueueReport {
  return {
    id,
    office_id: 'office-1',
    user_id: `u-${id}`,
    queue_size_min: 10,
    queue_size_max: 20,
    waiting_time_min: waitMin,
    waiting_time_max: waitMax,
    crowd_level: crowd,
    note: null,
    submitted_at: isoDate,
    report_status: 'active',
  };
}

describe('Historical Crowd Analytics & Smart Visit Planner', () => {
  it('refuses to fabricate peak hours when observations are below minimum threshold', () => {
    const sparse: QueueReport[] = [
      buildHistoricalReport('1', '2026-11-16T10:30:00', 30, 60, 'high'),
      buildHistoricalReport('2', '2026-11-17T11:00:00', 15, 30, 'moderate'),
      buildHistoricalReport('3', '2026-11-18T15:00:00', 0, 15, 'low'),
    ];

    const analytics = calculateHistoricalAnalytics(sparse, 10);
    expect(analytics.hasSufficientData).toBe(false);
    expect(analytics.totalObservations).toBe(3);
    expect(analytics.busiestWeekdays).toHaveLength(0);
    expect(analytics.busiestTimePeriods).toHaveLength(0);

    const plan = evaluatePlannedVisit(sparse, '2026-11-23', 10);
    expect(plan.hasSlotData).toBe(false);
    expect(plan.explanation).toContain('At least 10 real citizen reports are required');
  });

  it('identifies busiest and quietest periods accurately when sufficient observations exist', () => {
    const reports: QueueReport[] = [
      // Monday morning 10:00-12:00 very crowded (6 reports)
      buildHistoricalReport('m1', '2026-11-02T10:15:00', 60, 120, 'very_high'),
      buildHistoricalReport('m2', '2026-11-02T11:00:00', 60, 120, 'high'),
      buildHistoricalReport('m3', '2026-11-09T10:30:00', 60, 120, 'very_high'),
      buildHistoricalReport('m4', '2026-11-09T11:15:00', 60, 120, 'high'),
      buildHistoricalReport('m5', '2026-11-16T10:45:00', 60, 120, 'very_high'),
      buildHistoricalReport('m6', '2026-11-16T11:20:00', 60, 120, 'high'),
      // Wednesday afternoon 14:00-16:00 quiet (6 reports)
      buildHistoricalReport('w1', '2026-11-04T14:30:00', 0, 15, 'very_low'),
      buildHistoricalReport('w2', '2026-11-04T15:00:00', 0, 15, 'low'),
      buildHistoricalReport('w3', '2026-11-11T14:15:00', 0, 15, 'very_low'),
      buildHistoricalReport('w4', '2026-11-11T15:30:00', 15, 30, 'low'),
      buildHistoricalReport('w5', '2026-11-18T14:45:00', 0, 15, 'very_low'),
      buildHistoricalReport('w6', '2026-11-18T15:10:00', 0, 15, 'low'),
    ];

    const analytics = calculateHistoricalAnalytics(reports, 10, 2);
    expect(analytics.hasSufficientData).toBe(true);
    expect(analytics.totalObservations).toBe(12);
    expect(analytics.busiestWeekdays[0].dayName).toBe('Monday');
    expect(analytics.busiestTimePeriods[0].label).toBe('10:00 – 12:00');
    expect(analytics.leastCrowdedTimePeriods[0].label).toBe('14:00 – 16:00');

    // Planner check for Monday 10:00 should highlight high wait & recommend 14:00-16:00 without guaranteeing
    const plan = evaluatePlannedVisit(reports, '2026-11-23', 10, 3);
    expect(plan.hasSlotData).toBe(true);
    expect(plan.slotAverageWaitingMinutes).toBeGreaterThan(60);
    expect(plan.recommendedAlternative?.label).toBe('14:00 – 16:00');
    expect(plan.explanation.toLowerCase()).toContain('cannot be guaranteed');
  });
});
