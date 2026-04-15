CREATE TABLE IF NOT EXISTS users (
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    email      VARCHAR(255) NULL,
    phone      VARCHAR(20)  NULL,
    password   VARCHAR(255) NOT NULL,
    name       VARCHAR(100) NOT NULL,
    role       ENUM('user', 'admin') NOT NULL DEFAULT 'user',
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email),
    UNIQUE KEY uq_users_phone (phone),
    INDEX idx_users_email (email),
    INDEX idx_users_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehicles (
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    user_id    BIGINT       NOT NULL,
    name       VARCHAR(100) NOT NULL,
    type       ENUM('motorcycle', 'car') NOT NULL,
    brand      VARCHAR(100) NOT NULL,
    year       INT          NOT NULL,
    fuel_level INT          NOT NULL DEFAULT 100,
    notes      TEXT         NULL,
    status     ENUM('good', 'warning', 'critical') NOT NULL DEFAULT 'good',
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_vehicles_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mileage_logs (
    id         BIGINT    NOT NULL AUTO_INCREMENT,
    vehicle_id BIGINT    NOT NULL,
    mileage    INT       NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_mileage_vehicle_created (vehicle_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_records (
    id                 BIGINT                NOT NULL AUTO_INCREMENT,
    vehicle_id         BIGINT                NOT NULL,
    service_type       ENUM('light', 'heavy') NOT NULL,
    description        TEXT                  NULL,
    mileage_at_service INT                   NOT NULL DEFAULT 0,
    serviced_at        TIMESTAMP             NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at         TIMESTAMP             NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_service_records_vehicle_id (vehicle_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reminders (
    id                 BIGINT                 NOT NULL AUTO_INCREMENT,
    vehicle_id         BIGINT                 NOT NULL,
    service_type       ENUM('light', 'heavy') NOT NULL,
    km_interval        INT                    NOT NULL DEFAULT 0,
    date_interval_days INT                    NOT NULL DEFAULT 0,
    last_service_km    INT                    NOT NULL DEFAULT 0,
    last_service_date  TIMESTAMP              NULL,
    next_due_km        INT                    NOT NULL DEFAULT 0,
    next_due_date      TIMESTAMP              NULL,
    created_at         TIMESTAMP              NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP              NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_reminders_vehicle_due (vehicle_id, next_due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default admin (password: admin123, bcrypt hash)
INSERT INTO users (email, name, password, role)
VALUES (
    'admin@example.com',
    'Admin',
    '$2y$10$jkf3TPaZelTB1p7J6.BskOsYM/gUZp2JAuMBvg0nnky230upSShZ6',
    'admin'
);
