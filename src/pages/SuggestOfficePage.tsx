import React, { Suspense, lazy, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLocationContext } from '../context/LocationContext';
import { useI18n } from '../i18n/I18nContext';
import { INDIA_STATES_AND_UTS } from '../data/indiaLocations';
import { OFFICE_CATEGORIES, type OfficeCategory } from '../types/domain';
import { submitOfficeSuggestion } from '../lib/api';
import { sanitizeExternalUrl } from '../lib/utils';
import { SupabaseNotice } from '../components/common/SupabaseNotice';
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  Skeleton,
  Textarea,
} from '../components/ui/primitives';

const LazyOfficeMap = lazy(() => import('../components/map/InteractiveOfficeMap'));

export function SuggestOfficePage() {
  const { user, isConfigured } = useAuth();
  const { selectedLocation } = useLocationContext();
  const { language, t } = useI18n();

  const [officeName, setOfficeName] = useState('');
  const [category, setCategory] = useState<OfficeCategory>('government_office');
  const [stateName, setStateName] = useState(selectedLocation?.state || '');
  const [city, setCity] = useState(selectedLocation?.city || '');
  const [district, setDistrict] = useState('');
  const [address, setAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [latitude, setLatitude] = useState<string>(
    selectedLocation ? String(selectedLocation.latitude.toFixed(6)) : ''
  );
  const [longitude, setLongitude] = useState<string>(
    selectedLocation ? String(selectedLocation.longitude.toFixed(6)) : ''
  );
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const parsedLat = Number(latitude);
  const parsedLon = Number(longitude);
  const hasValidCoords =
    latitude !== '' &&
    longitude !== '' &&
    !Number.isNaN(parsedLat) &&
    !Number.isNaN(parsedLon) &&
    parsedLat >= 6.0 &&
    parsedLat <= 38.5 &&
    parsedLon >= 68.0 &&
    parsedLon <= 98.0;

  const mapCenter = hasValidCoords
    ? { latitude: parsedLat, longitude: parsedLon }
    : selectedLocation || { latitude: 22.5937, longitude: 78.9629 };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!hasValidCoords) {
      setErrorMsg('Please select valid map coordinates within India (click the map or enter latitude/longitude).');
      return;
    }

    if (postalCode.trim() && !/^[1-9][0-9]{5}$/.test(postalCode.trim())) {
      setErrorMsg('PIN code must be a valid 6-digit Indian postal code.');
      return;
    }

    if (website.trim() && !sanitizeExternalUrl(website)) {
      setErrorMsg('Official website must start with https:// or http://');
      return;
    }

    setSubmitting(true);
    try {
      await submitOfficeSuggestion({
        office_name: officeName,
        category,
        address,
        city,
        district: district || undefined,
        state: stateName,
        postal_code: postalCode || undefined,
        latitude: parsedLat,
        longitude: parsedLon,
        official_website: website || undefined,
        phone: phone || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to submit office suggestion.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Card className="max-w-xl mx-auto">
        <CardContent className="py-10 text-center space-y-4">
          <CheckCircle2 className="h-11 w-11 text-emerald-700 mx-auto" aria-hidden="true" />
          <h1 className="text-xl font-bold text-[#0F2744]">Suggestion submitted</h1>
          <p className="text-sm text-slate-600">{t.suggest.successMessage}</p>
          <div className="pt-2 flex justify-center gap-3">
            <Link to="/my-reports">
              <Button variant="primary">{t.nav.myReports}</Button>
            </Link>
            <Button
              variant="secondary"
              onClick={() => {
                setSubmitted(false);
                setOfficeName('');
                setAddress('');
              }}
            >
              Suggest Another
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0F2744]">{t.suggest.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{t.suggest.subtitle}</p>
      </div>

      <SupabaseNotice />

      {isConfigured && !user && (
        <Card>
          <CardContent className="py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm text-slate-700">{t.common.signInRequired}</p>
            <Link to="/login">
              <Button variant="primary">{t.nav.signIn}</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="suggest-name">{t.suggest.officeName}</Label>
                <Input
                  id="suggest-name"
                  required
                  minLength={2}
                  value={officeName}
                  onChange={(e) => setOfficeName(e.target.value)}
                  placeholder="e.g. Sub-Registrar Office, Indiranagar"
                />
              </div>

              <div>
                <Label htmlFor="suggest-category">{t.suggest.category}</Label>
                <Select
                  id="suggest-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as OfficeCategory)}
                >
                  {OFFICE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {language === 'hi' ? c.labelHi : c.labelEn}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="suggest-state">{t.suggest.state}</Label>
                <Select
                  id="suggest-state"
                  required
                  value={stateName}
                  onChange={(e) => {
                    const next = e.target.value;
                    setStateName(next);
                    const found = INDIA_STATES_AND_UTS.find((s) => s.name === next);
                    if (found && found.cities[0] && !hasValidCoords) {
                      setLatitude(String(found.cities[0].latitude));
                      setLongitude(String(found.cities[0].longitude));
                    }
                  }}
                >
                  <option value="">Select State / UT</option>
                  {INDIA_STATES_AND_UTS.map((s) => (
                    <option key={s.code} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="suggest-city">{t.suggest.city}</Label>
                <Input
                  id="suggest-city"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="suggest-district">{t.suggest.district}</Label>
                <Input
                  id="suggest-district"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <Label htmlFor="suggest-address">{t.suggest.address}</Label>
                <Textarea
                  id="suggest-address"
                  required
                  minLength={5}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={2}
                />
              </div>

              <div>
                <Label htmlFor="suggest-pin">{t.suggest.postalCode}</Label>
                <Input
                  id="suggest-pin"
                  value={postalCode}
                  inputMode="numeric"
                  onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit PIN"
                />
              </div>
            </div>

            {/* Interactive Coordinate Picker */}
            <div className="space-y-2.5">
              <Label>Click the map to pin exact office coordinates</Label>
              <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
                <LazyOfficeMap
                  offices={[]}
                  center={mapCenter}
                  zoom={hasValidCoords ? 14 : 5}
                  heightClass="h-64"
                  pickMode={true}
                  pickedCoords={hasValidCoords ? { latitude: parsedLat, longitude: parsedLon } : null}
                  onPickCoords={(coords) => {
                    setLatitude(String(coords.latitude));
                    setLongitude(String(coords.longitude));
                  }}
                />
              </Suspense>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="suggest-lat">{t.suggest.latitude}</Label>
                  <Input
                    id="suggest-lat"
                    required
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    placeholder="e.g. 28.6139"
                  />
                </div>
                <div>
                  <Label htmlFor="suggest-lon">{t.suggest.longitude}</Label>
                  <Input
                    id="suggest-lon"
                    required
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    placeholder="e.g. 77.2090"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="suggest-website">{t.suggest.websiteOptional}</Label>
                <Input
                  id="suggest-website"
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label htmlFor="suggest-phone">{t.suggest.phoneOptional}</Label>
                <Input
                  id="suggest-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Official office phone"
                />
              </div>
            </div>

            <p className="rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs text-slate-600">
              {t.suggest.pendingNotice}
            </p>

            {errorMsg && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
                {errorMsg}
              </p>
            )}

            <Button
              type="submit"
              variant="accent"
              size="lg"
              className="w-full"
              disabled={submitting || !user || !isConfigured}
            >
              {submitting ? t.common.loading : t.suggest.submitButton}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
