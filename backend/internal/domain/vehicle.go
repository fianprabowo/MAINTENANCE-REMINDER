package domain

import "time"

type Vehicle struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	Brand     string    `json:"brand"`
	Year      int       `json:"year"`
	FuelLevel int       `json:"fuel_level"`
	Notes     *string   `json:"notes,omitempty"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type VehicleRepository interface {
	Create(vehicle *Vehicle) error
	GetByID(id int64) (*Vehicle, error)
	GetByUserID(userID int64, params PaginationParams) ([]Vehicle, int64, error)
	Update(vehicle *Vehicle) error
	Delete(id int64) error
}
