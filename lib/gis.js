const TIMEOUT_MS = 9000;

export const SOURCES = {
  zoning: {
    id: 'zoning',
    label: 'Base zoning',
    url: 'https://gis.charleston-sc.gov/arcgis2/rest/services/External/Zoning/MapServer/66',
    kind: 'point'
  },
  historic: {
    id: 'historic',
    label: 'Old & Historic District',
    url: 'https://gis.charleston-sc.gov/arcgis2/rest/services/External/Zoning/MapServer/4',
    kind: 'point'
  },
  str: {
    id: 'str',
    label: 'Residential STR category',
    url: 'https://gis.charleston-sc.gov/arcgis2/rest/services/External/Zoning/MapServer/68',
    kind: 'point'
  },
  futureLandUse: {
    id: 'futureLandUse',
    label: 'Future land use',
    url: 'https://gis.charleston-sc.gov/arcgis/rest/services/External/mapnetExternal/MapServer/382',
    kind: 'point'
  },
  flood: {
    id: 'flood',
    label: 'FEMA flood layer',
    url: 'https://gis.charleston-sc.gov/arcgis/rest/services/External/mapnetExternal/MapServer/375',
    kind: 'point'
  },
  property: {
    id: 'property',
    label: 'Residential property / price-per-sq-ft',
    url: 'https://gis.charleston-sc.gov/arcgis2/rest/services/External/Applications/MapServer/42',
    kind: 'point'
  },
  countyParcel: {
    id: 'countyParcel',
    label: 'Charleston County parcel',
    url: 'https://gisccapps.charlestoncounty.org/arcgis/rest/services/ProVal/ParcelMap/MapServer/0',
    kind: 'point'
  },
  activePermits: {
    id: 'activePermits',
    label: 'Active permits',
    url: 'https://gis.charleston-sc.gov/arcgis2/rest/services/External/Applications/MapServer/20',
    kind: 'radius', radius: 350
  },
  newDevelopments: {
    id: 'newDevelopments',
    label: 'New developments',
    url: 'https://gis.charleston-sc.gov/arcgis2/rest/services/External/Applications/MapServer/1130',
    kind: 'radius', radius: 1200
  },
  newConstruction: {
    id: 'newConstruction',
    label: 'New construction — last 365 days',
    url: 'https://gis.charleston-sc.gov/arcgis2/rest/services/External/Applications/MapServer/1132',
    kind: 'radius', radius: 1000
  },
  parking: {
    id: 'parking',
    label: 'On-street parking',
    url: 'https://gis.charleston-sc.gov/arcgis2/rest/services/External/Applications/MapServer/1122',
    kind: 'radius', radius: 350
  },
  transit: {
    id: 'transit',
    label: 'CARTA bus stops',
    url: 'https://gis.charleston-sc.gov/arcgis2/rest/services/External/Applications/MapServer/3',
    kind: 'radius', radius: 500
  }
};

const REVERSE_GEOCODER = 'https://gis.charleston-sc.gov/arcgis/rest/services/External/Service_Composite_Locator/GeocodeServer/reverseGeocode';
const FORWARD_GEOCODER = 'https://gis.charleston-sc.gov/arcgis/rest/services/External/City_Address_Locator/GeocodeServer/findAddressCandidates';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

function timeoutSignal(ms = TIMEOUT_MS) {
  return AbortSignal.timeout(ms);
}

async function fetchJson(url, options = {}, timeout = TIMEOUT_MS) {
  const res = await fetch(url, { ...options, signal: timeoutSignal(timeout), headers: { 'User-Agent': 'VAL-GEO/0.1', ...(options.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  if (data?.error) throw new Error(data.error.message || 'GIS service error');
  return data;
}

function featureCollection(features = []) {
  return { type: 'FeatureCollection', features };
}

export async function queryArcGis(source, lat, lng) {
  const p = new URLSearchParams({
    where: '1=1',
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: '*',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'geojson'
  });
  if (source.kind === 'radius') {
    p.set('distance', String(source.radius || 500));
    p.set('units', 'esriSRUnit_Meter');
  }
  const data = await fetchJson(`${source.url}/query?${p}`);
  return featureCollection(data.features || []);
}

export async function reverseGeocode(lat, lng) {
  const p = new URLSearchParams({
    location: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
    outSR: '4326',
    returnIntersection: 'false',
    f: 'json'
  });
  const data = await fetchJson(`${REVERSE_GEOCODER}?${p}`);
  return {
    address: data.address?.LongLabel || data.address?.Match_addr || data.address?.Address || null,
    fields: data.address || {},
    location: data.location || { x: lng, y: lat },
    source: REVERSE_GEOCODER
  };
}

export async function forwardGeocode(query) {
  const p = new URLSearchParams({
    SingleLine: query,
    outFields: '*',
    maxLocations: '8',
    outSR: '4326',
    f: 'json'
  });
  const data = await fetchJson(`${FORWARD_GEOCODER}?${p}`);
  return (data.candidates || []).map((c) => ({
    address: c.address,
    score: c.score,
    location: c.location,
    attributes: c.attributes || {}
  }));
}

function overpassQuery(lat, lng, radius = 900) {
  return `[out:json][timeout:8];(
    nwr(around:${radius},${lat},${lng})[amenity~"restaurant|cafe|bar|pub|fast_food|marketplace"];
    nwr(around:${radius},${lat},${lng})[tourism~"hotel|museum|attraction"];
    nwr(around:${radius},${lat},${lng})[shop];
  );out center tags 100;`;
}

function normalizeOsm(el) {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  const t = el.tags || {};
  if (lat == null || lng == null) return null;
  return {
    id: `osm:${el.type}:${el.id}`,
    name: t.name || t.brand || 'Unnamed place',
    category: t.amenity || t.tourism || t.shop || 'place',
    lat, lng,
    website: t.website || t['contact:website'] || null,
    phone: t.phone || t['contact:phone'] || null,
    cuisine: t.cuisine || null,
    source: 'OpenStreetMap'
  };
}

export async function nearbyPlaces(lat, lng, radius = 900) {
  const body = new URLSearchParams({ data: overpassQuery(lat, lng, radius) }).toString();
  let lastError;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const data = await fetchJson(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      }, 10000);
      const seen = new Set();
      return (data.elements || [])
        .map(normalizeOsm)
        .filter(Boolean)
        .filter((x) => x.name !== 'Unnamed place')
        .filter((x) => {
          const k = `${x.name}|${x.lat.toFixed(5)}|${x.lng.toFixed(5)}`;
          if (seen.has(k)) return false;
          seen.add(k); return true;
        })
        .slice(0, 80);
    } catch (err) { lastError = err; }
  }
  throw lastError || new Error('Nearby place service unavailable');
}

export async function collectEvidence(lat, lng) {
  const entries = Object.entries(SOURCES);
  const settled = await Promise.allSettled([
    reverseGeocode(lat, lng),
    ...entries.map(([, source]) => queryArcGis(source, lat, lng)),
    nearbyPlaces(lat, lng)
  ]);

  const [addressResult, ...rest] = settled;
  const placeResult = rest.pop();
  const layers = {};
  const failures = [];

  entries.forEach(([key, source], index) => {
    const result = rest[index];
    if (result.status === 'fulfilled') {
      layers[key] = {
        ...source,
        data: result.value,
        count: result.value.features.length,
        ok: true
      };
    } else {
      layers[key] = { ...source, data: featureCollection(), count: 0, ok: false, error: result.reason?.message || 'Unavailable' };
      failures.push({ source: source.label, error: result.reason?.message || 'Unavailable' });
    }
  });

  const address = addressResult.status === 'fulfilled' ? addressResult.value : { address: null, source: REVERSE_GEOCODER };
  if (addressResult.status === 'rejected') failures.push({ source: 'Reverse geocoder', error: addressResult.reason?.message || 'Unavailable' });

  const places = placeResult?.status === 'fulfilled' ? placeResult.value : [];
  if (placeResult?.status === 'rejected') failures.push({ source: 'Nearby places', error: placeResult.reason?.message || 'Unavailable' });

  return { point: { lat, lng }, address, layers, places, failures, generatedAt: new Date().toISOString() };
}

export function compactEvidence(e) {
  const firstProps = (key) => e.layers[key]?.data?.features?.[0]?.properties || null;
  return {
    point: e.point,
    address: e.address?.address,
    zoning: firstProps('zoning'),
    historic: firstProps('historic'),
    str: firstProps('str'),
    futureLandUse: firstProps('futureLandUse'),
    flood: firstProps('flood'),
    property: firstProps('property'),
    countyParcel: firstProps('countyParcel'),
    counts: {
      activePermits: e.layers.activePermits?.count || 0,
      newDevelopments: e.layers.newDevelopments?.count || 0,
      newConstruction: e.layers.newConstruction?.count || 0,
      parking: e.layers.parking?.count || 0,
      transit: e.layers.transit?.count || 0,
      nearbyPlaces: e.places?.length || 0
    },
    failures: e.failures
  };
}
