package domain

import "time"

type MileageLog struct {
	ID        int64     `json:"id"`
	VehicleID int64     `json:"vehicle_id"`
	Mileage   int       `json:"mileage"`
	CreatedAt time.Time `json:"created_at"`
}

type MileageRepository interface {
	Create(log *MileageLog) error
	GetLatestByVehicleID(vehicleID int64) (*MileageLog, error)
	GetByVehicleID(vehicleID int64, params PaginationParams) ([]MileageLog, int64, error)
}
