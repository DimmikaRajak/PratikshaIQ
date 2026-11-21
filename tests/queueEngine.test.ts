import { describe, expect, it } from 'vitest';
import {
  calculateQueueAggregate,
  formatWaitingTimeSummary,
  getRecencyWeight,
} from '../src/lib/queueEngine';
import type { QueueReport } from '../src/types/domain';

function makeReport(
  overrides: Partial<QueueReport> & { minutesAgo: number; id: string }
): QueueReport {
  const { minutesAgo, ...rest } = overrides;
  const now = new Date('2026-11-21T10:00:00.000Z');
  const submitted = new Date(now.getTime() - minutesAgo * 60_000).toISOString();
  return {
    office_id: 'office-1',
    user_id: `user-${overrides.id}`,
    queue_size_min: 11,
    queue_size_max: 20,
    waiting_time_min: 15,
    waiting_time_max: 30,
    crowd_level: 'moderate',
    note: null,
    submitted_at: submitted,
    report_status: 'active',
    ...rest,
  };
}

const FIXED_NOW = new Date('2026-11-21T10:00:00.000Z');

describe('Queue Intelligence Engine', () => {
  it('returns honest no_data state when there are zero reports', () => {
    const result = calculateQueueAggregate([], FIXED_NOW);
    expect(result.current_crowd_level).toBe('unknown');
    expect(result.confidence_level).toBe('no_data');
    expect(result.estimated_waiting_minutes).toBeNull();
    expect(result.recent_report_count).toBe(0);

    const summary = formatWaitingTimeSummary(result, 'en');
    expect(summary.sourceType).toBe('none');
    expect(summary.headline).toContain('Waiting time unavailable');
  });

  it('excludes reports older than 2 hours (report expiration)', () => {
    const expired = [
      makeReport({ id: 'r1', minutesAgo: 125, crowd_level: 'very_high' }),
      makeReport({ id: 'r2', minutesAgo: 180, crowd_level: 'high' }),
    ];
    const result = calculateQueueAggregate(expired, FIXED_NOW);
    expect(result.recent_report_count).toBe(0);
    expect(result.current_crowd_level).toBe('unknown');
    expect(result.confidence_level).toBe('no_data');
  });

  it('excludes hidden and rejected reports from live calculations', () => {
    const reports = [
      makeReport({ id: 'r1', minutesAgo: 5, report_status: 'hidden', crowd_level: 'very_high' }),
      makeReport({ id: 'r2', minutesAgo: 10, report_status: 'rejected', crowd_level: 'very_high' }),
    ];
    const result = calculateQueueAggregate(reports, FIXED_NOW);
    expect(result.recent_report_count).toBe(0);
    expect(result.confidence_level).toBe('no_data');
  });

  it('assigns single recent report low confidence and displays reported range (not system estimate)', () => {
    const reports = [
      makeReport({
        id: 'r1',
        minutesAgo: 10,
        waiting_time_min: 30,
        waiting_time_max: 60,
        crowd_level: 'high',
      }),
    ];
    const result = calculateQueueAggregate(reports, FIXED_NOW);
    expect(result.recent_report_count).toBe(1);
    expect(result.confidence_level).toBe('low');
    expect(result.display_mode).toBe('single_report');
    expect(result.reported_waiting_range).toEqual({ min: 30, max: 60 });

    const summary = formatWaitingTimeSummary(result, 'en');
    expect(summary.sourceType).toBe('user_reported');
    expect(summary.headline).toContain('30–60 minutes');
  });

  it('weights recent reports higher than older reports within 2 hours', () => {
    expect(getRecencyWeight(10)).toBe(1.0);
    expect(getRecencyWeight(25)).toBe(0.75);
    expect(getRecencyWeight(45)).toBe(0.45);
    expect(getRecencyWeight(90)).toBe(0.2);
    expect(getRecencyWeight(121)).toBe(0);

    const reports = [
      // Very recent: 15-30m (midpoint 22.5, weight 1.0)
      makeReport({
        id: 'r1',
        minutesAgo: 5,
        waiting_time_min: 15,
        waiting_time_max: 30,
        crowd_level: 'low',
      }),
      // Older 90m ago: 60-120m (midpoint 90, weight 0.2)
      makeReport({
        id: 'r2',
        minutesAgo: 90,
        waiting_time_min: 60,
        waiting_time_max: 120,
        crowd_level: 'high',
      }),
    ];

    const result = calculateQueueAggregate(reports, FIXED_NOW);
    // Weighted average = (22.5 * 1.0 + 90 * 0.2) / 1.2 = 33.75 -> 33.8
    expect(result.estimated_waiting_minutes).toBeCloseTo(33.8, 1);
  });

  it('deduplicates multiple reports from the same user so one user cannot inflate confidence', () => {
    const reports = [
      makeReport({ id: 'r1', user_id: 'same-user', minutesAgo: 2, crowd_level: 'high' }),
      makeReport({ id: 'r2', user_id: 'same-user', minutesAgo: 10, crowd_level: 'high' }),
      makeReport({ id: 'r3', user_id: 'same-user', minutesAgo: 20, crowd_level: 'high' }),
      makeReport({ id: 'r4', user_id: 'same-user', minutesAgo: 30, crowd_level: 'high' }),
    ];

    const result = calculateQueueAggregate(reports, FIXED_NOW);
    expect(result.recent_report_count).toBe(1);
    expect(result.confidence_level).toBe('low');
  });

  it('grants high confidence for 4+ consistent independent recent reports', () => {
    const reports = [
      makeReport({ id: 'r1', minutesAgo: 5, waiting_time_min: 30, waiting_time_max: 60, crowd_level: 'moderate' }),
      makeReport({ id: 'r2', minutesAgo: 12, waiting_time_min: 30, waiting_time_max: 60, crowd_level: 'moderate' }),
      makeReport({ id: 'r3', minutesAgo: 25, waiting_time_min: 15, waiting_time_max: 30, crowd_level: 'low' }),
      makeReport({ id: 'r4', minutesAgo: 40, waiting_time_min: 30, waiting_time_max: 60, crowd_level: 'moderate' }),
    ];

    const result = calculateQueueAggregate(reports, FIXED_NOW);
    expect(result.recent_report_count).toBe(4);
    expect(result.confidence_level).toBe('high');
    expect(result.display_mode).toBe('estimated');
    expect(formatWaitingTimeSummary(result, 'en').sourceType).toBe('system_estimated');
  });

  it('reduces confidence when independent reports strongly contradict each other', () => {
    const contradictory = [
      makeReport({ id: 'r1', minutesAgo: 5, waiting_time_min: 0, waiting_time_max: 15, crowd_level: 'very_low' }),
      makeReport({ id: 'r2', minutesAgo: 6, waiting_time_min: 120, waiting_time_max: 180, crowd_level: 'very_high' }),
      makeReport({ id: 'r3', minutesAgo: 8, waiting_time_min: 0, waiting_time_max: 15, crowd_level: 'very_low' }),
      makeReport({ id: 'r4', minutesAgo: 9, waiting_time_min: 120, waiting_time_max: 180, crowd_level: 'very_high' }),
    ];

    const result = calculateQueueAggregate(contradictory, FIXED_NOW);
    expect(result.crowd_std_dev).toBeGreaterThan(1.2);
    expect(result.confidence_level).toBe('low');
  });
});
