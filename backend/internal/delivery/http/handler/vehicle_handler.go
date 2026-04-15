package handler

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/tiketcom/maintenance-reminder/internal/domain"
	"github.com/tiketcom/maintenance-reminder/internal/usecase"
	"github.com/tiketcom/maintenance-reminder/pkg/response"
)

type VehicleHandler struct {
	vehicleUsecase *usecase.VehicleUsecase
}

func NewVehicleHandler(vehicleUsecase *usecase.VehicleUsecase) *VehicleHandler {
	return &VehicleHandler{vehicleUsecase: vehicleUsecase}
}

func (h *VehicleHandler) Create(c echo.Context) error {
	userID := c.Get("user_id").(int64)

	var input usecase.CreateVehicleInput
	if err := c.Bind(&input); err != nil {
		return response.Error(c, http.StatusBadRequest, "invalid request body")
	}
	if err := c.Validate(&input); err != nil {
		return err
	}

	vehicle, err := h.vehicleUsecase.Create(userID, input)
	if err != nil {
		return response.FromDomainError(c, err)
	}

	return response.Success(c, http.StatusCreated, "vehicle created", vehicle)
}

func (h *VehicleHandler) List(c echo.Context) error {
	userID := c.Get("user_id").(int64)
	page, _ := strconv.Atoi(c.QueryParam("page"))
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	params := domain.NewPaginationParams(page, limit)

	vehicles, total, err := h.vehicleUsecase.GetByUserID(userID, params)
	if err != nil {
		return response.FromDomainError(c, err)
	}

	totalPages := total / int64(params.Limit)
	if total%int64(params.Limit) != 0 {
		totalPages++
	}

	meta := domain.PaginationMeta{
		Page:       params.Page,
		Limit:      params.Limit,
		TotalItems: total,
		TotalPages: totalPages,
	}

	return response.SuccessWithMeta(c, http.StatusOK, "vehicles retrieved", vehicles, meta)
}

func (h *VehicleHandler) GetDetail(c echo.Context) error {
	userID := c.Get("user_id").(int64)
	vehicleID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return response.Error(c, http.StatusBadRequest, "invalid vehicle id")
	}

	detail, err := h.vehicleUsecase.GetDetail(vehicleID, userID)
	if err != nil {
		return response.FromDomainError(c, err)
	}

	return response.Success(c, http.StatusOK, "vehicle detail retrieved", detail)
}

func (h *VehicleHandler) Update(c echo.Context) error {
	userID := c.Get("user_id").(int64)
	vehicleID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return response.Error(c, http.StatusBadRequest, "invalid vehicle id")
	}

	var input usecase.UpdateVehicleInput
	if err := c.Bind(&input); err != nil {
		return response.Error(c, http.StatusBadRequest, "invalid request body")
	}
	if err := c.Validate(&input); err != nil {
		return err
	}

	vehicle, err := h.vehicleUsecase.Update(vehicleID, userID, input)
	if err != nil {
		return response.FromDomainError(c, err)
	}

	return response.Success(c, http.StatusOK, "vehicle updated", vehicle)
}

func (h *VehicleHandler) Delete(c echo.Context) error {
	userID := c.Get("user_id").(int64)
	vehicleID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return response.Error(c, http.StatusBadRequest, "invalid vehicle id")
	}

	if err := h.vehicleUsecase.Delete(vehicleID, userID); err != nil {
		return response.FromDomainError(c, err)
	}

	return response.Success(c, http.StatusOK, "vehicle deleted", nil)
}
