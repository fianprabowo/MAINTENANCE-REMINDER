package usecase

import (
	"time"

	"github.com/tiketcom/maintenance-reminder/internal/domain"
)

type ReminderUsecase struct {
	reminderRepo domain.ReminderRepository
	vehicleRepo  domain.VehicleRepository
	mileageRepo  domain.MileageRepository
}

func NewReminderUsecase(
	reminderRepo domain.ReminderRepository,
	vehicleRepo domain.VehicleRepository,
	mileageRepo domain.MileageRepository,
) *ReminderUsecase {
	return &ReminderUsecase{
		reminderRepo: reminderRepo,
		vehicleRepo:  vehicleRepo,
		mileageRepo:  mileageRepo,
	}
}

type CreateReminderInput struct {
	ServiceType      string `json:"service_type" validate:"required,oneof=light heavy"`
	KMInterval       int    `json:"km_interval" validate:"min=0"`
	DateIntervalDays int    `json:"date_interval_days" validate:"min=0"`
	LastServiceKM    int    `json:"last_service_km" validate:"min=0"`
	LastServiceDate  string `json:"last_service_date"`
}

type ReminderResponse struct {
	domain.Reminder
	IsOverdueKM   bool `json:"is_overdue_km"`
	IsOverdueDate bool `json:"is_overdue_date"`
}

func (u *ReminderUsecase) Create(vehicleID int64, userID int64, input CreateReminderInput) (*domain.Reminder, error) {
	vehicle, err := u.vehicleRepo.GetByID(vehicleID)
	if err != nil {
		return nil, err
	}
	if vehicle.UserID != userID {
		return nil, domain.ErrForbidden
	}

	reminder := &domain.Reminder{
		VehicleID:        vehicleID,
		ServiceType:      input.ServiceType,
		KMInterval:       input.KMInterval,
		DateIntervalDays: input.DateIntervalDays,
		LastServiceKM:    input.LastServiceKM,
	}

	if input.LastServiceDate != "" {
		parsed, err := time.Parse("2006-01-02", input.LastServiceDate)
		if err == nil {
			reminder.LastServiceDate = &parsed
		}
	}

	if reminder.KMInterval > 0 {
		reminder.NextDueKM = reminder.LastServiceKM + reminder.KMInterval
	}

	if reminder.DateIntervalDays > 0 && reminder.LastServiceDate != nil {
		nextDate := reminder.LastServiceDate.AddDate(0, 0, reminder.DateIntervalDays)
		reminder.NextDueDate = &nextDate
	}

	if err := u.reminderRepo.Create(reminder); err != nil {
		return nil, err
	}
	return reminder, nil
}

func (u *ReminderUsecase) GetByVehicleID(vehicleID int64, userID int64) ([]ReminderResponse, error) {
	vehicle, err := u.vehicleRepo.GetByID(vehicleID)
	if err != nil {
		return nil, err
	}
	if vehicle.UserID != userID {
		return nil, domain.ErrForbidden
	}

	reminders, err := u.reminderRepo.GetByVehicleID(vehicleID)
	if err != nil {
		return nil, err
	}

	var currentKM int
	if latest, err := u.mileageRepo.GetLatestByVehicleID(vehicleID); err == nil {
		currentKM = latest.Mileage
	}

	now := time.Now()
	var responses []ReminderResponse
	for _, r := range reminders {
		resp := ReminderResponse{Reminder: r}
		if r.NextDueKM > 0 && currentKM >= r.NextDueKM {
			resp.IsOverdueKM = true
		}
		if r.NextDueDate != nil && now.After(*r.NextDueDate) {
			resp.IsOverdueDate = true
		}
		responses = append(responses, resp)
	}

	return responses, nil
}
