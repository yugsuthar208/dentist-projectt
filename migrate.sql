USE dental_clinic;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dental_clinic' AND TABLE_NAME = 'patients' AND COLUMN_NAME = 'user_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE patients ADD COLUMN user_id INT NOT NULL DEFAULT 1 AFTER id', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dental_clinic' AND TABLE_NAME = 'treatments' AND COLUMN_NAME = 'user_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE treatments ADD COLUMN user_id INT NOT NULL DEFAULT 1 AFTER id', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dental_clinic' AND TABLE_NAME = 'prescriptions' AND COLUMN_NAME = 'user_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE prescriptions ADD COLUMN user_id INT NOT NULL DEFAULT 1 AFTER id', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dental_clinic' AND TABLE_NAME = 'bills' AND COLUMN_NAME = 'user_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE bills ADD COLUMN user_id INT NOT NULL DEFAULT 1 AFTER id', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'Migration completed successfully!' AS result;
