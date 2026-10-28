// Booking, ticket retrieval, booking history and cancellation.
import { query, withTransaction } from '../db/pool.js';
import { HttpError, email, int, oneOf, phone, str } from '../utils/validate.js';

export const MAX_PASSENGERS = 6;

const SQL = {
  // Step 1 — lock the schedule row. Concurrent bookings for the SAME journey now queue
  // here one at a time, so the availability check in step 3 cannot go stale before the
  // insert in step 5. Bookings for other journeys are not blocked.
  lockSchedule: `
    SELECT sc.schedule_id, sc.status, sv.service_id, sv.vehicle_id, o.transport_mode,
           bf.fee_per_passenger,
           (sc.status = 'SCHEDULED' AND sv.is_active AND v.is_active AND o.is_active) AS is_open,
           sc.departure_at > ist_now() AS not_departed
    FROM schedules sc
    JOIN services sv     ON sv.service_id     = sc.service_id
    JOIN vehicles v      ON v.vehicle_id      = sv.vehicle_id
    JOIN operators o     ON o.operator_id     = v.operator_id
    JOIN booking_fees bf ON bf.transport_mode = o.transport_mode
    WHERE sc.schedule_id = $1
    FOR UPDATE OF sc`,

  // Step 2 — the requested seats must belong to THIS vehicle, be active, and have a fare.
  // The fare is read from fare_rules now; the client never sends a price.
  seatsWithFares: `
    SELECT s.seat_id, s.seat_number, s.is_active, co.coach_code, cl.class_code, fr.fare
    FROM seats s
    JOIN coaches co       ON co.coach_id    = s.coach_id
    JOIN coach_layouts cl ON cl.layout_code = co.layout_code
    LEFT JOIN fare_rules fr ON fr.service_id = $2 AND fr.class_code = cl.class_code
    WHERE s.seat_id = ANY ($1::int[]) AND co.vehicle_id = $3`,

  // Step 3 — re-validate availability inside the transaction.
  takenSeats: `
    SELECT co.coach_code, s.seat_number
    FROM seat_reservations sr
    JOIN seats s    ON s.seat_id    = sr.seat_id
    JOIN coaches co ON co.coach_id  = s.coach_id
    WHERE sr.schedule_id = $1 AND sr.seat_id = ANY ($2::int[]) AND sr.status = 'ACTIVE'`,

  // Step 4 — booking header. booking_reference / pnr_reference come from column DEFAULTs.
  insertBooking: `
    INSERT INTO bookings (user_id, schedule_id, contact_email, contact_phone, fee_amount)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING booking_id, booking_reference, pnr_reference`,

  // Step 5 — one passenger row + one seat reservation row per traveller.
  insertPassenger: `
    INSERT INTO passengers (booking_id, passenger_name, age, gender, passenger_fare)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING passenger_id`,
  insertReservation: `
    INSERT INTO seat_reservations (booking_id, schedule_id, passenger_id, seat_id)
    VALUES ($1, $2, $3, $4)`,

  // Step 6 — the database computes the amount from the rows just inserted.
  // total_amount is a GENERATED column (base_amount + fee_amount).
  finaliseAmounts: `
    UPDATE bookings b
    SET base_amount = (SELECT SUM(p.passenger_fare) FROM passengers p WHERE p.booking_id = b.booking_id)
    WHERE b.booking_id = $1
    RETURNING base_amount, fee_amount, total_amount`,

  ticket: `
    SELECT * FROM booking_details_view
    WHERE booking_reference = $1 AND ($2::boolean OR user_id = $3)
    ORDER BY passenger_id`,

  myBookings: `
    SELECT * FROM booking_summary_view
    WHERE user_id = $1
      AND ($2::text IS NULL OR journey_state = $2)
      AND ($3::text IS NULL OR transport_mode = $3)
      AND ($4::text IS NULL OR booking_reference ILIKE '%' || $4 || '%' OR pnr_reference LIKE $4 || '%')
    ORDER BY CASE WHEN journey_state = 'UPCOMING' THEN departure_at END ASC NULLS LAST,
             departure_at DESC`,

  myBookingCounts: `
    SELECT journey_state, COUNT(*) AS count
    FROM booking_summary_view
    WHERE user_id = $1
    GROUP BY journey_state`,

  findOwnBooking: `
    SELECT booking_id FROM bookings
    WHERE booking_reference = $1 AND ($2::boolean OR user_id = $3)`,

  refundQuote: `SELECT * FROM calculate_refund($1)`,

  // The stored function performs the whole cancellation atomically.
  cancel: `SELECT * FROM cancel_booking($1, $2, $3)`,
};

const REFERENCE_PATTERN = /^TNT[A-Z0-9]{7}$/;
const reference = (value) =>
  str(String(value ?? '').toUpperCase(), 'Booking reference', {
    pattern: REFERENCE_PATTERN,
    patternMessage: 'Booking reference looks like TNT followed by 7 letters/digits',
  });

function parseBookingRequest(body) {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'Send the booking as a JSON body');
  const scheduleId = int(body.schedule_id, 'schedule_id', { min: 1 });
  const contactEmail = email(body.contact_email, 'Contact email');
  const contactPhone = phone(body.contact_phone, 'Contact phone');
  if (!Array.isArray(body.passengers) || body.passengers.length === 0) {
    throw new HttpError(400, 'At least one passenger is required');
  }
  if (body.passengers.length > MAX_PASSENGERS) {
    throw new HttpError(400, `A booking can have at most ${MAX_PASSENGERS} passengers`);
  }
  const passengers = body.passengers.map((p, i) => ({
    name: str(p?.passenger_name, `Passenger ${i + 1} name`, { min: 2, max: 100 }),
    age: int(p?.age, `Passenger ${i + 1} age`, { min: 1, max: 120 }),
    gender: oneOf(p?.gender, `Passenger ${i + 1} gender`, ['M', 'F', 'O']),
    seatId: int(p?.seat_id, `Passenger ${i + 1} seat`, { min: 1 }),
  }));
  const seatIds = passengers.map((p) => p.seatId);
  if (new Set(seatIds).size !== seatIds.length) {
    throw new HttpError(400, 'The same seat cannot be assigned to two passengers');
  }
  return { scheduleId, contactEmail, contactPhone, passengers, seatIds };
}

/** The booking transaction. Every statement runs on the same `client` between BEGIN and COMMIT. */
async function createBookingTransaction(userId, req) {
  return withTransaction(async (client) => {
    // 1. Validate + lock the journey
    const { rows: [schedule] } = await client.query(SQL.lockSchedule, [req.scheduleId]);
    if (!schedule) throw new HttpError(404, 'Schedule not found');
    if (!schedule.is_open) throw new HttpError(409, 'This journey is no longer open for booking');
    if (!schedule.not_departed) throw new HttpError(409, 'This journey has already departed');

    // 2. Validate seats and fetch the current fare for each
    const { rows: seats } = await client.query(SQL.seatsWithFares, [req.seatIds, schedule.service_id, schedule.vehicle_id]);
    if (seats.length !== req.seatIds.length) {
      throw new HttpError(400, 'One or more seats do not belong to this service');
    }
    const blocked = seats.filter((s) => !s.is_active || s.fare === null);
    if (blocked.length) {
      throw new HttpError(409, `Seat ${blocked.map((s) => `${s.coach_code}-${s.seat_number}`).join(', ')} is not available for sale`);
    }

    // 3. Re-check availability (the browser's seat map may be minutes old)
    const { rows: taken } = await client.query(SQL.takenSeats, [req.scheduleId, req.seatIds]);
    if (taken.length) {
      throw new HttpError(
        409,
        `Seat ${taken.map((s) => `${s.coach_code}-${s.seat_number}`).join(', ')} was just booked by another passenger. Please choose another seat.`,
        { taken },
      );
    }

    // 4. Booking header
    const fee = schedule.fee_per_passenger * req.passengers.length;
    const { rows: [booking] } = await client.query(SQL.insertBooking, [
      userId, req.scheduleId, req.contactEmail, req.contactPhone, fee,
    ]);

    // 5. Passengers + seat reservations (the partial unique index is the final guard)
    const fareBySeat = new Map(seats.map((s) => [s.seat_id, s.fare]));
    for (const p of req.passengers) {
      const { rows: [passenger] } = await client.query(SQL.insertPassenger, [
        booking.booking_id, p.name, p.age, p.gender, fareBySeat.get(p.seatId),
      ]);
      await client.query(SQL.insertReservation, [booking.booking_id, req.scheduleId, passenger.passenger_id, p.seatId]);
    }

    // 6. Amounts computed by SQL from the inserted rows
    const { rows: [amounts] } = await client.query(SQL.finaliseAmounts, [booking.booking_id]);
    return { ...booking, ...amounts };
    // 7. withTransaction COMMITs here; any error above ROLLBACKs everything.
  });
}

// ----------------------------------------------------------------------------
// Handlers
// ----------------------------------------------------------------------------
export async function createBooking(req, res) {
  const request = parseBookingRequest(req.body);
  // A randomly generated reference can (very rarely) collide with an existing one.
  // The UNIQUE constraint detects it; the whole transaction is simply retried.
  for (let attempt = 1; ; attempt++) {
    try {
      const booking = await createBookingTransaction(req.user.user_id, request);
      return res.status(201).json(booking);
    } catch (err) {
      const collision = err.code === '23505' &&
        ['bookings_booking_reference_key', 'bookings_pnr_reference_key'].includes(err.constraint);
      if (!collision || attempt >= 3) throw err;
    }
  }
}

/** Shape booking_details_view rows (one per passenger) into one ticket object. */
export function toTicket(rows) {
  const first = rows[0];
  const passengerFields = ['passenger_id', 'passenger_name', 'age', 'gender', 'passenger_fare', 'seat_id',
    'seat_number', 'berth_type', 'coach_code', 'class_code', 'class_name', 'reservation_status', 'released_at'];
  const ticket = Object.fromEntries(Object.entries(first).filter(([k]) => !passengerFields.includes(k)));
  ticket.passengers = rows.map((r) => Object.fromEntries(passengerFields.map((k) => [k, r[k]])));
  return ticket;
}

export async function getBooking(req, res) {
  const ref = reference(req.params.reference);
  const isAdmin = req.user.role === 'ADMIN';
  const { rows } = await query(SQL.ticket, [ref, isAdmin, req.user.user_id]);
  // 404 (not 403) for other people's bookings, so references cannot be probed.
  if (!rows.length) throw new HttpError(404, 'Booking not found');
  const ticket = toTicket(rows);
  if (ticket.journey_state === 'UPCOMING') {
    const { rows: [quote] } = await query(SQL.refundQuote, [ticket.booking_id]);
    ticket.refund_quote = quote;
  }
  res.json(ticket);
}

export async function listMyBookings(req, res) {
  const state = oneOf(req.query.state, 'state', ['UPCOMING', 'COMPLETED', 'CANCELLED'], { optional: true });
  const mode = oneOf(req.query.mode, 'mode', ['BUS', 'TRAIN'], { optional: true });
  const q = str(req.query.q, 'Search', { optional: true, max: 12, pattern: /^[A-Za-z0-9]+$/, patternMessage: 'Search by booking reference or PNR (letters and digits only)' });
  const [list, counts] = await Promise.all([
    query(SQL.myBookings, [req.user.user_id, state, mode, q ? q.toUpperCase() : null]),
    query(SQL.myBookingCounts, [req.user.user_id]),
  ]);
  res.json({
    bookings: list.rows,
    counts: Object.fromEntries(counts.rows.map((r) => [r.journey_state, r.count])),
  });
}

export async function cancelBooking(req, res) {
  const ref = reference(req.params.reference);
  const reason = str(req.body?.reason, 'Reason', { optional: true, max: 200 });
  const isAdmin = req.user.role === 'ADMIN';
  const { rows: [booking] } = await query(SQL.findOwnBooking, [ref, isAdmin, req.user.user_id]);
  if (!booking) throw new HttpError(404, 'Booking not found');
  // cancel_booking() raises TN404 / TN409 / TN422, mapped to HTTP codes by errorHandler.
  const { rows: [cancellation] } = await query(SQL.cancel, [booking.booking_id, req.user.user_id, reason]);
  res.json(cancellation);
}
