import { describe, expect, it } from 'vitest';
import { INDIA_STATES_AND_UTS } from '../src/data/indiaLocations';
import {
  buildOverpassQuery,
  classifyOsmOfficeCategory,
  mapOverpassElementToOffice,
} from '../src/lib/osmMapper';
import { haversineDistanceMeters, sanitizeExternalUrl } from '../src/lib/utils';

describe('Pan-India Geography & OpenStreetMap Office Discovery', () => {
  it('includes all 28 Indian States and 8 Union Territories with valid Indian coordinates', () => {
    const states = INDIA_STATES_AND_UTS.filter((x) => x.type === 'state');
    const uts = INDIA_STATES_AND_UTS.filter((x) => x.type === 'ut');
    expect(states).toHaveLength(28);
    expect(uts).toHaveLength(8);

    for (const region of INDIA_STATES_AND_UTS) {
      expect(region.cities.length).toBeGreaterThan(0);
      for (const city of region.cities) {
        expect(city.latitude).toBeGreaterThanOrEqual(6.0);
        expect(city.latitude).toBeLessThanOrEqual(38.5);
        expect(city.longitude).toBeGreaterThanOrEqual(68.0);
        expect(city.longitude).toBeLessThanOrEqual(98.0);
      }
    }
  });

  it('classifies OpenStreetMap Indian civic offices accurately', () => {
    expect(classifyOsmOfficeCategory({ amenity: 'post_office', name: 'Head Post Office' })).toBe(
      'post_office'
    );
    expect(classifyOsmOfficeCategory({ amenity: 'police', name: 'Kotwali Police Station' })).toBe(
      'police_station'
    );
    expect(classifyOsmOfficeCategory({ amenity: 'courthouse', name: 'District Court' })).toBe(
      'court'
    );
    expect(
      classifyOsmOfficeCategory({ office: 'government', name: 'Regional Transport Office (RTO)' })
    ).toBe('rto_office');
    expect(
      classifyOsmOfficeCategory({ office: 'government', name: 'Sub-Registrar Office, Pune' })
    ).toBe('sub_registrar');
    expect(
      classifyOsmOfficeCategory({ office: 'government', name: 'Tehsil Office, Sadar' })
    ).toBe('tehsil_office');
    expect(
      classifyOsmOfficeCategory({ office: 'government', name: 'Passport Seva Kendra' })
    ).toBe('service_centre');
  });

  it('filters out private hospitals and out-of-India coordinates during OSM mapping', () => {
    const privateHospital = mapOverpassElementToOffice(
      {
        type: 'node',
        id: 1001,
        lat: 28.6139,
        lon: 77.209,
        tags: { amenity: 'hospital', name: 'Sunrise Private Care Hospital' },
      },
      28.6139,
      77.209
    );
    expect(privateHospital).toBeNull();

    const govtHospital = mapOverpassElementToOffice(
      {
        type: 'node',
        id: 1002,
        lat: 28.5672,
        lon: 77.21,
        tags: {
          amenity: 'hospital',
          name: 'Safdarjung Government Hospital',
          'operator:type': 'government',
          'addr:postcode': '110029',
        },
      },
      28.6139,
      77.209,
      'Delhi (NCT)',
      'New Delhi'
    );
    expect(govtHospital).not.toBeNull();
    expect(govtHospital?.category).toBe('government_hospital');
    expect(govtHospital?.source).toBe('osm');
    expect(govtHospital?.osm_id).toBe(1002);
    expect(govtHospital?.postal_code).toBe('110029');

    const outsideIndia = mapOverpassElementToOffice(
      {
        type: 'node',
        id: 1003,
        lat: 51.5074,
        lon: -0.1278,
        tags: { amenity: 'post_office', name: 'London Post Office' },
      },
      28.6139,
      77.209
    );
    expect(outsideIndia).toBeNull();
  });

  it('builds bounded Overpass queries and sanitizes external URLs safely', () => {
    const ql = buildOverpassQuery(19.076, 72.8777, 100000, 'post_office');
    // Radius capped at 25000m
    expect(ql).toContain('around:25000');
    expect(ql).toContain('amenity"="post_office');

    expect(sanitizeExternalUrl('https://india.gov.in')).toBe('https://india.gov.in/');
    expect(sanitizeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull();

    const dist = haversineDistanceMeters(28.6139, 77.209, 28.6239, 77.209);
    expect(dist).toBeGreaterThan(1000);
    expect(dist).toBeLessThan(1200);
  });
});
