-- =============================================================================
--  TN Transit — queries.sql
--  Commented examples of every major operation, for study and the viva.
--
--  Safe to run end-to-end:   psql -d tn_transit -f database/queries.sql
--  Every example that changes data is wrapped in BEGIN ... ROLLBACK, so the demo
--  database is left exactly as it was.
--
--  The application runs the same SQL (see server/src/controllers/*). Where the API
--  uses $1, $2 ... placeholders (parameterized queries), these examples use literals.
-- =============================================================================

\echo '=== 1. CRUD ============================================================='

-- 1.1 CREATE + READ + UPDATE + DELETE a city (rolled back).
BEGIN;
INSERT INTO cities (city_name, also_known_as) VALUES ('Karaikudi', 'Chettinad') RETURNING *;
SELECT * FROM cities WHERE city_name = 'Karaikudi';
UPDATE cities SET also_known_as = 'Chettinad region' WHERE city_name = 'Karaikudi' RETURNING *;
DELETE FROM cities WHERE city_name = 'Karaikudi';
ROLLBACK;

-- 1.2 Add a route and a service, then "deactivate" the service instead of deleting it.
BEGIN;
INSERT INTO routes (origin_station_id, destination_station_id, distance_km, estimated_duration)
SELECT o.station_id, d.station_id, 215, INTERVAL '4 hours 30 minutes'
FROM stations o, stations d
WHERE o.station_code = 'MDU-MTT' AND d.station_code = 'CBE-GPM'
RETURNING route_id;

INSERT INTO services (vehicle_id, route_id, service_number, service_name, service_type)
SELECT v.vehicle_id, r.route_id, 'TNT-B999', 'Viva Demo Express', 'Express'
FROM vehicles v, routes r
JOIN stations o ON o.station_id = r.origin_station_id AND o.station_code = 'MDU-MTT'
JOIN stations d ON d.station_id = r.destination_station_id AND d.station_code = 'CBE-GPM'
WHERE v.vehicle_number = 'TN45DL3181'
RETURNING *;

-- Deactivate (soft delete): history stays intact, the service vanishes from search.
UPDATE services SET is_active = FALSE WHERE service_number = 'TNT-B999';
ROLLBACK;

-- 1.3 Schedules: create 7 daily runs with ONE statement (generate_series + INSERT ... SELECT).
--     ON CONFLICT skips dates that already have a run (unique service_id + journey_date).
BEGIN;
INSERT INTO schedules (service_id, departure_at, arrival_at)
SELECT sv.service_id,
       d::date + TIME '23:30',
       d::date + TIME '23:30' + r.estimated_duration
FROM services sv
JOIN routes r ON r.route_id = sv.route_id
CROSS JOIN generate_series(CURRENT_DATE + 40, CURRENT_DATE + 46, INTERVAL '1 day') AS d
WHERE sv.service_number = 'TNT-B101'
ON CONFLICT (service_id, journey_date) DO NOTHING
RETURNING schedule_id, journey_date, departure_at;
ROLLBACK;

-- 1.4 Seat configuration: add a coach; the stored function generates all its berths.
BEGIN;
-- The rake is already at capacity, so add_coach() refuses (custom SQLSTATE TN422).
DO $$
BEGIN
    PERFORM add_coach(v.vehicle_id, 'S9', 'TRAIN_SL') FROM vehicles v WHERE v.vehicle_number = 'RAKE-96111';
EXCEPTION WHEN SQLSTATE 'TN422' THEN
    RAISE NOTICE 'OK: %', SQLERRM;
END $$;
-- Raise the registered capacity, then the same call generates 72 berths.
UPDATE vehicles SET capacity = capacity + 72 WHERE vehicle_number = 'RAKE-96111';
SELECT add_coach(v.vehicle_id, 'S9', 'TRAIN_SL') AS new_coach_id
FROM vehicles v WHERE v.vehicle_number = 'RAKE-96111';
SELECT berth_type, COUNT(*) FROM seats
WHERE coach_id = (SELECT MAX(coach_id) FROM coaches) GROUP BY berth_type ORDER BY 1;
ROLLBACK;

-- 1.5 Update a fare. Trigger trg_fare_history records the change automatically.
BEGIN;
UPDATE fare_rules fr SET fare = fare + 50, updated_at = now()
FROM services sv
WHERE sv.service_id = fr.service_id AND sv.service_number = '96111' AND fr.class_code = '3A'
RETURNING fr.*;
SELECT * FROM fare_history ORDER BY changed_at DESC LIMIT 1;
ROLLBACK;


\echo '=== 2. SEARCHING AND JOINS =============================================='

-- 2.1 Search: services between two CITIES on a date (via the view; 9-table join inside).
SELECT service_number, service_name, transport_mode, service_type,
       origin_station, departure_at, destination_station, arrival_at,
       duration_minutes, available_seats, min_fare
FROM available_services_view
WHERE origin_city = 'Chennai' AND destination_city = 'Coimbatore'
  AND journey_date = CURRENT_DATE + 1
ORDER BY departure_at;

-- 2.2 The same search written out without the view: explicit INNER JOINs and an
--     aggregate subquery for availability. Shows what the view hides.
SELECT sv.service_number, sv.service_name, o.transport_mode,
       os.station_name AS from_station, sc.departure_at,
       ds.station_name AS to_station,   sc.arrival_at,
       (SELECT COUNT(*) FROM seats s JOIN coaches c ON c.coach_id = s.coach_id
        WHERE c.vehicle_id = sv.vehicle_id AND s.is_active)
     - (SELECT COUNT(*) FROM seat_reservations sr
        WHERE sr.schedule_id = sc.schedule_id AND sr.status = 'ACTIVE') AS seats_left
FROM schedules sc
INNER JOIN services  sv ON sv.service_id  = sc.service_id
INNER JOIN vehicles  v  ON v.vehicle_id   = sv.vehicle_id
INNER JOIN operators o  ON o.operator_id  = v.operator_id
INNER JOIN routes    r  ON r.route_id     = sv.route_id
INNER JOIN stations  os ON os.station_id  = r.origin_station_id
INNER JOIN cities    oc ON oc.city_id     = os.city_id
INNER JOIN stations  ds ON ds.station_id  = r.destination_station_id
INNER JOIN cities    dc ON dc.city_id     = ds.city_id
WHERE oc.city_name = 'Chennai' AND dc.city_name = 'Madurai'
  AND sc.journey_date = CURRENT_DATE + 1
  AND sc.status = 'SCHEDULED' AND sv.is_active
ORDER BY sc.departure_at;

-- 2.3 Seat availability per class for one schedule (view built on LEFT JOIN ... IS NULL).
SELECT ca.class_name, ca.fare, ca.total_seats, ca.booked_seats, ca.available_seats
FROM schedule_class_availability_view ca
JOIN schedules sc ON sc.schedule_id = ca.schedule_id
JOIN services sv  ON sv.service_id  = sc.service_id
WHERE sv.service_number = '96111' AND sc.journey_date = CURRENT_DATE + 2
ORDER BY ca.display_order;

-- 2.4 Seat map for one schedule: LEFT JOIN keeps every seat; a NULL reservation = free.
SELECT co.coach_code, s.seat_number, s.berth_type,
       CASE WHEN sr.reservation_id IS NOT NULL THEN 'OCCUPIED'
            WHEN NOT s.is_active               THEN 'UNAVAILABLE'
            ELSE 'AVAILABLE' END AS status
FROM schedules sc
JOIN services sv ON sv.service_id = sc.service_id
JOIN coaches co  ON co.vehicle_id = sv.vehicle_id
JOIN seats s     ON s.coach_id    = co.coach_id
LEFT JOIN seat_reservations sr
       ON sr.schedule_id = sc.schedule_id AND sr.seat_id = s.seat_id AND sr.status = 'ACTIVE'
WHERE sv.service_number = 'TNT-B101' AND sc.journey_date = CURRENT_DATE + 1
ORDER BY co.coach_code, s.layout_row, s.layout_col;

-- 2.5 Complete ticket: one row per passenger, 17 tables joined by booking_details_view.
SELECT booking_reference, pnr_reference, service_name, origin_station, destination_station,
       departure_at, passenger_name, age, gender, coach_code, seat_number, class_name,
       passenger_fare, booking_status
FROM booking_details_view
WHERE booking_id = (SELECT MIN(booking_id) FROM bookings);

-- 2.6 Booking history of one user (newest journey first).
SELECT booking_reference, journey_state, origin_city, destination_city, departure_at,
       passenger_count, seat_list, total_amount
FROM booking_summary_view
WHERE user_email = 'priya@example.com'
ORDER BY departure_at DESC;

-- 2.7 Cancellation details (INNER JOIN: only bookings that HAVE a cancellation row).
SELECT b.booking_reference, c.cancelled_at, c.cancellation_reason,
       b.total_amount, c.refund_percent, c.refund_amount, u.full_name AS cancelled_by
FROM cancellations c
JOIN bookings b ON b.booking_id = c.booking_id
JOIN users u    ON u.user_id    = c.cancelled_by
ORDER BY c.cancelled_at DESC
LIMIT 10;

-- 2.8 LEFT JOIN vs INNER JOIN: operators with their vehicle count, including zero.
SELECT o.operator_name, o.transport_mode, COUNT(v.vehicle_id) AS vehicles
FROM operators o
LEFT JOIN vehicles v ON v.operator_id = o.operator_id
GROUP BY o.operator_id, o.operator_name, o.transport_mode
ORDER BY vehicles DESC;


\echo '=== 3. AGGREGATION ======================================================'

-- 3.1 Total reservations per day (last 14 days), including days with zero bookings.
SELECT d::date AS day, COUNT(b.booking_id) AS bookings
FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, INTERVAL '1 day') AS d
LEFT JOIN bookings b ON (b.booked_at AT TIME ZONE 'Asia/Kolkata')::date = d::date
GROUP BY d
ORDER BY d;

-- 3.2 Reservations and revenue by transport mode.
SELECT transport_mode,
       COUNT(*)                                                           AS bookings,
       COUNT(*) FILTER (WHERE booking_status = 'CONFIRMED')               AS confirmed,
       SUM(total_amount) FILTER (WHERE booking_status = 'CONFIRMED')      AS revenue
FROM booking_summary_view
GROUP BY transport_mode;

-- 3.3 Revenue by bus operator / railway service operator.
SELECT o.operator_name, o.transport_mode,
       COALESCE(SUM(b.total_amount) FILTER (WHERE b.booking_status = 'CONFIRMED'), 0) AS revenue
FROM operators o
LEFT JOIN vehicles v   ON v.operator_id = o.operator_id
LEFT JOIN services sv  ON sv.vehicle_id = v.vehicle_id
LEFT JOIN schedules sc ON sc.service_id = sv.service_id
LEFT JOIN bookings b   ON b.schedule_id = sc.schedule_id
GROUP BY o.operator_id, o.operator_name, o.transport_mode
ORDER BY revenue DESC;

-- 3.4 Most frequently booked routes (view).
SELECT origin_city, destination_city, transport_mode, confirmed_bookings, passengers_carried
FROM route_booking_summary_view
ORDER BY confirmed_bookings DESC
LIMIT 5;

-- 3.5 Most popular destinations: GROUP BY with HAVING.
SELECT destination_city, COUNT(*) AS bookings
FROM booking_summary_view
WHERE booking_status = 'CONFIRMED'
GROUP BY destination_city
HAVING COUNT(*) >= 50
ORDER BY bookings DESC;

-- 3.6 Average booking value.
SELECT ROUND(AVG(total_amount), 2) AS avg_booking_value,
       MIN(total_amount) AS smallest, MAX(total_amount) AS largest
FROM bookings
WHERE booking_status = 'CONFIRMED';

-- 3.7 Cancellation count and rate.
SELECT COUNT(*) FILTER (WHERE booking_status = 'CANCELLED') AS cancellations,
       ROUND(100.0 * COUNT(*) FILTER (WHERE booking_status = 'CANCELLED') / NULLIF(COUNT(*), 0), 2) AS cancellation_rate_pct
FROM bookings;

-- 3.8 Seat occupancy per schedule (tomorrow), highest first.
SELECT sv.service_number, sc.departure_at,
       SUM(ca.booked_seats) AS booked, SUM(ca.total_seats) AS total,
       ROUND(100.0 * SUM(ca.booked_seats) / NULLIF(SUM(ca.total_seats), 0), 1) AS occupancy_pct
FROM schedules sc
JOIN services sv ON sv.service_id = sc.service_id
JOIN schedule_class_availability_view ca ON ca.schedule_id = sc.schedule_id
WHERE sc.journey_date = CURRENT_DATE + 1
GROUP BY sc.schedule_id, sv.service_number, sc.departure_at
ORDER BY occupancy_pct DESC;


\echo '=== 4. SUBQUERIES ======================================================='

-- 4.1 Scalar subquery in WHERE: bookings above the overall average value.
SELECT booking_reference, total_amount
FROM bookings
WHERE booking_status = 'CONFIRMED'
  AND total_amount > (SELECT AVG(total_amount) FROM bookings WHERE booking_status = 'CONFIRMED')
ORDER BY total_amount DESC
LIMIT 5;

-- 4.2 IN subquery: users who have ever cancelled a booking.
SELECT full_name, email FROM users
WHERE user_id IN (SELECT b.user_id FROM bookings b WHERE b.booking_status = 'CANCELLED');

-- 4.3 NOT EXISTS (anti-join): active services with no confirmed booking in the next 7 days.
SELECT sv.service_number, sv.service_name
FROM services sv
WHERE sv.is_active
  AND NOT EXISTS (SELECT 1 FROM schedules sc JOIN bookings b ON b.schedule_id = sc.schedule_id
                  WHERE sc.service_id = sv.service_id
                    AND sc.journey_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
                    AND b.booking_status = 'CONFIRMED');

-- 4.4 Derived table (subquery in FROM) + HAVING with a subquery.
SELECT u.full_name, t.spent
FROM (SELECT user_id, SUM(total_amount) AS spent
      FROM bookings WHERE booking_status = 'CONFIRMED' GROUP BY user_id) t
JOIN users u ON u.user_id = t.user_id
WHERE t.spent > (SELECT AVG(s) FROM (SELECT SUM(total_amount) AS s FROM bookings
                                     WHERE booking_status = 'CONFIRMED' GROUP BY user_id) x)
ORDER BY t.spent DESC;


\echo '=== 5. TRANSACTIONS: BOOKING ============================================'
-- The same steps the API runs in POST /api/bookings (bookingController.js).
-- Rolled back at the end so the demo data is untouched.
BEGIN;

-- Step 1: lock the journey row. Another booking for the SAME schedule now waits here.
SELECT sc.schedule_id, sc.status, sc.departure_at > ist_now() AS not_departed
FROM schedules sc
JOIN services sv ON sv.service_id = sc.service_id
WHERE sv.service_number = 'TNT-B111' AND sc.journey_date = CURRENT_DATE + 10
FOR UPDATE OF sc;

-- Step 2 + 3: the chosen seats exist on this vehicle, have a fare, and are still free.
SELECT s.seat_id, s.seat_number, fr.fare,
       EXISTS (SELECT 1 FROM seat_reservations sr
               WHERE sr.seat_id = s.seat_id AND sr.status = 'ACTIVE'
                 AND sr.schedule_id = (SELECT sc.schedule_id FROM schedules sc JOIN services sv USING (service_id)
                                       WHERE sv.service_number = 'TNT-B111' AND sc.journey_date = CURRENT_DATE + 10)) AS taken
FROM seats s
JOIN coaches co ON co.coach_id = s.coach_id
JOIN coach_layouts cl ON cl.layout_code = co.layout_code
JOIN services sv ON sv.vehicle_id = co.vehicle_id AND sv.service_number = 'TNT-B111'
JOIN fare_rules fr ON fr.service_id = sv.service_id AND fr.class_code = cl.class_code
WHERE s.seat_number IN ('39', '40');

-- Step 4: booking header (references come from column DEFAULTs).
WITH sched AS (
    SELECT sc.schedule_id FROM schedules sc JOIN services sv USING (service_id)
    WHERE sv.service_number = 'TNT-B111' AND sc.journey_date = CURRENT_DATE + 10)
INSERT INTO bookings (user_id, schedule_id, contact_email, contact_phone, fee_amount)
SELECT 2, schedule_id, 'priya@example.com', '9840012345', 2 * 20 FROM sched
RETURNING booking_id, booking_reference, pnr_reference;

-- Step 5: passenger + reservation (here for seat 40 only, to keep the demo short).
INSERT INTO passengers (booking_id, passenger_name, age, gender, passenger_fare)
SELECT currval(pg_get_serial_sequence('bookings', 'booking_id')), 'Viva Demo', 22, 'F', fr.fare
FROM fare_rules fr JOIN services sv ON sv.service_id = fr.service_id
WHERE sv.service_number = 'TNT-B111' AND fr.class_code = 'BS'
RETURNING passenger_id;

-- Step 6: total computed by SQL from the inserted rows.
UPDATE bookings b
SET base_amount = (SELECT SUM(p.passenger_fare) FROM passengers p WHERE p.booking_id = b.booking_id)
WHERE b.booking_id = currval(pg_get_serial_sequence('bookings', 'booking_id'))
RETURNING booking_reference, base_amount, fee_amount, total_amount;

ROLLBACK;   -- in the application this is COMMIT; any error before it means ROLLBACK


\echo '=== 6. DOUBLE-BOOKING GUARD (expected to FAIL inside a savepoint) ======='
-- The partial unique index seat_reservations_active_uq allows only ONE active reservation
-- per (schedule_id, seat_id). Trying to insert a second one raises unique_violation 23505.
BEGIN;
SAVEPOINT before_duplicate;
DO $$
BEGIN
    INSERT INTO seat_reservations (booking_id, schedule_id, passenger_id, seat_id)
    SELECT b.booking_id, b.schedule_id, p.passenger_id, sr.seat_id
    FROM seat_reservations sr
    JOIN bookings b    ON b.schedule_id = sr.schedule_id AND b.booking_id <> sr.booking_id
    JOIN passengers p  ON p.booking_id  = b.booking_id
    WHERE sr.status = 'ACTIVE'
    LIMIT 1;
    RAISE NOTICE 'UNEXPECTED: duplicate accepted';
EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'OK: duplicate active reservation rejected by seat_reservations_active_uq';
END $$;
ROLLBACK TO SAVEPOINT before_duplicate;
ROLLBACK;


\echo '=== 7. TRANSACTIONS: CANCELLATION (stored function) ===================='
BEGIN;
-- Preview the refund using the policy table.
SELECT b.booking_reference, r.*
FROM bookings b CROSS JOIN LATERAL calculate_refund(b.booking_id) r
WHERE b.booking_status = 'CONFIRMED'
  AND b.schedule_id IN (SELECT schedule_id FROM schedules WHERE journey_date = CURRENT_DATE + 5)
LIMIT 1;

-- Cancel it: status, seat release and refund record happen atomically.
SELECT * FROM cancel_booking(
    (SELECT b.booking_id FROM bookings b JOIN schedules sc ON sc.schedule_id = b.schedule_id
     WHERE b.booking_status = 'CONFIRMED' AND sc.journey_date = CURRENT_DATE + 5
     ORDER BY b.booking_id LIMIT 1),
    1, 'Viva demonstration');

-- The history is still there; the seats are RELEASED; the trigger logged the change.
SELECT b.booking_reference, b.booking_status, sr.status AS reservation_status, sr.released_at
FROM bookings b JOIN seat_reservations sr ON sr.booking_id = b.booking_id
WHERE b.booking_id = (SELECT booking_id FROM cancellations ORDER BY cancellation_id DESC LIMIT 1);
SELECT * FROM booking_status_log ORDER BY log_id DESC LIMIT 2;
ROLLBACK;


\echo '=== 8. CONSTRAINTS IN ACTION (each error is caught and reported) ======='
DO $$
BEGIN
    BEGIN
        INSERT INTO routes (origin_station_id, destination_station_id, distance_km, estimated_duration)
        SELECT station_id, station_id, 10, INTERVAL '1 hour' FROM stations LIMIT 1;
    EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK CHECK routes_distinct_ends: %', SQLERRM; END;

    BEGIN
        UPDATE passengers SET age = 0 WHERE passenger_id = (SELECT MIN(passenger_id) FROM passengers);
    EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK CHECK passenger age: %', SQLERRM; END;

    BEGIN
        UPDATE fare_rules SET fare = -10 WHERE fare_rule_id = (SELECT MIN(fare_rule_id) FROM fare_rules);
    EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK CHECK non-negative fare: %', SQLERRM; END;

    BEGIN
        DELETE FROM cities WHERE city_name = 'Chennai';
    EXCEPTION WHEN restrict_violation OR foreign_key_violation THEN RAISE NOTICE 'OK FOREIGN KEY (RESTRICT): %', SQLERRM; END;

    BEGIN
        INSERT INTO bookings (user_id, schedule_id, contact_email, contact_phone) VALUES (999999, 1, 'a@b.co', '9840012345');
    EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'OK FOREIGN KEY user: %', SQLERRM; END;
END $$;


\echo '=== 9. INDEXES ==========================================================='
-- List the indexes and show one being used by the planner.
SELECT tablename, indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN ('bookings', 'seat_reservations', 'schedules', 'routes')
ORDER BY tablename, indexname;

EXPLAIN
SELECT * FROM seat_reservations
WHERE schedule_id = 100 AND seat_id = 5 AND status = 'ACTIVE';
