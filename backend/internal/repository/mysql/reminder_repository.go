package mysql

import (
	"database/sql"

	"github.com/tiketcom/maintenance-reminder/internal/domain"
)

type reminderRepository struct {
	db *sql.DB
}

func NewReminderRepository(db *sql.DB) domain.ReminderRepository {
	return &reminderRepository{db: db}
}

func (r *reminderRepository) Create(rem *domain.Reminder) error {
	query := `INSERT INTO reminders (vehicle_id, service_type, km_interval, date_interval_days, last_service_km, last_service_date, next_due_km, next_due_date)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	result, err := r.db.Exec(query,
		rem.VehicleID, rem.ServiceType, rem.KMInterval, rem.DateIntervalDays,
		rem.LastServiceKM, rem.LastServiceDate, rem.NextDueKM, rem.NextDueDate,
	)
	if err != nil {
		return err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	rem.ID = id
	return nil
}

func (r *reminderRepository) GetByVehicleID(vehicleID int64) ([]domain.Reminder, error) {
	query := `SELECT id, vehicle_id, service_type, km_interval, date_interval_days,
		last_service_km, last_service_date, next_due_km, next_due_date, created_at, updated_at
		FROM reminders WHERE vehicle_id = ? ORDER BY next_due_date ASC`
	rows, err := r.db.Query(query, vehicleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reminders []domain.Reminder
	for rows.Next() {
		var rem domain.Reminder
		if err := rows.Scan(
			&rem.ID, &rem.VehicleID, &rem.ServiceType, &rem.KMInterval, &rem.DateIntervalDays,
			&rem.LastServiceKM, &rem.LastServiceDate, &rem.NextDueKM, &rem.NextDueDate,
			&rem.CreatedAt, &rem.UpdatedAt,
		); err != nil {
			return nil, err
		}
		reminders = append(reminders, rem)
	}
	return reminders, rows.Err()
}

func (r *reminderRepository) Update(rem *domain.Reminder) error {
	query := `UPDATE reminders SET km_interval = ?, date_interval_days = ?,
		last_service_km = ?, last_service_date = ?, next_due_km = ?, next_due_date = ?
		WHERE id = ?`
	result, err := r.db.Exec(query,
		rem.KMInterval, rem.DateIntervalDays,
		rem.LastServiceKM, rem.LastServiceDate, rem.NextDueKM, rem.NextDueDate,
		rem.ID,
	)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return domain.ErrNotFound
	}
	return nil
}

type serviceRecordRepository struct {
	db *sql.DB
}

func NewServiceRecordRepository(db *sql.DB) domain.ServiceRecordRepository {
	return &serviceRecordRepository{db: db}
}

func (r *serviceRecordRepository) Create(rec *domain.ServiceRecord) error {
	query := `INSERT INTO service_records (vehicle_id, service_type, description, mileage_at_service, serviced_at) VALUES (?, ?, ?, ?, ?)`
	result, err := r.db.Exec(query, rec.VehicleID, rec.ServiceType, rec.Description, rec.MileageAtService, rec.ServicedAt)
	if err != nil {
		return err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	rec.ID = id
	return nil
}

func (r *serviceRecordRepository) GetByVehicleID(vehicleID int64, params domain.PaginationParams) ([]domain.ServiceRecord, int64, error) {
	var total int64
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM service_records WHERE vehicle_id = ?`, vehicleID).Scan(&total); err != nil {
		return nil, 0, err
	}

	query := `SELECT id, vehicle_id, service_type, description, mileage_at_service, serviced_at, created_at
		FROM service_records WHERE vehicle_id = ? ORDER BY serviced_at DESC LIMIT ? OFFSET ?`
	rows, err := r.db.Query(query, vehicleID, params.Limit, params.Offset())
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var records []domain.ServiceRecord
	for rows.Next() {
		var rec domain.ServiceRecord
		if err := rows.Scan(
			&rec.ID, &rec.VehicleID, &rec.ServiceType, &rec.Description,
			&rec.MileageAtService, &rec.ServicedAt, &rec.CreatedAt,
		); err != nil {
			return nil, 0, err
		}
		records = append(records, rec)
	}
	return records, total, rows.Err()
}
