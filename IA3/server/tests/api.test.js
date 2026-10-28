// End-to-end tests: real Express app + real PostgreSQL (the seeded tn_transit database).
// Run:  npm test   (after npm run db:setup). Tests add a few bookings/schedules; re-run
// `npm run db:setup` any time to restore the pristine demo data.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';

let server;
let base;

/** Tiny HTTP client that keeps its own session cookie. */
function client() {
  let cookie = '';
  const call = async (method, path, body, raw) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined || raw ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b ?? {}),
    put: (p, b) => call('PUT', p, b ?? {}),
    del: (p) => call('DELETE', p),
    raw: (p, text) => call('POST', p, undefined, text),
    login: (email, password) => call('POST', '/api/auth/login', { email, password }),
  };
}

const sql = async (text, params) => (await pool.query(text, params)).rows;
const istDate = (offset) => new Date(Date.now() + 5.5 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);
const cityId = async (name) => (await sql('SELECT city_id FROM cities WHERE city_name = $1', [name]))[0].city_id;

let passenger;
let admin;
let anon;

/** First bus schedule Chennai -> Coimbatore `offset` days ahead, with N free seats. */
async function freeBusSeats(offset, n) {
  const [from, to] = [await cityId('Chennai'), await cityId('Coimbatore')];
  const search = await anon.get(`/api/services/search?from=${from}&to=${to}&date=${istDate(offset)}&mode=BUS`);
  const schedule = search.body.results[0];
  const seats = (await anon.get(`/api/schedules/${schedule.schedule_id}/seats`)).body.filter((s) => s.status === 'AVAILABLE');
  return { schedule, seats: seats.slice(0, n) };
}

const bookingBody = (scheduleId, seats) => ({
  schedule_id: scheduleId,
  contact_email: 'priya@example.com',
  contact_phone: '9840012345',
  passengers: seats.map((s, i) => ({ passenger_name: `Test Passenger ${i + 1}`, age: 30 + i, gender: i % 2 ? 'M' : 'F', seat_id: s.seat_id })),
});

before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
  anon = client();
  passenger = client();
  admin = client();
  assert.equal((await passenger.login('priya@example.com', 'Demo@123')).status, 200);
  assert.equal((await admin.login('admin@tntransit.demo', 'Admin@123')).status, 200);
});

after(async () => {
  await new Promise((r) => server.close(r));
  await pool.end();
});

describe('search', () => {
  test('1. bus search Chennai -> Coimbatore returns only matching bus services', async () => {
    const res = await anon.get(`/api/services/search?from=${await cityId('Chennai')}&to=${await cityId('Coimbatore')}&date=${istDate(2)}&mode=BUS`);
    assert.equal(res.status, 200);
    assert.ok(res.body.results.length >= 2);
    for (const r of res.body.results) {
      assert.equal(r.transport_mode, 'BUS');
      assert.equal(r.origin_city, 'Chennai');
      assert.equal(r.destination_city, 'Coimbatore');
      assert.equal(r.journey_date, istDate(2));
    }
  });

  test('2. train search Chennai -> Madurai returns trains with per-class availability', async () => {
    const res = await anon.get(`/api/services/search?from=${await cityId('Chennai')}&to=${await cityId('Madurai')}&date=${istDate(3)}&mode=TRAIN&sort=fare`);
    assert.equal(res.status, 200);
    assert.ok(res.body.results.length >= 2);
    assert.ok(res.body.results.every((r) => r.transport_mode === 'TRAIN' && r.classes.length > 0));
    const fares = res.body.results.map((r) => r.min_fare);
    assert.deepEqual(fares, [...fares].sort((a, b) => a - b), 'sorted by fare');
  });

  test('3. a route with no service returns an empty result (not an error)', async () => {
    const res = await anon.get(`/api/services/search?from=${await cityId('Vellore')}&to=${await cityId('Kanyakumari')}&date=${istDate(1)}&mode=BUS`);
    assert.equal(res.status, 200);
    assert.equal(res.body.results.length, 0);
    assert.equal(res.body.facets.total_services, 0);
  });

  test('filters change the SQL result set', async () => {
    const q = `/api/services/search?from=${await cityId('Chennai')}&to=${await cityId('Coimbatore')}&date=${istDate(2)}&mode=BUS`;
    const all = (await anon.get(q)).body.results;
    const night = (await anon.get(`${q}&depart=3`)).body.results;
    const cheap = (await anon.get(`${q}&max_price=700`)).body.results;
    assert.ok(night.length < all.length && night.every((r) => Number(r.departure_at.slice(11, 13)) >= 18));
    assert.ok(cheap.every((r) => r.min_fare <= 700));
  });
});

describe('booking transaction', () => {
  let booking;
  let picked;

  test('4. seat fares come from the database and the total is computed correctly', async () => {
    picked = await freeBusSeats(4, 2);
    const fee = (await anon.get(`/api/schedules/${picked.schedule.schedule_id}`)).body.fee_per_passenger;
    const res = await passenger.post('/api/bookings', bookingBody(picked.schedule.schedule_id, picked.seats));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    booking = res.body;
    const expectedBase = picked.seats.reduce((s, x) => s + x.fare, 0);
    assert.equal(booking.base_amount, expectedBase);
    assert.equal(booking.fee_amount, fee * 2);
    assert.equal(booking.total_amount, expectedBase + fee * 2);
    assert.match(booking.booking_reference, /^TNT[A-Z0-9]{7}$/);
    assert.match(booking.pnr_reference, /^\d{10}$/);
  });

  test('5. all related rows exist in PostgreSQL', async () => {
    const [b] = await sql('SELECT * FROM bookings WHERE booking_reference = $1', [booking.booking_reference]);
    assert.equal(b.booking_status, 'CONFIRMED');
    const pax = await sql('SELECT * FROM passengers WHERE booking_id = $1', [b.booking_id]);
    const res = await sql('SELECT * FROM seat_reservations WHERE booking_id = $1', [b.booking_id]);
    const log = await sql('SELECT * FROM booking_status_log WHERE booking_id = $1', [b.booking_id]);
    assert.equal(pax.length, 2);
    assert.equal(res.length, 2);
    assert.ok(res.every((r) => r.status === 'ACTIVE' && r.schedule_id === picked.schedule.schedule_id));
    assert.equal(log.length, 1, 'audit trigger logged the new booking');
    const seatMap = (await anon.get(`/api/schedules/${picked.schedule.schedule_id}/seats`)).body;
    for (const s of picked.seats) assert.equal(seatMap.find((x) => x.seat_id === s.seat_id).status, 'OCCUPIED');
  });

  test('6. the booking persists and is retrievable by reference (owner only)', async () => {
    const res = await passenger.get(`/api/bookings/${booking.booking_reference}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.passengers.length, 2);
    assert.equal(res.body.total_amount, booking.total_amount);
    const other = client();
    await other.login('arun@example.com', 'Demo@123');
    assert.equal((await other.get(`/api/bookings/${booking.booking_reference}`)).status, 404, 'other users cannot see it');
    assert.equal((await admin.get(`/api/bookings/${booking.booking_reference}`)).status, 200, 'admins can');
  });

  test('7a. booking an already-booked seat is rejected (409) and nothing is written', async () => {
    const before = (await sql('SELECT count(*)::int AS n FROM bookings'))[0].n;
    const res = await passenger.post('/api/bookings', bookingBody(picked.schedule.schedule_id, picked.seats));
    assert.equal(res.status, 409);
    assert.equal((await sql('SELECT count(*)::int AS n FROM bookings'))[0].n, before);
  });

  test('7b. ten concurrent requests for the same free seat: exactly one succeeds', async () => {
    const { schedule, seats } = await freeBusSeats(6, 1);
    const users = await Promise.all(Array.from({ length: 10 }, async () => {
      const c = client();
      await c.login('priya@example.com', 'Demo@123');
      return c;
    }));
    const results = await Promise.all(users.map((c) => c.post('/api/bookings', bookingBody(schedule.schedule_id, seats))));
    const codes = results.map((r) => r.status).sort();
    assert.equal(codes.filter((c) => c === 201).length, 1, `codes: ${codes}`);
    assert.equal(codes.filter((c) => c === 409).length, 9);
    const active = await sql(`SELECT count(*)::int AS n FROM seat_reservations
                              WHERE schedule_id = $1 AND seat_id = $2 AND status = 'ACTIVE'`, [schedule.schedule_id, seats[0].seat_id]);
    assert.equal(active[0].n, 1);
  });

  test('8. cancelling releases the seats but keeps the history', async () => {
    const res = await passenger.post(`/api/bookings/${booking.booking_reference}/cancel`, { reason: 'Automated test' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.refund_amount > 0);
    const [b] = await sql('SELECT * FROM bookings WHERE booking_reference = $1', [booking.booking_reference]);
    assert.equal(b.booking_status, 'CANCELLED');
    const resv = await sql('SELECT status, released_at FROM seat_reservations WHERE booking_id = $1', [b.booking_id]);
    assert.ok(resv.length === 2 && resv.every((r) => r.status === 'RELEASED' && r.released_at));
    assert.equal((await sql('SELECT count(*)::int AS n FROM passengers WHERE booking_id = $1', [b.booking_id]))[0].n, 2);
    assert.equal((await sql('SELECT count(*)::int AS n FROM cancellations WHERE booking_id = $1', [b.booking_id]))[0].n, 1);
    const seatMap = (await anon.get(`/api/schedules/${picked.schedule.schedule_id}/seats`)).body;
    for (const s of picked.seats) assert.equal(seatMap.find((x) => x.seat_id === s.seat_id).status, 'AVAILABLE');
    assert.equal((await passenger.post(`/api/bookings/${booking.booking_reference}/cancel`, {})).status, 409, 'second cancel');
    // The freed seat can be booked again.
    const again = await passenger.post('/api/bookings', bookingBody(picked.schedule.schedule_id, picked.seats.slice(0, 1)));
    assert.equal(again.status, 201);
  });

  test('9. cancelled bookings remain visible in booking history', async () => {
    const res = await passenger.get('/api/bookings?state=CANCELLED');
    assert.equal(res.status, 200);
    assert.ok(res.body.bookings.some((b) => b.booking_reference === booking.booking_reference));
  });
});

describe('admin', () => {
  test('10. a schedule added by an admin appears in search', async () => {
    const [svc] = await sql(`SELECT sv.service_id, r.origin_station_id FROM services sv JOIN routes r ON r.route_id = sv.route_id
                             WHERE sv.service_number = 'TNT-B101'`);
    const date = istDate(45);
    await sql('DELETE FROM schedules WHERE service_id = $1 AND journey_date = $2', [svc.service_id, date]);
    const res = await admin.post('/api/admin/schedules', { service_id: svc.service_id, journey_date: date, departure_time: '23:10', repeat_days: 1 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const search = await anon.get(`/api/services/search?from=${await cityId('Chennai')}&to=${await cityId('Coimbatore')}&date=${date}&mode=BUS`);
    assert.ok(search.body.results.some((r) => r.service_number === 'TNT-B101' && r.departure_at.endsWith('23:10:00')));
    await sql('DELETE FROM schedules WHERE schedule_id = $1', [res.body.schedules[0].schedule_id]);
  });

  test('11. a fare change applies to new bookings only; old tickets keep their fare', async () => {
    const { schedule, seats } = await freeBusSeats(8, 2);
    const first = await passenger.post('/api/bookings', bookingBody(schedule.schedule_id, seats.slice(0, 1)));
    assert.equal(first.status, 201);
    const oldFare = seats[0].fare;
    const [rule] = await sql(`SELECT fr.fare_rule_id FROM fare_rules fr JOIN schedules sc ON sc.service_id = fr.service_id
                              WHERE sc.schedule_id = $1 AND fr.class_code = $2`, [schedule.schedule_id, seats[0].class_code]);
    try {
      assert.equal((await admin.put(`/api/admin/fares/${rule.fare_rule_id}`, { fare: oldFare + 100 })).status, 200);
      const second = await passenger.post('/api/bookings', bookingBody(schedule.schedule_id, seats.slice(1, 2)));
      assert.equal(second.status, 201);
      assert.equal(second.body.base_amount, oldFare + 100, 'new booking uses new fare');
      const oldTicket = (await passenger.get(`/api/bookings/${first.body.booking_reference}`)).body;
      assert.equal(oldTicket.passengers[0].passenger_fare, oldFare, 'old ticket unchanged');
      const hist = await sql('SELECT * FROM fare_history WHERE fare_rule_id = $1 ORDER BY changed_at DESC LIMIT 1', [rule.fare_rule_id]);
      assert.equal(hist[0].old_fare, oldFare);
      assert.equal(hist[0].new_fare, oldFare + 100);
    } finally {
      await admin.put(`/api/admin/fares/${rule.fare_rule_id}`, { fare: oldFare });
    }
  });

  test('12. dashboard figures equal direct SQL aggregates', async () => {
    const dash = (await admin.get('/api/admin/dashboard')).body.totals;
    const [direct] = await sql(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE booking_status = 'CONFIRMED')::int AS confirmed,
             count(*) FILTER (WHERE booking_status = 'CANCELLED')::int AS cancelled,
             COALESCE(sum(total_amount) FILTER (WHERE booking_status = 'CONFIRMED'), 0) AS revenue
      FROM bookings`);
    assert.equal(dash.total_bookings, direct.total);
    assert.equal(dash.confirmed_bookings, direct.confirmed);
    assert.equal(dash.cancelled_bookings, direct.cancelled);
    assert.equal(dash.confirmed_revenue, direct.revenue);
  });

  test('deleting referenced records is refused; deactivation hides a service from search', async () => {
    const [city] = await sql(`SELECT city_id FROM cities WHERE city_name = 'Chennai'`);
    assert.equal((await admin.del(`/api/admin/cities/${city.city_id}`)).status, 409);
    const [svc] = await sql(`SELECT * FROM services WHERE service_number = 'TNT-B111'`);
    assert.equal((await admin.del(`/api/admin/services/${svc.service_id}`)).status, 409);
    const q = `/api/services/search?from=${await cityId('Chennai')}&to=${await cityId('Coimbatore')}&date=${istDate(3)}&mode=BUS`;
    await sql('UPDATE services SET is_active = FALSE WHERE service_id = $1', [svc.service_id]);
    try {
      assert.ok(!(await anon.get(q)).body.results.some((r) => r.service_number === 'TNT-B111'));
    } finally {
      await sql('UPDATE services SET is_active = TRUE WHERE service_id = $1', [svc.service_id]);
    }
  });
});

describe('database constraints', () => {
  const expectError = async (code, text, params) => {
    await assert.rejects(pool.query(text, params), (err) => {
      assert.equal(err.code, code, `${err.code} ${err.message}`);
      return true;
    });
  };

  test('13. CHECK and FOREIGN KEY constraints reject invalid data', async () => {
    const [st] = await sql(`SELECT station_id FROM stations LIMIT 1`);
    await expectError('23514', 'INSERT INTO routes (origin_station_id, destination_station_id, distance_km, estimated_duration) VALUES ($1, $1, 10, \'1 hour\')', [st.station_id]);
    await expectError('23514', `UPDATE fare_rules SET fare = -1 WHERE fare_rule_id = (SELECT min(fare_rule_id) FROM fare_rules)`);
    await expectError('23514', `UPDATE passengers SET age = 150 WHERE passenger_id = (SELECT min(passenger_id) FROM passengers)`);
    await expectError('23514', `UPDATE vehicles SET capacity = 0 WHERE vehicle_id = (SELECT min(vehicle_id) FROM vehicles)`);
    await expectError('23503', `INSERT INTO stations (station_name, station_code, city_id, station_kind) VALUES ('X', 'XX-TEST', 999999, 'BUS')`);
    // ON DELETE RESTRICT reports restrict_violation (23001).
    await expectError('23001', `DELETE FROM schedules WHERE schedule_id = (SELECT min(schedule_id) FROM bookings)`);
    await expectError('23505', `INSERT INTO users (full_name, email, phone, password_hash) VALUES ('Dup', 'PRIYA@example.com', '9840012345', 'x')`);
    await expectError('23514', `UPDATE schedules SET arrival_at = departure_at - interval '1 hour' WHERE schedule_id = (SELECT min(schedule_id) FROM schedules)`);
    // Partial unique index: a second ACTIVE reservation for the same (schedule, seat).
    await expectError('23505', `
      INSERT INTO seat_reservations (booking_id, schedule_id, passenger_id, seat_id)
      SELECT b.booking_id, b.schedule_id, p.passenger_id, sr.seat_id
      FROM seat_reservations sr
      JOIN bookings b2 ON b2.schedule_id = sr.schedule_id AND b2.booking_id <> sr.booking_id
      JOIN bookings b ON b.booking_id = b2.booking_id
      JOIN passengers p ON p.booking_id = b.booking_id
      WHERE sr.status = 'ACTIVE' LIMIT 1`);
  });

  test('14. a failed transaction rolls back every partial insert', async () => {
    const count = async () => (await sql(`SELECT (SELECT count(*) FROM bookings) + (SELECT count(*) FROM passengers) AS n`))[0].n;
    const before = await count();
    const [taken] = await sql(`SELECT sr.schedule_id, sr.seat_id FROM seat_reservations sr WHERE sr.status = 'ACTIVE' LIMIT 1`);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const { rows: [b] } = await c.query(
        `INSERT INTO bookings (user_id, schedule_id, contact_email, contact_phone) VALUES (2, $1, 'a@b.co', '9840012345') RETURNING booking_id`, [taken.schedule_id]);
      const { rows: [p] } = await c.query(
        `INSERT INTO passengers (booking_id, passenger_name, age, gender, passenger_fare) VALUES ($1, 'Rollback Test', 30, 'F', 100) RETURNING passenger_id`, [b.booking_id]);
      await assert.rejects(c.query(
        'INSERT INTO seat_reservations (booking_id, schedule_id, passenger_id, seat_id) VALUES ($1, $2, $3, $4)',
        [b.booking_id, taken.schedule_id, p.passenger_id, taken.seat_id]), { code: '23505' });
      await c.query('ROLLBACK');
    } finally {
      c.release();
    }
    assert.equal(await count(), before, 'booking and passenger rows were rolled back');
  });
});

describe('validation and authorisation', () => {
  test('15. invalid input, missing parameters and unauthorised access are rejected', async () => {
    assert.equal((await anon.get('/api/services/search?from=1')).status, 400);
    assert.equal((await anon.get('/api/services/search?from=1&to=2&date=31-12-2026')).status, 400);
    assert.equal((await anon.get('/api/services/search?from=1&to=2&date=2026-11-01&sort=DROP TABLE')).status, 400);
    assert.equal((await anon.post('/api/bookings', {})).status, 401);
    assert.equal((await anon.get('/api/admin/dashboard')).status, 401);
    assert.equal((await passenger.get('/api/admin/dashboard')).status, 403);
    assert.equal((await passenger.post('/api/admin/cities', { city_name: 'Hacked' })).status, 403);
    assert.equal((await passenger.raw('/api/bookings', '{not json')).status, 400);
    assert.equal((await passenger.post('/api/bookings', [])).status, 400);
    const { schedule, seats } = await freeBusSeats(9, 1);
    const bad = bookingBody(schedule.schedule_id, seats);
    assert.equal((await passenger.post('/api/bookings', { ...bad, passengers: [{ ...bad.passengers[0], age: 0 }] })).status, 400);
    assert.equal((await passenger.post('/api/bookings', { ...bad, contact_phone: '12345' })).status, 400);
    assert.equal((await passenger.post('/api/bookings', { ...bad, passengers: [bad.passengers[0], bad.passengers[0]] })).status, 400);
    assert.equal((await passenger.post('/api/bookings', { ...bad, passengers: Array(7).fill(bad.passengers[0]) })).status, 400);
    const [otherSeat] = await sql(`SELECT s.seat_id FROM seats s JOIN coaches c ON c.coach_id = s.coach_id
                                   JOIN services sv ON sv.vehicle_id <> c.vehicle_id WHERE sv.service_id = $1 LIMIT 1`, [schedule.service_id]);
    const wrongVehicle = { ...bad, passengers: [{ ...bad.passengers[0], seat_id: otherSeat.seat_id }] };
    assert.equal((await passenger.post('/api/bookings', wrongVehicle)).status, 400, 'seat from another vehicle');
    assert.equal((await anon.login('priya@example.com', 'wrong-password')).status, 401);
    assert.equal((await anon.post('/api/auth/register', { full_name: 'X Y', email: 'priya@example.com', phone: '9840012345', password: 'abc12345' })).status, 409);
  });
});
