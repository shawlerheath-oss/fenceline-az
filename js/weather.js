// Open-Meteo forecast, pressure trend, and wind-vs-stand logic.
import { TZ } from './config.js';
import { store } from './store.js';
import { angleDiff, norm360, compass16, withRetry } from './util.js';

const TTL_MS = 30 * 60 * 1000;

const WMO = {
  0: ['Clear', 'sun'], 1: ['Mostly clear', 'sun'], 2: ['Partly cloudy', 'cloud'], 3: ['Overcast', 'cloud'],
  45: ['Fog', 'fog'], 48: ['Rime fog', 'fog'], 51: ['Light drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Heavy drizzle', 'rain'],
  56: ['Freezing drizzle', 'sleet'], 57: ['Freezing drizzle', 'sleet'], 61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'sleet'], 67: ['Freezing rain', 'sleet'], 71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'],
  77: ['Snow grains', 'snow'], 80: ['Showers', 'rain'], 81: ['Showers', 'rain'], 82: ['Heavy showers', 'rain'],
  85: ['Snow showers', 'snow'], 86: ['Snow showers', 'snow'], 95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm, hail', 'storm'], 99: ['Thunderstorm, hail', 'storm']
};
export function wmoDesc(code) { return (WMO[code] || ['Unknown', 'cloud'])[0]; }
export function wmoKind(code) { return (WMO[code] || ['Unknown', 'cloud'])[1]; }

function buildURL(lat, lon) {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lon.toFixed(4),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,relative_humidity_2m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,sunrise,sunset',
    temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch', timezone: TZ, forecast_days: '7', past_hours: '6'
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

function normalize(j, lat, lon) {
  const c = j.current || {};
  const hz = j.hourly || {}; const dz = j.daily || {};
  const hourly = (hz.time || []).map((t, i) => ({
    time: new Date(t), temp: hz.temperature_2m?.[i], pop: hz.precipitation_probability?.[i], precip: hz.precipitation?.[i],
    code: hz.weather_code?.[i], cloud: hz.cloud_cover?.[i], windSpeed: hz.wind_speed_10m?.[i], windDir: hz.wind_direction_10m?.[i],
    gust: hz.wind_gusts_10m?.[i], pressure: hz.pressure_msl?.[i], humidity: hz.relative_humidity_2m?.[i]
  }));
  const daily = (dz.time || []).map((t, i) => ({
    date: new Date(`${t}T12:00:00`), code: dz.weather_code?.[i], desc: wmoDesc(dz.weather_code?.[i]), tmax: dz.temperature_2m_max?.[i], tmin: dz.temperature_2m_min?.[i],
    precip: dz.precipitation_sum?.[i], pop: dz.precipitation_probability_max?.[i], windMax: dz.wind_speed_10m_max?.[i], windDir: dz.wind_direction_10m_dominant?.[i],
    sunrise: dz.sunrise?.[i] ? new Date(dz.sunrise[i]) : null, sunset: dz.sunset?.[i] ? new Date(dz.sunset[i]) : null
  }));
  const now = Date.now();
  const past = hourly.filter((h) => h.time.getTime() <= now && h.pressure != null);
  const p0 = past.length ? past[past.length - 1].pressure : c.pressure_msl;
  const p3 = past.length >= 4 ? past[past.length - 4].pressure : null;
  const delta3h = p3 != null && p0 != null ? (p0 - p3) * 0.02953 : null; // hPa -> inHg
  const trend = delta3h == null ? 'steady' : delta3h > 0.04 ? 'rising' : delta3h < -0.04 ? 'falling' : 'steady';
  return {
    fetchedAt: now, lat, lon,
    current: {
      time: c.time ? new Date(c.time) : new Date(), temp: c.temperature_2m, feelsLike: c.apparent_temperature, humidity: c.relative_humidity_2m,
      precip: c.precipitation, code: c.weather_code, desc: wmoDesc(c.weather_code), cloud: c.cloud_cover,
      pressure: c.pressure_msl != null ? c.pressure_msl * 0.02953 : null, windSpeed: c.wind_speed_10m, windDir: c.wind_direction_10m, gust: c.wind_gusts_10m
    },
    hourly, daily, pressureTrend: { delta3h, trend }
  };
}

const memo = new Map();
export async function getForecast(lon, lat, { force = false } = {}) {
  const key = `wx:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cached = memo.get(key) || (await store.get('cache', key));
  if (cached && !force && Date.now() - cached.fetchedAt < TTL_MS) { memo.set(key, revive(cached)); return memo.get(key); }
  try {
    const j = await withRetry(async () => {
      const res = await fetch(buildURL(lat, lon));
      if (!res.ok) throw new Error(`Weather HTTP ${res.status}`);
      return res.json();
    }, { tries: 3, delay: 600 });
    const fc = normalize(j, lat, lon);
    memo.set(key, fc); await store.put('cache', key, fc);
    return fc;
  } catch (err) {
    if (cached) { const fc = revive(cached); fc.stale = true; memo.set(key, fc); return fc; }
    throw err;
  }
}
function revive(fc) {
  // Dates survive IDB structured clone, but be defensive for memory fallback.
  const d = (v) => (v instanceof Date ? v : v ? new Date(v) : null);
  return { ...fc, current: { ...fc.current, time: d(fc.current.time) }, hourly: fc.hourly.map((h) => ({ ...h, time: d(h.time) })), daily: fc.daily.map((x) => ({ ...x, date: d(x.date), sunrise: d(x.sunrise), sunset: d(x.sunset) })) };
}

// Wind blows FROM windDir. Scent travels TO windDir + 180.
// bearingToBedding: where the animals you expect are, measured from the stand.
export function rateStand(bearingToBedding, windDir) {
  if (bearingToBedding == null || windDir == null) return { rating: 'unknown', diff: null, scentDir: null };
  const scentDir = norm360(windDir + 180);
  const diff = angleDiff(scentDir, bearingToBedding);
  const rating = diff < 35 ? 'bad' : diff < 75 ? 'marginal' : 'good';
  return { rating, diff, scentDir };
}
export function bestWinds(bearingToBedding) {
  if (bearingToBedding == null) return [];
  const out = [];
  for (let off = -45; off <= 45; off += 22.5) out.push(compass16(bearingToBedding + off));
  return [...new Set(out)];
}
export function windCalendar(forecast, bearingToBedding, hours = 48) {
  const now = Date.now();
  return forecast.hourly.filter((h) => h.time.getTime() >= now - 3600000).slice(0, hours).map((h) => ({ ...h, ...rateStand(bearingToBedding, h.windDir) }));
}
// Hours within a legal-light window that also carry a "good" wind rating for the stand.
export function goodWindows(calendar, isLegal) {
  const out = []; let cur = null;
  for (const h of calendar) {
    const ok = h.rating === 'good' && (!isLegal || isLegal(h.time));
    if (ok) { if (cur && h.time - cur.end <= 3600000) cur.end = new Date(h.time.getTime() + 3600000); else { cur = { start: h.time, end: new Date(h.time.getTime() + 3600000) }; out.push(cur); } }
  }
  return out;
}
// Simple activity score (0-100) blending pressure trend, temperature drop, wind and moon.
export function activityScore(fc, moonIllumination) {
  if (!fc) return null;
  let s = 55;
  const t = fc.pressureTrend;
  if (t.trend === 'rising') s += 12; else if (t.trend === 'falling') s += 5;
  const w = fc.current.windSpeed ?? 0; if (w > 20) s -= 15; else if (w > 12) s -= 6; else if (w >= 4) s += 4;
  const today = fc.daily[0]; const yest = fc.daily[1];
  if (today && yest && today.tmax != null && yest.tmax != null && yest.tmax - today.tmax > 8) s += 10; // cold front
  if (fc.current.code >= 95) s -= 20; else if ((fc.current.code ?? 0) >= 61) s -= 8;
  if (moonIllumination != null) s += moonIllumination > 0.85 ? -6 : moonIllumination < 0.15 ? 4 : 0;
  return Math.max(0, Math.min(100, Math.round(s)));
}
