package domain

import "errors"

type PaginationParams struct {
	Page  int `json:"page"`
	Limit int `json:"limit"`
}

type PaginationMeta struct {
	Page       int   `json:"page"`
	Limit      int   `json:"limit"`
	TotalItems int64 `json:"total_items"`
	TotalPages int64 `json:"total_pages"`
}

func NewPaginationParams(page, limit int) PaginationParams {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 10
	}
	return PaginationParams{Page: page, Limit: limit}
}

func (p PaginationParams) Offset() int {
	return (p.Page - 1) * p.Limit
}

var (
	ErrNotFound             = errors.New("resource not found")
	ErrDuplicateEmail       = errors.New("email already registered")
	ErrDuplicatePhone       = errors.New("phone already registered")
	ErrInvalidCredential    = errors.New("invalid email/phone or password")
	ErrUnauthorized         = errors.New("unauthorized")
	ErrForbidden            = errors.New("forbidden")
	ErrMileageMustIncrease  = errors.New("mileage must be greater than or equal to the latest recorded value")
	ErrEmailOrPhoneRequired = errors.New("email or phone is required")
)
