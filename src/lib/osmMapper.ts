import type { Office, OfficeCategory } from '../types/domain.ts';
import { haversineDistanceMeters, sanitizeExternalUrl, slugifyOffice } from './utils.ts';

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * Classifies a genuine OpenStreetMap feature into a PratikshaIQ civic office category.
 */
export function classifyOsmOfficeCategory(tags: Record<string, string>): OfficeCategory {
  const amenity = (tags.amenity || '').toLowerCase();
  const office = (tags.office || '').toLowerCase();
  const gov = (tags.government || '').toLowerCase();
  const name = (tags.name || tags['name:en'] || '').toLowerCase();

  if (amenity === 'post_office') return 'post_office';
  if (amenity === 'police') return 'police_station';
  if (amenity === 'courthouse' || name.includes('court') || name.includes('nyayalaya')) return 'court';
  if (amenity === 'hospital' || amenity === 'clinic') return 'government_hospital';

  if (
    gov === 'transportation' ||
    name.includes('rto') ||
    name.includes('regional transport') ||
    name.includes('motor vehicles')
  ) {
    return 'rto_office';
  }

  if (
    gov === 'register_office' ||
    name.includes('sub-registrar') ||
    name.includes('sub registrar') ||
    name.includes('registrar office')
  ) {
    return 'sub_registrar';
  }

  if (
    name.includes('collector') ||
    name.includes('collectorate') ||
    name.includes('district magistrate') ||
    name.includes('dm office') ||
    name.includes('deputy commissioner')
  ) {
    return 'district_collector';
  }

  if (
    name.includes('tehsil') ||
    name.includes('tahsil') ||
    name.includes('taluka') ||
    name.includes('taluk') ||
    name.includes('mamlatdar') ||
    name.includes('mandal revenue') ||
    name.includes('sdm office')
  ) {
    return 'tehsil_office';
  }

  if (
    gov === 'panchayat' ||
    name.includes('gram panchayat') ||
    name.includes('panchayat bhawan') ||
    name.includes('panchayat office')
  ) {
    return 'gram_panchayat';
  }

  if (
    name.includes('municipal corporation') ||
    name.includes('nagar nigam') ||
    name.includes('mahanagar palika') ||
    name.includes('bmc ') ||
    name.includes('bbmp') ||
    name.includes('mcd ') ||
    name.includes('ghmc')
  ) {
    return 'municipal_corporation';
  }

  if (
    amenity === 'townhall' ||
    gov === 'municipality' ||
    gov === 'local_authority' ||
    name.includes('municipal council') ||
    name.includes('nagar palika') ||
    name.includes('nagar parishad') ||
    name.includes('municipality')
  ) {
    return 'municipal_council';
  }

  if (
    name.includes('seva kendra') ||
    name.includes('passport seva') ||
    name.includes('aadhaar') ||
    name.includes('e-mitra') ||
    name.includes('jan seva') ||
    name.includes('csc ') ||
    name.includes('common service') ||
    name.includes('meeseva') ||
    name.includes('akshaya') ||
    name.includes('setu') ||
    gov === 'public_service'
  ) {
    return 'service_centre';
  }

  if (office === 'government' || gov) {
    return 'government_office';
  }

  return 'other_public_office';
}

function buildOsmAddress(tags: Record<string, string>): string | null {
  const parts = [
    tags['addr:full'],
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:suburb'] || tags['addr:neighbourhood'],
    tags['addr:city'] || tags['addr:town'] || tags['addr:village'],
    tags['addr:district'],
    tags['addr:state'],
    tags['addr:postcode'],
  ]
    .map((p) => p?.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;
  // Deduplicate adjacent identical segments
  const unique = Array.from(new Set(parts));
  return unique.join(', ');
}

function isLikelyPublicHospital(tags: Record<string, string>): boolean {
  if (tags.amenity !== 'hospital') return true;
  const operatorType = (tags['operator:type'] || '').toLowerCase();
  const ownership = (tags.ownership || '').toLowerCase();
  const operator = (tags.operator || '').toLowerCase();
  const name = (tags.name || '').toLowerCase();

  if (['government', 'public', 'municipal', 'state', 'central'].includes(operatorType)) return true;
  if (['government', 'public', 'municipal'].includes(ownership)) return true;
  if (
    operator.includes('government') ||
    operator.includes('govt') ||
    operator.includes('municipal') ||
    operator.includes('aiims') ||
    operator.includes('esic') ||
    operator.includes('ministry')
  ) {
    return true;
  }
  if (
    name.includes('government') ||
    name.includes('govt') ||
    name.includes('civil hospital') ||
    name.includes('district hospital') ||
    name.includes('general hospital') ||
    name.includes('aiims') ||
    name.includes('esic') ||
    name.includes('primary health') ||
    name.includes('phc') ||
    name.includes('community health') ||
    name.includes('chc') ||
    name.includes('sarkari') ||
    name.includes('safdarjung') ||
    name.includes('ram manohar lohia') ||
    name.includes('kem hospital') ||
    name.includes('jj hospital')
  ) {
    return true;
  }
  return false;
}

/**
 * Converts a raw Overpass element into a normalized Office record.
 * Returns null if the element lacks coordinates, a valid Indian bounding box, or a usable name.
 */
export function mapOverpassElementToOffice(
  el: OverpassElement,
  originLat: number,
  originLon: number,
  fallbackState: string = 'India',
  fallbackCity: string | null = null
): Office | null {
  const tags = el.tags || {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;

  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  // Keep strictly within India's geographic bounding box
  if (lat < 6.0 || lat > 38.5 || lon < 68.0 || lon > 98.0) return null;

  const rawName = (tags['name:en'] || tags.name || tags.official_name || '').trim();
  if (!rawName || rawName.length < 2) return null;

  // For hospitals, only include genuine public/government hospitals rather than private clinics
  if (tags.amenity === 'hospital' && !isLikelyPublicHospital(tags)) {
    return null;
  }

  const category = classifyOsmOfficeCategory(tags);
  const city =
    tags['addr:city'] ||
    tags['addr:town'] ||
    tags['addr:village'] ||
    tags['addr:suburb'] ||
    fallbackCity ||
    null;
  const district = tags['addr:district'] || null;
  const state = tags['addr:state'] || fallbackState;
  const rawPin = (tags['addr:postcode'] || '').trim();
  const postal_code = /^[1-9][0-9]{5}$/.test(rawPin) ? rawPin : null;

  const website = sanitizeExternalUrl(tags.website || tags['contact:website'] || tags.url);
  const phone = (tags.phone || tags['contact:phone'] || '').trim().slice(0, 40) || null;

  return {
    id: `osm-${el.type}-${el.id}`,
    name: rawName,
    slug: slugifyOffice(rawName, `${el.type}-${el.id}`),
    category,
    address: buildOsmAddress(tags),
    city,
    district,
    state,
    postal_code,
    latitude: lat,
    longitude: lon,
    source: 'osm',
    osm_type: el.type,
    osm_id: el.id,
    official_website: website,
    phone,
    verification_status: 'approved',
    distance_meters: haversineDistanceMeters(originLat, originLon, lat, lon),
    aggregate: null,
  };
}

/**
 * Builds an efficient, bounded Overpass QL query for genuine Indian public offices.
 * Uses indexed tag-equality queries on nodes/ways (nw) rather than slow regex scans
 * so public Overpass mirrors respond quickly and reliably.
 */
export function buildOverpassQuery(
  lat: number,
  lon: number,
  radiusMeters: number,
  category?: string
): string {
  const r = Math.min(Math.max(Math.round(radiusMeters), 500), 25000);
  const around = `(around:${r},${lat.toFixed(5)},${lon.toFixed(5)})`;

  const clauses: string[] = [];

  if (!category || category === 'all') {
    clauses.push(
      `nw["office"="government"]${around};`,
      `nw["government"]${around};`,
      `nw["amenity"="townhall"]${around};`,
      `nw["amenity"="post_office"]${around};`,
      `nw["amenity"="police"]${around};`,
      `nw["amenity"="courthouse"]${around};`,
      `nw["amenity"="hospital"]["operator:type"="government"]${around};`,
      `nw["amenity"="hospital"]["operator:type"="public"]${around};`
    );
  } else {
    switch (category) {
      case 'post_office':
        clauses.push(`nw["amenity"="post_office"]${around};`);
        break;
      case 'police_station':
        clauses.push(`nw["amenity"="police"]${around};`);
        break;
      case 'court':
        clauses.push(`nw["amenity"="courthouse"]${around};`);
        break;
      case 'government_hospital':
        clauses.push(
          `nw["amenity"="hospital"]["operator:type"="government"]${around};`,
          `nw["amenity"="hospital"]["operator:type"="public"]${around};`,
          `nw["amenity"="hospital"]["ownership"="public"]${around};`
        );
        break;
      case 'municipal_corporation':
      case 'municipal_council':
      case 'gram_panchayat':
        clauses.push(
          `nw["amenity"="townhall"]${around};`,
          `nw["government"="municipality"]${around};`,
          `nw["government"="local_authority"]${around};`,
          `nw["government"="panchayat"]${around};`
        );
        break;
      case 'rto_office':
        clauses.push(
          `nw["government"="transportation"]${around};`,
          `nw["office"="government"]${around};`
        );
        break;
      case 'sub_registrar':
        clauses.push(
          `nw["government"="register_office"]${around};`,
          `nw["office"="government"]${around};`
        );
        break;
      case 'district_collector':
      case 'tehsil_office':
        clauses.push(
          `nw["government"="administrative"]${around};`,
          `nw["office"="government"]${around};`
        );
        break;
      case 'service_centre':
        clauses.push(
          `nw["government"="public_service"]${around};`,
          `nw["office"="government"]${around};`
        );
        break;
      default:
        clauses.push(`nw["office"="government"]${around};`, `nw["government"]${around};`);
        break;
    }
  }

  return `[out:json][timeout:14];(\n${clauses.join('\n')}\n);out center 60;`;
}
