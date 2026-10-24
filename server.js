// server.js - Node.js Backend Server for Dental Clinic
// This file connects your website to MySQL database
// Now includes Authentication, Multi-Tenant Data Isolation, and Appointment Reminders

// Step 1: Import required packages
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");
const nodemailer = require("nodemailer");
const cron = require("node-cron");
const notifyConfig = require("./notification-config");
const https = require("https");

// Step 2: Create Express app
const app = express();
const PORT = 3000;

// Step 3: Middleware setup
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (same-origin, file://, etc)
        callback(null, true);
    },
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

// Session middleware (keeps users logged in)
app.use(session({
    secret: process.env.SESSION_SECRET || require("crypto").randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: "lax",
        httpOnly: true
    }
}));

// ============================================================
// Step 4: MySQL Database Connection
// IMPORTANT: Change these values to match YOUR MySQL setup
// ============================================================
const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "dental_clinic",
    timezone: "+05:30",      // IST — prevents date shifting (UTC vs IST)
    dateStrings: true        // Return DATE columns as plain strings, not JS Date objects
});

// Connect to MySQL
db.connect(function (err) {
    if (err) {
        console.error("Could not connect to MySQL!");
        console.error("Make sure MySQL is running and your password is correct.");
        console.error(err.message);
        return;
    }
    console.log("Connected to MySQL database!");

    // AUTO-MIGRATION: Create users table if it doesn't exist
    db.query(`CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, function (err) {
        if (err) {
            console.error("Error creating users table:", err.message);
        } else {
            console.log("users table ready.");
        }
    });

    // Add user_id column to existing tables if missing
    let tables = ["patients", "treatments", "prescriptions", "bills"];
    for (let i = 0; i < tables.length; i++) {
        let tableName = tables[i];
        db.query("SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'user_id'", [tableName], function (err, results) {
            if (err) return;
            if (results[0].cnt === 0) {
                db.query("ALTER TABLE " + tableName + " ADD COLUMN user_id INT NOT NULL DEFAULT 1 AFTER id", function (err) {
                    if (err) {
                        console.error("Error adding user_id to " + tableName + ":", err.message);
                    } else {
                        console.log("Added user_id to " + tableName);
                    }
                });
            }
        });
    }

    // Add patient_id column to treatments, prescriptions, bills tables if missing
    let linkedTables = ["treatments", "prescriptions", "bills"];
    for (let li = 0; li < linkedTables.length; li++) {
        (function(tableName) {
            db.query("SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'patient_id'", [tableName], function (err, results) {
                if (err) return;
                if (results[0].cnt === 0) {
                    db.query("ALTER TABLE " + tableName + " ADD COLUMN patient_id VARCHAR(10) DEFAULT '' AFTER user_id", function (err) {
                        if (err) { console.error("Error adding patient_id to " + tableName + ":", err.message); }
                        else { console.log("Added patient_id to " + tableName); }
                    });
                }
            });
        })(linkedTables[li]);
    }

    // Add email column to patients table if missing
    db.query("SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'patients' AND COLUMN_NAME = 'email'", function (err, results) {
        if (err) return;
        if (results[0].cnt === 0) {
            db.query("ALTER TABLE patients ADD COLUMN email VARCHAR(100) DEFAULT '' AFTER mobile", function (err) {
                if (err) {
                    console.error("Error adding email to patients:", err.message);
                } else {
                    console.log("Added email column to patients table.");
                }
            });
        }
    });

    // Create notifications_sent table to track sent reminders
    db.query(`CREATE TABLE IF NOT EXISTS notifications_sent (
        id INT AUTO_INCREMENT PRIMARY KEY,
        treatment_id INT NOT NULL,
        notification_date DATE NOT NULL,
        type VARCHAR(20) DEFAULT 'reminder',
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_notification (treatment_id, notification_date)
    )`, function (err) {
        if (err) {
            console.error("Error creating notifications_sent table:", err.message);
        } else {
            console.log("notifications_sent table ready.");
        }
    });

});

// ============================================================
// AUTHENTICATION MIDDLEWARE
// This blocks any API request if user is not logged in
// ============================================================
function requireLogin(req, res, next) {
    if (req.session && req.session.userId) {
        next(); // User is logged in, continue
    } else {
        console.log("AUTH BLOCKED: " + req.method + " " + req.url + " (no session userId)");
        res.status(401).json({ error: "Not logged in. Please login first." });
    }
}

// ============================================================
// AUTH ROUTES - Signup, Login, Logout
// ============================================================

// POST - Sign up a new user
app.post("/api/signup", function (req, res) {
    let data = req.body;

    if (!data.name || !data.email || !data.password) {
        res.status(400).json({ error: "Name, email and password are required!" });
        return;
    }

    if (data.password.length < 6) {
        res.status(400).json({ error: "Password must be at least 6 characters!" });
        return;
    }

    // Check if email already exists
    db.query("SELECT id FROM users WHERE email = ?", [data.email], function (err, results) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (results.length > 0) {
            res.status(400).json({ error: "This email is already registered! Please login instead." });
            return;
        }

        // Hash the password
        bcrypt.hash(data.password, 10, function (err, hashedPassword) {
            if (err) {
                res.status(500).json({ error: "Error creating account." });
                return;
            }

            let sql = "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";
            db.query(sql, [data.name, data.email, hashedPassword], function (err, result) {
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                res.json({ message: "Account created successfully! Please login now." });
            });
        });
    });
});

// POST - Login
app.post("/api/login", function (req, res) {
    let data = req.body;

    if (!data.email || !data.password) {
        res.status(400).json({ error: "Email and password are required!" });
        return;
    }

    db.query("SELECT * FROM users WHERE email = ?", [data.email], function (err, results) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (results.length === 0) {
            res.status(400).json({ error: "No account found with this email!" });
            return;
        }

        let user = results[0];

        // Compare password with hash
        bcrypt.compare(data.password, user.password, function (err, isMatch) {
            if (err) {
                res.status(500).json({ error: "Login error." });
                return;
            }
            if (!isMatch) {
                res.status(400).json({ error: "Wrong password!" });
                return;
            }

            // Save user info in session
            req.session.userId = user.id;
            req.session.userName = user.name;
            req.session.userEmail = user.email;

            res.json({
                message: "Login successful!",
                user: { name: user.name, email: user.email }
            });
        });
    });
});

// POST - Logout
app.post("/api/logout", function (req, res) {
    req.session.destroy(function (err) {
        res.json({ message: "Logged out successfully!" });
    });
});

// GET - Check if user is logged in
app.get("/api/auth/check", function (req, res) {
    if (req.session && req.session.userId) {
        res.json({
            loggedIn: true,
            user: { name: req.session.userName, email: req.session.userEmail }
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// ============================================================
// ALL ROUTES BELOW THIS LINE REQUIRE LOGIN
// ============================================================

// ---------- PATIENTS ----------

// GET all patients (only for this user)
app.get("/api/patients", requireLogin, function (req, res) {
    let sql = "SELECT id, user_id, patient_id, name, mobile, email, age, gender, address, problem, DATE_FORMAT(visit_date, '%Y-%m-%d') AS visit_date, DATE_FORMAT(created_at, '%Y-%m-%d') AS created_at FROM patients WHERE user_id = ? ORDER BY id DESC";
    db.query(sql, [req.session.userId], function (err, results) {
        if (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(results);
    });
});

// POST - Add new patient (linked to this user)
app.post("/api/patients", requireLogin, function (req, res) {
    let data = req.body;
    console.log("ADDING PATIENT: user_id=" + req.session.userId + ", patient_id=" + data.patient_id + ", name=" + data.name);
    let sql = "INSERT INTO patients (user_id, patient_id, name, mobile, email, age, gender, address, problem, visit_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    let values = [req.session.userId, data.patient_id, data.name, data.mobile, data.email || '', data.age, data.gender, data.address, data.problem, data.visit_date];

    db.query(sql, values, function (err, result) {
        if (err) {
            console.error("PATIENT INSERT ERROR:", err.message);
            res.status(500).json({ error: err.message });
            return;
        }
        console.log("PATIENT SAVED OK: id=" + result.insertId);
        res.json({ message: "Patient saved!", id: result.insertId });
    });
});

// GET - Get next patient ID (P001, P002, etc.) for this user
app.get("/api/patients/next-id", requireLogin, function (req, res) {
    let sql = "SELECT patient_id FROM patients WHERE user_id = ? ORDER BY id DESC LIMIT 1";
    db.query(sql, [req.session.userId], function (err, results) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (results.length === 0) {
            res.json({ nextId: "P001" });
        } else {
            let lastId = results[0].patient_id;
            let num = parseInt(lastId.substring(1)) + 1;
            let nextId = "P" + String(num).padStart(3, "0");
            res.json({ nextId: nextId });
        }
    });
});

// PUT - Update an existing patient by patient_id (only if owned by this user)
app.put("/api/patients/:patient_id", requireLogin, function (req, res) {
    let patientId = req.params.patient_id;
    let data = req.body;
    let oldName = data.old_name;
    let newName = data.name;

    let sql = "UPDATE patients SET name = ?, mobile = ?, email = ?, age = ?, gender = ?, address = ?, problem = ?, visit_date = ? WHERE patient_id = ? AND user_id = ?";
    let values = [newName, data.mobile, data.email || '', data.age, data.gender, data.address, data.problem, data.visit_date, patientId, req.session.userId];

    db.query(sql, values, function (err, result) {
        if (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
            return;
        }
        if (result.affectedRows === 0) {
            res.status(404).json({ error: "Patient not found!" });
            return;
        }

        // If the name was changed, update it in ALL related tables (for this user only)
        if (oldName && oldName !== newName) {
            db.query("UPDATE treatments SET patient_name = ? WHERE patient_name = ? AND user_id = ?", [newName, oldName, req.session.userId], function () { });
            db.query("UPDATE prescriptions SET patient_name = ? WHERE patient_name = ? AND user_id = ?", [newName, oldName, req.session.userId], function () { });
            db.query("UPDATE bills SET patient_name = ? WHERE patient_name = ? AND user_id = ?", [newName, oldName, req.session.userId], function () { });
            console.log("Name cascaded: '" + oldName + "' -> '" + newName + "' in all tables");
        }

        res.json({ message: "Patient updated successfully!" });
    });
});

// GET - Get single patient by patient_id (only if owned by this user)
app.get("/api/patients/:patient_id", requireLogin, function (req, res) {
    let sql = "SELECT id, user_id, patient_id, name, mobile, email, age, gender, address, problem, DATE_FORMAT(visit_date, '%Y-%m-%d') AS visit_date, DATE_FORMAT(created_at, '%Y-%m-%d') AS created_at FROM patients WHERE patient_id = ? AND user_id = ?";
    db.query(sql, [req.params.patient_id, req.session.userId], function (err, results) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (results.length === 0) {
            res.status(404).json({ error: "Patient not found!" });
            return;
        }
        res.json(results[0]);
    });
});

// DELETE - Delete a patient by patient_id (only if owned by this user)
app.delete("/api/patients/:patient_id", requireLogin, function (req, res) {
    let patientId = req.params.patient_id;

    // First get the patient name for cascading deletes
    db.query("SELECT name FROM patients WHERE patient_id = ? AND user_id = ?", [patientId, req.session.userId], function (err, results) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        let patientName = results.length > 0 ? results[0].name : null;

        // Delete the patient
        db.query("DELETE FROM patients WHERE patient_id = ? AND user_id = ?", [patientId, req.session.userId], function (err, result) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }

            // Also delete related records for this user
            if (patientName) {
                db.query("DELETE FROM treatments WHERE patient_name = ? AND user_id = ?", [patientName, req.session.userId], function () { });
                db.query("DELETE FROM prescriptions WHERE patient_name = ? AND user_id = ?", [patientName, req.session.userId], function () { });
                db.query("DELETE FROM bills WHERE patient_name = ? AND user_id = ?", [patientName, req.session.userId], function () { });
            }

            res.json({ message: "Patient deleted!" });
        });
    });
});

// ---------- TREATMENTS ----------

// GET all treatments (only for this user)
app.get("/api/treatments", requireLogin, function (req, res) {
    let sql = "SELECT id, user_id, patient_id, patient_name, treatment_name, step_completed, remaining_steps, DATE_FORMAT(next_date, '%Y-%m-%d') AS next_date FROM treatments WHERE user_id = ? ORDER BY id DESC";
    db.query(sql, [req.session.userId], function (err, results) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(results);
    });
});

app.post("/api/treatments", requireLogin, function (req, res) {
    let data = req.body;
    let userId = req.session.userId;
    let patientId = data.patient_id || '';

    let checkSql = "SELECT id FROM treatments WHERE user_id = ? AND patient_id = ? AND treatment_name = ?";
    db.query(checkSql, [userId, patientId, data.treatment_name], function(err, results) {
        if (err) return res.status(500).json({ error: err.message });
        
        if (results.length > 0) {
            let updateSql = "UPDATE treatments SET step_completed = ?, remaining_steps = ?, next_date = ? WHERE id = ?";
            db.query(updateSql, [data.step_completed, data.remaining_steps, data.next_date, results[0].id], function(err, result) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: "Treatment updated (replaced old data)!" });
            });
        } else {
            let insertSql = "INSERT INTO treatments (user_id, patient_id, patient_name, treatment_name, step_completed, remaining_steps, next_date) VALUES (?, ?, ?, ?, ?, ?, ?)";
            let values = [userId, patientId, data.patient_name, data.treatment_name, data.step_completed, data.remaining_steps, data.next_date];
        
            db.query(insertSql, values, function (err, result) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: "Treatment saved!" });
            });
        }
    });
});

// PUT - Update treatment by id (only if owned by this user)
app.put("/api/treatments/:id", requireLogin, function (req, res) {
    let data = req.body;
    let sql = "UPDATE treatments SET treatment_name = ?, step_completed = ?, remaining_steps = ?, next_date = ? WHERE id = ? AND user_id = ?";
    let values = [data.treatment_name, data.step_completed, data.remaining_steps, data.next_date, req.params.id, req.session.userId];

    db.query(sql, values, function (err, result) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: "Treatment updated!" });
    });
});

// DELETE - Delete treatment by id (only if owned by this user)
app.delete("/api/treatments/:id", requireLogin, function (req, res) {
    let sql = "DELETE FROM treatments WHERE id = ? AND user_id = ?";
    db.query(sql, [req.params.id, req.session.userId], function (err, result) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: "Treatment deleted!" });
    });
});

// ---------- PRESCRIPTIONS ----------

// GET all prescriptions (only for this user)
app.get("/api/prescriptions", requireLogin, function (req, res) {
    let sql = "SELECT id, user_id, patient_id, patient_name, treatment_given, medicines, notes, DATE_FORMAT(date, '%Y-%m-%d') AS date FROM prescriptions WHERE user_id = ? ORDER BY id DESC";
    db.query(sql, [req.session.userId], function (err, results) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(results);
    });
});

// POST - Add new prescription (linked to this user)
app.post("/api/prescriptions", requireLogin, function (req, res) {
    let data = req.body;
    let sql = "INSERT INTO prescriptions (user_id, patient_id, patient_name, treatment_given, medicines, notes, date) VALUES (?, ?, ?, ?, ?, ?, ?)";
    let values = [req.session.userId, data.patient_id || '', data.patient_name, data.treatment_given, data.medicines, data.notes, data.date];

    db.query(sql, values, function (err, result) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: "Prescription saved!", id: result.insertId });
    });
});

// PUT - Update prescription by id (only if owned by this user)
app.put("/api/prescriptions/:id", requireLogin, function (req, res) {
    let data = req.body;
    let sql = "UPDATE prescriptions SET treatment_given = ?, medicines = ?, notes = ?, date = ? WHERE id = ? AND user_id = ?";
    let values = [data.treatment_given, data.medicines, data.notes, data.date, req.params.id, req.session.userId];

    db.query(sql, values, function (err, result) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: "Prescription updated!" });
    });
});

// ---------- BILLS ----------

// GET all bills (only for this user)
app.get("/api/bills", requireLogin, function (req, res) {
    let sql = "SELECT id, user_id, patient_id, patient_name, treatment, total_cost, amount_paid, remaining_amount, DATE_FORMAT(payment_date, '%Y-%m-%d') AS payment_date FROM bills WHERE user_id = ? ORDER BY id DESC";
    db.query(sql, [req.session.userId], function (err, results) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(results);
    });
});

// POST - Add new bill (linked to this user)
app.post("/api/bills", requireLogin, function (req, res) {
    let data = req.body;
    let sql = "INSERT INTO bills (user_id, patient_id, patient_name, treatment, total_cost, amount_paid, remaining_amount, payment_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
    let values = [req.session.userId, data.patient_id || '', data.patient_name, data.treatment, data.total_cost, data.amount_paid, data.remaining_amount, data.payment_date];

    db.query(sql, values, function (err, result) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: "Bill saved!", id: result.insertId });
    });
});

// PUT - Update bill by id (only if owned by this user)
app.put("/api/bills/:id", requireLogin, function (req, res) {
    let data = req.body;
    let sql = "UPDATE bills SET treatment = ?, total_cost = ?, amount_paid = ?, remaining_amount = ?, payment_date = ? WHERE id = ? AND user_id = ?";
    let values = [data.treatment, data.total_cost, data.amount_paid, data.remaining_amount, data.payment_date, req.params.id, req.session.userId];

    db.query(sql, values, function (err, result) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ message: "Bill updated!" });
    });
});

// ---------- DASHBOARD STATS ----------

app.get("/api/dashboard", requireLogin, function (req, res) {
    // Get IST date correctly (UTC+5:30)
    let nowIST = new Date(Date.now() + (5.5 * 60 * 60 * 1000));
    let today = nowIST.toISOString().split("T")[0];
    let stats = {};

    db.query("SELECT COUNT(*) AS total FROM patients WHERE user_id = ?", [req.session.userId], function (err, r1) {
        stats.totalPatients = r1[0].total;

        db.query("SELECT COUNT(*) AS today FROM patients WHERE visit_date = ? AND user_id = ?", [today, req.session.userId], function (err, r2) {
            stats.patientsToday = r2[0].today;

            db.query("SELECT COUNT(*) AS ongoing FROM treatments WHERE remaining_steps > 0 AND user_id = ?", [req.session.userId], function (err, r3) {
                stats.ongoingTreatments = r3[0].ongoing;
                res.json(stats);
            });
        });
    });
});

// ---------- DELETE ALL DATA (only for this user) ----------

app.delete("/api/delete-all", requireLogin, function (req, res) {
    let uid = req.session.userId;
    db.query("DELETE FROM bills WHERE user_id = ?", [uid], function () {
        db.query("DELETE FROM prescriptions WHERE user_id = ?", [uid], function () {
            db.query("DELETE FROM treatments WHERE user_id = ?", [uid], function () {
                db.query("DELETE FROM patients WHERE user_id = ?", [uid], function () {
                    res.json({ message: "All your data deleted!" });
                });
            });
        });
    });
});

// ============================================================
// HTML Page Routes (handles URLs without .html extension)
// ============================================================
app.get("/add-patient", function (req, res) {
    res.sendFile(path.join(__dirname, "add-patient.html"));
});
app.get("/edit-patient", function (req, res) {
    res.sendFile(path.join(__dirname, "edit-patient.html"));
});
app.get("/search-patient", function (req, res) {
    res.sendFile(path.join(__dirname, "search-patient.html"));
});
app.get("/treatment-progress", function (req, res) {
    res.sendFile(path.join(__dirname, "treatment-progress.html"));
});
app.get("/prescription", function (req, res) {
    res.sendFile(path.join(__dirname, "prescription.html"));
});
app.get("/billing", function (req, res) {
    res.sendFile(path.join(__dirname, "billing.html"));
});
app.get("/patient-service", function (req, res) {
    res.sendFile(path.join(__dirname, "patient-service.html"));
});
app.get("/patients-records", function (req, res) {
    res.sendFile(path.join(__dirname, "patients-records.html"));
});
app.get("/login", function (req, res) {
    res.sendFile(path.join(__dirname, "login.html"));
});

// ============================================================
// APPOINTMENT REMINDER NOTIFICATION SYSTEM
// ============================================================

// Email transporter (Gmail SMTP)
let emailTransporter = null;
if (notifyConfig.email.enabled && notifyConfig.email.user !== "YOUR_GMAIL_ADDRESS@gmail.com") {
    emailTransporter = nodemailer.createTransport({
        service: notifyConfig.email.service,
        auth: {
            user: notifyConfig.email.user,
            pass: notifyConfig.email.password
        }
    });
    console.log("EMAIL: Notification service configured (" + notifyConfig.email.user + ")");
} else {
    console.log("EMAIL: Not configured. Edit notification-config.js to enable.");
}

// Send email reminder
function sendEmailReminder(patientEmail, patientName, appointmentDate, doctorName) {
    if (!emailTransporter || !patientEmail) return;

    let mailOptions = {
        from: '"' + doctorName + ' - Dental Clinic" <' + notifyConfig.email.user + '>',
        to: patientEmail,
        subject: "Appointment Reminder - " + appointmentDate,
        html: '<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;border:1px solid #ddd;border-radius:8px;">'
            + '<h2 style="color:#0056b3;text-align:center;">🦷 Appointment Reminder</h2>'
            + '<p>Dear <b>' + patientName + '</b>,</p>'
            + '<p>This is a friendly reminder that you have a dental appointment scheduled for:</p>'
            + '<div style="background:#f0f8ff;padding:15px;border-radius:5px;text-align:center;margin:15px 0;">'
            + '<h3 style="margin:0;color:#333;">📅 ' + appointmentDate + '</h3>'
            + '</div>'
            + '<p>Please arrive on time. If you need to reschedule, contact us as soon as possible.</p>'
            + '<p>Best regards,<br><b>Dr. ' + doctorName + '</b><br>Clinic Management System</p>'
            + '</div>'
    };

    emailTransporter.sendMail(mailOptions, function (err, info) {
        if (err) {
            console.error("EMAIL SEND ERROR to " + patientEmail + ":", err.message);
        } else {
            console.log("EMAIL SENT to " + patientEmail + " for appointment on " + appointmentDate);
        }
    });
}

// Send SMS reminder via Fast2SMS (GET method - works on free tier)
function sendSMSReminder(mobile, patientName, appointmentDate, doctorName) {
    if (!notifyConfig.sms.enabled || notifyConfig.sms.apiKey === "YOUR_FAST2SMS_API_KEY_HERE" || !mobile) return;

    let message = "Reminder: Dear " + patientName + ", you have a dental appointment on " + appointmentDate + " with Dr. " + doctorName + ". Please arrive on time.";

    // Clean mobile number (remove +91 or leading 0)
    let cleanMobile = mobile.replace(/[^0-9]/g, "");
    if (cleanMobile.length > 10) {
        cleanMobile = cleanMobile.slice(-10);
    }

    // Use GET request with variables_values (works on free tier)
    let queryPath = "/dev/bulkV2?"
        + "authorization=" + notifyConfig.sms.apiKey
        + "&route=q"
        + "&message=" + encodeURIComponent(message)
        + "&language=english"
        + "&numbers=" + cleanMobile;

    let options = {
        hostname: "www.fast2sms.com",
        path: queryPath,
        method: "GET"
    };

    let req = https.request(options, function (res) {
        let body = "";
        res.on("data", function (chunk) { body += chunk; });
        res.on("end", function () {
            console.log("SMS to " + cleanMobile + " | Response: " + body);
        });
    });

    req.on("error", function (err) {
        console.error("SMS ERROR to " + cleanMobile + ":", err.message);
    });

    req.end();
}

// Main function: Check for upcoming appointments and send reminders
function checkAndSendReminders() {
    let hoursAhead = notifyConfig.reminder.hoursBeforeAppointment;

    // Calculate the target date (today or tomorrow depending on time)
    let now = new Date();
    let targetTime = new Date(now.getTime() + (hoursAhead * 60 * 60 * 1000));
    let targetDate = targetTime.toISOString().split("T")[0]; // YYYY-MM-DD

    console.log("REMINDER CHECK: Looking for appointments on " + targetDate + " (" + hoursAhead + "h ahead)");

    // Find all treatments with next_date matching target, joined with patient contact info
    let sql = `
        SELECT t.id AS treatment_id, t.patient_name, t.treatment_name, t.next_date, t.user_id,
               p.mobile, p.email AS patient_email,
               u.name AS doctor_name, u.email AS doctor_email
        FROM treatments t
        JOIN patients p ON LOWER(t.patient_name) = LOWER(p.name) AND t.user_id = p.user_id
        JOIN users u ON t.user_id = u.id
        WHERE t.next_date = ? AND t.remaining_steps > 0
    `;

    db.query(sql, [targetDate], function (err, treatments) {
        if (err) {
            console.error("REMINDER QUERY ERROR:", err.message);
            return;
        }

        if (treatments.length === 0) {
            console.log("REMINDER CHECK: No appointments found for " + targetDate);
            return;
        }

        console.log("REMINDER CHECK: Found " + treatments.length + " appointment(s) for " + targetDate);

        for (let i = 0; i < treatments.length; i++) {
            let t = treatments[i];

            // Check if reminder was already sent for this treatment+date
            db.query(
                "SELECT id FROM notifications_sent WHERE treatment_id = ? AND notification_date = ?",
                [t.treatment_id, targetDate],
                function (err, sent) {
                    if (err) return;
                    if (sent.length > 0) {
                        console.log("REMINDER SKIP: Already sent for " + t.patient_name + " on " + targetDate);
                        return;
                    }

                    let formattedDate = targetDate;

                    // Send Email
                    sendEmailReminder(t.patient_email, t.patient_name, formattedDate, t.doctor_name);

                    // Send SMS
                    sendSMSReminder(t.mobile, t.patient_name, formattedDate, t.doctor_name);

                    // Record that notification was sent
                    db.query(
                        "INSERT INTO notifications_sent (treatment_id, notification_date) VALUES (?, ?)",
                        [t.treatment_id, targetDate],
                        function (err) {
                            if (err) {
                                console.error("Error recording notification:", err.message);
                            } else {
                                console.log("REMINDER RECORDED: " + t.patient_name + " for " + targetDate);
                            }
                        }
                    );
                }
            );
        }
    });
}

// Schedule the reminder check (runs every hour by default)
if (notifyConfig.reminder.checkIntervalCron) {
    cron.schedule(notifyConfig.reminder.checkIntervalCron, function () {
        console.log("--- CRON: Running scheduled reminder check ---");
        checkAndSendReminders();
    });
    console.log("SCHEDULER: Appointment reminder cron active (" + notifyConfig.reminder.checkIntervalCron + ")");
}

// Manual test endpoint (only for logged-in users)
app.get("/api/test-reminders", requireLogin, function (req, res) {
    checkAndSendReminders();
    res.json({ message: "Reminder check triggered! Check server console for results." });
});

// Manual send reminder for a specific patient (from Patients Records page)
app.post("/api/send-reminder", requireLogin, function (req, res) {
    let patientName = req.body.patient_name;
    let userId = req.session.userId;

    // Find patient contact info
    db.query("SELECT name, mobile, email FROM patients WHERE LOWER(name) = LOWER(?) AND user_id = ?", [patientName, userId], function (err, patients) {
        if (err || patients.length === 0) {
            res.status(404).json({ error: "Patient not found!" });
            return;
        }

        let patient = patients[0];

        // Find their next appointment
        db.query("SELECT next_date, treatment_name FROM treatments WHERE LOWER(patient_name) = LOWER(?) AND user_id = ? AND remaining_steps > 0 ORDER BY next_date ASC LIMIT 1",
            [patientName, userId], function (err, treatments) {
                if (err || treatments.length === 0) {
                    res.status(404).json({ error: "No upcoming appointment found!" });
                    return;
                }

                let nextDate = treatments[0].next_date;
                let formattedDate = nextDate ? new Date(nextDate).toISOString().split("T")[0] : "upcoming";
                let doctorName = req.session.userName;

                // Send notifications
                sendEmailReminder(patient.email, patient.name, formattedDate, doctorName);
                sendSMSReminder(patient.mobile, patient.name, formattedDate, doctorName);

                console.log("MANUAL REMINDER: Sent to " + patient.name + " (mobile: " + patient.mobile + ", email: " + patient.email + ") for " + formattedDate);
                res.json({ message: "Reminder sent to " + patient.name + "!" });
            }
        );
    });
});

// ============================================================
// PATIENT REPORT — Generate & Email Full Report
// ============================================================

app.post("/api/send-report", requireLogin, function (req, res) {
    let patientId = req.body.patient_id;
    let userId    = req.session.userId;
    let doctorName = req.session.userName;

    if (!patientId) {
        return res.status(400).json({ error: "patient_id is required." });
    }

    // 1) Fetch patient
    db.query(
        "SELECT id, patient_id, name, mobile, email, age, gender, address, problem, DATE_FORMAT(visit_date, '%Y-%m-%d') AS visit_date, DATE_FORMAT(created_at, '%Y-%m-%d') AS created_at FROM patients WHERE patient_id = ? AND user_id = ?",
        [patientId, userId],
        function (err, patients) {
            if (err || patients.length === 0) {
                return res.status(404).json({ error: "Patient not found." });
            }
            let p = patients[0];
            if (!p.email || p.email.trim() === "") {
                return res.status(400).json({ error: "This patient has no email address on file." });
            }

            // 2) Fetch treatment
            db.query(
                "SELECT treatment_name, step_completed, remaining_steps, DATE_FORMAT(next_date, '%Y-%m-%d') AS next_date FROM treatments WHERE (patient_id = ? OR LOWER(patient_name) = LOWER(?)) AND user_id = ? ORDER BY id DESC LIMIT 1",
                [patientId, p.name, userId],
                function (err, treatments) {
                    let t = (treatments && treatments.length > 0) ? treatments[0] : null;

                    // 3) Fetch prescription
                    db.query(
                        "SELECT treatment_given, medicines, notes, DATE_FORMAT(date, '%Y-%m-%d') AS date FROM prescriptions WHERE (patient_id = ? OR LOWER(patient_name) = LOWER(?)) AND user_id = ? ORDER BY id DESC LIMIT 1",
                        [patientId, p.name, userId],
                        function (err, prescriptions) {
                            let rx = (prescriptions && prescriptions.length > 0) ? prescriptions[0] : null;

                            // 4) Fetch bill
                            db.query(
                                "SELECT treatment, total_cost, amount_paid, remaining_amount, DATE_FORMAT(payment_date, '%Y-%m-%d') AS payment_date FROM bills WHERE (patient_id = ? OR LOWER(patient_name) = LOWER(?)) AND user_id = ? ORDER BY id DESC LIMIT 1",
                                [patientId, p.name, userId],
                                function (err, bills) {
                                    let b = (bills && bills.length > 0) ? bills[0] : null;

                                    // Build report date
                                    let nowIST = new Date(Date.now() + (5.5 * 60 * 60 * 1000));
                                    let reportDate = nowIST.toISOString().split("T")[0];

                                    // Format helpers
                                    function fmtDate(d) { return d ? String(d).split("T")[0] : "—"; }
                                    function fmtRupee(v) { return (v !== undefined && v !== null) ? "₹" + parseFloat(v).toFixed(2) : "—"; }

                                    // Medicines list
                                    let medicineRows = "";
                                    if (rx && rx.medicines) {
                                        let meds = rx.medicines.split(/[,;\n]+/).map(function(m) { return m.trim(); }).filter(Boolean);
                                        meds.forEach(function(med, idx) {
                                            let bg = idx % 2 === 0 ? "#f8f9ff" : "#ffffff";
                                            medicineRows += '<tr style="background:' + bg + ';">' +
                                                '<td style="padding:8px 12px;border-bottom:1px solid #e8ecf0;font-size:14px;color:#2d3748;">' + (idx + 1) + '. ' + med + '</td>' +
                                                '</tr>';
                                        });
                                    } else {
                                        medicineRows = '<tr><td style="padding:8px 12px;color:#999;font-style:italic;font-size:14px;">No medicines prescribed</td></tr>';
                                    }

                                    // Bill status
                                    let billStatus = "—";
                                    let billStatusColor = "#666";
                                    if (b) {
                                        let rem = parseFloat(b.remaining_amount || 0);
                                        billStatus = rem <= 0 ? "✅ Fully Paid" : "⚠️ Balance Due: " + fmtRupee(rem);
                                        billStatusColor = rem <= 0 ? "#16a34a" : "#d97706";
                                    }

                                    // Next appointment row
                                    let nextApptHtml = "";
                                    if (t && t.next_date) {
                                        nextApptHtml = '<tr>' +
                                            '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;font-weight:600;color:#4a5568;background:#fafbff;width:35%;">📅 Next Appointment</td>' +
                                            '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;color:#1a56db;font-weight:700;">' + fmtDate(t.next_date) + '</td>' +
                                            '</tr>';
                                    }

                                    // Full HTML email
                                    let html =
                                        '<!DOCTYPE html>' +
                                        '<html><head><meta charset="UTF-8"></head>' +
                                        '<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif;">' +

                                        // Outer wrapper
                                        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:30px 0;">' +
                                        '<tr><td align="center">' +
                                        '<table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">' +

                                        // Header
                                        '<tr>' +
                                        '<td style="background:linear-gradient(135deg,#1a56db 0%,#0ea5e9 100%);padding:32px 36px;text-align:center;">' +
                                        '<div style="font-size:36px;margin-bottom:8px;">🦷</div>' +
                                        '<h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:0.5px;">Dental Clinic</h1>' +
                                        '<p style="margin:6px 0 0;color:#bfdbfe;font-size:13px;">Patient Medical Report</p>' +
                                        '</td>' +
                                        '</tr>' +

                                        // Report meta bar
                                        '<tr>' +
                                        '<td style="background:#1e40af;padding:10px 36px;">' +
                                        '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
                                        '<td style="color:#bfdbfe;font-size:12px;">Report Date: <span style="color:#fff;font-weight:600;">' + reportDate + '</span></td>' +
                                        '<td align="right" style="color:#bfdbfe;font-size:12px;">Patient ID: <span style="color:#fff;font-weight:600;">' + p.patient_id + '</span></td>' +
                                        '</tr></table>' +
                                        '</td>' +
                                        '</tr>' +

                                        // Section: Patient Information
                                        '<tr><td style="padding:28px 36px 0;">' +
                                        '<h2 style="margin:0 0 14px;font-size:16px;color:#1a56db;border-left:4px solid #1a56db;padding-left:10px;letter-spacing:0.3px;">👤 Patient Information</h2>' +
                                        '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8ecf0;border-radius:8px;overflow:hidden;">' +
                                        '<tr>' +
                                        '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;font-weight:600;color:#4a5568;background:#fafbff;width:35%;">Full Name</td>' +
                                        '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;color:#1a202c;font-weight:700;">' + p.name + '</td>' +
                                        '</tr>' +
                                        '<tr>' +
                                        '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;font-weight:600;color:#4a5568;background:#fafbff;">📱 Mobile</td>' +
                                        '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;color:#2d3748;">' + p.mobile + '</td>' +
                                        '</tr>' +
                                        '<tr>' +
                                        '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;font-weight:600;color:#4a5568;background:#fafbff;">✉️ Email</td>' +
                                        '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;color:#2d3748;">' + p.email + '</td>' +
                                        '</tr>' +
                                        '<tr>' +
                                        '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;font-weight:600;color:#4a5568;background:#fafbff;">🆔 UPI / Patient ID</td>' +
                                        '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;color:#1a56db;font-weight:700;font-size:15px;">' + p.patient_id + '</td>' +
                                        '</tr>' +
                                        '<tr>' +
                                        '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;font-weight:600;color:#4a5568;background:#fafbff;">Age / Gender</td>' +
                                        '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;color:#2d3748;">' + (p.age || "—") + ' / ' + (p.gender || "—") + '</td>' +
                                        '</tr>' +
                                        '<tr>' +
                                        '<td style="padding:10px 16px;font-weight:600;color:#4a5568;background:#fafbff;">📍 Address</td>' +
                                        '<td style="padding:10px 16px;color:#2d3748;">' + (p.address || "—") + '</td>' +
                                        '</tr>' +
                                        '</table>' +
                                        '</td></tr>' +

                                        // Section: Visit & Problem
                                        '<tr><td style="padding:24px 36px 0;">' +
                                        '<h2 style="margin:0 0 14px;font-size:16px;color:#1a56db;border-left:4px solid #1a56db;padding-left:10px;">🦷 Visit Details</h2>' +
                                        '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8ecf0;border-radius:8px;overflow:hidden;">' +
                                        '<tr>' +
                                        '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;font-weight:600;color:#4a5568;background:#fafbff;width:35%;">📆 Visit Date</td>' +
                                        '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;color:#2d3748;">' + fmtDate(p.visit_date) + '</td>' +
                                        '</tr>' +
                                        '<tr>' +
                                        '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;font-weight:600;color:#4a5568;background:#fafbff;">🩺 Problem / Chief Complaint</td>' +
                                        '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;color:#dc2626;font-weight:600;">' + (p.problem || "—") + '</td>' +
                                        '</tr>' +
                                        '<tr>' +
                                        '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;font-weight:600;color:#4a5568;background:#fafbff;">⚙️ Treatment Given</td>' +
                                        '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;color:#2d3748;">' + (t ? (t.treatment_name || "—") : "—") + '</td>' +
                                        '</tr>' +
                                        nextApptHtml +
                                        '</table>' +
                                        '</td></tr>' +

                                        // Section: Prescription / Medicines
                                        '<tr><td style="padding:24px 36px 0;">' +
                                        '<h2 style="margin:0 0 14px;font-size:16px;color:#1a56db;border-left:4px solid #1a56db;padding-left:10px;">💊 Prescription & Medicines</h2>' +
                                        (rx && rx.treatment_given ? '<p style="margin:0 0 10px;font-size:13px;color:#4a5568;"><b>Procedure: </b>' + rx.treatment_given + '</p>' : '') +
                                        '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8ecf0;border-radius:8px;overflow:hidden;">' +
                                        '<thead><tr style="background:#1a56db;">' +
                                        '<th style="padding:10px 12px;color:#fff;font-size:13px;text-align:left;">Medicine Name</th>' +
                                        '</tr></thead>' +
                                        '<tbody>' + medicineRows + '</tbody>' +
                                        '</table>' +
                                        (rx && rx.notes ? '<p style="margin:10px 0 0;font-size:13px;color:#4a5568;"><b>Notes: </b>' + rx.notes + '</p>' : '') +
                                        '</td></tr>' +

                                        // Section: Billing Summary
                                        '<tr><td style="padding:24px 36px 0;">' +
                                        '<h2 style="margin:0 0 14px;font-size:16px;color:#1a56db;border-left:4px solid #1a56db;padding-left:10px;">💳 Billing Summary</h2>' +
                                        '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8ecf0;border-radius:8px;overflow:hidden;">' +
                                        '<tr>' +
                                        '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;font-weight:600;color:#4a5568;background:#fafbff;width:35%;">Total Bill</td>' +
                                        '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;color:#2d3748;font-weight:700;">' + (b ? fmtRupee(b.total_cost) : "—") + '</td>' +
                                        '</tr>' +
                                        '<tr>' +
                                        '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;font-weight:600;color:#4a5568;background:#fafbff;">Amount Paid</td>' +
                                        '<td style="padding:10px 16px;border-bottom:1px solid #e8ecf0;color:#16a34a;font-weight:700;">' + (b ? fmtRupee(b.amount_paid) : "—") + '</td>' +
                                        '</tr>' +
                                        '<tr>' +
                                        '<td style="padding:10px 16px;font-weight:600;color:#4a5568;background:#fafbff;">Status</td>' +
                                        '<td style="padding:10px 16px;font-weight:700;color:' + billStatusColor + ';">' + billStatus + '</td>' +
                                        '</tr>' +
                                        '</table>' +
                                        '</td></tr>' +

                                        // Footer
                                        '<tr><td style="padding:28px 36px;text-align:center;border-top:1px solid #e8ecf0;margin-top:24px;">' +
                                        '<p style="margin:0 0 4px;font-size:13px;color:#6b7280;">This report was generated and issued by</p>' +
                                        '<p style="margin:0;font-size:14px;font-weight:700;color:#1a56db;">Dr. ' + doctorName + ' — Clinic Management System</p>' +
                                        '<p style="margin:8px 0 0;font-size:12px;color:#9ca3af;">For queries, contact your dental clinic directly.</p>' +
                                        '</td></tr>' +

                                        '</table>' +  // inner card
                                        '</td></tr>' +
                                        '</table>' +  // outer wrapper
                                        '</body></html>';

                                    // Send email
                                    if (!emailTransporter) {
                                        return res.status(500).json({ error: "Email not configured. Please set up notification-config.js." });
                                    }

                                    let mailOptions = {
                                        from: '"Dr. ' + doctorName + ' — Dental Clinic" <' + notifyConfig.email.user + '>',
                                        to: p.email,
                                        subject: "🦷 Your Dental Report — " + p.name + " (" + p.patient_id + ")",
                                        html: html
                                    };

                                    emailTransporter.sendMail(mailOptions, function (err, info) {
                                        if (err) {
                                            console.error("REPORT EMAIL ERROR:", err.message);
                                            return res.status(500).json({ error: "Failed to send email: " + err.message });
                                        }
                                        console.log("REPORT SENT: " + p.name + " -> " + p.email);
                                        res.json({ message: "Report sent to " + p.email + "!" });
                                    });
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

// ============================================================
// Start the server
// ============================================================
app.listen(PORT, function () {
    console.log("Server is running at: http://localhost:" + PORT);
    console.log("Open this URL in your browser to use the app.");
});
