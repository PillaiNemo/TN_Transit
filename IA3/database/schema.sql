-- =============================================================================
--  TN Transit — Tamil Nadu Bus & Railway Reservations
--  schema.sql : tables, keys, constraints and indexes
--
--  Load order:  schema.sql -> functions.sql -> views.sql -> seed.sql
--  (server/scripts/setup-db.js runs all four in this order.)
--
--  Re-running this file drops and recreates every TN Transit object, so it is
--  safe to run repeatedly against the dedicated `tn_transit` database.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Clean slate (explicit list, never DROP SCHEMA, so nothing else is touched)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS route_booking_summary_view, booking_summary_view, booking_details_view,
                    available_services_view, schedule_class_availability_view CASCADE;

DROP TABLE IF EXISTS
    user_sessions, booking_status_log, fare_history, cancellations, seat_reservations,
    passengers, bookings, schedules, fare_rules, service_amenities, amenities, services,
    routes, seats, coaches, coach_layouts, vehicles, seat_classes, operators, stations,
    cities, cancellation_policy, booking_fees, users
CASCADE;

DROP FUNCTION IF EXISTS generate_booking_reference(), generate_pnr_reference(), ist_now() CASCADE;
DROP DOMAIN IF EXISTS transport_mode CASCADE;

-- ---------------------------------------------------------------------------
-- 1. Domain + helper functions needed by column defaults
-- ---------------------------------------------------------------------------

-- A DOMAIN is a reusable, constrained data type. Every table that stores a
-- transport mode uses it, so the allowed values are defined exactly once.
CREATE DOMAIN transport_mode AS VARCHAR(5)
    CHECK (VALUE IN ('BUS', 'TRAIN'));

-- Journey times are stored as Indian Standard Time wall-clock TIMESTAMPs.
-- ist_now() gives "now" in the same form, so comparisons are always like-for-like
-- regardless of the database server's own timezone setting.
CREATE FUNCTION ist_now() RETURNS TIMESTAMP
LANGUAGE sql STABLE AS $$
    SELECT (now() AT TIME ZONE 'Asia/Kolkata')::timestamp;
$$;

-- Application booking reference: 'TNT' + 7 unambiguous characters, e.g. TNT7KQ2MXP
CREATE FUNCTION generate_booking_reference() RETURNS VARCHAR(10)
LANGUAGE sql VOLATILE AS $$
    SELECT 'TNT' || string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                                      (floor(random() * 32) + 1)::int, 1), '')
    FROM generate_series(1, 7);
$$;

-- PNR-style application reference: 10 digits. NOT an official railway PNR.
CREATE FUNCTION generate_pnr_reference() RETURNS CHAR(10)
LANGUAGE sql VOLATILE AS $$
    SELECT (floor(random() * 9000000000) + 1000000000)::bigint::text;
$$;

-- ---------------------------------------------------------------------------
-- 2. Users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    user_id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name      VARCHAR(100) NOT NULL CHECK (length(btrim(full_name)) >= 2),
    email          VARCHAR(150) NOT NULL CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    phone          VARCHAR(10)  NOT NULL CHECK (phone ~ '^[6-9][0-9]{9}$'),   -- Indian mobile
    password_hash  VARCHAR(100) NOT NULL,                                     -- bcrypt, never plain text
    role           VARCHAR(10)  NOT NULL DEFAULT 'PASSENGER'
                   CHECK (role IN ('PASSENGER', 'ADMIN')),
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
-- Case-insensitive uniqueness: Priya@Example.com and priya@example.com are the same account.
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));

-- ---------------------------------------------------------------------------
-- 3. Geography: cities -> stations  (1 : N)
-- ---------------------------------------------------------------------------
CREATE TABLE cities (
    city_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    city_name  VARCHAR(60) NOT NULL CHECK (length(btrim(city_name)) >= 2),
    state      VARCHAR(60) NOT NULL DEFAULT 'Tamil Nadu',
    also_known_as VARCHAR(40),                       -- popular short name, e.g. Trichy, Ooty
    CONSTRAINT cities_name_state_uq UNIQUE (city_name, state)
);

CREATE TABLE stations (
    station_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    station_name  VARCHAR(100)   NOT NULL,
    station_code  VARCHAR(12)    NOT NULL UNIQUE CHECK (station_code ~ '^[A-Z0-9-]{2,12}$'),
    city_id       INTEGER        NOT NULL REFERENCES cities (city_id) ON DELETE RESTRICT,
    station_kind  transport_mode NOT NULL,          -- BUS stand or TRAIN station
    CONSTRAINT stations_name_city_uq UNIQUE (station_name, city_id)
);
CREATE INDEX stations_city_idx ON stations (city_id);

-- ---------------------------------------------------------------------------
-- 4. Operators -> vehicles -> coaches -> seats  (each 1 : N)
-- ---------------------------------------------------------------------------
CREATE TABLE operators (
    operator_id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operator_name   VARCHAR(100)   NOT NULL UNIQUE,
    transport_mode  transport_mode NOT NULL,
    contact_phone   VARCHAR(15),
    is_active       BOOLEAN        NOT NULL DEFAULT TRUE
);

-- Seat/berth classes. A class belongs to exactly one transport mode.
CREATE TABLE seat_classes (
    class_code      VARCHAR(4)     PRIMARY KEY,           -- SL, 3A, 2A, 1A, CC, BS, BSL
    class_name      VARCHAR(40)    NOT NULL UNIQUE,
    transport_mode  transport_mode NOT NULL,
    is_ac           BOOLEAN        NOT NULL,
    display_order   SMALLINT       NOT NULL
);

-- Physical bus or train rake. transport_mode is NOT stored here: it is a fact
-- about the operator (vehicle -> operator -> mode), so storing it again would be
-- a transitive dependency (3NF violation).
CREATE TABLE vehicles (
    vehicle_id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operator_id     INTEGER      NOT NULL REFERENCES operators (operator_id) ON DELETE RESTRICT,
    vehicle_name    VARCHAR(100) NOT NULL,
    vehicle_number  VARCHAR(20)  NOT NULL UNIQUE,        -- registration / rake number
    vehicle_type    VARCHAR(40)  NOT NULL,               -- e.g. 'Multi-axle Sleeper', 'LHB Rake'
    capacity        INTEGER      NOT NULL CHECK (capacity > 0 AND capacity <= 2000),
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE
);
CREATE INDEX vehicles_operator_idx ON vehicles (operator_id);

-- Layout templates. The class depends on the layout (a 3A coach is always AC 3 Tier),
-- so class_code lives here and not on every seat (avoids a partial dependency).
CREATE TABLE coach_layouts (
    layout_code   VARCHAR(12) PRIMARY KEY,
    layout_name   VARCHAR(60) NOT NULL,
    class_code    VARCHAR(4)  NOT NULL REFERENCES seat_classes (class_code),
    seat_count    SMALLINT    NOT NULL CHECK (seat_count > 0)
);

-- A coach (train) or deck (bus) inside a vehicle. Buses use 'MAIN', or 'LOWER'/'UPPER' decks.
CREATE TABLE coaches (
    coach_id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vehicle_id   INTEGER     NOT NULL REFERENCES vehicles (vehicle_id) ON DELETE RESTRICT,
    coach_code   VARCHAR(8)  NOT NULL CHECK (coach_code ~ '^[A-Z0-9]{1,8}$'),
    layout_code  VARCHAR(12) NOT NULL REFERENCES coach_layouts (layout_code),
    CONSTRAINT coaches_vehicle_code_uq UNIQUE (vehicle_id, coach_code)
);

-- Physical seat or berth. Availability is NOT stored here: it depends on the journey
-- (schedule) and lives in seat_reservations.
CREATE TABLE seats (
    seat_id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    coach_id     INTEGER     NOT NULL REFERENCES coaches (coach_id) ON DELETE RESTRICT,
    seat_number  VARCHAR(6)  NOT NULL,
    berth_type   VARCHAR(12) NOT NULL CHECK (berth_type IN
                 ('LOWER', 'MIDDLE', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER', 'WINDOW', 'CENTER', 'AISLE')),
    layout_row   SMALLINT    NOT NULL CHECK (layout_row >= 1),   -- bay / row used to draw the seat map
    layout_col   SMALLINT    NOT NULL CHECK (layout_col >= 1),
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE,              -- FALSE = blocked (maintenance / quota)
    CONSTRAINT seats_coach_number_uq   UNIQUE (coach_id, seat_number),
    CONSTRAINT seats_coach_position_uq UNIQUE (coach_id, layout_row, layout_col)
);

-- ---------------------------------------------------------------------------
-- 5. Routes and services
-- ---------------------------------------------------------------------------
CREATE TABLE routes (
    route_id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    origin_station_id       INTEGER      NOT NULL REFERENCES stations (station_id) ON DELETE RESTRICT,
    destination_station_id  INTEGER      NOT NULL REFERENCES stations (station_id) ON DELETE RESTRICT,
    distance_km             NUMERIC(6,1) NOT NULL CHECK (distance_km > 0),
    estimated_duration      INTERVAL     NOT NULL
                            CHECK (estimated_duration > INTERVAL '0' AND estimated_duration < INTERVAL '48 hours'),
    CONSTRAINT routes_distinct_ends CHECK (origin_station_id <> destination_station_id),
    CONSTRAINT routes_pair_uq       UNIQUE (origin_station_id, destination_station_id)
);
CREATE INDEX routes_destination_idx ON routes (destination_station_id);

-- A named, numbered service that a vehicle runs on a route (e.g. 96111 Thamirabarani Express).
CREATE TABLE services (
    service_id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vehicle_id      INTEGER      NOT NULL REFERENCES vehicles (vehicle_id) ON DELETE RESTRICT,
    route_id        INTEGER      NOT NULL REFERENCES routes (route_id) ON DELETE RESTRICT,
    service_number  VARCHAR(12)  NOT NULL UNIQUE,
    service_name    VARCHAR(100) NOT NULL,
    service_type    VARCHAR(20)  NOT NULL CHECK (service_type IN
                    ('Ordinary', 'Express', 'AC Seater', 'AC Sleeper', 'Non-AC Sleeper',   -- bus types
                     'Superfast', 'Mail/Express', 'Intercity')),                          -- train categories
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE
);
CREATE INDEX services_route_idx   ON services (route_id);
CREATE INDEX services_vehicle_idx ON services (vehicle_id);

-- Amenities <-> services is a genuine MANY-TO-MANY relationship, resolved by the
-- junction table service_amenities (keeps services in 1NF: no array/list columns).
CREATE TABLE amenities (
    amenity_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    amenity_name  VARCHAR(40) NOT NULL UNIQUE
);

CREATE TABLE service_amenities (
    service_id  INTEGER NOT NULL REFERENCES services (service_id) ON DELETE CASCADE,
    amenity_id  INTEGER NOT NULL REFERENCES amenities (amenity_id) ON DELETE CASCADE,
    PRIMARY KEY (service_id, amenity_id)                  -- composite primary key
);

-- ---------------------------------------------------------------------------
-- 6. Fares
--   The fare depends on (service, class) — not on an individual journey date and not
--   on an individual seat — so that is exactly the key of this table.
-- ---------------------------------------------------------------------------
CREATE TABLE fare_rules (
    fare_rule_id  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    service_id    INTEGER       NOT NULL REFERENCES services (service_id) ON DELETE CASCADE,
    class_code    VARCHAR(4)    NOT NULL REFERENCES seat_classes (class_code),
    fare          NUMERIC(10,2) NOT NULL CHECK (fare >= 0),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT fare_rules_service_class_uq UNIQUE (service_id, class_code)
);

-- Explicitly configured per-passenger booking / reservation fee, per transport mode.
CREATE TABLE booking_fees (
    transport_mode     transport_mode PRIMARY KEY,
    fee_per_passenger  NUMERIC(8,2)   NOT NULL CHECK (fee_per_passenger >= 0)
);

-- Audit trail written by a trigger whenever a fare changes (see functions.sql).
CREATE TABLE fare_history (
    fare_history_id  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fare_rule_id     INTEGER       REFERENCES fare_rules (fare_rule_id) ON DELETE SET NULL,
    service_id       INTEGER       NOT NULL,
    class_code       VARCHAR(4)    NOT NULL,
    old_fare         NUMERIC(10,2) NOT NULL,
    new_fare         NUMERIC(10,2) NOT NULL,
    changed_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 7. Schedules: one dated run of a service
-- ---------------------------------------------------------------------------
CREATE TABLE schedules (
    schedule_id   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    service_id    INTEGER     NOT NULL REFERENCES services (service_id) ON DELETE RESTRICT,
    departure_at  TIMESTAMP   NOT NULL,                      -- IST wall-clock
    arrival_at    TIMESTAMP   NOT NULL,
    -- Derived by the database itself, so it can never disagree with departure_at.
    journey_date  DATE        GENERATED ALWAYS AS (departure_at::date) STORED,
    status        VARCHAR(10) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'CANCELLED')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT schedules_arrival_after_departure CHECK (arrival_at > departure_at),
    CONSTRAINT schedules_one_run_per_day_uq      UNIQUE (service_id, journey_date)
);
CREATE INDEX schedules_journey_date_idx ON schedules (journey_date);

-- ---------------------------------------------------------------------------
-- 8. Bookings -> passengers -> seat_reservations
-- ---------------------------------------------------------------------------
CREATE TABLE bookings (
    booking_id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_reference  VARCHAR(10)   NOT NULL UNIQUE DEFAULT generate_booking_reference()
                       CHECK (booking_reference ~ '^TNT[A-Z0-9]{7}$'),
    pnr_reference      CHAR(10)      NOT NULL UNIQUE DEFAULT generate_pnr_reference()
                       CHECK (pnr_reference ~ '^[0-9]{10}$'),
    user_id            INTEGER       NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT,
    schedule_id        INTEGER       NOT NULL REFERENCES schedules (schedule_id) ON DELETE RESTRICT,
    contact_email      VARCHAR(150)  NOT NULL CHECK (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    contact_phone      VARCHAR(10)   NOT NULL CHECK (contact_phone ~ '^[6-9][0-9]{9}$'),
    booked_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    base_amount        NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (base_amount >= 0),  -- sum of passenger fares
    fee_amount         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
    total_amount       NUMERIC(10,2) GENERATED ALWAYS AS (base_amount + fee_amount) STORED,
    booking_status     VARCHAR(10)   NOT NULL DEFAULT 'CONFIRMED'
                       CHECK (booking_status IN ('CONFIRMED', 'CANCELLED')),
    payment_status     VARCHAR(15)   NOT NULL DEFAULT 'DEMO_PAID'
                       CHECK (payment_status IN ('DEMO_PAID', 'DEMO_REFUNDED')),
    -- Target for the composite foreign key from seat_reservations (see below).
    CONSTRAINT bookings_id_schedule_uq UNIQUE (booking_id, schedule_id)
);
CREATE INDEX bookings_user_idx      ON bookings (user_id, booked_at DESC);
CREATE INDEX bookings_schedule_idx  ON bookings (schedule_id);
CREATE INDEX bookings_booked_at_idx ON bookings (booked_at);

CREATE TABLE passengers (
    passenger_id    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id      INTEGER       NOT NULL REFERENCES bookings (booking_id) ON DELETE RESTRICT,
    passenger_name  VARCHAR(100)  NOT NULL CHECK (length(btrim(passenger_name)) >= 2),
    age             SMALLINT      NOT NULL CHECK (age BETWEEN 1 AND 120),
    gender          CHAR(1)       NOT NULL CHECK (gender IN ('M', 'F', 'O')),
    -- Fare actually charged, copied at booking time. Later fare changes never alter old tickets.
    passenger_fare  NUMERIC(10,2) NOT NULL CHECK (passenger_fare >= 0),
    CONSTRAINT passengers_id_booking_uq UNIQUE (passenger_id, booking_id)
);
CREATE INDEX passengers_booking_idx ON passengers (booking_id);

-- Associative entity between schedules and seats (MANY-TO-MANY: one seat is reserved on
-- many journeys; one journey has many reserved seats). Each row also belongs to one
-- passenger of one booking.
--
-- booking_id and schedule_id are deliberately repeated here so that the partial unique
-- index below can be enforced by the database. Composite foreign keys guarantee that the
-- repeated values can never disagree with bookings / passengers (controlled redundancy).
CREATE TABLE seat_reservations (
    reservation_id  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id      INTEGER     NOT NULL,
    schedule_id     INTEGER     NOT NULL,
    passenger_id    INTEGER     NOT NULL UNIQUE,            -- one seat per passenger
    seat_id         INTEGER     NOT NULL REFERENCES seats (seat_id) ON DELETE RESTRICT,
    status          VARCHAR(10) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RELEASED')),
    reserved_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    released_at     TIMESTAMPTZ,
    CONSTRAINT seat_res_booking_fk   FOREIGN KEY (booking_id, schedule_id)
                                     REFERENCES bookings (booking_id, schedule_id) ON DELETE RESTRICT,
    CONSTRAINT seat_res_passenger_fk FOREIGN KEY (passenger_id, booking_id)
                                     REFERENCES passengers (passenger_id, booking_id) ON DELETE RESTRICT,
    CONSTRAINT seat_res_booking_seat_uq UNIQUE (booking_id, seat_id),   -- same seat twice in one booking
    CONSTRAINT seat_res_release_consistency CHECK (
        (status = 'ACTIVE'   AND released_at IS NULL) OR
        (status = 'RELEASED' AND released_at IS NOT NULL))
);

-- THE double-booking guard: at most ONE *active* reservation per (journey, seat).
-- Released (cancelled) rows are excluded by the WHERE clause, so a seat freed by a
-- cancellation can be booked again while the old row stays as history.
CREATE UNIQUE INDEX seat_reservations_active_uq
    ON seat_reservations (schedule_id, seat_id)
    WHERE status = 'ACTIVE';

-- ---------------------------------------------------------------------------
-- 9. Cancellations and the demo refund policy
-- ---------------------------------------------------------------------------
-- Refund % is chosen by how many hours before departure the cancellation happens.
-- The smallest min_hours_before is also the cut-off: later than that, no cancellation.
CREATE TABLE cancellation_policy (
    policy_id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    min_hours_before  INTEGER      NOT NULL UNIQUE CHECK (min_hours_before >= 0),
    refund_percent    NUMERIC(5,2) NOT NULL CHECK (refund_percent BETWEEN 0 AND 100)
);

CREATE TABLE cancellations (
    cancellation_id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id           INTEGER       NOT NULL UNIQUE REFERENCES bookings (booking_id) ON DELETE RESTRICT,
    cancelled_at         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    cancellation_reason  VARCHAR(200),
    refund_percent       NUMERIC(5,2)  NOT NULL CHECK (refund_percent BETWEEN 0 AND 100),
    refund_amount        NUMERIC(10,2) NOT NULL CHECK (refund_amount >= 0),
    refund_status        VARCHAR(15)   NOT NULL DEFAULT 'DEMO_PROCESSED'
                         CHECK (refund_status IN ('DEMO_PROCESSED')),
    cancelled_by         INTEGER       NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT
);

-- Audit trail of booking status changes, written by a trigger (see functions.sql).
CREATE TABLE booking_status_log (
    log_id      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id  INTEGER     NOT NULL REFERENCES bookings (booking_id) ON DELETE RESTRICT,
    old_status  VARCHAR(10),
    new_status  VARCHAR(10) NOT NULL,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX booking_status_log_booking_idx ON booking_status_log (booking_id);

-- ---------------------------------------------------------------------------
-- 10. Server-side login sessions (used by express-session + connect-pg-simple)
-- ---------------------------------------------------------------------------
CREATE TABLE user_sessions (
    sid     VARCHAR      NOT NULL PRIMARY KEY,
    sess    JSON         NOT NULL,
    expire  TIMESTAMP(6) NOT NULL
);
CREATE INDEX user_sessions_expire_idx ON user_sessions (expire);
