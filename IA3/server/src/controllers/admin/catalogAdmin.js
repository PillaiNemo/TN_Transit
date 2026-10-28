// Admin CRUD: cities, stations, operators, routes, vehicles, services (+ amenities M:N).
import { query, withTransaction } from '../../db/pool.js';
import { registerCrud } from '../../utils/crud.js';
import { HttpError, bool, int, num, oneOf, str } from '../../utils/validate.js';

const MODES = ['BUS', 'TRAIN'];
export const SERVICE_TYPES = {
  BUS: ['Ordinary', 'Express', 'AC Seater', 'AC Sleeper', 'Non-AC Sleeper'],
  TRAIN: ['Superfast', 'Mail/Express', 'Intercity'],
};

const like = (q) => (q && String(q).trim() ? String(q).trim() : null);

export function registerCatalogAdmin(router) {
  // --------------------------------------------------------------------------
  // Cities
  // --------------------------------------------------------------------------
  registerCrud(router, '/cities', {
    list: {
      sql: `
        SELECT c.*, COUNT(s.station_id) AS station_count
        FROM cities c LEFT JOIN stations s ON s.city_id = c.city_id
        WHERE ($1::text IS NULL OR c.city_name ILIKE '%' || $1 || '%' OR c.also_known_as ILIKE '%' || $1 || '%')
        GROUP BY c.city_id
        ORDER BY c.city_name`,
      params: (q) => [like(q.q)],
    },
    insert: `INSERT INTO cities (city_name, state, also_known_as) VALUES ($1, $2, $3) RETURNING *`,
    update: `UPDATE cities SET city_name = $2, state = $3, also_known_as = $4 WHERE city_id = $1 RETURNING *`,
    remove: `DELETE FROM cities WHERE city_id = $1`,
    parse: (b) => [
      str(b.city_name, 'City name', { min: 2, max: 60 }),
      str(b.state, 'State', { min: 2, max: 60, optional: true }) ?? 'Tamil Nadu',
      str(b.also_known_as, 'Also known as', { max: 40, optional: true }),
    ],
  });

  // --------------------------------------------------------------------------
  // Stations
  // --------------------------------------------------------------------------
  registerCrud(router, '/stations', {
    list: {
      sql: `
        SELECT s.*, c.city_name,
               (SELECT COUNT(*) FROM routes r
                WHERE s.station_id IN (r.origin_station_id, r.destination_station_id)) AS route_count
        FROM stations s JOIN cities c ON c.city_id = s.city_id
        WHERE ($1::text IS NULL OR s.station_name ILIKE '%' || $1 || '%' OR s.station_code ILIKE $1 || '%'
                                OR c.city_name ILIKE '%' || $1 || '%')
          AND ($2::text IS NULL OR s.station_kind = $2)
        ORDER BY c.city_name, s.station_kind, s.station_name`,
      params: (q) => [like(q.q), oneOf(q.kind, 'kind', MODES, { optional: true })],
    },
    insert: `
      INSERT INTO stations (station_name, station_code, city_id, station_kind)
      VALUES ($1, $2, $3, $4) RETURNING *`,
    update: `
      UPDATE stations SET station_name = $2, station_code = $3, city_id = $4, station_kind = $5
      WHERE station_id = $1 RETURNING *`,
    remove: `DELETE FROM stations WHERE station_id = $1`,
    parse: (b) => [
      str(b.station_name, 'Station name', { min: 2, max: 100 }),
      str(String(b.station_code ?? '').toUpperCase(), 'Station code', {
        min: 2, max: 12, pattern: /^[A-Z0-9-]+$/, patternMessage: 'Station code may contain only A-Z, 0-9 and -',
      }),
      int(b.city_id, 'City', { min: 1 }),
      oneOf(b.station_kind, 'Station type', MODES),
    ],
  });

  // --------------------------------------------------------------------------
  // Operators
  // --------------------------------------------------------------------------
  registerCrud(router, '/operators', {
    list: {
      sql: `
        SELECT o.*, COUNT(v.vehicle_id) AS vehicle_count
        FROM operators o LEFT JOIN vehicles v ON v.operator_id = o.operator_id
        WHERE ($1::text IS NULL OR o.operator_name ILIKE '%' || $1 || '%')
          AND ($2::text IS NULL OR o.transport_mode = $2)
        GROUP BY o.operator_id
        ORDER BY o.transport_mode, o.operator_name`,
      params: (q) => [like(q.q), oneOf(q.mode, 'mode', MODES, { optional: true })],
    },
    insert: `
      INSERT INTO operators (operator_name, transport_mode, contact_phone, is_active)
      VALUES ($1, $2, $3, $4) RETURNING *`,
    update: `
      UPDATE operators SET operator_name = $2, transport_mode = $3, contact_phone = $4, is_active = $5
      WHERE operator_id = $1 RETURNING *`,
    remove: `DELETE FROM operators WHERE operator_id = $1`,
    parse: async (b, { id }) => {
      const mode = oneOf(b.transport_mode, 'Transport mode', MODES);
      if (id) {
        // Changing the mode of an operator that already owns vehicles would make
        // their seat layouts inconsistent, so it is refused.
        const { rows } = await query(
          `SELECT o.transport_mode, COUNT(v.vehicle_id) AS vehicles
           FROM operators o LEFT JOIN vehicles v ON v.operator_id = o.operator_id
           WHERE o.operator_id = $1 GROUP BY o.operator_id`, [id]);
        if (rows[0] && rows[0].transport_mode !== mode && rows[0].vehicles > 0) {
          throw new HttpError(409, 'Cannot change the transport mode of an operator that already has vehicles');
        }
      }
      return [
        str(b.operator_name, 'Operator name', { min: 2, max: 100 }),
        mode,
        str(b.contact_phone, 'Contact phone', { optional: true, max: 15, pattern: /^[0-9+ -]{6,15}$/ }),
        bool(b.is_active, 'Active', { optional: true }) ?? true,
      ];
    },
  });

  // --------------------------------------------------------------------------
  // Routes
  // --------------------------------------------------------------------------
  registerCrud(router, '/routes', {
    list: {
      sql: `
        SELECT r.route_id, r.origin_station_id, r.destination_station_id, r.distance_km,
               (EXTRACT(EPOCH FROM r.estimated_duration) / 60)::int AS duration_minutes,
               os.station_kind AS transport_mode,
               os.station_name AS origin_station, oc.city_name AS origin_city,
               ds.station_name AS destination_station, dc.city_name AS destination_city,
               (SELECT COUNT(*) FROM services sv WHERE sv.route_id = r.route_id) AS service_count
        FROM routes r
        JOIN stations os ON os.station_id = r.origin_station_id
        JOIN cities oc   ON oc.city_id    = os.city_id
        JOIN stations ds ON ds.station_id = r.destination_station_id
        JOIN cities dc   ON dc.city_id    = ds.city_id
        WHERE ($1::text IS NULL OR oc.city_name ILIKE '%' || $1 || '%' OR dc.city_name ILIKE '%' || $1 || '%'
                                OR os.station_name ILIKE '%' || $1 || '%' OR ds.station_name ILIKE '%' || $1 || '%')
          AND ($2::text IS NULL OR os.station_kind = $2)
        ORDER BY os.station_kind, oc.city_name, dc.city_name`,
      params: (q) => [like(q.q), oneOf(q.mode, 'mode', MODES, { optional: true })],
    },
    insert: `
      INSERT INTO routes (origin_station_id, destination_station_id, distance_km, estimated_duration)
      VALUES ($1, $2, $3, make_interval(mins => $4)) RETURNING route_id`,
    update: `
      UPDATE routes SET origin_station_id = $2, destination_station_id = $3, distance_km = $4,
                        estimated_duration = make_interval(mins => $5)
      WHERE route_id = $1 RETURNING route_id`,
    remove: `DELETE FROM routes WHERE route_id = $1`,
    parse: async (b) => {
      const origin = int(b.origin_station_id, 'Origin station', { min: 1 });
      const destination = int(b.destination_station_id, 'Destination station', { min: 1 });
      if (origin === destination) throw new HttpError(400, 'Origin and destination must be different stations');
      const { rows } = await query(
        'SELECT COUNT(DISTINCT station_kind) AS kinds, COUNT(*) AS found FROM stations WHERE station_id IN ($1, $2)',
        [origin, destination]);
      if (rows[0].found !== 2) throw new HttpError(400, 'Station not found');
      if (rows[0].kinds !== 1) throw new HttpError(400, 'Both stations must be bus stands, or both railway stations');
      return [
        origin,
        destination,
        num(b.distance_km, 'Distance (km)', { min: 1, max: 5000 }),
        int(b.duration_minutes, 'Duration (minutes)', { min: 10, max: 2879 }),
      ];
    },
  });

  // --------------------------------------------------------------------------
  // Vehicles (buses and train rakes)
  // --------------------------------------------------------------------------
  registerCrud(router, '/vehicles', {
    list: {
      sql: `
        SELECT v.*, o.operator_name, o.transport_mode,
               (SELECT COUNT(*) FROM coaches c WHERE c.vehicle_id = v.vehicle_id) AS coach_count,
               (SELECT COUNT(*) FROM seats s JOIN coaches c ON c.coach_id = s.coach_id
                WHERE c.vehicle_id = v.vehicle_id) AS configured_seats,
               (SELECT string_agg(sv.service_number, ', ') FROM services sv WHERE sv.vehicle_id = v.vehicle_id) AS services
        FROM vehicles v JOIN operators o ON o.operator_id = v.operator_id
        WHERE ($1::text IS NULL OR v.vehicle_name ILIKE '%' || $1 || '%' OR v.vehicle_number ILIKE '%' || $1 || '%'
                                OR o.operator_name ILIKE '%' || $1 || '%')
          AND ($2::text IS NULL OR o.transport_mode = $2)
        ORDER BY o.transport_mode, v.vehicle_number`,
      params: (q) => [like(q.q), oneOf(q.mode, 'mode', MODES, { optional: true })],
    },
    insert: `
      INSERT INTO vehicles (operator_id, vehicle_name, vehicle_number, vehicle_type, capacity, is_active)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    update: `
      UPDATE vehicles SET operator_id = $2, vehicle_name = $3, vehicle_number = $4, vehicle_type = $5,
                          capacity = $6, is_active = $7
      WHERE vehicle_id = $1 RETURNING *`,
    remove: `DELETE FROM vehicles WHERE vehicle_id = $1`,
    parse: async (b, { id }) => {
      const capacity = int(b.capacity, 'Capacity', { min: 1, max: 2000 });
      const operatorId = int(b.operator_id, 'Operator', { min: 1 });
      if (id) {
        const { rows } = await query(
          `SELECT v.operator_id, o.transport_mode,
                  (SELECT transport_mode FROM operators WHERE operator_id = $2) AS new_mode,
                  (SELECT COUNT(*) FROM seats s JOIN coaches c ON c.coach_id = s.coach_id WHERE c.vehicle_id = v.vehicle_id) AS seats
           FROM vehicles v JOIN operators o ON o.operator_id = v.operator_id WHERE v.vehicle_id = $1`, [id, operatorId]);
        if (rows[0] && capacity < rows[0].seats) {
          throw new HttpError(422, `Capacity cannot be below the ${rows[0].seats} seats already configured`);
        }
        if (rows[0] && rows[0].new_mode && rows[0].new_mode !== rows[0].transport_mode && rows[0].seats > 0) {
          throw new HttpError(409, 'A vehicle with seats cannot move to an operator of a different transport mode');
        }
      }
      return [
        operatorId,
        str(b.vehicle_name, 'Vehicle name', { min: 2, max: 100 }),
        str(String(b.vehicle_number ?? '').toUpperCase(), 'Vehicle number', { min: 3, max: 20 }),
        str(b.vehicle_type, 'Vehicle type', { min: 2, max: 40 }),
        capacity,
        bool(b.is_active, 'Active', { optional: true }) ?? true,
      ];
    },
  });

  // --------------------------------------------------------------------------
  // Services — custom handlers because amenities (many-to-many) are saved in the
  // same transaction as the service row.
  // --------------------------------------------------------------------------
  const SERVICE_LIST_SQL = `
    SELECT sv.*, o.transport_mode, o.operator_name, v.vehicle_number, v.vehicle_name,
           oc.city_name AS origin_city, os.station_name AS origin_station,
           dc.city_name AS destination_city, ds.station_name AS destination_station,
           COALESCE((SELECT array_agg(sa.amenity_id ORDER BY sa.amenity_id)
                     FROM service_amenities sa WHERE sa.service_id = sv.service_id), '{}') AS amenity_ids,
           (SELECT COUNT(*) FROM fare_rules fr WHERE fr.service_id = sv.service_id) AS fare_count,
           (SELECT COUNT(*) FROM schedules sc WHERE sc.service_id = sv.service_id
                                              AND sc.journey_date >= CURRENT_DATE) AS upcoming_schedules
    FROM services sv
    JOIN vehicles v  ON v.vehicle_id  = sv.vehicle_id
    JOIN operators o ON o.operator_id = v.operator_id
    JOIN routes r    ON r.route_id    = sv.route_id
    JOIN stations os ON os.station_id = r.origin_station_id
    JOIN cities oc   ON oc.city_id    = os.city_id
    JOIN stations ds ON ds.station_id = r.destination_station_id
    JOIN cities dc   ON dc.city_id    = ds.city_id
    WHERE ($1::text IS NULL OR sv.service_number ILIKE '%' || $1 || '%' OR sv.service_name ILIKE '%' || $1 || '%'
                            OR oc.city_name ILIKE '%' || $1 || '%' OR dc.city_name ILIKE '%' || $1 || '%')
      AND ($2::text IS NULL OR o.transport_mode = $2)
    ORDER BY o.transport_mode, sv.service_number`;

  router.get('/services', async (req, res) => {
    const { rows } = await query(SERVICE_LIST_SQL, [like(req.query.q), oneOf(req.query.mode, 'mode', MODES, { optional: true })]);
    res.json(rows);
  });

  async function parseService(b) {
    const vehicleId = int(b.vehicle_id, 'Vehicle', { min: 1 });
    const routeId = int(b.route_id, 'Route', { min: 1 });
    const { rows: [check] } = await query(
      `SELECT (SELECT o.transport_mode FROM vehicles v JOIN operators o ON o.operator_id = v.operator_id
               WHERE v.vehicle_id = $1) AS vehicle_mode,
              (SELECT s.station_kind FROM routes r JOIN stations s ON s.station_id = r.origin_station_id
               WHERE r.route_id = $2) AS route_mode`, [vehicleId, routeId]);
    if (!check.vehicle_mode) throw new HttpError(400, 'Vehicle not found');
    if (!check.route_mode) throw new HttpError(400, 'Route not found');
    if (check.vehicle_mode !== check.route_mode) {
      throw new HttpError(400, `A ${check.vehicle_mode.toLowerCase()} vehicle cannot run on a ${check.route_mode.toLowerCase()} route`);
    }
    const amenityIds = Array.isArray(b.amenity_ids) ? b.amenity_ids.map((x) => int(x, 'Amenity', { min: 1 })) : [];
    return {
      values: [
        vehicleId,
        routeId,
        str(String(b.service_number ?? '').toUpperCase(), 'Service number', { min: 2, max: 12, pattern: /^[A-Z0-9-]+$/ }),
        str(b.service_name, 'Service name', { min: 2, max: 100 }),
        oneOf(b.service_type, 'Service type', SERVICE_TYPES[check.vehicle_mode]),
        bool(b.is_active, 'Active', { optional: true }) ?? true,
      ],
      amenityIds: [...new Set(amenityIds)],
    };
  }

  // Replace the amenity set: delete the old junction rows, insert the new ones.
  const saveAmenities = async (client, serviceId, amenityIds) => {
    await client.query('DELETE FROM service_amenities WHERE service_id = $1', [serviceId]);
    if (amenityIds.length) {
      await client.query(
        `INSERT INTO service_amenities (service_id, amenity_id) SELECT $1, unnest($2::int[])`,
        [serviceId, amenityIds]);
    }
  };

  router.post('/services', async (req, res) => {
    const { values, amenityIds } = await parseService(req.body ?? {});
    const service = await withTransaction(async (client) => {
      const { rows: [row] } = await client.query(
        `INSERT INTO services (vehicle_id, route_id, service_number, service_name, service_type, is_active)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, values);
      await saveAmenities(client, row.service_id, amenityIds);
      return row;
    });
    res.status(201).json(service);
  });

  router.put('/services/:id', async (req, res) => {
    const id = int(req.params.id, 'id', { min: 1 });
    const { values, amenityIds } = await parseService(req.body ?? {});
    const service = await withTransaction(async (client) => {
      const { rows: [row] } = await client.query(
        `UPDATE services SET vehicle_id = $2, route_id = $3, service_number = $4, service_name = $5,
                             service_type = $6, is_active = $7
         WHERE service_id = $1 RETURNING *`, [id, ...values]);
      if (!row) throw new HttpError(404, 'Service not found');
      await saveAmenities(client, id, amenityIds);
      return row;
    });
    res.json(service);
  });

  router.delete('/services/:id', async (req, res) => {
    const id = int(req.params.id, 'id', { min: 1 });
    // Fails with 409 (FK RESTRICT from schedules) once the service has ever been scheduled.
    const { rowCount } = await query('DELETE FROM services WHERE service_id = $1', [id]);
    if (!rowCount) throw new HttpError(404, 'Service not found');
    res.status(204).end();
  });
}
