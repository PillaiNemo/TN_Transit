// Admin: dashboard metrics, SQL reports, booking + cancellation records, form lookups.
// Every number shown on the dashboard is produced by one of the queries below.
import { query } from '../../db/pool.js';
import { HttpError, date, oneOf, str } from '../../utils/validate.js';

const DASHBOARD_SQL = {
  // Aggregates with FILTER, a scalar subquery and NULLIF to avoid division by zero.
  totals: `
    SELECT COUNT(*)                                                           AS total_bookings,
           COUNT(*) FILTER (WHERE booking_status = 'CONFIRMED')               AS confirmed_bookings,
           COUNT(*) FILTER (WHERE booking_status = 'CANCELLED')               AS cancelled_bookings,
           (SELECT COUNT(*) FROM passengers p JOIN bookings b2 ON b2.booking_id = p.booking_id
            WHERE b2.booking_status = 'CONFIRMED')                            AS total_passengers,
           COALESCE(SUM(total_amount) FILTER (WHERE booking_status = 'CONFIRMED'), 0) AS confirmed_revenue,
           ROUND(AVG(total_amount) FILTER (WHERE booking_status = 'CONFIRMED'), 2)    AS avg_booking_value,
           ROUND(100.0 * COUNT(*) FILTER (WHERE booking_status = 'CANCELLED') / NULLIF(COUNT(*), 0), 2) AS cancellation_rate,
           (SELECT COUNT(*) FROM services WHERE is_active)                    AS active_services,
           (SELECT COALESCE(SUM(refund_amount), 0) FROM cancellations)        AS total_refunds
    FROM bookings`,

  // generate_series + LEFT JOIN: days with no bookings still appear with zero.
  daily: `
    SELECT d::date AS day,
           COUNT(b.booking_id) FILTER (WHERE o.transport_mode = 'BUS')   AS bus,
           COUNT(b.booking_id) FILTER (WHERE o.transport_mode = 'TRAIN') AS train,
           COALESCE(SUM(b.total_amount) FILTER (WHERE b.booking_status = 'CONFIRMED'), 0) AS revenue
    FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, INTERVAL '1 day') AS d
    LEFT JOIN bookings  b  ON (b.booked_at AT TIME ZONE 'Asia/Kolkata')::date = d::date
    LEFT JOIN schedules sc ON sc.schedule_id = b.schedule_id
    LEFT JOIN services  sv ON sv.service_id  = sc.service_id
    LEFT JOIN vehicles  v  ON v.vehicle_id   = sv.vehicle_id
    LEFT JOIN operators o  ON o.operator_id  = v.operator_id
    GROUP BY d
    ORDER BY d`,

  byMode: `
    SELECT transport_mode,
           COUNT(*)                                                   AS bookings,
           COUNT(*) FILTER (WHERE booking_status = 'CONFIRMED')       AS confirmed,
           COUNT(*) FILTER (WHERE booking_status = 'CANCELLED')       AS cancelled,
           COALESCE(SUM(passenger_count) FILTER (WHERE booking_status = 'CONFIRMED'), 0)::int AS passengers,
           COALESCE(SUM(total_amount) FILTER (WHERE booking_status = 'CONFIRMED'), 0) AS revenue
    FROM booking_summary_view
    GROUP BY transport_mode
    ORDER BY transport_mode`,

  topRoutes: `
    SELECT * FROM route_booking_summary_view
    WHERE confirmed_bookings > 0
    ORDER BY confirmed_bookings DESC, confirmed_revenue DESC
    LIMIT 6`,

  // GROUP BY ... HAVING: only destinations with a meaningful number of bookings.
  popularDestinations: `
    SELECT destination_city, COUNT(*) AS bookings, SUM(passenger_count)::int AS passengers
    FROM booking_summary_view
    WHERE booking_status = 'CONFIRMED'
    GROUP BY destination_city
    HAVING COUNT(*) >= 10
    ORDER BY bookings DESC
    LIMIT 8`,

  occupancy: `
    SELECT sc.schedule_id, sv.service_number, sv.service_name, sc.departure_at,
           oc.city_name AS origin_city, dc.city_name AS destination_city,
           occ.total_seats, occ.booked_seats,
           ROUND(100.0 * occ.booked_seats / NULLIF(occ.total_seats, 0), 1) AS occupancy_pct
    FROM schedules sc
    JOIN services sv ON sv.service_id = sc.service_id
    JOIN routes r    ON r.route_id    = sv.route_id
    JOIN stations os ON os.station_id = r.origin_station_id
    JOIN cities oc   ON oc.city_id    = os.city_id
    JOIN stations ds ON ds.station_id = r.destination_station_id
    JOIN cities dc   ON dc.city_id    = ds.city_id
    CROSS JOIN LATERAL (
        SELECT SUM(ca.total_seats)::int AS total_seats, SUM(ca.booked_seats)::int AS booked_seats
        FROM schedule_class_availability_view ca WHERE ca.schedule_id = sc.schedule_id
    ) occ
    WHERE sc.status = 'SCHEDULED' AND sc.departure_at > ist_now() AND sc.journey_date <= CURRENT_DATE + 3
    ORDER BY occupancy_pct DESC NULLS LAST
    LIMIT 8`,

  recent: `
    SELECT booking_reference, booked_by, transport_mode, service_number, origin_city, destination_city,
           departure_at, total_amount, booking_status, booked_at, passenger_count
    FROM booking_summary_view
    ORDER BY booked_at DESC
    LIMIT 8`,
};

// Named reports for the "SQL Reports" admin page. The page shows the SQL text together
// with the live result, which makes each DBMS concept easy to demonstrate.
export const REPORTS = [
  {
    key: 'bookings-per-day',
    title: 'Total reservations per day (last 14 days)',
    concepts: ['GROUP BY', 'COUNT', 'Date functions'],
    sql: `SELECT (booked_at AT TIME ZONE 'Asia/Kolkata')::date AS booking_day,
       COUNT(*) AS bookings,
       COUNT(*) FILTER (WHERE booking_status = 'CANCELLED') AS later_cancelled
FROM bookings
WHERE booked_at >= now() - INTERVAL '14 days'
GROUP BY booking_day
ORDER BY booking_day DESC;`,
  },
  {
    key: 'bookings-by-mode',
    title: 'Reservations and revenue by transport mode',
    concepts: ['INNER JOIN', 'GROUP BY', 'SUM', 'FILTER'],
    sql: `SELECT o.transport_mode,
       COUNT(*) AS bookings,
       SUM(b.total_amount) FILTER (WHERE b.booking_status = 'CONFIRMED') AS confirmed_revenue
FROM bookings b
JOIN schedules sc ON sc.schedule_id = b.schedule_id
JOIN services sv  ON sv.service_id  = sc.service_id
JOIN vehicles v   ON v.vehicle_id   = sv.vehicle_id
JOIN operators o  ON o.operator_id  = v.operator_id
GROUP BY o.transport_mode;`,
  },
  {
    key: 'revenue-by-operator',
    title: 'Revenue by operator (bus companies and railway services)',
    concepts: ['INNER JOIN', 'LEFT JOIN', 'GROUP BY', 'ORDER BY aggregate'],
    sql: `SELECT o.operator_name, o.transport_mode,
       COUNT(b.booking_id) AS bookings,
       COALESCE(SUM(b.total_amount) FILTER (WHERE b.booking_status = 'CONFIRMED'), 0) AS confirmed_revenue
FROM operators o
LEFT JOIN vehicles v   ON v.operator_id  = o.operator_id
LEFT JOIN services sv  ON sv.vehicle_id  = v.vehicle_id
LEFT JOIN schedules sc ON sc.service_id  = sv.service_id
LEFT JOIN bookings b   ON b.schedule_id  = sc.schedule_id
GROUP BY o.operator_id, o.operator_name, o.transport_mode
ORDER BY confirmed_revenue DESC;`,
  },
  {
    key: 'top-routes',
    title: 'Most frequently booked routes',
    concepts: ['VIEW', 'ORDER BY', 'LIMIT'],
    sql: `SELECT origin_city, destination_city, transport_mode,
       confirmed_bookings, passengers_carried, confirmed_revenue
FROM route_booking_summary_view
ORDER BY confirmed_bookings DESC
LIMIT 10;`,
  },
  {
    key: 'popular-destinations',
    title: 'Most popular destinations (at least 10 confirmed bookings)',
    concepts: ['GROUP BY', 'HAVING', 'SUM'],
    sql: `SELECT dc.city_name AS destination,
       COUNT(DISTINCT b.booking_id) AS bookings,
       COUNT(p.passenger_id) AS passengers
FROM bookings b
JOIN schedules sc ON sc.schedule_id = b.schedule_id
JOIN services sv  ON sv.service_id  = sc.service_id
JOIN routes r     ON r.route_id     = sv.route_id
JOIN stations ds  ON ds.station_id  = r.destination_station_id
JOIN cities dc    ON dc.city_id     = ds.city_id
JOIN passengers p ON p.booking_id   = b.booking_id
WHERE b.booking_status = 'CONFIRMED'
GROUP BY dc.city_name
HAVING COUNT(DISTINCT b.booking_id) >= 10
ORDER BY bookings DESC;`,
  },
  {
    key: 'average-booking-value',
    title: 'Average booking value and passengers per booking, by mode',
    concepts: ['AVG', 'ROUND', 'Subquery in FROM'],
    sql: `SELECT transport_mode,
       ROUND(AVG(total_amount), 2)    AS avg_booking_value,
       ROUND(AVG(passenger_count), 2) AS avg_passengers
FROM (SELECT transport_mode, total_amount, passenger_count
      FROM booking_summary_view
      WHERE booking_status = 'CONFIRMED') AS confirmed
GROUP BY transport_mode;`,
  },
  {
    key: 'cancellation-rate',
    title: 'Cancellation count, rate and refunds by mode',
    concepts: ['LEFT JOIN', 'COUNT', 'NULLIF', 'Percentages'],
    sql: `SELECT bs.transport_mode,
       COUNT(*) AS bookings,
       COUNT(c.cancellation_id) AS cancellations,
       ROUND(100.0 * COUNT(c.cancellation_id) / NULLIF(COUNT(*), 0), 2) AS cancellation_rate_pct,
       COALESCE(SUM(c.refund_amount), 0) AS refunded
FROM booking_summary_view bs
LEFT JOIN cancellations c ON c.booking_id = bs.booking_id
GROUP BY bs.transport_mode;`,
  },
  {
    key: 'seat-occupancy',
    title: 'Seat occupancy per upcoming schedule (next 3 days)',
    concepts: ['VIEW', 'LATERAL subquery', 'Computed percentage'],
    sql: `SELECT sv.service_number, sv.service_name, sc.departure_at,
       occ.booked, occ.total,
       ROUND(100.0 * occ.booked / NULLIF(occ.total, 0), 1) AS occupancy_pct
FROM schedules sc
JOIN services sv ON sv.service_id = sc.service_id
CROSS JOIN LATERAL (
    SELECT SUM(booked_seats) AS booked, SUM(total_seats) AS total
    FROM schedule_class_availability_view ca
    WHERE ca.schedule_id = sc.schedule_id
) occ
WHERE sc.departure_at > ist_now() AND sc.journey_date <= CURRENT_DATE + 3
ORDER BY occupancy_pct DESC;`,
  },
  {
    key: 'class-revenue',
    title: 'Revenue by seat class (from fares actually charged)',
    concepts: ['Multi-table JOIN', 'GROUP BY', 'Historical fare snapshot'],
    sql: `SELECT cls.class_name, cls.transport_mode,
       COUNT(*) AS seats_sold,
       SUM(p.passenger_fare) AS fare_revenue,
       ROUND(AVG(p.passenger_fare), 2) AS avg_fare_paid
FROM passengers p
JOIN bookings b           ON b.booking_id    = p.booking_id
JOIN seat_reservations sr ON sr.passenger_id = p.passenger_id
JOIN seats s              ON s.seat_id       = sr.seat_id
JOIN coaches co           ON co.coach_id     = s.coach_id
JOIN coach_layouts cl     ON cl.layout_code  = co.layout_code
JOIN seat_classes cls     ON cls.class_code  = cl.class_code
WHERE b.booking_status = 'CONFIRMED'
GROUP BY cls.class_code, cls.class_name, cls.transport_mode, cls.display_order
ORDER BY cls.display_order;`,
  },
  {
    key: 'above-average-customers',
    title: 'Passengers whose total spend is above the average customer',
    concepts: ['Nested subquery', 'GROUP BY', 'HAVING with subquery'],
    sql: `SELECT u.full_name, u.email, COUNT(*) AS bookings, SUM(b.total_amount) AS total_spent
FROM users u
JOIN bookings b ON b.user_id = u.user_id
WHERE b.booking_status = 'CONFIRMED'
GROUP BY u.user_id, u.full_name, u.email
HAVING SUM(b.total_amount) > (
    SELECT AVG(user_total)
    FROM (SELECT SUM(total_amount) AS user_total
          FROM bookings
          WHERE booking_status = 'CONFIRMED'
          GROUP BY user_id) AS per_user
)
ORDER BY total_spent DESC;`,
  },
  {
    key: 'unbooked-services',
    title: 'Active services with no bookings in the next 7 days',
    concepts: ['NOT EXISTS', 'Correlated subquery', 'Anti-join'],
    sql: `SELECT sv.service_number, sv.service_name, sv.service_type
FROM services sv
WHERE sv.is_active
  AND NOT EXISTS (
      SELECT 1
      FROM schedules sc
      JOIN bookings b ON b.schedule_id = sc.schedule_id
      WHERE sc.service_id = sv.service_id
        AND sc.journey_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
        AND b.booking_status = 'CONFIRMED')
ORDER BY sv.service_number;`,
  },
  {
    key: 'booking-audit',
    title: 'Booking status audit trail (written by trigger)',
    concepts: ['TRIGGER', 'Audit table', 'JOIN'],
    sql: `SELECT b.booking_reference, l.old_status, l.new_status, l.changed_at
FROM booking_status_log l
JOIN bookings b ON b.booking_id = l.booking_id
WHERE l.old_status IS NOT NULL
ORDER BY l.changed_at DESC
LIMIT 25;`,
  },
];

const RECORDS_SQL = {
  bookings: `
    SELECT bs.*, COUNT(*) OVER () AS total_matches
    FROM booking_summary_view bs
    WHERE ($1::text IS NULL OR bs.booking_reference ILIKE '%' || $1 || '%' OR bs.pnr_reference LIKE $1 || '%'
                            OR bs.user_email ILIKE '%' || $1 || '%' OR bs.booked_by ILIKE '%' || $1 || '%'
                            OR bs.service_number ILIKE '%' || $1 || '%')
      AND ($2::text IS NULL OR bs.booking_status = $2)
      AND ($3::text IS NULL OR bs.transport_mode = $3)
      AND ($4::date IS NULL OR bs.journey_date >= $4)
      AND ($5::date IS NULL OR bs.journey_date <= $5)
      AND ($6::text IS NULL OR bs.journey_state = $6)
    ORDER BY bs.booked_at DESC
    LIMIT 200`,

  cancellations: `
    SELECT c.*, bs.booking_reference, bs.pnr_reference, bs.total_amount, bs.service_number, bs.service_name,
           bs.origin_city, bs.destination_city, bs.departure_at, bs.transport_mode, bs.passenger_count,
           bs.booked_by, cb.full_name AS cancelled_by_name, cb.role AS cancelled_by_role
    FROM cancellations c
    JOIN booking_summary_view bs ON bs.booking_id = c.booking_id
    JOIN users cb                ON cb.user_id    = c.cancelled_by
    WHERE ($1::text IS NULL OR bs.booking_reference ILIKE '%' || $1 || '%' OR bs.booked_by ILIKE '%' || $1 || '%'
                            OR bs.service_number ILIKE '%' || $1 || '%')
      AND ($2::text IS NULL OR bs.transport_mode = $2)
    ORDER BY c.cancelled_at DESC
    LIMIT 200`,

  cancellationSummary: `
    SELECT COUNT(*) AS cancellations,
           COALESCE(SUM(refund_amount), 0) AS total_refunded,
           ROUND(AVG(refund_percent), 1)   AS avg_refund_percent,
           COUNT(*) FILTER (WHERE cancelled_at >= now() - INTERVAL '7 days') AS last_7_days
    FROM cancellations`,

  lookups: `
    SELECT
      (SELECT json_agg(x ORDER BY x.city_name) FROM (SELECT city_id, city_name FROM cities) x) AS cities,
      (SELECT json_agg(x ORDER BY x.city_name, x.station_name) FROM (
          SELECT s.station_id, s.station_name, s.station_code, s.station_kind, c.city_name
          FROM stations s JOIN cities c ON c.city_id = s.city_id) x) AS stations,
      (SELECT json_agg(x ORDER BY x.operator_name) FROM (
          SELECT operator_id, operator_name, transport_mode FROM operators) x) AS operators,
      (SELECT json_agg(x ORDER BY x.vehicle_number) FROM (
          SELECT v.vehicle_id, v.vehicle_number, v.vehicle_name, o.transport_mode
          FROM vehicles v JOIN operators o ON o.operator_id = v.operator_id) x) AS vehicles,
      (SELECT json_agg(x ORDER BY x.label) FROM (
          SELECT r.route_id, os.station_kind AS transport_mode,
                 oc.city_name || ' (' || os.station_code || ') → ' || dc.city_name || ' (' || ds.station_code || ')' AS label
          FROM routes r
          JOIN stations os ON os.station_id = r.origin_station_id JOIN cities oc ON oc.city_id = os.city_id
          JOIN stations ds ON ds.station_id = r.destination_station_id JOIN cities dc ON dc.city_id = ds.city_id) x) AS routes,
      (SELECT json_agg(x ORDER BY x.service_number) FROM (
          SELECT sv.service_id, sv.service_number, sv.service_name, o.transport_mode
          FROM services sv JOIN vehicles v ON v.vehicle_id = sv.vehicle_id
          JOIN operators o ON o.operator_id = v.operator_id) x) AS services,
      (SELECT json_agg(x ORDER BY x.amenity_name) FROM (SELECT amenity_id, amenity_name FROM amenities) x) AS amenities,
      (SELECT json_agg(x ORDER BY x.display_order) FROM (SELECT * FROM seat_classes) x) AS seat_classes,
      (SELECT json_agg(x ORDER BY x.layout_code) FROM (
          SELECT cl.*, sc.transport_mode FROM coach_layouts cl JOIN seat_classes sc ON sc.class_code = cl.class_code) x) AS layouts`,
};

const like = (q) => (q && String(q).trim() ? String(q).trim() : null);

export function registerInsightsAdmin(router) {
  router.get('/dashboard', async (_req, res) => {
    const keys = Object.keys(DASHBOARD_SQL);
    const results = await Promise.all(keys.map((k) => query(DASHBOARD_SQL[k])));
    const data = Object.fromEntries(keys.map((k, i) => [k, results[i].rows]));
    data.totals = data.totals[0];
    res.json(data);
  });

  router.get('/reports', (_req, res) => {
    res.json(REPORTS.map(({ key, title, concepts, sql }) => ({ key, title, concepts, sql })));
  });

  router.get('/reports/:key', async (req, res) => {
    const report = REPORTS.find((r) => r.key === req.params.key);
    if (!report) throw new HttpError(404, 'Report not found');
    const started = process.hrtime.bigint();
    const result = await query(report.sql);
    res.json({
      ...report,
      columns: result.fields.map((f) => f.name),
      rows: result.rows,
      elapsed_ms: Number(process.hrtime.bigint() - started) / 1e6,
    });
  });

  router.get('/bookings', async (req, res) => {
    const q = req.query;
    const { rows } = await query(RECORDS_SQL.bookings, [
      like(q.q),
      oneOf(q.status, 'status', ['CONFIRMED', 'CANCELLED'], { optional: true }),
      oneOf(q.mode, 'mode', ['BUS', 'TRAIN'], { optional: true }),
      date(q.date_from, 'date_from', { optional: true }),
      date(q.date_to, 'date_to', { optional: true }),
      oneOf(q.state, 'state', ['UPCOMING', 'COMPLETED', 'CANCELLED'], { optional: true }),
    ]);
    res.json({ bookings: rows, total_matches: rows[0]?.total_matches ?? 0 });
  });

  router.get('/cancellations', async (req, res) => {
    const [list, summary] = await Promise.all([
      query(RECORDS_SQL.cancellations, [
        str(req.query.q, 'q', { optional: true, max: 60 }),
        oneOf(req.query.mode, 'mode', ['BUS', 'TRAIN'], { optional: true }),
      ]),
      query(RECORDS_SQL.cancellationSummary),
    ]);
    res.json({ cancellations: list.rows, summary: summary.rows[0] });
  });

  router.get('/lookups', async (_req, res) => {
    const { rows } = await query(RECORDS_SQL.lookups);
    const data = rows[0];
    for (const k of Object.keys(data)) data[k] ??= [];
    res.json(data);
  });
}
