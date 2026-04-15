package usecase

import (
	"github.com/tiketcom/maintenance-reminder/internal/domain"
)

type MileageUsecase struct {
	mileageRepo domain.MileageRepository
	vehicleRepo domain.VehicleRepository
}

func NewMileageUsecase(mileageRepo domain.MileageRepository, vehicleRepo domain.VehicleRepository) *MileageUsecase {
	return &MileageUsecase{
		mileageRepo: mileageRepo,
		vehicleRepo: vehicleRepo,
	}
}

type AddMileageInput struct {
	Mileage int `json:"mileage" validate:"required,min=0"`
}

func (u *MileageUsecase) Add(vehicleID int64, userID int64, input AddMileageInput) (*domain.MileageLog, error) {
	vehicle, err := u.vehicleRepo.GetByID(vehicleID)
	if err != nil {
		return nil, err
	}
	if vehicle.UserID != userID {
		return nil, domain.ErrForbidden
	}

	latest, err := u.mileageRepo.GetLatestByVehicleID(vehicleID)
	if err != nil && err != domain.ErrNotFound {
		return nil, err
	}
	if latest != nil && input.Mileage < latest.Mileage {
		return nil, domain.ErrMileageMustIncrease
	}

	log := &domain.MileageLog{
		VehicleID: vehicleID,
		Mileage:   input.Mileage,
	}
	if err := u.mileageRepo.Create(log); err != nil {
		return nil, err
	}
	return log, nil
}

func (u *MileageUsecase) GetHistory(vehicleID int64, userID int64, params domain.PaginationParams) ([]domain.MileageLog, int64, error) {
	vehicle, err := u.vehicleRepo.GetByID(vehicleID)
	if err != nil {
		return nil, 0, err
	}
	if vehicle.UserID != userID {
		return nil, 0, domain.ErrForbidden
	}
	return u.mileageRepo.GetByVehicleID(vehicleID, params)
}
