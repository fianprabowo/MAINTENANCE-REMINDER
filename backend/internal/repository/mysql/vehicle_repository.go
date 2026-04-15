package mysql

import (
	"database/sql"

	"github.com/tiketcom/maintenance-reminder/internal/domain"
)

type vehicleRepository struct {
	db *sql.DB
}

func NewVehicleRepository(db *sql.DB) domain.VehicleRepository {
	return &vehicleRepository{db: db}
}

func (r *vehicleRepository) Create(v *domain.Vehicle) error {
	query := `INSERT INTO vehicles (user_id, name, type, brand, year, fuel_level, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	result, err := r.db.Exec(query, v.UserID, v.Name, v.Type, v.Brand, v.Year, v.FuelLevel, v.Notes, v.Status)
	if err != nil {
		return err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	v.ID = id
	return r.db.QueryRow(
		`SELECT created_at, updated_at FROM vehicles WHERE id = ?`, v.ID,
	).Scan(&v.CreatedAt, &v.UpdatedAt)
}

func (r *vehicleRepository) GetByID(id int64) (*domain.Vehicle, error) {
	query := `SELECT id, user_id, name, type, brand, year, fuel_level, notes, status, created_at, updated_at FROM vehicles WHERE id = ?`
	v := &domain.Vehicle{}
	err := r.db.QueryRow(query, id).Scan(
		&v.ID, &v.UserID, &v.Name, &v.Type, &v.Brand, &v.Year,
		&v.FuelLevel, &v.Notes, &v.Status, &v.CreatedAt, &v.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, domain.ErrNotFound
	}
	return v, err
}

func (r *vehicleRepository) GetByUserID(userID int64, params domain.PaginationParams) ([]domain.Vehicle, int64, error) {
	var total int64
	countQuery := `SELECT COUNT(*) FROM vehicles WHERE user_id = ?`
	if err := r.db.QueryRow(countQuery, userID).Scan(&total); err != nil {
		return nil, 0, err
	}

	query := `SELECT id, user_id, name, type, brand, year, fuel_level, notes, status, created_at, updated_at
		FROM vehicles WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
	rows, err := r.db.Query(query, userID, params.Limit, params.Offset())
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var vehicles []domain.Vehicle
	for rows.Next() {
		var v domain.Vehicle
		if err := rows.Scan(
			&v.ID, &v.UserID, &v.Name, &v.Type, &v.Brand, &v.Year,
			&v.FuelLevel, &v.Notes, &v.Status, &v.CreatedAt, &v.UpdatedAt,
		); err != nil {
			return nil, 0, err
		}
		vehicles = append(vehicles, v)
	}
	return vehicles, total, rows.Err()
}

func (r *vehicleRepository) Update(v *domain.Vehicle) error {
	query := `UPDATE vehicles SET name = ?, type = ?, brand = ?, year = ?, fuel_level = ?, notes = ?, status = ? WHERE id = ?`
	result, err := r.db.Exec(query, v.Name, v.Type, v.Brand, v.Year, v.FuelLevel, v.Notes, v.Status, v.ID)
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

func (r *vehicleRepository) Delete(id int64) error {
	result, err := r.db.Exec(`DELETE FROM vehicles WHERE id = ?`, id)
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
