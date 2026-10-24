import assert from 'node:assert/strict';

async function request(url, {status = 200, headers = {}} = {}) {
  const response = await fetch(url, {headers, signal: AbortSignal.timeout(30000)});
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
