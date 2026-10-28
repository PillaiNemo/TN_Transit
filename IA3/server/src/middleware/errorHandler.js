import { HttpError } from '../utils/validate.js';

// Friendly messages for named constraints, so database errors read well in the UI.
const CONSTRAINT_MESSAGES = {
  users_email_lower_uq: 'An account with this email already exists',
  seat_reservations_active_uq: 'One or more selected seats were just booked by someone else. Please choose different seats.',
  seat_res_booking_seat_uq: 'The same seat cannot be selected twice in one booking',
  cities_name_state_uq: 'This city already exists',
  stations_station_code_key: 'Station code is already in use',
  stations_name_city_uq: 'A station with this name already exists in that city',
  operators_operator_name_key: 'An operator with this name already exists',
  vehicles_vehicle_number_key: 'Vehicle number is already registered',
  coaches_vehicle_code_uq: 'This vehicle already has a coach with that code',
  routes_pair_uq: 'A route between these two stations already exists',
  routes_distinct_ends: 'Origin and destination must be different stations',
  services_service_number_key: 'Service number is already in use',
  fare_rules_service_class_uq: 'A fare for this class already exists on this service',
  schedules_one_run_per_day_uq: 'This service already has a schedule on that date',
  schedules_arrival_after_departure: 'Arrival must be after departure',
};

// Custom SQLSTATEs raised by functions.sql
const CUSTOM_CODES = { TN404: 404, TN409: 409, TN422: 422 };

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  if (err.code && CUSTOM_CODES[err.code]) {
    return res.status(CUSTOM_CODES[err.code]).json({ error: err.message });
  }

  const known = CONSTRAINT_MESSAGES[err.constraint];
  switch (err.code) {
    case '23505': // unique_violation
      return res.status(409).json({ error: known || 'This record already exists', constraint: err.constraint });
    case '23001': // restrict_violation (ON DELETE RESTRICT)
    case '23503': // foreign_key_violation
      return res.status(409).json({
        error: err.code === '23001' || err.message.includes('is still referenced')
          ? 'This record is used by other records (e.g. schedules or bookings) and cannot be deleted. Deactivate it instead.'
          : 'A referenced record does not exist',
        constraint: err.constraint,
      });
    case '23514': // check_violation
      return res.status(422).json({ error: known || `Value rejected by database rule "${err.constraint}"`, constraint: err.constraint });
    case '23502': // not_null_violation
      return res.status(422).json({ error: `${err.column} is required` });
    case '22P02': // invalid_text_representation
    case '22007': // invalid_datetime_format
    case '22008': // datetime_field_overflow
      return res.status(400).json({ error: 'One of the values has an invalid format' });
    default:
      console.error(err);
      return res.status(500).json({ error: 'Something went wrong on the server' });
  }
}
