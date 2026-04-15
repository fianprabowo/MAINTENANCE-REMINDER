package usecase

import (
	"github.com/tiketcom/maintenance-reminder/internal/domain"
)

type VehicleUsecase struct {
	vehicleRepo domain.VehicleRepository
	mileageRepo domain.MileageRepository
	reminderRepo domain.ReminderRepository
}

func NewVehicleUsecase(
	vehicleRepo domain.VehicleRepository,
	mileageRepo domain.MileageRepository,
	reminderRepo domain.ReminderRepository,
) *VehicleUsecase {
	return &VehicleUsecase{
		vehicleRepo:  vehicleRepo,
		mileageRepo:  mileageRepo,
		reminderRepo: reminderRepo,
	}
}

type CreateVehicleInput struct {
	Name      string  `json:"name" validate:"required"`
	Type      string  `json:"type" validate:"required,oneof=motorcycle car"`
	Brand     string  `json:"brand" validate:"required"`
	Year      int     `json:"year" validate:"required,min=1900,max=2100"`
	FuelLevel int     `json:"fuel_level" validate:"min=0,max=100"`
	Notes     *string `json:"notes"`
}

type UpdateVehicleInput struct {
	Name      string  `json:"name" validate:"required"`
	Type      string  `json:"type" validate:"required,oneof=motorcycle car"`
	Brand     string  `json:"brand" validate:"required"`
	Year      int     `json:"year" validate:"required,min=1900,max=2100"`
	FuelLevel int     `json:"fuel_level" validate:"min=0,max=100"`
	Notes     *string `json:"notes"`
	Status    string  `json:"status" validate:"required,oneof=good warning critical"`
}

type VehicleDetail struct {
	Vehicle        *domain.Vehicle    `json:"vehicle"`
	LatestMileage  *domain.MileageLog `json:"latest_mileage,omitempty"`
	Reminders      []domain.Reminder  `json:"reminders"`
}

func (u *VehicleUsecase) Create(userID int64, input CreateVehicleInput) (*domain.Vehicle, error) {
	vehicle := &domain.Vehicle{
		UserID:    userID,
		Name:      input.Name,
		Type:      input.Type,
		Brand:     input.Brand,
		Year:      input.Year,
		FuelLevel: input.FuelLevel,
		Notes:     input.Notes,
		Status:    "good",
	}
	if vehicle.FuelLevel == 0 {
		vehicle.FuelLevel = 100
	}
	if err := u.vehicleRepo.Create(vehicle); err != nil {
		return nil, err
	}
	return vehicle, nil
}

func (u *VehicleUsecase) GetByUserID(userID int64, params domain.PaginationParams) ([]domain.Vehicle, int64, error) {
	return u.vehicleRepo.GetByUserID(userID, params)
}

func (u *VehicleUsecase) GetDetail(vehicleID int64, userID int64) (*VehicleDetail, error) {
	vehicle, err := u.vehicleRepo.GetByID(vehicleID)
	if err != nil {
		return nil, err
	}
	if vehicle.UserID != userID {
		return nil, domain.ErrForbidden
	}

	detail := &VehicleDetail{Vehicle: vehicle}

	if latest, err := u.mileageRepo.GetLatestByVehicleID(vehicleID); err == nil {
		detail.LatestMileage = latest
	}

	if reminders, err := u.reminderRepo.GetByVehicleID(vehicleID); err == nil {
		detail.Reminders = reminders
	}

	return detail, nil
}

func (u *VehicleUsecase) Update(vehicleID int64, userID int64, input UpdateVehicleInput) (*domain.Vehicle, error) {
	vehicle, err := u.vehicleRepo.GetByID(vehicleID)
	if err != nil {
		return nil, err
	}
	if vehicle.UserID != userID {
		return nil, domain.ErrForbidden
	}

	vehicle.Name = input.Name
	vehicle.Type = input.Type
	vehicle.Brand = input.Brand
	vehicle.Year = input.Year
	vehicle.FuelLevel = input.FuelLevel
	vehicle.Notes = input.Notes
	vehicle.Status = input.Status

	if err := u.vehicleRepo.Update(vehicle); err != nil {
		return nil, err
	}
	return vehicle, nil
}

func (u *VehicleUsecase) Delete(vehicleID int64, userID int64) error {
	vehicle, err := u.vehicleRepo.GetByID(vehicleID)
	if err != nil {
		return err
	}
	if vehicle.UserID != userID {
		return domain.ErrForbidden
	}
	return u.vehicleRepo.Delete(vehicleID)
}
