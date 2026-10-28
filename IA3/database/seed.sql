-- =============================================================================
--  TN Transit — seed.sql   (run after views.sql)
--
--  DEMONSTRATION DATA ONLY. Operators, service numbers, timetables, fares and
--  availability are fictional. They are not official TNSTC / SETC / Indian Railways
--  data. Station and city names are real places in Tamil Nadu.
--
--  Repeatable: the file TRUNCATEs every table first (RESTART IDENTITY), so loading
--  it again gives the same rows, never duplicates. setseed() makes the generated
--  sample bookings deterministic. Journey dates are relative to CURRENT_DATE so the
--  demo always has past AND upcoming journeys.
-- =============================================================================
BEGIN;

TRUNCATE users, cities, stations, operators, seat_classes, vehicles, coach_layouts, coaches,
         seats, routes, services, amenities, service_amenities, fare_rules, booking_fees,
         fare_history, schedules, bookings, passengers, seat_reservations,
         cancellation_policy, cancellations, booking_status_log, user_sessions
RESTART IDENTITY CASCADE;

-- -----------------------------------------------------------------------------
-- Reference data
-- -----------------------------------------------------------------------------
INSERT INTO seat_classes (class_code, class_name, transport_mode, is_ac, display_order) VALUES
    ('1A',  'AC First Class', 'TRAIN', TRUE,  1),
    ('2A',  'AC 2 Tier',      'TRAIN', TRUE,  2),
    ('3A',  'AC 3 Tier',      'TRAIN', TRUE,  3),
    ('CC',  'AC Chair Car',   'TRAIN', TRUE,  4),
    ('SL',  'Sleeper',        'TRAIN', FALSE, 5),
    ('BSL', 'Sleeper Berth',  'BUS',   FALSE, 6),
    ('BS',  'Seater',         'BUS',   FALSE, 7);

INSERT INTO coach_layouts (layout_code, layout_name, class_code, seat_count) VALUES
    ('TRAIN_1A',    'First AC coach — 4-berth cabins',        '1A',  24),
    ('TRAIN_2A',    'AC 2 Tier coach — 6 berths per bay',     '2A',  48),
    ('TRAIN_3A',    'AC 3 Tier coach — 8 berths per bay',     '3A',  64),
    ('TRAIN_CC',    'AC Chair Car — 3 + 2 seating',           'CC',  80),
    ('TRAIN_SL',    'Sleeper coach — 8 berths per bay',       'SL',  72),
    ('BUS_SLEEPER', 'Sleeper deck — 1 + 2 berths',            'BSL', 18),
    ('BUS_2X2',     'Seater — 2 + 2 pushback',                'BS',  40),
    ('BUS_2X3',     'Seater — 2 + 3 ordinary',                'BS',  50);

INSERT INTO booking_fees (transport_mode, fee_per_passenger) VALUES
    ('BUS', 20.00),
    ('TRAIN', 30.00);

-- Demo refund policy: >= 48 h -> 90 %, >= 12 h -> 50 %, >= 2 h -> 25 %, < 2 h -> not cancellable
INSERT INTO cancellation_policy (min_hours_before, refund_percent) VALUES
    (48, 90.00), (12, 50.00), (2, 25.00);

INSERT INTO amenities (amenity_name) VALUES
    ('Charging Point'), ('Water Bottle'), ('Blanket'), ('Reading Light'), ('Live Tracking'),
    ('CCTV'), ('Wi-Fi'), ('Pantry Car'), ('Bedroll'), ('Bio Toilet');

-- -----------------------------------------------------------------------------
-- Users. Passwords are bcrypt hashes (cost 10):
--   admin@tntransit.demo / Admin@123      everyone else / Demo@123
-- -----------------------------------------------------------------------------
INSERT INTO users (full_name, email, phone, password_hash, role) VALUES
    ('TN Transit Admin',     'admin@tntransit.demo', '9876500000', '$2b$10$xrNx.Pd2mrglDafA1K7m7ukMdPVXkyvMTbsd0TxDTE39A8eQ8x6pC', 'ADMIN'),
    ('Priya Raman',          'priya@example.com',    '9840012345', '$2b$10$QYw6raFiPm0uI2jYjBSIGuFov3CiagMyuZoJAMVMuv5SghL60xRT6', 'PASSENGER'),
    ('Arun Kumar',           'arun@example.com',     '9940123456', '$2b$10$QYw6raFiPm0uI2jYjBSIGuFov3CiagMyuZoJAMVMuv5SghL60xRT6', 'PASSENGER'),
    ('Kavya Sundaram',       'kavya@example.com',    '9003456789', '$2b$10$QYw6raFiPm0uI2jYjBSIGuFov3CiagMyuZoJAMVMuv5SghL60xRT6', 'PASSENGER'),
    ('Mohammed Irfan',       'irfan@example.com',    '9789012345', '$2b$10$QYw6raFiPm0uI2jYjBSIGuFov3CiagMyuZoJAMVMuv5SghL60xRT6', 'PASSENGER'),
    ('Lakshmi Narayanan',    'lakshmi@example.com',  '9444098765', '$2b$10$QYw6raFiPm0uI2jYjBSIGuFov3CiagMyuZoJAMVMuv5SghL60xRT6', 'PASSENGER'),
    ('Deepa Krishnan',       'deepa@example.com',    '9566123987', '$2b$10$QYw6raFiPm0uI2jYjBSIGuFov3CiagMyuZoJAMVMuv5SghL60xRT6', 'PASSENGER'),
    ('Vignesh Babu',         'vignesh@example.com',  '8838012345', '$2b$10$QYw6raFiPm0uI2jYjBSIGuFov3CiagMyuZoJAMVMuv5SghL60xRT6', 'PASSENGER'),
    ('Sneha Joseph',         'sneha@example.com',    '7708123456', '$2b$10$QYw6raFiPm0uI2jYjBSIGuFov3CiagMyuZoJAMVMuv5SghL60xRT6', 'PASSENGER'),
    ('Karthik Subramanian',  'karthik@example.com',  '6380123456', '$2b$10$QYw6raFiPm0uI2jYjBSIGuFov3CiagMyuZoJAMVMuv5SghL60xRT6', 'PASSENGER');

-- -----------------------------------------------------------------------------
-- Cities and stations
-- -----------------------------------------------------------------------------
INSERT INTO cities (city_name, also_known_as) VALUES
    ('Chennai', 'Madras'), ('Coimbatore', 'Kovai'), ('Madurai', NULL), ('Tiruchirappalli', 'Trichy'),
    ('Salem', NULL), ('Tirunelveli', 'Nellai'), ('Erode', NULL), ('Thanjavur', 'Tanjore'),
    ('Vellore', NULL), ('Dindigul', NULL), ('Kanyakumari', 'Cape Comorin'), ('Tiruppur', NULL),
    ('Rameswaram', NULL), ('Kumbakonam', NULL), ('Udhagamandalam', 'Ooty');

INSERT INTO stations (station_name, station_code, city_id, station_kind)
SELECT s.station_name, s.station_code, c.city_id, s.kind
FROM (VALUES
    -- Bus terminals
    ('Kilambakkam Bus Terminus (KCBT)',   'CHN-KCBT', 'Chennai',         'BUS'),
    ('Koyambedu Bus Terminus (CMBT)',     'CHN-CMBT', 'Chennai',         'BUS'),
    ('Gandhipuram Central Bus Stand',     'CBE-GPM',  'Coimbatore',      'BUS'),
    ('Mattuthavani Bus Stand',            'MDU-MTT',  'Madurai',         'BUS'),
    ('Trichy Central Bus Stand',          'TPJ-CBS',  'Tiruchirappalli', 'BUS'),
    ('Salem New Bus Stand',               'SLM-NBS',  'Salem',           'BUS'),
    ('Tirunelveli New Bus Stand',         'TEN-NBS',  'Tirunelveli',     'BUS'),
    ('Erode Central Bus Stand',           'ERD-CBS',  'Erode',           'BUS'),
    ('Thanjavur New Bus Stand',           'TJ-NBS',   'Thanjavur',       'BUS'),
    ('Vellore New Bus Stand',             'VLR-NBS',  'Vellore',         'BUS'),
    ('Dindigul Bus Stand',                'DGL-BS',   'Dindigul',        'BUS'),
    ('Kanyakumari Bus Stand',             'CAPE-BS',  'Kanyakumari',     'BUS'),
    ('Tiruppur New Bus Stand',            'TUP-NBS',  'Tiruppur',        'BUS'),
    ('Rameswaram Bus Stand',              'RMM-BS',   'Rameswaram',      'BUS'),
    ('Kumbakonam Bus Stand',              'KMU-BS',   'Kumbakonam',      'BUS'),
    ('Ooty Central Bus Stand',            'OOTY-BS',  'Udhagamandalam',  'BUS'),
    -- Railway stations
    ('Chennai Central',                   'MAS',      'Chennai',         'TRAIN'),
    ('Chennai Egmore',                    'MS',       'Chennai',         'TRAIN'),
    ('Coimbatore Junction',               'CBE',      'Coimbatore',      'TRAIN'),
    ('Madurai Junction',                  'MDU',      'Madurai',         'TRAIN'),
    ('Tiruchchirappalli Junction',        'TPJ',      'Tiruchirappalli', 'TRAIN'),
    ('Salem Junction',                    'SA',       'Salem',           'TRAIN'),
    ('Tirunelveli Junction',              'TEN',      'Tirunelveli',     'TRAIN'),
    ('Erode Junction',                    'ED',       'Erode',           'TRAIN'),
    ('Thanjavur Junction',                'TJ',       'Thanjavur',       'TRAIN'),
    ('Katpadi Junction',                  'KPD',      'Vellore',         'TRAIN'),
    ('Dindigul Junction',                 'DG',       'Dindigul',        'TRAIN'),
    ('Kanniyakumari',                     'CAPE',     'Kanyakumari',     'TRAIN'),
    ('Tiruppur',                          'TUP',      'Tiruppur',        'TRAIN'),
    ('Rameswaram',                        'RMM',      'Rameswaram',      'TRAIN'),
    ('Kumbakonam',                        'KMU',      'Kumbakonam',      'TRAIN')
) AS s (station_name, station_code, city_name, kind)
JOIN cities c ON c.city_name = s.city_name;

-- -----------------------------------------------------------------------------
-- Operators (fictional)
-- -----------------------------------------------------------------------------
INSERT INTO operators (operator_name, transport_mode, contact_phone) VALUES
    ('Marina Roadways',          'BUS',   '04445550101'),
    ('Kongu Comfort Travels',    'BUS',   '04225550102'),
    ('Pandya Express Lines',     'BUS',   '04525550103'),
    ('Chola Night Riders',       'BUS',   '04315550104'),
    ('Nilgiri Hill Coaches',     'BUS',   '04235550105'),
    ('Coromandel Rail Link',     'TRAIN', '04425550201'),
    ('Western Ghats Rail',       'TRAIN', '04225550202');

-- -----------------------------------------------------------------------------
-- Service catalogue (staging table, used only while seeding).
-- coaches = 'CODE:LAYOUT,...' passed to add_coach() one by one.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE seed_services (
    service_number TEXT, service_name TEXT, operator_name TEXT, service_type TEXT,
    origin_code TEXT, destination_code TEXT, departure_time TIME, distance_km NUMERIC,
    duration INTERVAL, vehicle_number TEXT, vehicle_type TEXT, coaches TEXT
);

INSERT INTO seed_services VALUES
    -- ===== Buses =====
    ('TNT-B101', 'Marina Night Sleeper',     'Marina Roadways',       'AC Sleeper',     'CHN-KCBT', 'CBE-GPM',  '21:30', 505, '9 hours 15 minutes', 'TN01AN4521', 'Multi-axle AC Sleeper',  'LOWER:BUS_SLEEPER,UPPER:BUS_SLEEPER'),
    ('TNT-B102', 'Marina Night Sleeper',     'Marina Roadways',       'AC Sleeper',     'CBE-GPM',  'CHN-KCBT', '21:45', 505, '9 hours 15 minutes', 'TN01AN4522', 'Multi-axle AC Sleeper',  'LOWER:BUS_SLEEPER,UPPER:BUS_SLEEPER'),
    ('TNT-B111', 'Kongu Day Cruiser',        'Kongu Comfort Travels', 'AC Seater',      'CHN-CMBT', 'CBE-GPM',  '07:00', 500, '9 hours 30 minutes', 'TN38BZ1101', 'AC Pushback Seater',     'MAIN:BUS_2X2'),
    ('TNT-B115', 'Kongu Value Sleeper',      'Kongu Comfort Travels', 'Non-AC Sleeper', 'CHN-KCBT', 'CBE-GPM',  '22:15', 505, '9 hours 45 minutes', 'TN38BZ1115', 'Non-AC Sleeper',         'LOWER:BUS_SLEEPER,UPPER:BUS_SLEEPER'),
    ('TNT-B116', 'Kongu Value Sleeper',      'Kongu Comfort Travels', 'Non-AC Sleeper', 'CBE-GPM',  'CHN-KCBT', '20:45', 505, '9 hours 45 minutes', 'TN38BZ1116', 'Non-AC Sleeper',         'LOWER:BUS_SLEEPER,UPPER:BUS_SLEEPER'),
    ('TNT-B121', 'Pandya Express',           'Pandya Express Lines',  'Express',        'CHN-KCBT', 'MDU-MTT',  '08:30', 460, '8 hours 45 minutes', 'TN58CK2121', 'Express Seater',         'MAIN:BUS_2X2'),
    ('TNT-B122', 'Pandya Night Sleeper',     'Pandya Express Lines',  'AC Sleeper',     'MDU-MTT',  'CHN-KCBT', '22:00', 460, '8 hours 30 minutes', 'TN58CK2122', 'Multi-axle AC Sleeper',  'LOWER:BUS_SLEEPER,UPPER:BUS_SLEEPER'),
    ('TNT-B123', 'Pandya Night Sleeper',     'Pandya Express Lines',  'AC Sleeper',     'CHN-KCBT', 'MDU-MTT',  '22:30', 460, '8 hours 30 minutes', 'TN58CK2123', 'Multi-axle AC Sleeper',  'LOWER:BUS_SLEEPER,UPPER:BUS_SLEEPER'),
    ('TNT-B124', 'Meenakshi AC Seater',      'Pandya Express Lines',  'AC Seater',      'CHN-KCBT', 'MDU-MTT',  '13:15', 460, '8 hours 40 minutes', 'TN58CK2124', 'AC Pushback Seater',     'MAIN:BUS_2X2'),
    ('TNT-B131', 'Chola Express',            'Chola Night Riders',    'Express',        'CHN-KCBT', 'TPJ-CBS',  '06:15', 330, '6 hours 15 minutes', 'TN45DL3131', 'Express Seater',         'MAIN:BUS_2X2'),
    ('TNT-B132', 'Chola Express',            'Chola Night Riders',    'Express',        'TPJ-CBS',  'CHN-KCBT', '14:30', 330, '6 hours 15 minutes', 'TN45DL3132', 'Express Seater',         'MAIN:BUS_2X2'),
    ('TNT-B141', 'Cape Comorin Sleeper',     'Chola Night Riders',    'AC Sleeper',     'CHN-KCBT', 'CAPE-BS',  '19:00', 705, '12 hours 45 minutes','TN45DL3141', 'Multi-axle AC Sleeper',  'LOWER:BUS_SLEEPER,UPPER:BUS_SLEEPER'),
    ('TNT-B151', 'Steel City Shuttle',       'Kongu Comfort Travels', 'AC Seater',      'SLM-NBS',  'CHN-CMBT', '06:00', 340, '6 hours 30 minutes', 'TN30BZ1151', 'AC Pushback Seater',     'MAIN:BUS_2X2'),
    ('TNT-B152', 'Steel City Shuttle',       'Kongu Comfort Travels', 'AC Seater',      'CHN-CMBT', 'SLM-NBS',  '15:00', 340, '6 hours 30 minutes', 'TN30BZ1152', 'AC Pushback Seater',     'MAIN:BUS_2X2'),
    ('TNT-B161', 'Hill Queen Ordinary',      'Nilgiri Hill Coaches',  'Ordinary',       'CBE-GPM',  'OOTY-BS',  '07:30',  86, '3 hours 15 minutes', 'TN43NH1161', 'Ghat Section Seater',    'MAIN:BUS_2X3'),
    ('TNT-B162', 'Hill Queen Ordinary',      'Nilgiri Hill Coaches',  'Ordinary',       'OOTY-BS',  'CBE-GPM',  '15:30',  86, '3 hours 15 minutes', 'TN43NH1162', 'Ghat Section Seater',    'MAIN:BUS_2X3'),
    ('TNT-B171', 'Thamirabarani Link',       'Pandya Express Lines',  'Ordinary',       'MDU-MTT',  'TEN-NBS',  '09:00', 160, '3 hours 45 minutes', 'TN58CK2171', 'Ordinary Seater',        'MAIN:BUS_2X3'),
    ('TNT-B181', 'Delta Express',            'Chola Night Riders',    'Express',        'TPJ-CBS',  'TJ-NBS',   '10:00',  58, '1 hour 30 minutes',  'TN45DL3181', 'Express Seater',         'MAIN:BUS_2X2'),
    ('TNT-B191', 'Fort City Express',        'Marina Roadways',       'Express',        'CHN-CMBT', 'VLR-NBS',  '07:45', 140, '3 hours 15 minutes', 'TN01AN4591', 'Express Seater',         'MAIN:BUS_2X2'),
    ('TNT-B201', 'Kongu Belt Express',       'Kongu Comfort Travels', 'Express',        'ERD-CBS',  'CBE-GPM',  '08:15', 100, '2 hours 15 minutes', 'TN33BZ1201', 'Express Seater',         'MAIN:BUS_2X2'),
    ('TNT-B211', 'Kovai–Madurai Sleeper',    'Kongu Comfort Travels', 'Non-AC Sleeper', 'CBE-GPM',  'MDU-MTT',  '22:45', 215, '5 hours 15 minutes', 'TN38BZ1211', 'Non-AC Sleeper',         'LOWER:BUS_SLEEPER,UPPER:BUS_SLEEPER'),
    ('TNT-B221', 'Rockfort–Dindigul Link',   'Chola Night Riders',    'Ordinary',       'TPJ-CBS',  'DGL-BS',   '11:00',  95, '2 hours 15 minutes', 'TN45DL3221', 'Ordinary Seater',        'MAIN:BUS_2X3'),
    ('TNT-B231', 'Knit City Sleeper',        'Marina Roadways',       'AC Sleeper',     'CHN-KCBT', 'TUP-NBS',  '21:00', 460, '8 hours 45 minutes', 'TN01AN4631', 'Multi-axle AC Sleeper',  'LOWER:BUS_SLEEPER,UPPER:BUS_SLEEPER'),
    ('TNT-B241', 'Island Express',           'Pandya Express Lines',  'Express',        'MDU-MTT',  'RMM-BS',   '06:30', 175, '4 hours',            'TN58CK2241', 'Express Seater',         'MAIN:BUS_2X2'),
    ('TNT-B251', 'Temple Town Sleeper',      'Chola Night Riders',    'Non-AC Sleeper', 'CHN-KCBT', 'KMU-BS',   '22:00', 290, '7 hours',            'TN45DL3251', 'Non-AC Sleeper',         'LOWER:BUS_SLEEPER,UPPER:BUS_SLEEPER'),
    -- ===== Trains =====
    ('96101', 'Marina Meenakshi Superfast',  'Coromandel Rail Link',  'Superfast',      'MS',  'MDU',  '06:30', 493, '7 hours 40 minutes',  'RAKE-96101', 'LHB Rake', 'C1:TRAIN_CC,C2:TRAIN_CC,S1:TRAIN_SL'),
    ('96102', 'Marina Meenakshi Superfast',  'Coromandel Rail Link',  'Superfast',      'MDU', 'MS',   '15:00', 493, '7 hours 40 minutes',  'RAKE-96102', 'LHB Rake', 'C1:TRAIN_CC,C2:TRAIN_CC,S1:TRAIN_SL'),
    ('96111', 'Thamirabarani Night Express', 'Coromandel Rail Link',  'Mail/Express',   'MS',  'TEN',  '20:10', 653, '10 hours 40 minutes', 'RAKE-96111', 'LHB Rake', 'S1:TRAIN_SL,S2:TRAIN_SL,B1:TRAIN_3A,A1:TRAIN_2A,H1:TRAIN_1A'),
    ('96112', 'Thamirabarani Night Express', 'Coromandel Rail Link',  'Mail/Express',   'TEN', 'MS',   '18:50', 653, '10 hours 40 minutes', 'RAKE-96112', 'LHB Rake', 'S1:TRAIN_SL,S2:TRAIN_SL,B1:TRAIN_3A,A1:TRAIN_2A,H1:TRAIN_1A'),
    ('96121', 'Kovai Night Mail',            'Western Ghats Rail',    'Mail/Express',   'MAS', 'CBE',  '21:05', 497, '8 hours 5 minutes',   'RAKE-96121', 'ICF Rake', 'S1:TRAIN_SL,S2:TRAIN_SL,B1:TRAIN_3A,B2:TRAIN_3A,A1:TRAIN_2A'),
    ('96122', 'Kovai Night Mail',            'Western Ghats Rail',    'Mail/Express',   'CBE', 'MAS',  '20:30', 497, '8 hours 5 minutes',   'RAKE-96122', 'ICF Rake', 'S1:TRAIN_SL,S2:TRAIN_SL,B1:TRAIN_3A,B2:TRAIN_3A,A1:TRAIN_2A'),
    ('96131', 'Kongu Intercity',             'Western Ghats Rail',    'Intercity',      'MAS', 'CBE',  '06:10', 497, '7 hours 30 minutes',  'RAKE-96131', 'LHB Rake', 'C1:TRAIN_CC,C2:TRAIN_CC,C3:TRAIN_CC'),
    ('96132', 'Kongu Intercity',             'Western Ghats Rail',    'Intercity',      'CBE', 'MAS',  '15:15', 497, '7 hours 30 minutes',  'RAKE-96132', 'LHB Rake', 'C1:TRAIN_CC,C2:TRAIN_CC,C3:TRAIN_CC'),
    ('96141', 'Meenakshi Night Express',     'Coromandel Rail Link',  'Mail/Express',   'MS',  'MDU',  '21:40', 493, '8 hours 20 minutes',  'RAKE-96141', 'ICF Rake', 'S1:TRAIN_SL,S2:TRAIN_SL,B1:TRAIN_3A,A1:TRAIN_2A,H1:TRAIN_1A'),
    ('96142', 'Meenakshi Night Express',     'Coromandel Rail Link',  'Mail/Express',   'MDU', 'MS',   '21:20', 493, '8 hours 20 minutes',  'RAKE-96142', 'ICF Rake', 'S1:TRAIN_SL,S2:TRAIN_SL,B1:TRAIN_3A,A1:TRAIN_2A,H1:TRAIN_1A'),
    ('96151', 'Cape Sunrise Express',        'Coromandel Rail Link',  'Mail/Express',   'MS',  'CAPE', '17:20', 741, '13 hours 10 minutes', 'RAKE-96151', 'ICF Rake', 'S1:TRAIN_SL,S2:TRAIN_SL,B1:TRAIN_3A,A1:TRAIN_2A'),
    ('96161', 'Chola Delta Express',         'Coromandel Rail Link',  'Mail/Express',   'MS',  'TJ',   '08:10', 351, '7 hours',             'RAKE-96161', 'ICF Rake', 'C1:TRAIN_CC,S1:TRAIN_SL,S2:TRAIN_SL'),
    ('96162', 'Chola Delta Express',         'Coromandel Rail Link',  'Mail/Express',   'TJ',  'MS',   '14:00', 351, '7 hours',             'RAKE-96162', 'ICF Rake', 'C1:TRAIN_CC,S1:TRAIN_SL,S2:TRAIN_SL'),
    ('96171', 'Rameswaram Coastal Express',  'Coromandel Rail Link',  'Mail/Express',   'MDU', 'RMM',  '06:00', 161, '4 hours 10 minutes',  'RAKE-96171', 'ICF Rake', 'C1:TRAIN_CC,S1:TRAIN_SL'),
    ('96181', 'Steel City Superfast',        'Western Ghats Rail',    'Superfast',      'SA',  'MAS',  '05:30', 334, '5 hours 15 minutes',  'RAKE-96181', 'LHB Rake', 'C1:TRAIN_CC,C2:TRAIN_CC,S1:TRAIN_SL'),
    ('96201', 'Srirangam Superfast',         'Coromandel Rail Link',  'Superfast',      'TPJ', 'MS',   '05:50', 337, '5 hours 20 minutes',  'RAKE-96201', 'LHB Rake', 'C1:TRAIN_CC,C2:TRAIN_CC,S1:TRAIN_SL'),
    ('96211', 'Bhavani Night Express',       'Western Ghats Rail',    'Mail/Express',   'ED',  'MAS',  '22:30', 393, '7 hours',             'RAKE-96211', 'ICF Rake', 'S1:TRAIN_SL,S2:TRAIN_SL,B1:TRAIN_3A'),
    ('96221', 'Knit City Express',           'Western Ghats Rail',    'Mail/Express',   'TUP', 'MAS',  '20:00', 448, '7 hours 30 minutes',  'RAKE-96221', 'ICF Rake', 'S1:TRAIN_SL,B1:TRAIN_3A'),
    ('96231', 'Fort Katpadi Intercity',      'Western Ghats Rail',    'Intercity',      'KPD', 'MAS',  '06:45', 130, '2 hours',             'RAKE-96231', 'LHB Rake', 'C1:TRAIN_CC,C2:TRAIN_CC');

-- Vehicles: capacity = total seats of the coaches listed for it.
INSERT INTO vehicles (operator_id, vehicle_name, vehicle_number, vehicle_type, capacity)
SELECT o.operator_id,
       CASE WHEN o.transport_mode = 'TRAIN' THEN 'Rake for ' || ss.service_number
            ELSE ss.vehicle_type || ' ' || right(ss.vehicle_number, 4) END,
       ss.vehicle_number,
       ss.vehicle_type,
       (SELECT SUM(cl.seat_count)
        FROM unnest(string_to_array(ss.coaches, ',')) AS c(spec)
        JOIN coach_layouts cl ON cl.layout_code = split_part(c.spec, ':', 2))
FROM seed_services ss
JOIN operators o ON o.operator_name = ss.operator_name
ORDER BY ss.service_number;

-- Coaches + seats, generated by the same stored function the admin UI uses.
SELECT count(add_coach(v.vehicle_id, split_part(c.spec, ':', 1), split_part(c.spec, ':', 2)))
FROM (SELECT ss.vehicle_number, c.spec, c.ord
      FROM seed_services ss
      CROSS JOIN LATERAL unnest(string_to_array(ss.coaches, ',')) WITH ORDINALITY AS c(spec, ord)
      ORDER BY ss.service_number, c.ord) AS c
JOIN vehicles v ON v.vehicle_number = c.vehicle_number;

-- A few blocked seats so the "Unavailable" legend state is demonstrable.
UPDATE seats s SET is_active = FALSE
FROM coaches c JOIN vehicles v ON v.vehicle_id = c.vehicle_id
WHERE s.coach_id = c.coach_id
  AND ((v.vehicle_number = 'TN01AN4521' AND s.seat_number IN ('L1', 'U1'))
    OR (v.vehicle_number = 'RAKE-96111' AND c.coach_code = 'S1' AND s.seat_number IN ('1', '2', '3'))
    OR (v.vehicle_number = 'TN58CK2121' AND s.seat_number IN ('1', '2')));

-- Routes (one per ordered station pair).
INSERT INTO routes (origin_station_id, destination_station_id, distance_km, estimated_duration)
SELECT DISTINCT ON (os.station_id, ds.station_id)
       os.station_id, ds.station_id, ss.distance_km, ss.duration
FROM seed_services ss
JOIN stations os ON os.station_code = ss.origin_code
JOIN stations ds ON ds.station_code = ss.destination_code
ORDER BY os.station_id, ds.station_id, ss.service_number;

INSERT INTO services (vehicle_id, route_id, service_number, service_name, service_type)
SELECT v.vehicle_id, r.route_id, ss.service_number, ss.service_name, ss.service_type
FROM seed_services ss
JOIN vehicles v  ON v.vehicle_number = ss.vehicle_number
JOIN stations os ON os.station_code  = ss.origin_code
JOIN stations ds ON ds.station_code  = ss.destination_code
JOIN routes r    ON r.origin_station_id = os.station_id AND r.destination_station_id = ds.station_id
ORDER BY ss.service_number;

-- Amenities by service type (many-to-many junction rows).
INSERT INTO service_amenities (service_id, amenity_id)
SELECT sv.service_id, a.amenity_id
FROM services sv
JOIN amenities a ON a.amenity_name = ANY (
    CASE sv.service_type
        WHEN 'AC Sleeper'     THEN ARRAY['Charging Point','Water Bottle','Blanket','Reading Light','Live Tracking','CCTV']
        WHEN 'Non-AC Sleeper' THEN ARRAY['Charging Point','Reading Light','Live Tracking']
        WHEN 'AC Seater'      THEN ARRAY['Charging Point','Water Bottle','Wi-Fi','Live Tracking']
        WHEN 'Express'        THEN ARRAY['Charging Point','Live Tracking']
        WHEN 'Ordinary'       THEN ARRAY['Live Tracking']
        WHEN 'Superfast'      THEN ARRAY['Pantry Car','Charging Point','Bio Toilet','CCTV']
        WHEN 'Intercity'      THEN ARRAY['Charging Point','Bio Toilet']
        ELSE                       ARRAY['Pantry Car','Bedroll','Charging Point','Bio Toilet']
    END);

-- Fares: distance-based demo formula per class, rounded to the nearest ₹5.
INSERT INTO fare_rules (service_id, class_code, fare)
SELECT DISTINCT sv.service_id, cl.class_code,
       ROUND((CASE cl.class_code
                WHEN 'SL'  THEN  35 + r.distance_km * 0.62
                WHEN '3A'  THEN  60 + r.distance_km * 1.65
                WHEN '2A'  THEN  80 + r.distance_km * 2.35
                WHEN '1A'  THEN 120 + r.distance_km * 3.95
                WHEN 'CC'  THEN  55 + r.distance_km * 1.38
                WHEN 'BSL' THEN  15 + r.distance_km * CASE sv.service_type WHEN 'AC Sleeper' THEN 2.10 ELSE 1.35 END
                ELSE             15 + r.distance_km * CASE sv.service_type WHEN 'AC Seater'  THEN 1.45
                                                                           WHEN 'Express'    THEN 0.95
                                                                           ELSE 0.70 END
              END) / 5) * 5
FROM services sv
JOIN routes r         ON r.route_id     = sv.route_id
JOIN coaches co       ON co.vehicle_id  = sv.vehicle_id
JOIN coach_layouts cl ON cl.layout_code = co.layout_code;

-- Schedules: every service runs daily from 21 days ago to 30 days ahead.
INSERT INTO schedules (service_id, departure_at, arrival_at)
SELECT sv.service_id,
       d::date + ss.departure_time,
       d::date + ss.departure_time + ss.duration
FROM services sv
JOIN seed_services ss ON ss.service_number = sv.service_number
CROSS JOIN generate_series(CURRENT_DATE - 21, CURRENT_DATE + 30, INTERVAL '1 day') AS d
ORDER BY d, ss.departure_time;

-- One cancelled run and one withdrawn service, to demonstrate both states.
UPDATE schedules SET status = 'CANCELLED'
WHERE journey_date = CURRENT_DATE + 4
  AND service_id = (SELECT service_id FROM services WHERE service_number = 'TNT-B141');
UPDATE services SET is_active = FALSE WHERE service_number = 'TNT-B231';

-- -----------------------------------------------------------------------------
-- Sample bookings
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE seed_names (passenger_name TEXT, gender CHAR(1));
INSERT INTO seed_names VALUES
    ('Anitha Selvam','F'), ('Balaji Ramesh','M'), ('Chitra Devi','F'), ('Dinesh Kumar','M'),
    ('Elango Murugan','M'), ('Fathima Begum','F'), ('Gokul Raj','M'), ('Harini Prakash','F'),
    ('Ilango Sekar','M'), ('Janani Venkat','F'), ('Kumaravel P','M'), ('Lavanya Mohan','F'),
    ('Manikandan S','M'), ('Nandhini Arul','F'), ('Oviya Senthil','F'), ('Pradeep Natarajan','M'),
    ('Revathi Ganesh','F'), ('Saravanan K','M'), ('Tamilselvi R','F'), ('Udhaya Kumar','M'),
    ('Vasanthi Ravi','F'), ('Yuvan Shankar','M'), ('Abdul Rahman','M'), ('Meera Iyer','F'),
    ('Joseph Antony','M'), ('Sangeetha Pillai','F'), ('Rajesh Kannan','M'), ('Swathi Bala','F'),
    ('Thiru Murugan','M'), ('Keerthana V','F'), ('Alex Pandian','O'), ('Bhuvana Shree','F');

-- Books p_pax adjacent free seats of one random class. Mirrors the API's transaction.
CREATE FUNCTION pg_temp.seed_booking(p_user INT, p_schedule INT, p_pax INT, p_booked_at TIMESTAMPTZ)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
    v_service INT; v_vehicle INT; v_mode TEXT; v_class TEXT; v_fee NUMERIC;
    v_booking INT; v_start INT; v_pid INT; r RECORD;
BEGIN
    SELECT sv.service_id, sv.vehicle_id, o.transport_mode INTO v_service, v_vehicle, v_mode
    FROM schedules sc
    JOIN services sv ON sv.service_id = sc.service_id
    JOIN vehicles v  ON v.vehicle_id  = sv.vehicle_id
    JOIN operators o ON o.operator_id = v.operator_id
    WHERE sc.schedule_id = p_schedule;

    SELECT ca.class_code INTO v_class
    FROM schedule_class_availability_view ca
    WHERE ca.schedule_id = p_schedule AND ca.available_seats >= p_pax
    ORDER BY random() LIMIT 1;
    IF v_class IS NULL THEN RETURN NULL; END IF;

    SELECT fee_per_passenger INTO v_fee FROM booking_fees WHERE transport_mode = v_mode;

    INSERT INTO bookings (user_id, schedule_id, contact_email, contact_phone, booked_at, fee_amount)
    SELECT u.user_id, p_schedule, u.email, u.phone, p_booked_at, v_fee * p_pax
    FROM users u WHERE u.user_id = p_user
    RETURNING booking_id INTO v_booking;

    -- Free seats of the chosen class, starting from a random one, so groups sit together.
    CREATE TEMP TABLE IF NOT EXISTS seed_free (seat_id INT, fare NUMERIC);
    TRUNCATE seed_free;
    INSERT INTO seed_free
    SELECT s.seat_id, fr.fare
    FROM seats s
    JOIN coaches co       ON co.coach_id    = s.coach_id
    JOIN coach_layouts cl ON cl.layout_code = co.layout_code
    JOIN fare_rules fr    ON fr.service_id  = v_service AND fr.class_code = cl.class_code
    WHERE co.vehicle_id = v_vehicle AND cl.class_code = v_class AND s.is_active
      AND NOT EXISTS (SELECT 1 FROM seat_reservations sr
                      WHERE sr.schedule_id = p_schedule AND sr.seat_id = s.seat_id AND sr.status = 'ACTIVE');
    SELECT seat_id INTO v_start FROM seed_free ORDER BY random() LIMIT 1;

    FOR r IN SELECT f.seat_id, f.fare FROM seed_free f
             ORDER BY (f.seat_id < v_start), f.seat_id LIMIT p_pax
    LOOP
        INSERT INTO passengers (booking_id, passenger_name, age, gender, passenger_fare)
        SELECT v_booking, n.passenger_name,
               CASE WHEN random() < 0.12 THEN 5 + floor(random() * 10) ELSE 18 + floor(random() * 52) END,
               n.gender, r.fare
        FROM seed_names n ORDER BY random() LIMIT 1
        RETURNING passenger_id INTO v_pid;

        INSERT INTO seat_reservations (booking_id, schedule_id, passenger_id, seat_id, reserved_at)
        VALUES (v_booking, p_schedule, v_pid, r.seat_id, p_booked_at);
    END LOOP;

    UPDATE bookings
    SET base_amount = (SELECT SUM(passenger_fare) FROM passengers WHERE booking_id = v_booking)
    WHERE booking_id = v_booking;
    RETURN v_booking;
END;
$$;

-- Backdated cancellation (cancel_booking() always uses "now", which suits the live app
-- but not historical sample data). Same three steps as cancel_booking().
CREATE FUNCTION pg_temp.seed_cancel(p_booking INT, p_at TIMESTAMP, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_refund RECORD;
BEGIN
    SELECT * INTO v_refund FROM calculate_refund(p_booking, p_at);
    UPDATE bookings SET booking_status = 'CANCELLED', payment_status = 'DEMO_REFUNDED'
    WHERE booking_id = p_booking;
    UPDATE seat_reservations SET status = 'RELEASED', released_at = p_at AT TIME ZONE 'Asia/Kolkata'
    WHERE booking_id = p_booking AND status = 'ACTIVE';
    INSERT INTO cancellations (booking_id, cancelled_at, cancellation_reason, refund_percent, refund_amount, cancelled_by)
    SELECT p_booking, p_at AT TIME ZONE 'Asia/Kolkata', p_reason, v_refund.refund_percent, v_refund.refund_amount, b.user_id
    FROM bookings b WHERE b.booking_id = p_booking;
    UPDATE booking_status_log SET changed_at = p_at AT TIME ZONE 'Asia/Kolkata'
    WHERE booking_id = p_booking AND new_status = 'CANCELLED';
END;
$$;

DO $$
DECLARE
    v_schedule INT; v_dep TIMESTAMP; v_booked TIMESTAMP; v_cancel_at TIMESTAMP;
    v_booking INT; v_user INT; v_pax INT; v_mode TEXT;
    v_reasons TEXT[] := ARRAY['Change of travel plans', 'Medical emergency', 'Booked another service',
                              'Meeting rescheduled', 'Family function postponed'];
BEGIN
    PERFORM setseed(0.2026);

    -- Curated journeys for the main demo passenger (Priya, user 2), so every tab of
    -- My Bookings has something to show.
    FOR v_schedule, v_pax, v_booked IN
        SELECT sc.schedule_id, x.pax, sc.departure_at - x.lead
        FROM (VALUES ('TNT-B101',   5, 2, INTERVAL '6 days'),     -- upcoming bus
                     ('96111',      9, 3, INTERVAL '10 days'),    -- upcoming train
                     ('96131',     14, 1, INTERVAL '15 days'),    -- upcoming train (CC)
                     ('96141',     -6, 1, INTERVAL '8 days'),     -- completed train
                     ('TNT-B121', -12, 2, INTERVAL '4 days'),     -- completed bus
                     ('96121',    -17, 2, INTERVAL '3 days')      -- completed train
             ) AS x (service_number, day_offset, pax, lead)
        JOIN services sv  ON sv.service_number = x.service_number
        JOIN schedules sc ON sc.service_id = sv.service_id AND sc.journey_date = CURRENT_DATE + x.day_offset
    LOOP
        IF v_booked > ist_now() THEN v_booked := ist_now() - INTERVAL '2 days'; END IF;
        PERFORM pg_temp.seed_booking(2, v_schedule, v_pax, v_booked AT TIME ZONE 'Asia/Kolkata');
    END LOOP;

    -- Priya's cancelled booking (cancelled 3 days ago, journey still in the future).
    SELECT sc.schedule_id INTO v_schedule
    FROM schedules sc JOIN services sv ON sv.service_id = sc.service_id
    WHERE sv.service_number = '96122' AND sc.journey_date = CURRENT_DATE + 11;
    v_booking := pg_temp.seed_booking(2, v_schedule, 2, (ist_now() - INTERVAL '6 days') AT TIME ZONE 'Asia/Kolkata');
    PERFORM pg_temp.seed_cancel(v_booking, ist_now() - INTERVAL '3 days', 'Change of travel plans');

    -- Bulk bookings. Weighted sampling (exponential race: ORDER BY -ln(u)/weight) makes
    -- Chennai <-> Coimbatore/Madurai the busiest corridors, as in real life.
    FOR i IN 1..340 LOOP
        SELECT sc.schedule_id, sc.departure_at INTO v_schedule, v_dep
        FROM schedules sc
        JOIN services sv ON sv.service_id = sc.service_id
        JOIN routes r    ON r.route_id    = sv.route_id
        JOIN stations os ON os.station_id = r.origin_station_id
        JOIN stations ds ON ds.station_id = r.destination_station_id
        JOIN cities oc   ON oc.city_id    = os.city_id
        JOIN cities dc   ON dc.city_id    = ds.city_id
        WHERE sc.status = 'SCHEDULED' AND sv.is_active
          AND sc.journey_date BETWEEN CURRENT_DATE - 20 AND CURRENT_DATE + 21
        ORDER BY -ln(1 - random()) /
                 CASE WHEN 'Chennai' IN (oc.city_name, dc.city_name)
                       AND (oc.city_name IN ('Coimbatore', 'Madurai') OR dc.city_name IN ('Coimbatore', 'Madurai')) THEN 5
                      WHEN 'Chennai' IN (oc.city_name, dc.city_name) THEN 2.5
                      ELSE 1 END
        LIMIT 1;

        v_booked := v_dep - (INTERVAL '5 hours' + random() * INTERVAL '10 days');
        IF v_booked > ist_now() THEN
            v_booked := ist_now() - random() * INTERVAL '13 days';
        END IF;
        -- Priya gets ~6 % of the bulk so her history stays readable; the rest go to users 3..10.
        v_user := CASE WHEN random() < 0.06 THEN 2 ELSE 3 + floor(random() * 8)::int END;
        v_pax  := 1 + floor(power(random(), 2) * 4)::int;       -- mostly 1-2, up to 4

        v_booking := pg_temp.seed_booking(v_user, v_schedule, v_pax, v_booked AT TIME ZONE 'Asia/Kolkata');

        -- About 12 % are cancelled at a random moment before the 2-hour cut-off.
        IF v_booking IS NOT NULL AND random() < 0.12 THEN
            v_cancel_at := v_booked + random() * (LEAST(v_dep - INTERVAL '3 hours', ist_now()) - v_booked);
            IF v_cancel_at > v_booked THEN
                PERFORM pg_temp.seed_cancel(v_booking, v_cancel_at, v_reasons[1 + floor(random() * 5)::int]);
            END IF;
        END IF;
    END LOOP;

    -- Demand for the coming week, so seat maps show a realistic mix of free and taken seats.
    FOR v_schedule, v_dep, v_mode IN
        SELECT sc.schedule_id, sc.departure_at, o.transport_mode
        FROM schedules sc
        JOIN services sv ON sv.service_id = sc.service_id
        JOIN vehicles v  ON v.vehicle_id  = sv.vehicle_id
        JOIN operators o ON o.operator_id = v.operator_id
        WHERE sc.status = 'SCHEDULED' AND sv.is_active
          AND sc.journey_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6
        ORDER BY sc.schedule_id
    LOOP
        FOR j IN 1 .. CASE WHEN v_mode = 'BUS' THEN 3 + floor(random() * 6)::int
                           ELSE 6 + floor(random() * 9)::int END
        LOOP
            v_booked := LEAST(ist_now(), v_dep - INTERVAL '6 hours') - random() * INTERVAL '12 days';
            v_booking := pg_temp.seed_booking(3 + floor(random() * 8)::int, v_schedule,
                                              1 + floor(power(random(), 2) * 4)::int,
                                              v_booked AT TIME ZONE 'Asia/Kolkata');
            IF v_booking IS NOT NULL AND random() < 0.07 THEN
                v_cancel_at := v_booked + random() * (LEAST(v_dep - INTERVAL '3 hours', ist_now()) - v_booked);
                IF v_cancel_at > v_booked THEN
                    PERFORM pg_temp.seed_cancel(v_booking, v_cancel_at, v_reasons[1 + floor(random() * 5)::int]);
                END IF;
            END IF;
        END LOOP;
    END LOOP;
END;
$$;

DROP TABLE seed_services, seed_names;
DROP TABLE IF EXISTS seed_free;

COMMIT;

ANALYZE;
