# Local setup guide

[← Back to the project](../README.md)

## Requirements

Use Node.js **24 or newer**, npm, and a running **MySQL 8** server. The start command uses Node's built-in `.env` support, so no additional configuration package is needed.

## First run

1. Clone the repository and run `npm ci` in the project folder.
2. Open `database_setup.sql` in MySQL Workbench and execute it against your local server.
3. Copy `.env.example` to `.env` in the same folder as `package.json`.
4. Enter your own database credentials in `.env`.
5. Run `npm start` and wait for the server and database connection messages.
6. Open [http://localhost:3000/login.html](http://localhost:3000/login.html).
7. Choose **Sign Up**, create an account, then sign in.

For a fresh database, no sample patients or pre-created login credentials are included. Start by adding a patient through the interface.

## Configuration

| Variable | Default or example | Purpose |
| :--- | :--- | :--- |
| `DB_HOST` | `localhost` | MySQL server host |
| `DB_USER` | `root` | Your local MySQL user |
| `DB_PASSWORD` | Your own password | MySQL authentication |
| `DB_NAME` | `dental_clinic` | Database used by the application |
| `SESSION_SECRET` | Optional, long random value | Session signing key; a temporary random key is used when empty |
| `EMAIL_ENABLED` | `false` | Set to `true` to enable configured email delivery |
| `SMTP_SERVICE` | `gmail` | Nodemailer service setting |
| `SMTP_USER` | Empty | Your sender account |
| `SMTP_PASSWORD` | Empty | Your sender credential or provider app password |
| `SMS_ENABLED` | `false` | Set to `true` to enable configured SMS delivery |
| `FAST2SMS_API_KEY` | Empty | Your own Fast2SMS credential |

Do not commit `.env`. Restart the server after changing its values. If you change `DB_NAME`, create that database and import the schema into it first; the supplied SQL file explicitly creates and selects `dental_clinic`.

## Database setup and migration

`database_setup.sql` creates the five core tables: `users`, `patients`, `treatments`, `prescriptions` and `bills`.

On startup, `server.js` creates `notifications_sent` and checks for compatibility columns, including `user_id`, clinical `patient_id` fields and patient email. The MySQL user therefore needs permission to create and alter these tables during initial setup.

`migrate.sql` supports older databases that lack account ownership columns. Back up an existing database before running a migration. A fresh installation only needs the main setup SQL and the normal application startup.

## Optional integrations

### Email reminders and reports

Configure `SMTP_USER` and `SMTP_PASSWORD`, then set `EMAIL_ENABLED=true`. Use your own sender account. The **Report** action in Patient Records generates and emails a patient summary; it requires a patient email address and working sender configuration.

### SMS reminders

Set `FAST2SMS_API_KEY` and `SMS_ENABLED=true` using your own Fast2SMS account. Delivery depends on provider configuration, valid recipient numbers and available credits.

The reminder settings live in `notification-config.js`: `hoursBeforeAppointment` is `2` and the schedule is `*/30 * * * *`. The application stores appointment **dates**, so the current reminder logic is date-based, rather than a calendar with exact appointment times. A database log records reminders to reduce repeat sends.

### Google Sheets export

Deploy your own Google Apps Script web app, make its response accessible to your browser, and assign its URL to `SCRIPT_URL` in `script.js`. An empty URL means the integration is not configured; configure it before using the export button.

The frontend sends a JSON array in a `text/plain;charset=utf-8` POST body. Each object contains these keys:

```text
patientId, patientName, mobile, age, gender, address,
problem, visitDate, treatment, prescription, medicines,
totalBill, amountPaid, remainingAmount, nextAppointment, entryTime
```

Export reads the rows currently rendered in the records table. Clear the search filter before exporting if you want all displayed account records. A compatible Apps Script receiver is not included in this repository.

## Troubleshooting

| Symptom | What to check |
| :--- | :--- |
| `.env` file cannot be found | Copy `.env.example` to `.env` and start from the project folder. |
| MySQL connection fails | Check that MySQL is running and the `.env` credentials match your server. |
| Unknown database | Execute `database_setup.sql` before starting the app. |
| Table or column errors | Confirm the schema was imported and the database user can run startup migrations. |
| `--env-file` is not recognized | Install Node.js 24 or newer and reopen your terminal. |
| Port 3000 is already in use | Close the other process using that port and restart the app. |
| Pages load but account data does not | Use the running server at `http://localhost:3000`; avoid opening HTML files directly. |
| Login succeeds but no records appear | New accounts have their own empty records. Add a patient while signed in. |
| Email, SMS or export fails | Check the optional provider settings and endpoint; these integrations are not required for local patient management. |

## Scope

This repository is a college demonstration application. Sessions use the default in-memory store, and the interface points to `localhost:3000`. The setup above targets local evaluation. Real clinic deployment would require further work on hosting, HTTPS, session storage, validation, backups and patient-data protection.
