import assert from 'node:assert/strict';

async function request(url, {status = 200, headers = {}, timeout = 30000} = {}) {
  const response = await fetch(url, {headers, signal: AbortSignal.timeout(timeout)});
  assert.equal(response.status, status, `${url}: unexpected HTTP status`);
  console.log(JSON.stringify({url, status: response.status}));
  return response;
}
function fresh(value, days, name) {
  const time = Date.parse(value);
  const age = (Date.now() - time) / 86400000;
  assert(Number.isFinite(time) && age >= -1 && age <= days, `${name}: stale or invalid date ${value}`);
}
const base = 'https://vibreo.es/api-proxy';
const html = await (await request('https://vibreo.es/')).text();
assert.match(html, /VIBREO/i);
const origin = 'https://vibreo.es';
const headers = {Origin: origin, Referer: `${origin}/`};
const latest = await (await request(`${base}/latest`, {headers})).json();
fresh(latest.songs_daily, 4, 'songs');
fresh(latest.artists_daily, 4, 'artists');
fresh(latest.albums_weekly, 11, 'albums');
fresh(latest.updated_at, 3, 'publication');
for (const [kind, period] of [['songs', 'daily'], ['artists', 'daily'], ['albums', 'weekly']]) {
  const data = await (await request(`${base}/charts/${kind}/${period}/global/latest`, {headers})).json();
  const rows = Array.isArray(data) ? data : data.entries;
  assert(Array.isArray(rows) && rows.length >= 100, `${kind}: missing chart rows`);
  console.log(JSON.stringify({kind, rows: rows.length}));
}
console.log(JSON.stringify({latest}));

// HTTP 200 alone misses upstream body resets: consume and validate the full
// catalogue through both public surfaces used by the site and API clients.
for (const url of [`${base}/charting/youtube-links`, 'https://api.vibreo.es/charting/youtube-links']) {
  const links = await (await request(url, {headers, timeout: 120000})).json();
  assert(links && typeof links === 'object' && !Array.isArray(links), `${url}: invalid catalogue`);
  const entries = Object.entries(links);
  assert(entries.length >= 1000, `${url}: incomplete catalogue`);
  assert(entries.every(([uri, link]) => uri.startsWith('spotify:track:') && link && typeof link === 'object'),
    `${url}: invalid track links`);
  console.log(JSON.stringify({url, catalogEntries: entries.length}));
}
