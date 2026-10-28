-- =============================================================================
--  TN Transit — views.sql   (run after functions.sql)
--
--  Every view here is used by the running application:
--   schedule_class_availability_view  -> seat counts + fare per class (search cards)
--   available_services_view           -> GET /api/services/search
--   booking_details_view              -> ticket page  GET /api/bookings/:reference
--   booking_summary_view              -> My Bookings + admin booking records
--   route_booking_summary_view        -> admin dashboard "top routes"
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Per schedule, per seat class: total, booked and available seats, plus the fare.
-- Availability is computed from seat_reservations for THAT schedule (LEFT JOIN +
-- IS NULL = "seats with no active reservation"), never stored on the seat itself.
-- Classes without a fare rule are not sellable, so they are excluded (INNER JOIN).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW schedule_class_availability_view AS
SELECT sc.schedule_id,
       cls.class_code,
       cls.class_name,
       cls.display_order,
       fr.fare,
       COUNT(s.seat_id) FILTER (WHERE s.is_active)                                 AS total_seats,
       COUNT(sr.reservation_id)                                                    AS booked_seats,
       COUNT(s.seat_id) FILTER (WHERE s.is_active AND sr.reservation_id IS NULL)   AS available_seats
FROM schedules sc
JOIN services       sv  ON sv.service_id   = sc.service_id
JOIN coaches        co  ON co.vehicle_id   = sv.vehicle_id
JOIN coach_layouts  cl  ON cl.layout_code  = co.layout_code
JOIN seat_classes   cls ON cls.class_code  = cl.class_code
JOIN seats          s   ON s.coach_id      = co.coach_id
JOIN fare_rules     fr  ON fr.service_id   = sv.service_id AND fr.class_code = cls.class_code
LEFT JOIN seat_reservations sr
       ON sr.schedule_id = sc.schedule_id
      AND sr.seat_id     = s.seat_id
      AND sr.status      = 'ACTIVE'
GROUP BY sc.schedule_id, cls.class_code, cls.class_name, cls.display_order, fr.fare;

-- -----------------------------------------------------------------------------
-- Bookable journeys right now: schedule SCHEDULED, service/vehicle/operator active,
-- departure still in the future. One row per schedule with descriptive columns from
-- 8 joined tables and an availability summary from a LATERAL subquery.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW available_services_view AS
SELECT sc.schedule_id,
       sc.journey_date,
       sc.departure_at,
       sc.arrival_at,
       (EXTRACT(EPOCH FROM (sc.arrival_at - sc.departure_at)) / 60)::int AS duration_minutes,
       sv.service_id,
       sv.service_number,
       sv.service_name,
       sv.service_type,
       op.operator_name,
       op.transport_mode,
       v.vehicle_type,
       r.route_id,
       r.distance_km,
       os.station_id   AS origin_station_id,
       os.station_name AS origin_station,
       os.station_code AS origin_code,
       oc.city_id      AS origin_city_id,
       oc.city_name    AS origin_city,
       ds.station_id   AS destination_station_id,
       ds.station_name AS destination_station,
       ds.station_code AS destination_code,
       dc.city_id      AS destination_city_id,
       dc.city_name    AS destination_city,
       av.total_seats,
       av.available_seats,
       av.min_fare,
       av.classes,
       COALESCE((SELECT array_agg(a.amenity_name ORDER BY a.amenity_name)
                 FROM service_amenities sa JOIN amenities a ON a.amenity_id = sa.amenity_id
                 WHERE sa.service_id = sv.service_id), '{}') AS amenities
FROM schedules sc
JOIN services  sv ON sv.service_id  = sc.service_id
JOIN vehicles  v  ON v.vehicle_id   = sv.vehicle_id
JOIN operators op ON op.operator_id = v.operator_id
JOIN routes    r  ON r.route_id     = sv.route_id
JOIN stations  os ON os.station_id  = r.origin_station_id
JOIN cities    oc ON oc.city_id     = os.city_id
JOIN stations  ds ON ds.station_id  = r.destination_station_id
JOIN cities    dc ON dc.city_id     = ds.city_id
CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(ca.total_seats), 0)::int     AS total_seats,
           COALESCE(SUM(ca.available_seats), 0)::int AS available_seats,
           MIN(ca.fare)                              AS min_fare,
           COALESCE(jsonb_agg(jsonb_build_object(
                'class_code', ca.class_code, 'class_name', ca.class_name, 'fare', ca.fare,
                'total_seats', ca.total_seats, 'available_seats', ca.available_seats)
             ORDER BY ca.display_order), '[]'::jsonb) AS classes
    FROM schedule_class_availability_view ca
    WHERE ca.schedule_id = sc.schedule_id
) av
WHERE sc.status = 'SCHEDULED'
  AND sv.is_active AND v.is_active AND op.is_active
  AND sc.departure_at > ist_now();

-- -----------------------------------------------------------------------------
-- Complete ticket: one row per passenger, joining bookings, users, passengers,
-- seat_reservations, seats, coaches, classes, schedules, services, vehicles,
-- operators, routes, stations, cities — and LEFT JOIN cancellations (most bookings
-- have none). Seats of cancelled bookings still appear (history is preserved).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW booking_details_view AS
SELECT b.booking_id,
       b.booking_reference,
       b.pnr_reference,
       b.user_id,
       u.full_name      AS booked_by,
       b.contact_email,
       b.contact_phone,
       b.booked_at,
       b.base_amount,
       b.fee_amount,
       b.total_amount,
       b.booking_status,
       b.payment_status,
       CASE WHEN b.booking_status = 'CANCELLED'   THEN 'CANCELLED'
            WHEN sc.departure_at > ist_now()       THEN 'UPCOMING'
            ELSE 'COMPLETED' END AS journey_state,
       sc.schedule_id,
       sc.journey_date,
       sc.departure_at,
       sc.arrival_at,
       sc.status        AS schedule_status,
       sv.service_number,
       sv.service_name,
       sv.service_type,
       op.operator_name,
       op.transport_mode,
       v.vehicle_name,
       v.vehicle_number,
       r.distance_km,
       os.station_name  AS origin_station,
       os.station_code  AS origin_code,
       oc.city_name     AS origin_city,
       ds.station_name  AS destination_station,
       ds.station_code  AS destination_code,
       dc.city_name     AS destination_city,
       p.passenger_id,
       p.passenger_name,
       p.age,
       p.gender,
       p.passenger_fare,
       st.seat_id,
       st.seat_number,
       st.berth_type,
       co.coach_code,
       cls.class_code,
       cls.class_name,
       sr.status        AS reservation_status,
       sr.released_at,
       c.cancelled_at,
       c.cancellation_reason,
       c.refund_percent,
       c.refund_amount
FROM bookings b
JOIN users             u   ON u.user_id        = b.user_id
JOIN schedules         sc  ON sc.schedule_id   = b.schedule_id
JOIN services          sv  ON sv.service_id    = sc.service_id
JOIN vehicles          v   ON v.vehicle_id     = sv.vehicle_id
JOIN operators         op  ON op.operator_id   = v.operator_id
JOIN routes            r   ON r.route_id       = sv.route_id
JOIN stations          os  ON os.station_id    = r.origin_station_id
JOIN cities            oc  ON oc.city_id       = os.city_id
JOIN stations          ds  ON ds.station_id    = r.destination_station_id
JOIN cities            dc  ON dc.city_id       = ds.city_id
JOIN passengers        p   ON p.booking_id     = b.booking_id
JOIN seat_reservations sr  ON sr.passenger_id  = p.passenger_id
JOIN seats             st  ON st.seat_id       = sr.seat_id
JOIN coaches           co  ON co.coach_id      = st.coach_id
JOIN coach_layouts     cl  ON cl.layout_code   = co.layout_code
JOIN seat_classes      cls ON cls.class_code   = cl.class_code
LEFT JOIN cancellations c  ON c.booking_id     = b.booking_id;

-- -----------------------------------------------------------------------------
-- One row per booking (lists): journey info plus passenger count and seat list
-- aggregated in a correlated LATERAL subquery.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW booking_summary_view AS
SELECT b.booking_id,
       b.booking_reference,
       b.pnr_reference,
       b.user_id,
       u.full_name  AS booked_by,
       u.email      AS user_email,
       b.booked_at,
       b.total_amount,
       b.booking_status,
       b.payment_status,
       CASE WHEN b.booking_status = 'CANCELLED'   THEN 'CANCELLED'
            WHEN sc.departure_at > ist_now()       THEN 'UPCOMING'
            ELSE 'COMPLETED' END AS journey_state,
       sc.schedule_id,
       sc.journey_date,
       sc.departure_at,
       sc.arrival_at,
       sv.service_number,
       sv.service_name,
       sv.service_type,
       op.operator_name,
       op.transport_mode,
       oc.city_name  AS origin_city,
       os.station_name AS origin_station,
       dc.city_name  AS destination_city,
       ds.station_name AS destination_station,
       px.passenger_count,
       px.seat_list,
       px.class_list,
       c.refund_amount,
       c.cancelled_at
FROM bookings b
JOIN users     u  ON u.user_id      = b.user_id
JOIN schedules sc ON sc.schedule_id = b.schedule_id
JOIN services  sv ON sv.service_id  = sc.service_id
JOIN vehicles  v  ON v.vehicle_id   = sv.vehicle_id
JOIN operators op ON op.operator_id = v.operator_id
JOIN routes    r  ON r.route_id     = sv.route_id
JOIN stations  os ON os.station_id  = r.origin_station_id
JOIN cities    oc ON oc.city_id     = os.city_id
JOIN stations  ds ON ds.station_id  = r.destination_station_id
JOIN cities    dc ON dc.city_id     = ds.city_id
CROSS JOIN LATERAL (
    SELECT COUNT(*)::int AS passenger_count,
           string_agg(co.coach_code || '-' || st.seat_number, ', ' ORDER BY co.coach_code, st.seat_id) AS seat_list,
           string_agg(DISTINCT cl.class_code, ', ') AS class_list
    FROM passengers p
    JOIN seat_reservations sr ON sr.passenger_id = p.passenger_id
    JOIN seats   st ON st.seat_id   = sr.seat_id
    JOIN coaches co ON co.coach_id  = st.coach_id
    JOIN coach_layouts cl ON cl.layout_code = co.layout_code
    WHERE p.booking_id = b.booking_id
) px
LEFT JOIN cancellations c ON c.booking_id = b.booking_id;

-- -----------------------------------------------------------------------------
-- Bookings, passengers and confirmed revenue per route. LEFT JOINs keep routes that
-- have never been booked (they show zeros). FILTER clauses split by status.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW route_booking_summary_view AS
SELECT r.route_id,
       os.station_kind  AS transport_mode,
       oc.city_name     AS origin_city,
       dc.city_name     AS destination_city,
       os.station_name  AS origin_station,
       ds.station_name  AS destination_station,
       COUNT(b.booking_id)                                                    AS total_bookings,
       COUNT(b.booking_id) FILTER (WHERE b.booking_status = 'CONFIRMED')      AS confirmed_bookings,
       COUNT(b.booking_id) FILTER (WHERE b.booking_status = 'CANCELLED')      AS cancelled_bookings,
       COALESCE(SUM(pc.pax) FILTER (WHERE b.booking_status = 'CONFIRMED'), 0)::int AS passengers_carried,
       COALESCE(SUM(b.total_amount) FILTER (WHERE b.booking_status = 'CONFIRMED'), 0) AS confirmed_revenue
FROM routes r
JOIN stations os ON os.station_id = r.origin_station_id
JOIN cities   oc ON oc.city_id    = os.city_id
JOIN stations ds ON ds.station_id = r.destination_station_id
JOIN cities   dc ON dc.city_id    = ds.city_id
LEFT JOIN services  sv ON sv.route_id    = r.route_id
LEFT JOIN schedules sc ON sc.service_id  = sv.service_id
LEFT JOIN bookings  b  ON b.schedule_id  = sc.schedule_id
LEFT JOIN LATERAL (SELECT COUNT(*) AS pax FROM passengers p WHERE p.booking_id = b.booking_id) pc ON TRUE
GROUP BY r.route_id, os.station_kind, oc.city_name, dc.city_name, os.station_name, ds.station_name;
