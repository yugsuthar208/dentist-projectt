-- ============================================================
-- DATABASE SETUP FILE FOR DENTAL CLINIC PROJECT
-- Run this file in MySQL Workbench or phpMyAdmin
-- ============================================================

-- Step 1: Create the database
CREATE DATABASE IF NOT EXISTS dental_clinic;

-- Step 2: Select the database
USE dental_clinic;

-- Step 3: Create Users table (for login/signup)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Step 4: Create Patients table (linked to user)
CREATE TABLE IF NOT EXISTS patients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    patient_id VARCHAR(10) NOT NULL,
    name VARCHAR(100) NOT NULL,
    mobile VARCHAR(15) NOT NULL,
    email VARCHAR(100) DEFAULT '',
    age INT NOT NULL,
    gender VARCHAR(10) NOT NULL,
    address TEXT NOT NULL,
    problem TEXT NOT NULL,
    visit_date DATE NOT NULL,
    is_uploaded TINYINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Step 5: Create Treatments table (linked to user)
CREATE TABLE IF NOT EXISTS treatments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    patient_name VARCHAR(100) NOT NULL,
    treatment_name VARCHAR(200) NOT NULL,
    step_completed VARCHAR(200) NOT NULL,
    remaining_steps INT NOT NULL,
    next_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Step 6: Create Prescriptions table (linked to user)
CREATE TABLE IF NOT EXISTS prescriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    patient_name VARCHAR(100) NOT NULL,
    treatment_given VARCHAR(200) NOT NULL,
    medicines TEXT NOT NULL,
    notes TEXT,
    date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Step 7: Create Bills table (linked to user)
CREATE TABLE IF NOT EXISTS bills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    patient_name VARCHAR(100) NOT NULL,
    treatment VARCHAR(200) NOT NULL,
    total_cost DECIMAL(10, 2) NOT NULL,
    amount_paid DECIMAL(10, 2) NOT NULL,
    remaining_amount DECIMAL(10, 2) NOT NULL,
    payment_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================================
-- MIGRATION: If tables already exist, run these to add user_id:
-- ============================================================
-- ALTER TABLE patients ADD COLUMN user_id INT NOT NULL DEFAULT 1 AFTER id;
-- ALTER TABLE treatments ADD COLUMN user_id INT NOT NULL DEFAULT 1 AFTER id;
-- ALTER TABLE prescriptions ADD COLUMN user_id INT NOT NULL DEFAULT 1 AFTER id;
-- ALTER TABLE bills ADD COLUMN user_id INT NOT NULL DEFAULT 1 AFTER id;
-- ============================================================

-- ============================================================
-- DONE! All 5 tables have been created successfully.
-- ============================================================
