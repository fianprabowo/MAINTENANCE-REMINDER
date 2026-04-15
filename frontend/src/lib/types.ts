export interface User {
  id: number;
  email?: string;
  phone?: string;
  name: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: number;
  user_id: number;
  name: string;
  type: "motorcycle" | "car";
  brand: string;
  year: number;
  fuel_level: number;
  notes?: string;
  status: "good" | "warning" | "critical";
  created_at: string;
  updated_at: string;
}

export interface MileageLog {
  id: number;
  vehicle_id: number;
  mileage: number;
  created_at: string;
}

export interface Reminder {
  id: number;
  vehicle_id: number;
  service_type: "light" | "heavy";
  km_interval: number;
  date_interval_days: number;
  last_service_km: number;
  last_service_date?: string;
  next_due_km: number;
  next_due_date?: string;
  is_overdue_km?: boolean;
  is_overdue_date?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServiceRecord {
  id: number;
  vehicle_id: number;
  service_type: "light" | "heavy";
  description?: string;
  mileage_at_service: number;
  serviced_at: string;
  created_at: string;
}

export interface VehicleDetail {
  vehicle: Vehicle;
  latest_mileage?: MileageLog;
  reminders: Reminder[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total_items: number;
  total_pages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  meta?: PaginationMeta;
}

export interface AuthResponse {
  token: string;
  user: User;
}
