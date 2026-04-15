package mysql

import (
	"database/sql"

	"github.com/tiketcom/maintenance-reminder/internal/domain"
)

type mileageRepository struct {
	db *sql.DB
}

func NewMileageRepository(db *sql.DB) domain.MileageRepository {
	return &mileageRepository{db: db}
}

func (r *mileageRepository) Create(log *domain.MileageLog) error {
	query := `INSERT INTO mileage_logs (vehicle_id, mileage) VALUES (?, ?)`
	result, err := r.db.Exec(query, log.VehicleID, log.Mileage)
	if err != nil {
		return err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	log.ID = id
	return r.db.QueryRow(
		`SELECT created_at FROM mileage_logs WHERE id = ?`, log.ID,
	).Scan(&log.CreatedAt)
}

func (r *mileageRepository) GetLatestByVehicleID(vehicleID int64) (*domain.MileageLog, error) {
	query := `SELECT id, vehicle_id, mileage, created_at FROM mileage_logs WHERE vehicle_id = ? ORDER BY created_at DESC LIMIT 1`
	log := &domain.MileageLog{}
	err := r.db.QueryRow(query, vehicleID).Scan(&log.ID, &log.VehicleID, &log.Mileage, &log.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, domain.ErrNotFound
	}
	return log, err
}

func (r *mileageRepository) GetByVehicleID(vehicleID int64, params domain.PaginationParams) ([]domain.MileageLog, int64, error) {
	var total int64
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM mileage_logs WHERE vehicle_id = ?`, vehicleID).Scan(&total); err != nil {
		return nil, 0, err
	}

	query := `SELECT id, vehicle_id, mileage, created_at FROM mileage_logs
		WHERE vehicle_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
	rows, err := r.db.Query(query, vehicleID, params.Limit, params.Offset())
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var logs []domain.MileageLog
	for rows.Next() {
		var l domain.MileageLog
		if err := rows.Scan(&l.ID, &l.VehicleID, &l.Mileage, &l.CreatedAt); err != nil {
			return nil, 0, err
		}
		logs = append(logs, l)
	}
	return logs, total, rows.Err()
}
