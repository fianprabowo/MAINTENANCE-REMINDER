package validator

import (
	"net/http"

	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"
)

type CustomValidator struct {
	validator *validator.Validate
}

func New() *CustomValidator {
	return &CustomValidator{validator: validator.New()}
}

func (cv *CustomValidator) Validate(i interface{}) error {
	if err := cv.validator.Struct(i); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, formatErrors(err))
	}
	return nil
}

func formatErrors(err error) string {
	if ve, ok := err.(validator.ValidationErrors); ok {
		for _, fe := range ve {
			return fe.Field() + " is " + fe.Tag()
		}
	}
	return err.Error()
}
