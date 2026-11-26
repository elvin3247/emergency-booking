// Places: every US state and county, which county a ZIP code is in, and which counties touch each other.
// A county is always written the same way everywhere (database, emails, pages): "Somerset County, NJ".
// Data files in lib/geo-data are built once from public Census data (ZIP areas as of the 2010s; about 33,000 ZIPs).
// A ZIP that isn't in the data (new, or PO-box only) simply isn't found, and the forms let people pick their state and county.
const places = require('./geo-data/places.json');
let zipData = null, nbData = null; // large files, loaded only when first needed
const Z = () => zipData || (zipData = require('./geo-data/zips.json'));
const N = () => nbData || (nbData = require('./geo-data/neighbors.json'));

const all = new Set();
Object.keys(places.counties).forEach(st => places.counties[st].forEach(c => all.add(c + ', ' + st)));

const valid = key => all.has(key);
const stateOf = key => String(key || '').slice(-2);
// "Somerset County" from "Somerset County, NJ"
const short = key => String(key || '').replace(/, [A-Z]{2}$/, '');
// { zip, county: "Somerset County, NJ", state: "NJ", town: "Warren" } or null
function zip(z) {
  const hit = Z().zips[String(z || '').trim()];
  if (!hit) return null;
  const county = Z().counties[hit[0]];
  return { zip: String(z).trim(), county, state: stateOf(county), town: hit[1] || '' };
}
const town = z => { const hit = Z().zips[String(z || '').trim()]; return hit ? hit[1] || '' : ''; };
const neighbors = key => N()[key] || [];
// The time zone for a county (by state; a few states span two zones, and we use the one most of the state is in).
const tz = key => places.tz[stateOf(key)] || 'America/New_York';
// Old New Jersey-only data stored "Somerset". Read it as "Somerset County, NJ".
const upgrade = name => (valid(name) ? name : valid(name + ' County, NJ') ? name + ' County, NJ' : name);

module.exports = { states: places.states, counties: places.counties, valid, stateOf, short, zip, town, neighbors, tz, upgrade, slug: s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') };
