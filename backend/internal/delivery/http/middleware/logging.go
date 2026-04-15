package middleware

import (
	"log"
	"time"

	"github.com/labstack/echo/v4"
)

func RequestLogger(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		start := time.Now()
		err := next(c)
		latency := time.Since(start)

		log.Printf("[%s] %s %s | %d | %v",
			c.Request().Method,
			c.Request().URL.Path,
			c.RealIP(),
			c.Response().Status,
			latency,
		)

		return err
	}
}
