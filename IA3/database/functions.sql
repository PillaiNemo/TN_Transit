-- =============================================================================
--  TN Transit — functions.sql
--  Stored functions and (justified) triggers. Run after schema.sql.
--
--   add_coach(...)            generates the seats of one coach/deck from a layout
--   calculate_refund(...)     demo refund policy lookup (used before + during cancel)
--   cancel_booking(...)       atomic cancellation: status, seat release, refund record
--   trg_booking_status_log    audit trigger: every booking status change is logged
--   trg_fare_history          audit trigger: every fare change is logged
--
--  Custom SQLSTATEs raised here are mapped to HTTP codes by the API:
--   TN404 -> 404 Not Found,  TN409 -> 409 Conflict,  TN422 -> 422 Unprocessable
-- =============================================================================

-- -----------------------------------------------------------------------------
-- add_coach: create a coach (or bus deck) and generate all of its seats.
--
-- Seat numbering follows the familiar Indian Railways pattern, e.g. Sleeper / 3A bays:
--   1 LB, 2 MB, 3 UB, 4 LB, 5 MB, 6 UB, 7 SL (side lower), 8 SU (side upper), 9 LB ...
-- layout_row = bay or row, layout_col = position, so the frontend can draw the map
-- purely from database rows.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION add_coach(p_vehicle_id INT, p_coach_code TEXT, p_layout_code TEXT)
RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
    v_capacity     INT;
    v_vehicle_mode TEXT;
    v_layout_mode  TEXT;
    v_new_seats    INT;
    v_existing     INT;
    v_coach_id     INT;
BEGIN
    -- Lock the vehicle row so two admins cannot exceed capacity concurrently.
    SELECT v.capacity, o.transport_mode INTO v_capacity, v_vehicle_mode
    FROM vehicles v JOIN operators o ON o.operator_id = v.operator_id
    WHERE v.vehicle_id = p_vehicle_id
    FOR UPDATE OF v;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Vehicle % does not exist', p_vehicle_id USING ERRCODE = 'TN404';
    END IF;

    SELECT cl.seat_count, sc.transport_mode INTO v_new_seats, v_layout_mode
    FROM coach_layouts cl JOIN seat_classes sc ON sc.class_code = cl.class_code
    WHERE cl.layout_code = p_layout_code;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown layout %', p_layout_code USING ERRCODE = 'TN404';
    END IF;

    IF v_layout_mode <> v_vehicle_mode THEN
        RAISE EXCEPTION 'Layout % is for % vehicles, but this vehicle is a %',
              p_layout_code, v_layout_mode, v_vehicle_mode USING ERRCODE = 'TN422';
    END IF;

    SELECT count(*) INTO v_existing
    FROM seats s JOIN coaches c ON c.coach_id = s.coach_id
    WHERE c.vehicle_id = p_vehicle_id;

    IF v_existing + v_new_seats > v_capacity THEN
        RAISE EXCEPTION 'Adding % seats would exceed the vehicle capacity of % (already configured: %)',
              v_new_seats, v_capacity, v_existing USING ERRCODE = 'TN422';
    END IF;

    INSERT INTO coaches (vehicle_id, coach_code, layout_code)
    VALUES (p_vehicle_id, upper(p_coach_code), p_layout_code)
    RETURNING coach_id INTO v_coach_id;

    IF p_layout_code IN ('TRAIN_SL', 'TRAIN_3A') THEN          -- 8 berths per bay
        INSERT INTO seats (coach_id, seat_number, berth_type, layout_row, layout_col)
        SELECT v_coach_id, n::text,
               (ARRAY['LOWER','MIDDLE','UPPER','LOWER','MIDDLE','UPPER','SIDE_LOWER','SIDE_UPPER'])[(n - 1) % 8 + 1],
               (n - 1) / 8 + 1, (n - 1) % 8 + 1
        FROM generate_series(1, v_new_seats) AS n;

    ELSIF p_layout_code = 'TRAIN_2A' THEN                      -- 6 berths per bay, no middle
        INSERT INTO seats (coach_id, seat_number, berth_type, layout_row, layout_col)
        SELECT v_coach_id, n::text,
               (ARRAY['LOWER','UPPER','LOWER','UPPER','SIDE_LOWER','SIDE_UPPER'])[(n - 1) % 6 + 1],
               (n - 1) / 6 + 1, (n - 1) % 6 + 1
        FROM generate_series(1, v_new_seats) AS n;

    ELSIF p_layout_code = 'TRAIN_1A' THEN                      -- 4-berth cabins
        INSERT INTO seats (coach_id, seat_number, berth_type, layout_row, layout_col)
        SELECT v_coach_id, n::text,
               (ARRAY['LOWER','UPPER','LOWER','UPPER'])[(n - 1) % 4 + 1],
               (n - 1) / 4 + 1, (n - 1) % 4 + 1
        FROM generate_series(1, v_new_seats) AS n;

    ELSIF p_layout_code = 'TRAIN_CC' THEN                      -- 3 + 2 chairs, aisle at column 4
        INSERT INTO seats (coach_id, seat_number, berth_type, layout_row, layout_col)
        SELECT v_coach_id, n::text,
               (ARRAY['WINDOW','CENTER','AISLE','AISLE','WINDOW'])[(n - 1) % 5 + 1],
               (n - 1) / 5 + 1, (ARRAY[1,2,3,5,6])[(n - 1) % 5 + 1]
        FROM generate_series(1, v_new_seats) AS n;

    ELSIF p_layout_code = 'BUS_2X2' THEN                       -- 2 + 2 seats, aisle at column 3
        INSERT INTO seats (coach_id, seat_number, berth_type, layout_row, layout_col)
        SELECT v_coach_id, n::text,
               (ARRAY['WINDOW','AISLE','AISLE','WINDOW'])[(n - 1) % 4 + 1],
               (n - 1) / 4 + 1, (ARRAY[1,2,4,5])[(n - 1) % 4 + 1]
        FROM generate_series(1, v_new_seats) AS n;

    ELSIF p_layout_code = 'BUS_2X3' THEN                       -- 2 + 3 seats, aisle at column 3
        INSERT INTO seats (coach_id, seat_number, berth_type, layout_row, layout_col)
        SELECT v_coach_id, n::text,
               (ARRAY['WINDOW','AISLE','AISLE','CENTER','WINDOW'])[(n - 1) % 5 + 1],
               (n - 1) / 5 + 1, (ARRAY[1,2,4,5,6])[(n - 1) % 5 + 1]
        FROM generate_series(1, v_new_seats) AS n;

    ELSIF p_layout_code = 'BUS_SLEEPER' THEN                   -- 1 + 2 berths per deck, L1.. / U1..
        INSERT INTO seats (coach_id, seat_number, berth_type, layout_row, layout_col)
        SELECT v_coach_id, left(upper(p_coach_code), 1) || n,
               CASE WHEN upper(p_coach_code) LIKE 'U%' THEN 'UPPER' ELSE 'LOWER' END,
               (n - 1) / 3 + 1, (ARRAY[1,3,4])[(n - 1) % 3 + 1]
        FROM generate_series(1, v_new_seats) AS n;

    ELSE
        RAISE EXCEPTION 'No seat generator for layout %', p_layout_code USING ERRCODE = 'TN422';
    END IF;

    RETURN v_coach_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- calculate_refund: applies cancellation_policy to a booking "as of" a moment.
-- The refund covers passenger fares only; the booking fee is non-refundable.
-- Uses a LATERAL subquery to pick the best matching policy band.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_refund(p_booking_id INT, p_as_of TIMESTAMP DEFAULT NULL)
RETURNS TABLE (hours_before_departure NUMERIC, refund_percent NUMERIC, refund_amount NUMERIC, is_cancellable BOOLEAN)
LANGUAGE sql STABLE AS $$
    SELECT t.hours,
           COALESCE(p.refund_percent, 0),
           ROUND(b.base_amount * COALESCE(p.refund_percent, 0) / 100, 2),
           (b.booking_status = 'CONFIRMED' AND p.refund_percent IS NOT NULL)
    FROM bookings b
    JOIN schedules sc ON sc.schedule_id = b.schedule_id
    CROSS JOIN LATERAL (
        SELECT ROUND(EXTRACT(EPOCH FROM (sc.departure_at - COALESCE(p_as_of, ist_now()))) / 3600, 1) AS hours
    ) t
    LEFT JOIN LATERAL (
        SELECT cp.refund_percent
        FROM cancellation_policy cp
        WHERE t.hours >= cp.min_hours_before
        ORDER BY cp.min_hours_before DESC
        LIMIT 1
    ) p ON TRUE
    WHERE b.booking_id = p_booking_id;
$$;

-- -----------------------------------------------------------------------------
-- cancel_booking: the whole cancellation in one atomic unit.
-- A PL/pgSQL function always runs inside the caller's transaction, so if any statement
-- fails, every change below is rolled back together.
-- History is preserved: nothing is deleted. Seats are freed by marking the reservation
-- RELEASED, which removes it from the partial unique index.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_booking(p_booking_id INT, p_cancelled_by INT, p_reason TEXT)
RETURNS cancellations
LANGUAGE plpgsql AS $$
DECLARE
    v_status  TEXT;
    v_refund  RECORD;
    v_cutoff  INT;
    v_result  cancellations;
BEGIN
    -- Row lock: two simultaneous cancel requests for the same booking are serialised.
    SELECT booking_status INTO v_status
    FROM bookings WHERE booking_id = p_booking_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'TN404';
    END IF;
    IF v_status <> 'CONFIRMED' THEN
        RAISE EXCEPTION 'This booking is already cancelled' USING ERRCODE = 'TN409';
    END IF;

    SELECT * INTO v_refund FROM calculate_refund(p_booking_id);
    IF NOT v_refund.is_cancellable THEN
        SELECT min(min_hours_before) INTO v_cutoff FROM cancellation_policy;
        RAISE EXCEPTION 'Cancellation closes % hours before departure', v_cutoff USING ERRCODE = 'TN422';
    END IF;

    UPDATE bookings
    SET booking_status = 'CANCELLED', payment_status = 'DEMO_REFUNDED'
    WHERE booking_id = p_booking_id;

    UPDATE seat_reservations
    SET status = 'RELEASED', released_at = now()
    WHERE booking_id = p_booking_id AND status = 'ACTIVE';

    INSERT INTO cancellations (booking_id, cancellation_reason, refund_percent, refund_amount, cancelled_by)
    VALUES (p_booking_id, NULLIF(btrim(p_reason), ''), v_refund.refund_percent, v_refund.refund_amount, p_cancelled_by)
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- Trigger 1: booking status audit log.
-- Justification: an audit record must be written no matter which code path (API,
-- psql, admin script) changes a booking, which only a trigger can guarantee.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_booking_status() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO booking_status_log (booking_id, old_status, new_status, changed_at)
        VALUES (NEW.booking_id, NULL, NEW.booking_status, NEW.booked_at);
    ELSIF NEW.booking_status IS DISTINCT FROM OLD.booking_status THEN
        INSERT INTO booking_status_log (booking_id, old_status, new_status)
        VALUES (NEW.booking_id, OLD.booking_status, NEW.booking_status);
    END IF;
    RETURN NULL;   -- AFTER trigger: return value ignored
END;
$$;

CREATE TRIGGER trg_booking_status_log
AFTER INSERT OR UPDATE OF booking_status ON bookings
FOR EACH ROW EXECUTE FUNCTION log_booking_status();

-- -----------------------------------------------------------------------------
-- Trigger 2: fare change history. Same justification: fare changes are audited
-- regardless of who performs them. (Old tickets are protected separately because
-- passengers.passenger_fare stores the fare actually charged.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_fare_change() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO fare_history (fare_rule_id, service_id, class_code, old_fare, new_fare)
    VALUES (NEW.fare_rule_id, NEW.service_id, NEW.class_code, OLD.fare, NEW.fare);
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_fare_history
AFTER UPDATE OF fare ON fare_rules
FOR EACH ROW
WHEN (OLD.fare IS DISTINCT FROM NEW.fare)
EXECUTE FUNCTION log_fare_change();
