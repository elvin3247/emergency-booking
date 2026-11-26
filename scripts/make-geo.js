// One-time: builds the site's location data from public sources (run from the scratchpad; outputs are committed).
const fs = require('fs'), topo = require('topojson-client'), us = require('us-atlas/counties-10m.json');
const OUT = '/home/claude/emergency-booking';
const csv = (f, enc) => fs.readFileSync(f, enc || 'utf8').trim().split(/\r?\n/).slice(1).map(l => l.split(','));
const cap = s => s.toLowerCase().replace(/(^|[\s\-.'(/])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(Of|And|The)\b/g, m => m.toLowerCase()).replace(/^./, c => c.toUpperCase());
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\ufffd|[^\x00-\x7f]/g, 'n').toLowerCase().replace(/\b(county|parish|borough|census area|municipality|city and borough|city)\b/g, '').replace(/[^a-z]/g, '');
const STATES = {}, master = {}, byFips = {};
csv('adj_county_fips_master.csv', 'latin1').forEach(r => {
  const fips = r[0].padStart(5, '0'), name = r[1].replace(/Do.a Ana/, 'Do\u00f1a Ana'), st = r[2];
  if (!st || st.length !== 2 || ['PR', 'VI', 'GU', 'AS', 'MP', 'NA'].includes(st)) return;
  STATES[st] = cap(r[3]); (master[st] = master[st] || []).push(name); byFips[fips] = name + ', ' + st;
});
STATES.DC = 'District of Columbia';
// ZIPs
const zips = {}, list = [], idx = {}; let miss = 0; const missed = {};
csv('geo-data.csv').forEach(r => {
  const st = r[2], zip = r[3], raw = r[4]; let city = /^zcta/i.test(r[5]) ? '' : cap(r[5]);
  if (!master[st]) return;
  let hit = master[st].find(n => n.toLowerCase() === raw.toLowerCase()) || master[st].find(n => n.toLowerCase() === (raw + ' county').toLowerCase());
  if (!hit) { const c = master[st].filter(n => norm(n) === norm(raw)); hit = c.length === 1 ? c[0] : (c.find(n => /city$/.test(n) === /city$/i.test(raw)) || null); }
  if (!hit) { miss++; missed[st + ':' + raw] = 1; return; }
  const key = hit + ', ' + st; if (!(key in idx)) { idx[key] = list.length; list.push(key); }
  if (!zips[zip]) zips[zip] = [idx[key], city];
});
console.log('zips', Object.keys(zips).length, 'unmatched rows', miss, Object.keys(missed).slice(0, 12));
// Neighbors from county shapes
const geos = us.objects.counties.geometries, nb = topo.neighbors(geos), neighbors = {};
geos.forEach((g, i) => { const k = byFips[g.id]; if (!k) return; const n = nb[i].map(j => byFips[geos[j].id]).filter(Boolean); if (n.length) neighbors[k] = n.sort(); });
console.log('counties with neighbors', Object.keys(neighbors).length, neighbors['Somerset County, NJ']);
// All counties per state (from the master list, so counties with no ZIP in the data still exist)
const counties = {}; Object.keys(master).sort().forEach(st => { counties[st] = [...new Set(master[st])].sort(); });
const TZ = { E: 'America/New_York', C: 'America/Chicago', M: 'America/Denver', P: 'America/Los_Angeles', AK: 'America/Anchorage', HI: 'Pacific/Honolulu', AZ: 'America/Phoenix' };
const zone = { E: 'CT DE DC FL GA IN KY ME MD MA MI NH NJ NY NC OH PA RI SC VT VA WV', C: 'AL AR IL IA KS LA MN MS MO NE ND OK SD TN TX WI', M: 'CO ID MT NM UT WY', P: 'CA NV OR WA', AK: 'AK', HI: 'HI', AZ: 'AZ' };
const tz = {}; Object.keys(zone).forEach(z => zone[z].split(' ').forEach(s => { tz[s] = TZ[z]; }));
const states = Object.fromEntries(Object.keys(counties).map(s => [s, STATES[s]]));
console.log('states', Object.keys(states).length, 'counties', Object.values(counties).reduce((n, a) => n + a.length, 0), 'tz missing', Object.keys(states).filter(s => !tz[s]));
fs.writeFileSync(OUT + '/lib/geo-data/zips.json', JSON.stringify({ counties: list, zips }));
fs.writeFileSync(OUT + '/lib/geo-data/neighbors.json', JSON.stringify(neighbors));
fs.writeFileSync(OUT + '/lib/geo-data/places.json', JSON.stringify({ states, counties, tz }));
fs.writeFileSync(OUT + '/public/assets/geo.js', '// Every US state and county, for pickers and state pages. Built once from public Census data; not hand-edited.\n(function (g) { var G = ' + JSON.stringify({ states, counties }) + ';\n  if (typeof module !== "undefined" && module.exports) module.exports = G; else g.GEO = G;\n})(this);\n');
