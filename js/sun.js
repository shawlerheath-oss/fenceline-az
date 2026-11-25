// Sunrise, sunset, legal shooting light and moon phase. No network required.
const dayMs = 86400000; const J1970 = 2440588; const J2000 = 2451545;
const rad = Math.PI / 180; const e = rad * 23.4397;

const toJulian = (date) => date.valueOf() / dayMs - 0.5 + J1970;
const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs);
const toDays = (date) => toJulian(date) - J2000;
const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
const eclipticLongitude = (M) => M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
const declination = (l) => Math.asin(Math.sin(e) * Math.sin(l));
const julianCycle = (d, lw) => Math.round(d - 0.0009 - lw / (2 * Math.PI));
const approxTransit = (Ht, lw, n) => 0.0009 + (Ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const hourAngle = (h, phi, d) => Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));

export function sunTimes(date, lat, lon) {
  const lw = rad * -lon; const phi = rad * lat; const d = toDays(date);
  const n = julianCycle(d, lw); const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds); const L = eclipticLongitude(M); const dec = declination(L);
  const Jnoon = solarTransitJ(ds, M, L);
  const w = hourAngle(rad * -0.833, phi, dec);
  const Jset = solarTransitJ(approxTransit(w, lw, n), M, L);
  const Jrise = Jnoon - (Jset - Jnoon);
  const wc = hourAngle(rad * -6, phi, dec);
  const Jdusk = solarTransitJ(approxTransit(wc, lw, n), M, L);
  const Jdawn = Jnoon - (Jdusk - Jnoon);
  return { sunrise: fromJulian(Jrise), sunset: fromJulian(Jset), solarNoon: fromJulian(Jnoon), dawn: fromJulian(Jdawn), dusk: fromJulian(Jdusk) };
}

export function legalLight(date, lat, lon, rule) {
  const s = sunTimes(date, lat, lon);
  const start = new Date(s.sunrise.getTime() - rule.before * 60000);
  const end = new Date(s.sunset.getTime() + rule.after * 60000);
  const now = date.getTime();
  const status = now < start ? 'before' : now > end ? 'after' : 'open';
  const minsTo = status === 'before' ? Math.round((start - now) / 60000) : status === 'open' ? Math.round((end - now) / 60000) : null;
  return { ...s, start, end, status, minsTo };
}

export function moonPhase(date) {
  const synodic = 29.530588853;
  const ref = Date.UTC(2000, 0, 6, 18, 14);
  const days = (date.getTime() - ref) / dayMs;
  const phase = (((days % synodic) + synodic) % synodic) / synodic;
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  const idx = Math.round(phase * 8) % 8;
  return { phase, illumination, name: names[idx], ageDays: phase * synodic };
}

// Sun position (altitude, azimuth) for shade timing on slopes.
export function sunPosition(date, lat, lon) {
  const lw = rad * -lon; const phi = rad * lat; const d = toDays(date);
  const M = solarMeanAnomaly(d); const L = eclipticLongitude(M); const dec = declination(L);
  const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
  const theta = rad * (280.16 + 360.9856235 * d) - lw; const H = theta - ra;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  return { altitude: alt / rad, azimuth: ((az / rad) + 180 + 360) % 360 };
}
