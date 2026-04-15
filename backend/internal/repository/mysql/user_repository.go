package mysql

import (
	"database/sql"
	"strings"

	"github.com/tiketcom/maintenance-reminder/internal/domain"
)

type userRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) domain.UserRepository {
	return &userRepository{db: db}
}

func (r *userRepository) Create(user *domain.User) error {
	query := `INSERT INTO users (email, phone, password, name, role) VALUES (?, ?, ?, ?, ?)`
	result, err := r.db.Exec(query, user.Email, user.Phone, user.Password, user.Name, user.Role)
	if err != nil {
		if strings.Contains(err.Error(), "uq_users_email") {
			return domain.ErrDuplicateEmail
		}
		if strings.Contains(err.Error(), "uq_users_phone") {
			return domain.ErrDuplicatePhone
		}
		return err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	user.ID = id
	return r.db.QueryRow(
		`SELECT created_at, updated_at FROM users WHERE id = ?`, user.ID,
	).Scan(&user.CreatedAt, &user.UpdatedAt)
}

func (r *userRepository) GetByID(id int64) (*domain.User, error) {
	query := `SELECT id, email, phone, password, name, role, created_at, updated_at FROM users WHERE id = ?`
	user := &domain.User{}
	err := r.db.QueryRow(query, id).Scan(
		&user.ID, &user.Email, &user.Phone, &user.Password,
		&user.Name, &user.Role, &user.CreatedAt, &user.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, domain.ErrNotFound
	}
	return user, err
}

func (r *userRepository) GetByEmail(email string) (*domain.User, error) {
	query := `SELECT id, email, phone, password, name, role, created_at, updated_at FROM users WHERE email = ?`
	user := &domain.User{}
	err := r.db.QueryRow(query, email).Scan(
		&user.ID, &user.Email, &user.Phone, &user.Password,
		&user.Name, &user.Role, &user.CreatedAt, &user.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, domain.ErrNotFound
	}
	return user, err
}

func (r *userRepository) GetByPhone(phone string) (*domain.User, error) {
	query := `SELECT id, email, phone, password, name, role, created_at, updated_at FROM users WHERE phone = ?`
	user := &domain.User{}
	err := r.db.QueryRow(query, phone).Scan(
		&user.ID, &user.Email, &user.Phone, &user.Password,
		&user.Name, &user.Role, &user.CreatedAt, &user.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, domain.ErrNotFound
	}
	return user, err
}
