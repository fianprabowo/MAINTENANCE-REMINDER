package domain

import "time"

type Reminder struct {
	ID               int64      `json:"id"`
	VehicleID        int64      `json:"vehicle_id"`
	ServiceType      string     `json:"service_type"`
	KMInterval       int        `json:"km_interval"`
	DateIntervalDays int        `json:"date_interval_days"`
	LastServiceKM    int        `json:"last_service_km"`
	LastServiceDate  *time.Time `json:"last_service_date,omitempty"`
	NextDueKM        int        `json:"next_due_km"`
	NextDueDate      *time.Time `json:"next_due_date,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type ServiceRecord struct {
	ID               int64     `json:"id"`
	VehicleID        int64     `json:"vehicle_id"`
	ServiceType      string    `json:"service_type"`
	Description      *string   `json:"description,omitempty"`
	MileageAtService int       `json:"mileage_at_service"`
	ServicedAt       time.Time `json:"serviced_at"`
	CreatedAt        time.Time `json:"created_at"`
}

type ReminderRepository interface {
	Create(reminder *Reminder) error
	GetByVehicleID(vehicleID int64) ([]Reminder, error)
	Update(reminder *Reminder) error
}

type ServiceRecordRepository interface {
	Create(record *ServiceRecord) error
	GetByVehicleID(vehicleID int64, params PaginationParams) ([]ServiceRecord, int64, error)
}
