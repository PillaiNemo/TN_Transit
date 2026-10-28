// Admin: schedules, coach/seat configuration, fares and booking fees.
import { query, withTransaction } from '../../db/pool.js';
import { HttpError, bool, date, int, num, oneOf, str, time } from '../../utils/validate.js';

const MODES = ['BUS', 'TRAIN'];
const like = (q) => (q && String(q).trim() ? String(q).trim() : null);
const dateTime = (value, name) => {
  const s = str(value, name, { pattern: /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/, patternMessage: `${name} must be YYYY-MM-DD HH:MM` });
  return s.replace('T', ' ');
};

const SQL = {
  // Seat totals per schedule come from the availability view (LATERAL aggregate).
  listSchedules: `
    SELECT sc.schedule_id, sc.service_id, sc.journey_date, sc.departure_at, sc.arrival_at, sc.status,
           sv.service_number, sv.service_name, o.transport_mode,
           oc.city_name AS origin_city, dc.city_name AS destination_city,
           COALESCE(av.total_seats, 0)  AS total_seats,
           COALESCE(av.booked_seats, 0) AS booked_seats,
           (SELECT COUNT(*) FROM bookings b
            WHERE b.schedule_id = sc.schedule_id AND b.booking_status = 'CONFIRMED') AS confirmed_bookings
    FROM schedules sc
    JOIN services sv ON sv.service_id = sc.service_id
    JOIN vehicles v  ON v.vehicle_id  = sv.vehicle_id
    JOIN operators o ON o.operator_id = v.operator_id
    JOIN routes r    ON r.route_id    = sv.route_id
    JOIN stations os ON os.station_id = r.origin_station_id
    JOIN cities oc   ON oc.city_id    = os.city_id
    JOIN stations ds ON ds.station_id = r.destination_station_id
    JOIN cities dc   ON dc.city_id    = ds.city_id
    LEFT JOIN LATERAL (
        SELECT SUM(ca.total_seats)::int AS total_seats, SUM(ca.booked_seats)::int AS booked_seats
        FROM schedule_class_availability_view ca WHERE ca.schedule_id = sc.schedule_id
    ) av ON TRUE
    WHERE ($1::int  IS NULL OR sc.service_id = $1)
      AND ($2::date IS NULL OR sc.journey_date >= $2)
      AND ($3::date IS NULL OR sc.journey_date <= $3)
      AND ($4::text IS NULL OR sc.status = $4)
      AND ($5::text IS NULL OR o.transport_mode = $5)
      AND ($6::text IS NULL OR sv.service_number ILIKE '%' || $6 || '%' OR sv.service_name ILIKE '%' || $6 || '%'
                            OR oc.city_name ILIKE '%' || $6 || '%' OR dc.city_name ILIKE '%' || $6 || '%')
    ORDER BY sc.departure_at, sv.service_number
    LIMIT 300`,

  // One statement creates a run of daily schedules. generate_series produces the dates;
  // the arrival defaults to the route's estimated duration. Dates that already have a run
  // are skipped by ON CONFLICT on the (service_id, journey_date) unique constraint.
  createSchedules: `
    INSERT INTO schedules (service_id, departure_at, arrival_at)
    SELECT sv.service_id,
           d::date + $3::time,
           d::date + $3::time + COALESCE(make_interval(mins => $4::int), r.estimated_duration)
    FROM services sv
    JOIN routes r ON r.route_id = sv.route_id
    CROSS JOIN generate_series($2::date, $2::date + ($5::int - 1), INTERVAL '1 day') AS d
    WHERE sv.service_id = $1
    ON CONFLICT (service_id, journey_date) DO NOTHING
    RETURNING schedule_id, journey_date`,

  confirmedOnSchedule: `
    SELECT COUNT(*) AS n FROM bookings WHERE schedule_id = $1 AND booking_status = 'CONFIRMED'`,

  updateSchedule: `
    UPDATE schedules SET departure_at = $2, arrival_at = $3, status = $4
    WHERE schedule_id = $1 RETURNING *`,

  coaches: `
    SELECT co.coach_id, co.vehicle_id, co.coach_code, co.layout_code, cl.layout_name,
           cls.class_code, cls.class_name,
           COUNT(s.seat_id)                               AS seats,
           COUNT(s.seat_id) FILTER (WHERE NOT s.is_active) AS blocked_seats,
           (SELECT COUNT(*) FROM seat_reservations sr JOIN seats s2 ON s2.seat_id = sr.seat_id
            WHERE s2.coach_id = co.coach_id)               AS reservations_ever
    FROM coaches co
    JOIN coach_layouts cl ON cl.layout_code = co.layout_code
    JOIN seat_classes cls ON cls.class_code = cl.class_code
    LEFT JOIN seats s     ON s.coach_id     = co.coach_id
    WHERE co.vehicle_id = $1
    GROUP BY co.coach_id, cl.layout_code, cls.class_code
    ORDER BY cls.display_order, co.coach_code`,

  coachSeats: `
    SELECT s.*,
           (SELECT COUNT(*) FROM seat_reservations sr JOIN schedules sc ON sc.schedule_id = sr.schedule_id
            WHERE sr.seat_id = s.seat_id AND sr.status = 'ACTIVE' AND sc.departure_at > ist_now()) AS upcoming_reservations
    FROM seats s WHERE s.coach_id = $1
    ORDER BY s.layout_row, s.layout_col`,

  listFares: `
    SELECT fr.*, sv.service_number, sv.service_name, sv.service_type, o.transport_mode, cls.class_name,
           oc.city_name AS origin_city, dc.city_name AS destination_city,
           (SELECT COUNT(*) FROM fare_history fh WHERE fh.fare_rule_id = fr.fare_rule_id) AS change_count
    FROM fare_rules fr
    JOIN services sv      ON sv.service_id  = fr.service_id
    JOIN vehicles v       ON v.vehicle_id   = sv.vehicle_id
    JOIN operators o      ON o.operator_id  = v.operator_id
    JOIN seat_classes cls ON cls.class_code = fr.class_code
    JOIN routes r         ON r.route_id     = sv.route_id
    JOIN stations os      ON os.station_id  = r.origin_station_id
    JOIN cities oc        ON oc.city_id     = os.city_id
    JOIN stations ds      ON ds.station_id  = r.destination_station_id
    JOIN cities dc        ON dc.city_id     = ds.city_id
    WHERE ($1::text IS NULL OR sv.service_number ILIKE '%' || $1 || '%' OR sv.service_name ILIKE '%' || $1 || '%'
                            OR oc.city_name ILIKE '%' || $1 || '%' OR dc.city_name ILIKE '%' || $1 || '%')
      AND ($2::text IS NULL OR o.transport_mode = $2)
      AND ($3::int  IS NULL OR fr.service_id = $3)
    ORDER BY o.transport_mode, sv.service_number, cls.display_order`,

  fareHistory: `
    SELECT fh.*, sv.service_number, sv.service_name, cls.class_name
    FROM fare_history fh
    JOIN services sv      ON sv.service_id  = fh.service_id
    JOIN seat_classes cls ON cls.class_code = fh.class_code
    ORDER BY fh.changed_at DESC
    LIMIT 100`,
};

export function registerOperationsAdmin(router) {
  // --------------------------------------------------------------------------
  // Schedules
  // --------------------------------------------------------------------------
  router.get('/schedules', async (req, res) => {
    const q = req.query;
    const { rows } = await query(SQL.listSchedules, [
      int(q.service_id, 'service_id', { optional: true, min: 1 }),
      date(q.date_from, 'date_from', { optional: true }),
      date(q.date_to, 'date_to', { optional: true }),
      oneOf(q.status, 'status', ['SCHEDULED', 'CANCELLED'], { optional: true }),
      oneOf(q.mode, 'mode', MODES, { optional: true }),
      like(q.q),
    ]);
    res.json(rows);
  });

  router.post('/schedules', async (req, res) => {
    const b = req.body ?? {};
    const repeat = int(b.repeat_days, 'Repeat for (days)', { min: 1, max: 60, optional: true }) ?? 1;
    const { rows } = await query(SQL.createSchedules, [
      int(b.service_id, 'Service', { min: 1 }),
      date(b.journey_date, 'Journey date'),
      time(b.departure_time, 'Departure time'),
      int(b.duration_minutes, 'Duration (minutes)', { optional: true, min: 10, max: 2879 }),
      repeat,
    ]);
    if (!rows.length) {
      throw new HttpError(409, repeat === 1
        ? 'This service already has a schedule on that date'
        : 'Every date in that range already has a schedule for this service');
    }
    res.status(201).json({ created: rows.length, skipped: repeat - rows.length, schedules: rows });
  });

  router.put('/schedules/:id', async (req, res) => {
    const id = int(req.params.id, 'id', { min: 1 });
    const b = req.body ?? {};
    const departure = dateTime(b.departure_at, 'Departure');
    const arrival = dateTime(b.arrival_at, 'Arrival');
    const status = oneOf(b.status, 'Status', ['SCHEDULED', 'CANCELLED']);
    const row = await withTransaction(async (client) => {
      // Lock the schedule so no booking slips in between the check and the update.
      const { rows: [current] } = await client.query('SELECT status FROM schedules WHERE schedule_id = $1 FOR UPDATE', [id]);
      if (!current) throw new HttpError(404, 'Schedule not found');
      if (status === 'CANCELLED' && current.status !== 'CANCELLED') {
        const { rows: [{ n }] } = await client.query(SQL.confirmedOnSchedule, [id]);
        if (n > 0) {
          throw new HttpError(409, `This journey has ${n} confirmed booking(s). Cancel them first (Booking records), then cancel the schedule.`);
        }
      }
      const { rows: [updated] } = await client.query(SQL.updateSchedule, [id, departure, arrival, status]);
      return updated;
    });
    res.json(row);
  });

  router.delete('/schedules/:id', async (req, res) => {
    const id = int(req.params.id, 'id', { min: 1 });
    // FK RESTRICT from bookings stops deletion of any journey that has ever been booked.
    const { rowCount } = await query('DELETE FROM schedules WHERE schedule_id = $1', [id]);
    if (!rowCount) throw new HttpError(404, 'Schedule not found');
    res.status(204).end();
  });

  // --------------------------------------------------------------------------
  // Coaches and seats
  // --------------------------------------------------------------------------
  router.get('/layouts', async (_req, res) => {
    const { rows } = await query(`
      SELECT cl.*, sc.class_name, sc.transport_mode
      FROM coach_layouts cl JOIN seat_classes sc ON sc.class_code = cl.class_code
      ORDER BY sc.transport_mode, sc.display_order, cl.layout_code`);
    res.json(rows);
  });

  router.get('/vehicles/:id/coaches', async (req, res) => {
    const { rows } = await query(SQL.coaches, [int(req.params.id, 'vehicle id', { min: 1 })]);
    res.json(rows);
  });

  router.post('/vehicles/:id/coaches', async (req, res) => {
    const vehicleId = int(req.params.id, 'vehicle id', { min: 1 });
    const coachCode = str(String(req.body?.coach_code ?? '').toUpperCase(), 'Coach code', {
      max: 8, pattern: /^[A-Z0-9]+$/, patternMessage: 'Coach code may contain only letters and digits (e.g. S3, B2, MAIN)',
    });
    const layout = str(req.body?.layout_code, 'Layout', { max: 12 });
    // add_coach() checks mode + capacity and generates the seats (functions.sql).
    const { rows: [row] } = await query('SELECT add_coach($1, $2, $3) AS coach_id', [vehicleId, coachCode, layout]);
    res.status(201).json(row);
  });

  router.delete('/coaches/:id', async (req, res) => {
    const id = int(req.params.id, 'coach id', { min: 1 });
    await withTransaction(async (client) => {
      // If any seat was ever reserved, FK RESTRICT from seat_reservations aborts this
      // (and the transaction rolls back), protecting booking history.
      await client.query('DELETE FROM seats WHERE coach_id = $1', [id]);
      const { rowCount } = await client.query('DELETE FROM coaches WHERE coach_id = $1', [id]);
      if (!rowCount) throw new HttpError(404, 'Coach not found');
    });
    res.status(204).end();
  });

  router.get('/coaches/:id/seats', async (req, res) => {
    const { rows } = await query(SQL.coachSeats, [int(req.params.id, 'coach id', { min: 1 })]);
    res.json(rows);
  });

  router.patch('/seats/:id', async (req, res) => {
    const id = int(req.params.id, 'seat id', { min: 1 });
    const active = bool(req.body?.is_active, 'is_active');
    // Blocking a seat affects only future sales; existing reservations stay valid.
    const { rows: [row] } = await query('UPDATE seats SET is_active = $2 WHERE seat_id = $1 RETURNING *', [id, active]);
    if (!row) throw new HttpError(404, 'Seat not found');
    res.json(row);
  });

  // --------------------------------------------------------------------------
  // Fares and booking fees
  // --------------------------------------------------------------------------
  router.get('/fares', async (req, res) => {
    const { rows } = await query(SQL.listFares, [
      like(req.query.q),
      oneOf(req.query.mode, 'mode', MODES, { optional: true }),
      int(req.query.service_id, 'service_id', { optional: true, min: 1 }),
    ]);
    res.json(rows);
  });

  router.post('/fares', async (req, res) => {
    const serviceId = int(req.body?.service_id, 'Service', { min: 1 });
    const classCode = str(req.body?.class_code, 'Class', { max: 4 });
    const fare = num(req.body?.fare, 'Fare', { min: 0, max: 100000 });
    const { rows: [check] } = await query(
      `SELECT o.transport_mode, sc.transport_mode AS class_mode
       FROM services sv JOIN vehicles v ON v.vehicle_id = sv.vehicle_id
       JOIN operators o ON o.operator_id = v.operator_id
       LEFT JOIN seat_classes sc ON sc.class_code = $2
       WHERE sv.service_id = $1`, [serviceId, classCode]);
    if (!check) throw new HttpError(400, 'Service not found');
    if (!check.class_mode) throw new HttpError(400, 'Unknown class');
    if (check.class_mode !== check.transport_mode) throw new HttpError(400, 'That class does not belong to this transport mode');
    const { rows: [row] } = await query(
      'INSERT INTO fare_rules (service_id, class_code, fare) VALUES ($1, $2, $3) RETURNING *',
      [serviceId, classCode, fare]);
    res.status(201).json(row);
  });

  router.put('/fares/:id', async (req, res) => {
    const id = int(req.params.id, 'id', { min: 1 });
    const fare = num(req.body?.fare, 'Fare', { min: 0, max: 100000 });
    // trg_fare_history records the old and new fare automatically.
    // Existing tickets are untouched: passengers.passenger_fare holds what was charged.
    const { rows: [row] } = await query(
      'UPDATE fare_rules SET fare = $2, updated_at = now() WHERE fare_rule_id = $1 RETURNING *', [id, fare]);
    if (!row) throw new HttpError(404, 'Fare rule not found');
    res.json(row);
  });

  router.delete('/fares/:id', async (req, res) => {
    const { rowCount } = await query('DELETE FROM fare_rules WHERE fare_rule_id = $1', [int(req.params.id, 'id', { min: 1 })]);
    if (!rowCount) throw new HttpError(404, 'Fare rule not found');
    res.status(204).end();
  });

  router.get('/fare-history', async (_req, res) => {
    const { rows } = await query(SQL.fareHistory);
    res.json(rows);
  });

  router.get('/booking-fees', async (_req, res) => {
    const { rows } = await query('SELECT * FROM booking_fees ORDER BY transport_mode');
    res.json(rows);
  });

  router.put('/booking-fees/:mode', async (req, res) => {
    const mode = oneOf(req.params.mode, 'mode', MODES);
    const fee = num(req.body?.fee_per_passenger, 'Fee per passenger', { min: 0, max: 1000 });
    const { rows: [row] } = await query(
      'UPDATE booking_fees SET fee_per_passenger = $2 WHERE transport_mode = $1 RETURNING *', [mode, fee]);
    res.json(row);
  });
}
