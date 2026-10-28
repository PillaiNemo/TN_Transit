// Public, read-only endpoints: cities, stations, service search, schedule + seat map.
import { query } from '../db/pool.js';
import { HttpError, bool, date, int, list, num, oneOf } from '../utils/validate.js';

// ----------------------------------------------------------------------------
// SQL
// ----------------------------------------------------------------------------
const SQL = {
  // LEFT JOIN + COUNT: cities with no stations still appear (with 0).
  cities: `
    SELECT c.city_id, c.city_name, c.state, c.also_known_as,
           COUNT(s.station_id) FILTER (WHERE s.station_kind = 'BUS')   AS bus_stations,
           COUNT(s.station_id) FILTER (WHERE s.station_kind = 'TRAIN') AS train_stations
    FROM cities c
    LEFT JOIN stations s ON s.city_id = c.city_id
    GROUP BY c.city_id
    ORDER BY c.city_name`,

  stations: `
    SELECT s.station_id, s.station_name, s.station_code, s.station_kind, c.city_id, c.city_name
    FROM stations s
    JOIN cities c ON c.city_id = s.city_id
    WHERE ($1::int IS NULL OR s.city_id = $1)
      AND ($2::text IS NULL OR s.station_kind = $2)
    ORDER BY c.city_name, s.station_name`,

  // Search: every filter is a parameter; a NULL parameter means "no filter".
  // Time-of-day buckets: hour / 6 -> 0 = 00-06, 1 = 06-12, 2 = 12-18, 3 = 18-24.
  search: (orderBy) => `
    SELECT a.*
    FROM available_services_view a
    WHERE a.origin_city_id = $1
      AND a.destination_city_id = $2
      AND a.journey_date = $3
      AND ($4::text   IS NULL OR a.transport_mode = $4)
      AND ($5::int[]  IS NULL OR (EXTRACT(HOUR FROM a.departure_at)::int / 6) = ANY ($5))
      AND ($6::int[]  IS NULL OR (EXTRACT(HOUR FROM a.arrival_at)::int / 6)   = ANY ($6))
      AND ($7::numeric IS NULL OR a.min_fare >= $7)
      AND ($8::numeric IS NULL OR a.min_fare <= $8)
      AND ($9::text[] IS NULL OR a.service_type = ANY ($9))
      AND (NOT $10::boolean OR a.available_seats >= $11)
    ORDER BY ${orderBy}`,

  // Facets for the filter panel, from the same route/date/mode WITHOUT the other filters.
  searchFacets: `
    SELECT COUNT(*)                                       AS total_services,
           MIN(a.min_fare)                                AS min_fare,
           MAX(a.min_fare)                                AS max_fare,
           COALESCE(array_agg(DISTINCT a.service_type), '{}') AS service_types
    FROM available_services_view a
    WHERE a.origin_city_id = $1 AND a.destination_city_id = $2 AND a.journey_date = $3
      AND ($4::text IS NULL OR a.transport_mode = $4)`,

  // When nothing runs on the chosen date: the next dates that DO have services.
  nextDates: `
    SELECT a.journey_date, COUNT(*) AS services
    FROM available_services_view a
    WHERE a.origin_city_id = $1 AND a.destination_city_id = $2 AND a.journey_date > $3
      AND ($4::text IS NULL OR a.transport_mode = $4)
    GROUP BY a.journey_date
    ORDER BY a.journey_date
    LIMIT 3`,

  schedule: `
    SELECT a.*, bf.fee_per_passenger
    FROM available_services_view a
    JOIN booking_fees bf ON bf.transport_mode = a.transport_mode
    WHERE a.schedule_id = $1`,

  // Every seat of the vehicle with its status FOR THIS SCHEDULE.
  // LEFT JOIN seat_reservations: no matching active reservation => the seat is free.
  seatMap: `
    SELECT s.seat_id, s.seat_number, s.berth_type, s.layout_row, s.layout_col,
           co.coach_code, co.layout_code, cls.class_code, cls.class_name, cls.display_order,
           fr.fare,
           CASE WHEN sr.reservation_id IS NOT NULL      THEN 'OCCUPIED'
                WHEN NOT s.is_active OR fr.fare IS NULL THEN 'UNAVAILABLE'
                ELSE 'AVAILABLE' END AS status
    FROM schedules sc
    JOIN services sv      ON sv.service_id   = sc.service_id
    JOIN coaches co       ON co.vehicle_id   = sv.vehicle_id
    JOIN coach_layouts cl ON cl.layout_code  = co.layout_code
    JOIN seat_classes cls ON cls.class_code  = cl.class_code
    JOIN seats s          ON s.coach_id      = co.coach_id
    LEFT JOIN fare_rules fr
           ON fr.service_id = sv.service_id AND fr.class_code = cls.class_code
    LEFT JOIN seat_reservations sr
           ON sr.schedule_id = sc.schedule_id AND sr.seat_id = s.seat_id AND sr.status = 'ACTIVE'
    WHERE sc.schedule_id = $1
    ORDER BY cls.display_order, co.coach_code, s.layout_row, s.layout_col`,

  // Home page "featured routes": most-booked city pairs with their lowest current fare.
  // GROUP BY + HAVING + a correlated subquery for the cheapest fare.
  featuredRoutes: `
    SELECT r.origin_city, r.destination_city, r.transport_mode,
           SUM(r.confirmed_bookings)::int AS bookings,
           (SELECT MIN(fr.fare)
            FROM fare_rules fr
            JOIN services sv ON sv.service_id = fr.service_id AND sv.is_active
            JOIN routes rt   ON rt.route_id   = sv.route_id
            JOIN stations os ON os.station_id = rt.origin_station_id
            JOIN stations ds ON ds.station_id = rt.destination_station_id
            JOIN cities oc   ON oc.city_id    = os.city_id
            JOIN cities dc   ON dc.city_id    = ds.city_id
            WHERE oc.city_name = r.origin_city AND dc.city_name = r.destination_city
              AND os.station_kind = r.transport_mode) AS from_fare,
           (SELECT COUNT(*) FROM services sv JOIN routes rt ON rt.route_id = sv.route_id
            JOIN stations os ON os.station_id = rt.origin_station_id JOIN cities oc ON oc.city_id = os.city_id
            JOIN stations ds ON ds.station_id = rt.destination_station_id JOIN cities dc ON dc.city_id = ds.city_id
            WHERE sv.is_active AND oc.city_name = r.origin_city AND dc.city_name = r.destination_city
              AND os.station_kind = r.transport_mode)::int AS services,
           (SELECT (MIN(EXTRACT(EPOCH FROM rt.estimated_duration)) / 60)::int
            FROM routes rt
            JOIN stations os ON os.station_id = rt.origin_station_id JOIN cities oc ON oc.city_id = os.city_id
            JOIN stations ds ON ds.station_id = rt.destination_station_id JOIN cities dc ON dc.city_id = ds.city_id
            WHERE oc.city_name = r.origin_city AND dc.city_name = r.destination_city
              AND os.station_kind = r.transport_mode) AS min_duration_minutes,
           (SELECT city_id FROM cities WHERE city_name = r.origin_city)      AS origin_city_id,
           (SELECT city_id FROM cities WHERE city_name = r.destination_city) AS destination_city_id
    FROM route_booking_summary_view r
    GROUP BY r.origin_city, r.destination_city, r.transport_mode
    HAVING SUM(r.confirmed_bookings) > 0
    ORDER BY bookings DESC
    LIMIT 8`,

  // Home page destination cards: services arriving per city.
  popularDestinations: `
    SELECT c.city_id, c.city_name, c.also_known_as,
           COUNT(DISTINCT sv.service_id) AS services,
           COUNT(DISTINCT sv.service_id) FILTER (WHERE ds.station_kind = 'BUS')   AS bus_services,
           COUNT(DISTINCT sv.service_id) FILTER (WHERE ds.station_kind = 'TRAIN') AS train_services
    FROM cities c
    JOIN stations ds ON ds.city_id = c.city_id
    JOIN routes r    ON r.destination_station_id = ds.station_id
    JOIN services sv ON sv.route_id = r.route_id AND sv.is_active
    GROUP BY c.city_id
    ORDER BY services DESC, c.city_name
    LIMIT 12`,

  homeStats: `
    SELECT (SELECT COUNT(*) FROM cities)                                   AS cities,
           (SELECT COUNT(*) FROM stations)                                 AS stations,
           (SELECT COUNT(*) FROM services WHERE is_active)                 AS active_services,
           (SELECT COUNT(*) FROM schedules
            WHERE status = 'SCHEDULED' AND departure_at > ist_now())        AS upcoming_journeys`,

  meta: `
    SELECT (SELECT json_agg(bf ORDER BY bf.transport_mode) FROM booking_fees bf)               AS booking_fees,
           (SELECT json_agg(cp ORDER BY cp.min_hours_before DESC) FROM cancellation_policy cp) AS cancellation_policy,
           (SELECT json_agg(sc ORDER BY sc.display_order) FROM seat_classes sc)                AS seat_classes,
           (SELECT MIN(journey_date) FROM schedules WHERE journey_date >= CURRENT_DATE)        AS first_bookable_date,
           (SELECT MAX(journey_date) FROM schedules)                                           AS last_bookable_date`,
};

// Whitelisted ORDER BY clauses. User input never becomes SQL text, it only picks a key.
const SORTS = {
  departure: 'a.departure_at ASC',
  fare: 'a.min_fare ASC, a.departure_at ASC',
  fare_desc: 'a.min_fare DESC, a.departure_at ASC',
  duration: 'a.duration_minutes ASC, a.departure_at ASC',
  arrival: 'a.arrival_at ASC',
  seats: 'a.available_seats DESC, a.departure_at ASC',
};

// ----------------------------------------------------------------------------
// Handlers
// ----------------------------------------------------------------------------
export async function listCities(_req, res) {
  const { rows } = await query(SQL.cities);
  res.json(rows);
}

export async function listStations(req, res) {
  const cityId = int(req.query.city_id, 'city_id', { optional: true, min: 1 });
  const kind = oneOf(req.query.kind, 'kind', ['BUS', 'TRAIN'], { optional: true });
  const { rows } = await query(SQL.stations, [cityId, kind]);
  res.json(rows);
}

export async function searchServices(req, res) {
  const q = req.query;
  const from = int(q.from, 'from', { min: 1 });
  const to = int(q.to, 'to', { min: 1 });
  if (from === to) throw new HttpError(400, 'Origin and destination must be different cities');
  const journeyDate = date(q.date, 'date');
  const mode = q.mode === 'ALL' ? null : oneOf(q.mode, 'mode', ['BUS', 'TRAIN'], { optional: true });
  const passengers = int(q.passengers, 'passengers', { min: 1, max: 6, optional: true }) ?? 1;
  const depart = list(q.depart, (x) => int(x, 'depart', { min: 0, max: 3 }));
  const arrive = list(q.arrive, (x) => int(x, 'arrive', { min: 0, max: 3 }));
  const minPrice = num(q.min_price, 'min_price', { min: 0, optional: true });
  const maxPrice = num(q.max_price, 'max_price', { min: 0, optional: true });
  const types = list(q.types);
  const availableOnly = bool(q.available_only, 'available_only', { optional: true }) ?? false;
  const sort = oneOf(q.sort, 'sort', Object.keys(SORTS), { optional: true }) ?? 'departure';

  const base = [from, to, journeyDate, mode];
  const [results, facets, nextDates] = await Promise.all([
    query(SQL.search(SORTS[sort]), [...base, depart, arrive, minPrice, maxPrice, types, availableOnly, passengers]),
    query(SQL.searchFacets, base),
    query(SQL.nextDates, base),
  ]);
  res.json({
    results: results.rows,
    facets: facets.rows[0],
    next_dates: facets.rows[0].total_services === 0 ? nextDates.rows : [],
  });
}

export async function getSchedule(req, res) {
  const id = int(req.params.id, 'schedule id', { min: 1 });
  const { rows } = await query(SQL.schedule, [id]);
  if (!rows[0]) throw new HttpError(404, 'This journey is not open for booking (it may have departed or been cancelled)');
  res.json(rows[0]);
}

export async function getSeatMap(req, res) {
  const id = int(req.params.id, 'schedule id', { min: 1 });
  const { rows } = await query(SQL.seatMap, [id]);
  if (!rows.length) throw new HttpError(404, 'Schedule not found');
  res.json(rows);
}

export async function getHomeData(_req, res) {
  const [featured, destinations, stats] = await Promise.all([
    query(SQL.featuredRoutes), query(SQL.popularDestinations), query(SQL.homeStats),
  ]);
  res.json({ featured_routes: featured.rows, popular_destinations: destinations.rows, stats: stats.rows[0] });
}

export async function getMeta(_req, res) {
  const { rows } = await query(SQL.meta);
  res.json(rows[0]);
}
