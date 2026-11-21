export type OfficeCategory =
  | 'government_office'
  | 'municipal_corporation'
  | 'municipal_council'
  | 'gram_panchayat'
  | 'post_office'
  | 'police_station'
  | 'government_hospital'
  | 'district_collector'
  | 'tehsil_office'
  | 'sub_registrar'
  | 'court'
  | 'rto_office'
  | 'service_centre'
  | 'other_public_office';

export type CrowdLevel =
  | 'very_low'
  | 'low'
  | 'moderate'
  | 'high'
  | 'very_high'
  | 'unknown';

export type ReportableCrowdLevel = Exclude<CrowdLevel, 'unknown'>;

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'no_data';

export type OfficeSource = 'osm' | 'citizen_suggestion' | 'official_import';

export type VerificationStatus = 'approved' | 'pending' | 'archived';

export interface OfficeAggregate {
  office_id: string;
  current_crowd_level: CrowdLevel;
  estimated_waiting_minutes: number | null;
  average_queue_size: number | null;
  confidence_level: ConfidenceLevel;
  recent_report_count: number;
  last_report_at: string | null;
  calculated_at: string;
}

export interface Office {
  id: string;
  name: string;
  slug: string;
  category: OfficeCategory;
  address: string | null;
  city: string | null;
  district: string | null;
  state: string;
  postal_code: string | null;
  latitude: number;
  longitude: number;
  source: OfficeSource;
  osm_type: 'node' | 'way' | 'relation' | null;
  osm_id: number | null;
  official_website: string | null;
  phone: string | null;
  verification_status: VerificationStatus;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  distance_meters?: number | null;
  aggregate?: OfficeAggregate | null;
}

export interface QueueReport {
  id: string;
  office_id: string;
  user_id?: string;
  queue_size_min: number;
  queue_size_max: number;
  waiting_time_min: number;
  waiting_time_max: number;
  crowd_level: ReportableCrowdLevel;
  note: string | null;
  submitted_at: string;
  report_status: 'active' | 'flagged' | 'hidden' | 'rejected';
  suspicious_score?: number;
  created_at?: string;
  office?: Pick<Office, 'id' | 'name' | 'slug' | 'category' | 'city' | 'state'> | null;
}

export interface OfficeSuggestion {
  id: string;
  suggested_by: string;
  office_name: string;
  category: OfficeCategory;
  address: string;
  city: string;
  district: string | null;
  state: string;
  postal_code: string | null;
  latitude: number;
  longitude: number;
  official_website: string | null;
  phone: string | null;
  review_status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  created_at: string;
}

export interface ReportFlag {
  id: string;
  report_id: string;
  reported_by: string;
  reason: string;
  status: 'open' | 'reviewed' | 'dismissed' | 'action_taken';
  created_at: string;
  queue_report?: QueueReport | null;
}

export interface UserProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  preferred_language: 'en' | 'hi';
  is_suspended: boolean;
  created_at: string;
  updated_at: string;
}

export interface GeoLocationResult {
  display_name: string;
  latitude: number;
  longitude: number;
  city?: string;
  district?: string;
  state?: string;
  postal_code?: string;
  osm_id?: number;
  osm_type?: string;
}

export interface SelectedLocation {
  label: string;
  latitude: number;
  longitude: number;
  state?: string;
  city?: string;
  source: 'browser_geolocation' | 'manual_search' | 'state_city_picker';
}

export interface QueueEngineConfig {
  maxAgeMinutes: number;
  tier1Minutes: number;
  tier1Weight: number;
  tier2Minutes: number;
  tier2Weight: number;
  tier3Minutes: number;
  tier3Weight: number;
  tier4Weight: number;
  highConfidenceMinReports: number;
  highConfidenceMinRecent30m: number;
  highConfidenceMaxStdDev: number;
  mediumConfidenceMinReports: number;
  mediumConfidenceMinWeight: number;
  mediumConfidenceMaxStdDev: number;
}

export interface QueueCalculationResult {
  current_crowd_level: CrowdLevel;
  estimated_waiting_minutes: number | null;
  reported_waiting_range: { min: number; max: number } | null;
  average_queue_size: number | null;
  confidence_level: ConfidenceLevel;
  recent_report_count: number;
  total_weight: number;
  crowd_std_dev: number;
  last_report_at: string | null;
  display_mode: 'no_data' | 'single_report' | 'estimated';
  calculated_at: string;
}

export interface TimeBucketStat {
  bucketIndex: number;
  label: string;
  startHour: number;
  endHour: number;
  avgWaitingMinutes: number;
  avgCrowdScore: number;
  crowdLevel: ReportableCrowdLevel;
  observations: number;
}

export interface WeekdayStat {
  dayIndex: number; // 0 = Sun ... 6 = Sat
  dayName: string;
  avgWaitingMinutes: number;
  avgCrowdScore: number;
  crowdLevel: ReportableCrowdLevel;
  observations: number;
}

export interface HistoricalAnalyticsResult {
  hasSufficientData: boolean;
  minimumRequiredObservations: number;
  totalObservations: number;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  historicalAverageWaitingMinutes: number | null;
  busiestWeekdays: WeekdayStat[];
  weekdayStats: WeekdayStat[];
  timeBucketStats: TimeBucketStat[];
  busiestTimePeriods: TimeBucketStat[];
  leastCrowdedTimePeriods: TimeBucketStat[];
}

export const OFFICE_CATEGORIES: { value: OfficeCategory; labelEn: string; labelHi: string }[] = [
  { value: 'government_office', labelEn: 'Government Office', labelHi: 'सरकारी कार्यालय' },
  { value: 'municipal_corporation', labelEn: 'Municipal Corporation', labelHi: 'नगर निगम' },
  { value: 'municipal_council', labelEn: 'Municipal Council', labelHi: 'नगर पालिका' },
  { value: 'gram_panchayat', labelEn: 'Gram Panchayat', labelHi: 'ग्राम पंचायत' },
  { value: 'post_office', labelEn: 'Post Office', labelHi: 'डाकघर' },
  { value: 'police_station', labelEn: 'Police Station', labelHi: 'पुलिस थाना' },
  { value: 'government_hospital', labelEn: 'Government Hospital', labelHi: 'सरकारी अस्पताल' },
  { value: 'district_collector', labelEn: 'District Collector / DM', labelHi: 'जिलाधिकारी कार्यालय' },
  { value: 'tehsil_office', labelEn: 'Tehsil / Taluka Office', labelHi: 'तहसील / तालुका कार्यालय' },
  { value: 'sub_registrar', labelEn: 'Sub-Registrar Office', labelHi: 'उप-पंजीयक कार्यालय' },
  { value: 'court', labelEn: 'Court', labelHi: 'न्यायालय' },
  { value: 'rto_office', labelEn: 'RTO Office', labelHi: 'आरटीओ कार्यालय' },
  { value: 'service_centre', labelEn: 'Public Service Centre', labelHi: 'जन सेवा केंद्र' },
  { value: 'other_public_office', labelEn: 'Other Public Office', labelHi: 'अन्य जन कार्यालय' },
];

export const QUEUE_SIZE_OPTIONS = [
  { label: '0–5 people', labelHi: '0–5 लोग', min: 0, max: 5 },
  { label: '6–10 people', labelHi: '6–10 लोग', min: 6, max: 10 },
  { label: '11–20 people', labelHi: '11–20 लोग', min: 11, max: 20 },
  { label: '21–50 people', labelHi: '21–50 लोग', min: 21, max: 50 },
  { label: '50+ people', labelHi: '50+ लोग', min: 51, max: 100 },
] as const;

export const WAITING_TIME_OPTIONS = [
  { label: 'Less than 15 minutes', labelHi: '15 मिनट से कम', min: 0, max: 15 },
  { label: '15–30 minutes', labelHi: '15–30 मिनट', min: 15, max: 30 },
  { label: '30–60 minutes', labelHi: '30–60 मिनट', min: 30, max: 60 },
  { label: '1–2 hours', labelHi: '1–2 घंटे', min: 60, max: 120 },
  { label: 'More than 2 hours', labelHi: '2 घंटे से अधिक', min: 120, max: 180 },
] as const;
