package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	AppPort       string
	MySQLHost     string
	MySQLPort     string
	MySQLDatabase string
	MySQLUser     string
	MySQLPassword string
	JWTSecret     string
	JWTExpiry     int
}

func Load() *Config {
	return &Config{
		AppPort:       getEnv("APP_PORT", "8080"),
		MySQLHost:     getEnv("MYSQL_HOST", "localhost"),
		MySQLPort:     getEnv("MYSQL_PORT", "3306"),
		MySQLDatabase: getEnv("MYSQL_DATABASE", "maintenance_reminder"),
		MySQLUser:     getEnv("MYSQL_USER", "appuser"),
		MySQLPassword: getEnv("MYSQL_PASSWORD", "apppassword"),
		JWTSecret:     getEnv("JWT_SECRET", "change-me-to-a-strong-secret"),
		JWTExpiry:     getEnvInt("JWT_EXPIRY_HOURS", 72),
	}
}

func (c *Config) DSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&loc=Local",
		c.MySQLUser, c.MySQLPassword, c.MySQLHost, c.MySQLPort, c.MySQLDatabase)
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if val := os.Getenv(key); val != "" {
		if i, err := strconv.Atoi(val); err == nil {
			return i
		}
	}
	return fallback
}
