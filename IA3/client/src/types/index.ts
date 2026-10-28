// API response shapes. Keys are the PostgreSQL column names returned by the API.
export type Mode = 'BUS' | 'TRAIN';
export type SeatStatus = 'AVAILABLE' | 'OCCUPIED' | 'UNAVAILABLE';
export type JourneyState = 'UPCOMING' | 'COMPLETED' | 'CANCELLED';
export type Gender = 'M' | 'F' | 'O';

export interface User {
  user_id: number;
  full_name: string;
  email: string;
  phone: string;
  role: 'PASSENGER' | 'ADMIN';
  created_at: string;
  stats?: { total_bookings: number; confirmed_bookings: number; cancelled_bookings: number; total_spent: number };
}

export interface City {
  city_id: number;
  city_name: string;
  state: string;
  also_known_as: string | null;
  bus_stations: number;
  train_stations: number;
}

export interface ClassAvailability {
  class_code: string;
  class_name: string;
  fare: number;
  total_seats: number;
  available_seats: number;
}

export interface ServiceResult {
  schedule_id: number;
  journey_date: string;
  departure_at: string;
  arrival_at: string;
  duration_minutes: number;
  service_id: number;
  service_number: string;
  service_name: string;
  service_type: string;
  operator_name: string;
  transport_mode: Mode;
  vehicle_type: string;
  distance_km: number;
  origin_station: string;
  origin_code: string;
  origin_city_id: number;
  origin_city: string;
  destination_station: string;
  destination_code: string;
  destination_city_id: number;
  destination_city: string;
  total_seats: number;
  available_seats: number;
  min_fare: number | null;
  classes: ClassAvailability[];
  amenities: string[];
  fee_per_passenger?: number;
}

export interface SearchResponse {
  results: ServiceResult[];
  facets: { total_services: number; min_fare: number | null; max_fare: number | null; service_types: string[] };
  next_dates: { journey_date: string; services: number }[];
}

export interface Seat {
  seat_id: number;
  seat_number: string;
  berth_type: string;
  layout_row: number;
  layout_col: number;
  coach_code: string;
  layout_code: string;
  class_code: string;
  class_name: string;
  display_order: number;
  fare: number | null;
  status: SeatStatus;
}

export interface TicketPassenger {
  passenger_id: number;
  passenger_name: string;
  age: number;
  gender: Gender;
  passenger_fare: number;
  seat_id: number;
  seat_number: string;
  berth_type: string;
  coach_code: string;
  class_code: string;
  class_name: string;
  reservation_status: 'ACTIVE' | 'RELEASED';
  released_at: string | null;
}

export interface RefundQuote {
  hours_before_departure: number;
  refund_percent: number;
  refund_amount: number;
  is_cancellable: boolean;
}

export interface Ticket {
  booking_id: number;
  booking_reference: string;
  pnr_reference: string;
  user_id: number;
  booked_by: string;
  contact_email: string;
  contact_phone: string;
  booked_at: string;
  base_amount: number;
  fee_amount: number;
  total_amount: number;
  booking_status: 'CONFIRMED' | 'CANCELLED';
  payment_status: string;
  journey_state: JourneyState;
  schedule_id: number;
  journey_date: string;
  departure_at: string;
  arrival_at: string;
  schedule_status: string;
  service_number: string;
  service_name: string;
  service_type: string;
  operator_name: string;
  transport_mode: Mode;
  vehicle_name: string;
  vehicle_number: string;
  distance_km: number;
  origin_station: string;
  origin_code: string;
  origin_city: string;
  destination_station: string;
  destination_code: string;
  destination_city: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  refund_percent: number | null;
  refund_amount: number | null;
  passengers: TicketPassenger[];
  refund_quote?: RefundQuote;
}

export interface BookingSummary {
  booking_id: number;
  booking_reference: string;
  pnr_reference: string;
  user_id: number;
  booked_by: string;
  user_email: string;
  booked_at: string;
  total_amount: number;
  booking_status: 'CONFIRMED' | 'CANCELLED';
  payment_status: string;
  journey_state: JourneyState;
  schedule_id: number;
  journey_date: string;
  departure_at: string;
  arrival_at: string;
  service_number: string;
  service_name: string;
  service_type: string;
  operator_name: string;
  transport_mode: Mode;
  origin_city: string;
  origin_station: string;
  destination_city: string;
  destination_station: string;
  passenger_count: number;
  seat_list: string;
  class_list: string;
  refund_amount: number | null;
  cancelled_at: string | null;
}

export interface Meta {
  booking_fees: { transport_mode: Mode; fee_per_passenger: number }[];
  cancellation_policy: { policy_id: number; min_hours_before: number; refund_percent: number }[];
  seat_classes: { class_code: string; class_name: string; transport_mode: Mode; is_ac: boolean; display_order: number }[];
  first_bookable_date: string;
  last_bookable_date: string;
}

export interface HomeData {
  featured_routes: {
    origin_city: string;
    destination_city: string;
    transport_mode: Mode;
    bookings: number;
    from_fare: number | null;
    services: number;
    min_duration_minutes: number | null;
    origin_city_id: number;
    destination_city_id: number;
  }[];
  popular_destinations: {
    city_id: number;
    city_name: string;
    also_known_as: string | null;
    services: number;
    bus_services: number;
    train_services: number;
  }[];
  stats: { cities: number; stations: number; active_services: number; upcoming_journeys: number };
}

/** Temporary, client-side selection carried from the seat page to checkout. */
export interface BookingDraft {
  schedule_id: number;
  seats: Pick<Seat, 'seat_id' | 'seat_number' | 'coach_code' | 'class_code' | 'class_name' | 'berth_type' | 'fare'>[];
}
