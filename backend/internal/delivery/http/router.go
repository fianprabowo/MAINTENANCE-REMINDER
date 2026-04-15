package http

import (
	"github.com/labstack/echo/v4"
	echoMiddleware "github.com/labstack/echo/v4/middleware"
	"github.com/tiketcom/maintenance-reminder/internal/delivery/http/handler"
	"github.com/tiketcom/maintenance-reminder/internal/delivery/http/middleware"
)

type Router struct {
	echo            *echo.Echo
	authHandler     *handler.AuthHandler
	vehicleHandler  *handler.VehicleHandler
	mileageHandler  *handler.MileageHandler
	reminderHandler *handler.ReminderHandler
	jwtMiddleware   *middleware.JWTMiddleware
}

func NewRouter(
	e *echo.Echo,
	authHandler *handler.AuthHandler,
	vehicleHandler *handler.VehicleHandler,
	mileageHandler *handler.MileageHandler,
	reminderHandler *handler.ReminderHandler,
	jwtMiddleware *middleware.JWTMiddleware,
) *Router {
	return &Router{
		echo:            e,
		authHandler:     authHandler,
		vehicleHandler:  vehicleHandler,
		mileageHandler:  mileageHandler,
		reminderHandler: reminderHandler,
		jwtMiddleware:   jwtMiddleware,
	}
}

func (r *Router) Setup() {
	r.echo.Use(echoMiddleware.Recover())
	r.echo.Use(echoMiddleware.CORSWithConfig(echoMiddleware.CORSConfig{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders: []string{"Origin", "Content-Type", "Accept", "Authorization"},
	}))
	r.echo.Use(middleware.RequestLogger)

	api := r.echo.Group("/api")

	auth := api.Group("/auth")
	auth.POST("/register", r.authHandler.Register)
	auth.POST("/login", r.authHandler.Login)
	auth.GET("/profile", r.authHandler.Profile, r.jwtMiddleware.Handle)

	vehicles := api.Group("/vehicles", r.jwtMiddleware.Handle)
	vehicles.GET("", r.vehicleHandler.List)
	vehicles.POST("", r.vehicleHandler.Create)
	vehicles.GET("/:id", r.vehicleHandler.GetDetail)
	vehicles.PUT("/:id", r.vehicleHandler.Update)
	vehicles.DELETE("/:id", r.vehicleHandler.Delete)
	vehicles.POST("/:id/mileage", r.mileageHandler.Add)
	vehicles.GET("/:id/history", r.mileageHandler.GetHistory)
	vehicles.POST("/:id/reminder", r.reminderHandler.Create)
	vehicles.GET("/:id/reminders", r.reminderHandler.List)
}
