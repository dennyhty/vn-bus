// Turns a Vexere public route page (HTML) into the small JSON shape the site uses.

const NEXT_DATA_RE = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

export function extractRouteState(html) {
  const m = html.match(NEXT_DATA_RE);
  if (!m) throw new Error("NEXT_DATA_NOT_FOUND");
  const data = JSON.parse(m[1]);
  const state = data?.props?.initialState?.routeReducer;
  if (!state) throw new Error("ROUTE_STATE_NOT_FOUND");
  return state;
}

function place(area) {
  if (!area) return null;
  return {
    id: area.id,
    name: area.englishName || area.displayNameEnglish || area.name,
    lat: area.latitude,
    lon: area.longitude,
  };
}

function points(groups) {
  const out = [];
  for (const g of groups || []) {
    for (const p of g.points || []) {
      if (p.hidden || !p.location) continue;
      out.push({
        name: p.english_name || p.name,
        district: g.district,
        lat: p.location.lat,
        lon: p.location.lon,
        tripCount: p.trip_count,
      });
    }
  }
  return out;
}

function trip(t) {
  const schedule = t.route?.schedules?.[0] || {};
  return {
    code: t.tripCode,
    operator: t.busName,
    vehicle: t.vehicleTypeStr,
    departTime: t.fromTime,
    arriveTime: t.toTime,
    duration: t.duration,
    departAt: schedule.pickup_date || t.pickup_date,
    arriveAt: schedule.arrival_time || t.arrival_time,
    price: t.fareLarge,
    originalPrice: t.originalFare,
    seatsLeft: t.numberSeatAvailable,
    seatsTotal: t.totalSeats,
    rating: t.rateValue,
    ratingCount: t.countRate,
    pickup: { name: t.fromName, address: t.fromAddress },
    dropoff: { name: t.toName, address: t.toAddress },
    routeLabel: t.notification?.english_label || null,
    routeDetail: t.notification?.english_content || null,
    refundable: schedule.refundable === 1,
  };
}

export function normalizeRoute(state) {
  const stats = state.filterStatistic || {};
  return {
    date: state.routeQuery?.filter?.date || null,
    totalPages: state.meta?.total_pages ?? null,
    totalTrips: stats.total_available_trips ?? stats.total ?? null,
    from: place(state.from),
    to: place(state.to),
    trips: (state.trips || []).map(trip),
    pickupPoints: points(stats.pickup_points),
    dropoffPoints: points(stats.dropoff_points),
  };
}
