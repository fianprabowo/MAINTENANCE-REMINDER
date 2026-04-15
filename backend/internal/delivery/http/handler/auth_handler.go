package handler

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"github.com/tiketcom/maintenance-reminder/internal/usecase"
	"github.com/tiketcom/maintenance-reminder/pkg/response"
)

type AuthHandler struct {
	authUsecase *usecase.AuthUsecase
}

func NewAuthHandler(authUsecase *usecase.AuthUsecase) *AuthHandler {
	return &AuthHandler{authUsecase: authUsecase}
}

func (h *AuthHandler) Register(c echo.Context) error {
	var input usecase.RegisterInput
	if err := c.Bind(&input); err != nil {
		return response.Error(c, http.StatusBadRequest, "invalid request body")
	}
	input.Name = strings.TrimSpace(input.Name)
	input.Email = emptyStringPtrToNil(input.Email)
	input.Phone = emptyStringPtrToNil(input.Phone)
	if err := c.Validate(&input); err != nil {
		return err
	}

	result, err := h.authUsecase.Register(input)
	if err != nil {
		return response.FromDomainError(c, err)
	}

	return response.Success(c, http.StatusCreated, "registration successful", result)
}

func (h *AuthHandler) Login(c echo.Context) error {
	var input usecase.LoginInput
	if err := c.Bind(&input); err != nil {
		return response.Error(c, http.StatusBadRequest, "invalid request body")
	}
	input.Email = emptyStringPtrToNil(input.Email)
	input.Phone = emptyStringPtrToNil(input.Phone)
	if err := c.Validate(&input); err != nil {
		return err
	}

	result, err := h.authUsecase.Login(input)
	if err != nil {
		return response.FromDomainError(c, err)
	}

	return response.Success(c, http.StatusOK, "login successful", result)
}

func (h *AuthHandler) Profile(c echo.Context) error {
	userID := c.Get("user_id").(int64)

	user, err := h.authUsecase.GetProfile(userID)
	if err != nil {
		return response.FromDomainError(c, err)
	}

	return response.Success(c, http.StatusOK, "profile retrieved", user)
}

func emptyStringPtrToNil(p *string) *string {
	if p == nil {
		return nil
	}
	s := strings.TrimSpace(*p)
	if s == "" {
		return nil
	}
	return &s
}
