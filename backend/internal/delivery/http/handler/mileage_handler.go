package handler

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/tiketcom/maintenance-reminder/internal/domain"
	"github.com/tiketcom/maintenance-reminder/internal/usecase"
	"github.com/tiketcom/maintenance-reminder/pkg/response"
)

type MileageHandler struct {
	mileageUsecase *usecase.MileageUsecase
}

func NewMileageHandler(mileageUsecase *usecase.MileageUsecase) *MileageHandler {
	return &MileageHandler{mileageUsecase: mileageUsecase}
}

func (h *MileageHandler) Add(c echo.Context) error {
	userID := c.Get("user_id").(int64)
	vehicleID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return response.Error(c, http.StatusBadRequest, "invalid vehicle id")
	}

	var input usecase.AddMileageInput
	if err := c.Bind(&input); err != nil {
		return response.Error(c, http.StatusBadRequest, "invalid request body")
	}
	if err := c.Validate(&input); err != nil {
		return err
	}

	log, err := h.mileageUsecase.Add(vehicleID, userID, input)
	if err != nil {
		return response.FromDomainError(c, err)
	}

	return response.Success(c, http.StatusCreated, "mileage recorded", log)
}

func (h *MileageHandler) GetHistory(c echo.Context) error {
	userID := c.Get("user_id").(int64)
	vehicleID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		return response.Error(c, http.StatusBadRequest, "invalid vehicle id")
	}

	page, _ := strconv.Atoi(c.QueryParam("page"))
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	params := domain.NewPaginationParams(page, limit)

	logs, total, err := h.mileageUsecase.GetHistory(vehicleID, userID, params)
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

	return response.SuccessWithMeta(c, http.StatusOK, "mileage history retrieved", logs, meta)
}
