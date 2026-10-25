// Turns the public, undated Vexere route page (HTML) into a route timetable.
//
// The undated page is an SEO index page: it has no live trips, but
// props.initialState.seoReducer.seo carries every operator on the route with
// its daily departure times, fare range, rating and pickup/drop-off addresses,
// plus one sample dated trip per operator.

const NEXT_DATA_RE = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

export function extractSeo(html) {
  const m = html.match(NEXT_DATA_RE);
  if (!m) throw new Error("NEXT_DATA_NOT_FOUND");
  const seo = JSON.parse(m[1])?.props?.initialState?.seoReducer?.seo;
  if (!seo?.seoData) throw new Error("SEO_DATA_NOT_FOUND");
  return seo;
}

function place(area) {
  if (!area) return null;
  return {
    name: area.english_name || area.name,
    nameVi: area.name,
    lat: area.latitude ?? null,
    lon: area.longitude ?? null,
  };
}

function stop(p) {
  return { address: p.address || "", fullAddress: p.fullAddress || p.address || "" };
}

function endpoint(e) {
  if (!e) return null;
  return {
    name: e.english_name || e.name,
    nameVi: e.name,
    address: e.english_address || e.address || "",
  };
}

function sampleTrip(t) {
  const s = t.route?.schedules?.[0];
  if (!s) return null;
  return {
    date: s.pickup_date,
    arriveAt: s.arrival_time,
    price: s.fare?.discount > 0 ? s.fare.discount : s.fare?.original ?? null,
    seatsLeft: s.available_seats,
    seatsTotal: s.total_seats,
    vehicle: s.vehicle_type,
    refundable: s.refundable === 1,
    from: endpoint(t.route.from),
    to: endpoint(t.route.to),
  };
}

export function normalizeRoute(seo) {
  const area = seo.dataRoutePage?.area || {};
  const samples = new Map();
  for (const t of seo.dataRoutePage?.data || []) {
    if (t.company?.id != null) samples.set(t.company.id, t);
  }

  const operators = (seo.seoData.companyBestRatings || []).map((c) => {
    const t = samples.get(c.id);
    return {
      id: c.id,
      name: c.name,
      nameVi: t?.company?.name && t.company.name !== c.name ? t.company.name : null,
      url: c.url,
      rating: c.rating?.avg ?? null,
      ratingCount: c.rating?.count ?? 0,
      times: c.times || [],
      fareMin: c.fareMin ?? null,
      fareMax: c.fareMax ?? null,
      pickupPoints: (c.pickupPoints || []).map(stop),
      dropoffPoints: (c.dropoffPoints || []).map(stop),
      sample: t ? sampleTrip(t) : null,
    };
  });

  return {
    from: place(area.from),
    to: place(area.to),
    distanceKm: seo.distance ?? null,
    durationHours: seo.duration ?? null,
    totalTrips: seo.totalTrip ?? null,
    totalOperators: seo.totalCompany ?? operators.length,
    fareMin: seo.seoData.fareMin ?? null,
    fareMax: seo.seoData.fareMax ?? null,
    operators,
  };
}
