package handler

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/tiketcom/maintenance-reminder/internal/usecase"
	"github.com/tiketcom/maintenance-reminder/pkg/response"
)

type ReminderHandler struct {
	reminderUsecase *usecase.ReminderUsecase
}

func NewReminderHandler(reminderUsecase *usecase.ReminderUsecase) *ReminderHandler {
	return &ReminderHandler{reminderUsecase: reminderUsecase}
}

func (h *ReminderHandler) Create(c echo.Context) error {
	userID := c.Get("user_id").(int64)
	vehicleID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return response.Error(c, http.StatusBadRequest, "invalid vehicle id")
	}

	var input usecase.CreateReminderInput
	if err := c.Bind(&input); err != nil {
		return response.Error(c, http.StatusBadRequest, "invalid request body")
	}
	if err := c.Validate(&input); err != nil {
		return err
	}

	reminder, err := h.reminderUsecase.Create(vehicleID, userID, input)
	if err != nil {
		return response.FromDomainError(c, err)
	}

	return response.Success(c, http.StatusCreated, "reminder created", reminder)
}

func (h *ReminderHandler) List(c echo.Context) error {
	userID := c.Get("user_id").(int64)
	vehicleID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return response.Error(c, http.StatusBadRequest, "invalid vehicle id")
	}

	reminders, err := h.reminderUsecase.GetByVehicleID(vehicleID, userID)
	if err != nil {
		return response.FromDomainError(c, err)
	}

	return response.Success(c, http.StatusOK, "reminders retrieved", reminders)
}
