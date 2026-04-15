package response

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/tiketcom/maintenance-reminder/internal/domain"
)

type Response struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
	Meta    interface{} `json:"meta,omitempty"`
}

func Success(c echo.Context, code int, message string, data interface{}) error {
	return c.JSON(code, Response{
		Success: true,
		Message: message,
		Data:    data,
	})
}

func SuccessWithMeta(c echo.Context, code int, message string, data interface{}, meta interface{}) error {
	return c.JSON(code, Response{
		Success: true,
		Message: message,
		Data:    data,
		Meta:    meta,
	})
}

func Error(c echo.Context, code int, message string) error {
	return c.JSON(code, Response{
		Success: false,
		Message: message,
	})
}

func FromDomainError(c echo.Context, err error) error {
	switch err {
	case domain.ErrNotFound:
		return Error(c, http.StatusNotFound, err.Error())
	case domain.ErrDuplicateEmail, domain.ErrDuplicatePhone:
		return Error(c, http.StatusConflict, err.Error())
	case domain.ErrInvalidCredential:
		return Error(c, http.StatusUnauthorized, err.Error())
	case domain.ErrUnauthorized:
		return Error(c, http.StatusUnauthorized, err.Error())
	case domain.ErrForbidden:
		return Error(c, http.StatusForbidden, err.Error())
	case domain.ErrMileageMustIncrease:
		return Error(c, http.StatusBadRequest, err.Error())
	case domain.ErrEmailOrPhoneRequired:
		return Error(c, http.StatusBadRequest, err.Error())
	default:
		return Error(c, http.StatusInternalServerError, "internal server error")
	}
}
