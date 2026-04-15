package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/labstack/echo/v4"

	delivery "github.com/tiketcom/maintenance-reminder/internal/delivery/http"
	"github.com/tiketcom/maintenance-reminder/internal/delivery/http/handler"
	"github.com/tiketcom/maintenance-reminder/internal/delivery/http/middleware"
	mysqlRepo "github.com/tiketcom/maintenance-reminder/internal/repository/mysql"
	"github.com/tiketcom/maintenance-reminder/internal/usecase"
	"github.com/tiketcom/maintenance-reminder/pkg/config"
	"github.com/tiketcom/maintenance-reminder/pkg/validator"
)

func main() {
	cfg := config.Load()

	db, err := connectDB(cfg)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer db.Close()

	userRepo := mysqlRepo.NewUserRepository(db)
	vehicleRepo := mysqlRepo.NewVehicleRepository(db)
	mileageRepo := mysqlRepo.NewMileageRepository(db)
	reminderRepo := mysqlRepo.NewReminderRepository(db)
	serviceRecordRepo := mysqlRepo.NewServiceRecordRepository(db)
	_ = serviceRecordRepo

	authUsecase := usecase.NewAuthUsecase(userRepo, cfg.JWTSecret, cfg.JWTExpiry)
	vehicleUsecase := usecase.NewVehicleUsecase(vehicleRepo, mileageRepo, reminderRepo)
	mileageUsecase := usecase.NewMileageUsecase(mileageRepo, vehicleRepo)
	reminderUsecase := usecase.NewReminderUsecase(reminderRepo, vehicleRepo, mileageRepo)

	authHandler := handler.NewAuthHandler(authUsecase)
	vehicleHandler := handler.NewVehicleHandler(vehicleUsecase)
	mileageHandler := handler.NewMileageHandler(mileageUsecase)
	reminderHandler := handler.NewReminderHandler(reminderUsecase)

	jwtMiddleware := middleware.NewJWTMiddleware(cfg.JWTSecret)

	e := echo.New()
	e.Validator = validator.New()

	router := delivery.NewRouter(e, authHandler, vehicleHandler, mileageHandler, reminderHandler, jwtMiddleware)
	router.Setup()

	go func() {
		addr := fmt.Sprintf(":%s", cfg.AppPort)
		log.Printf("server starting on %s", addr)
		if err := e.Start(addr); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt)
	<-quit

	log.Println("shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := e.Shutdown(ctx); err != nil {
		log.Fatalf("server forced to shutdown: %v", err)
	}
	log.Println("server stopped")
}

func connectDB(cfg *config.Config) (*sql.DB, error) {
	var db *sql.DB
	var err error

	for i := 0; i < 30; i++ {
		db, err = sql.Open("mysql", cfg.DSN())
		if err != nil {
			log.Printf("attempt %d: failed to open db: %v", i+1, err)
			time.Sleep(2 * time.Second)
			continue
		}
		if err = db.Ping(); err != nil {
			log.Printf("attempt %d: failed to ping db: %v", i+1, err)
			time.Sleep(2 * time.Second)
			continue
		}
		break
	}
	if err != nil {
		return nil, err
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	log.Println("database connected successfully")
	return db, nil
}
