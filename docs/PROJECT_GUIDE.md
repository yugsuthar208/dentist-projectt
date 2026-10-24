# Project guide

[← Back to the project](../README.md) · [Installation help](SETUP.md)

## Project objective

Bring patient registration, dental treatment progress, prescriptions and billing into one small web application. The project demonstrates browser forms, JavaScript event handling, JSON APIs, sessions and relational database operations using a straightforward stack.

## Pages and responsibilities

| Page | Responsibility |
| :--- | :--- |
| `login.html` | Account registration and login |
| `index.html` | Summary counts and shortcuts |
| `add-patient.html` | Registration and generated patient ID |
| `search-patient.html` | Search by patient ID, name, mobile or visit date |
| `edit-patient.html` | Find and edit a patient's existing records |
| `patient-service.html` | Shared lookup with treatment, prescription and billing tabs |
| `patients-records.html` | Combined records, filtering and optional integration actions |

`script.js` contains the shared browser functions. `server.js` handles routes, sessions, MySQL queries and reminder scheduling. `style.css` supplies the interface styling.

## Database model

| Table | Information stored |
| :--- | :--- |
| `users` | Account name, unique email and hashed password |
| `patients` | Owner, patient ID, contact details, age, gender, address, complaint and visit date |
| `treatments` | Owner, patient reference, treatment name, completed step, remaining steps and next date |
| `prescriptions` | Owner, patient reference, treatment given, medicines, notes and date |
| `bills` | Owner, patient reference, treatment, total, paid amount, balance and payment date |
| `notifications_sent` | Treatment reference, reminder date, type and sent timestamp |

The schema declares `user_id` foreign keys on the four main record tables. The server adds clinical `patient_id` columns when missing. Clinical patient references and reminder treatment references are application-level associations; they are not declared as foreign keys in the supplied schema.

The interface calls IDs such as `P001` **Universal Patient IDs**. They are used throughout the workflow; do not describe them as globally unique across all installations or doctor accounts.

## Request flow

For example, when a patient is registered:

1. The browser reads the patient form.
2. It requests the next patient ID through `GET /api/patients/next-id`.
3. It sends the patient details as JSON to `POST /api/patients`.
4. Express checks for a logged-in session.
5. The server inserts the record with the current account's `user_id`.
6. The browser displays the generated patient ID.

## Main API groups

| Area | Routes |
| :--- | :--- |
| Accounts | `POST /api/signup`, `POST /api/login`, `POST /api/logout`, `GET /api/auth/check` |
| Dashboard | `GET /api/dashboard` |
| Patients | `GET/POST /api/patients`, `GET /api/patients/next-id`, `GET/PUT/DELETE /api/patients/:patient_id` |
| Treatments | `GET/POST /api/treatments`, `PUT/DELETE /api/treatments/:id` |
| Prescriptions | `GET/POST /api/prescriptions`, `PUT /api/prescriptions/:id` |
| Billing | `GET/POST /api/bills`, `PUT /api/bills/:id` |
| Optional messages | `POST /api/send-reminder`, `POST /api/send-report` |

Protected record routes use the `requireLogin` middleware. Browser requests include the session cookie. Queries use the signed-in account ID to scope the main account-owned record operations.

## Suggested presentation

| Step | Show | Explain |
| :--- | :--- | :--- |
| 1 | Login and Sign Up | Passwords are hashed with bcrypt; sessions track the signed-in account. |
| 2 | Dashboard | Counts come from the database through an API request. |
| 3 | Add Patient | Form data becomes a persistent patient record and receives an ID. |
| 4 | Patient lookup | One patient selection is shared across the service tabs. |
| 5 | Treatment | Completed steps, remaining steps and the next appointment date are recorded. |
| 6 | Prescription | Medicines and notes are saved against the selected patient. |
| 7 | Billing | Total minus paid amount gives the remaining balance. |
| 8 | Patient Records | Related information is brought together into a searchable view. |
| 9 | Logout | The session ends and the user returns to account access. |

Keep optional provider actions out of the live demonstration unless your own accounts and endpoint are configured and you intend to send messages or export data.

## Verification performed

The publication copy was run locally on **24 October 2026**, using **Node.js 24.11.0** and a separate MySQL demo database. Six fictional patients were created, each with one treatment, prescription and bill.

| Check | Result |
| :--- | :--- |
| Unauthenticated patient API access | Rejected with HTTP 401 |
| Registration through the browser | Demo account created |
| Login and logout | Successful |
| Patient creation and retrieval | Six records saved and retrieved |
| Treatment creation and retrieval | Six records saved and retrieved |
| Prescription creation and retrieval | Six records saved and retrieved |
| Billing creation and retrieval | Six records saved and retrieved |
| Dashboard | Six patients, six patients today and three ongoing treatments |
| Search by patient ID | `P001` returned the matching demo patient |
| Edit workflow | Existing patient and clinical records loaded into the edit screen |
| Service tabs | Treatment, prescription and billing tabs opened for the selected patient |

Email/SMS delivery and Google Sheets export were not exercised. Screenshot data is fictional, and no existing clinic records were used. This is a focused manual and API smoke check, not an exhaustive test suite.

## Possible future work

- Appointment time slots and calendar views.
- Downloadable prescription and billing documents.
- Pagination for larger patient lists.
- Stronger server-side validation and deployment configuration.
- Automated backups and more detailed reporting.

These are possible extensions, not claims about the current implementation.
