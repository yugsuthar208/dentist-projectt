const SERVER_URL = "http://localhost:3000";

// AUTH
function checkAuth() {
    return fetch(SERVER_URL + "/api/auth/check", { credentials: "include" })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (!data.loggedIn) { window.location.href = "login.html"; return null; }
            let g = document.getElementById("user-greeting");
            if (g) g.innerText = "👤 " + data.user.name;
            return data.user;
        })
        .catch(function () { window.location.href = "login.html"; return null; });
}

function logoutUser() {
    fetch(SERVER_URL + "/api/logout", { method: "POST", credentials: "include" })
        .then(function () { window.location.href = "login.html"; })
        .catch(function () { window.location.href = "login.html"; });
}

// API HELPERS
function getData(key, callback) {
    fetch(SERVER_URL + "/api/" + key, { credentials: "include" })
        .then(function (r) {
            if (r.status === 401) { window.location.href = "login.html"; return []; }
            return r.json();
        })
        .then(function (data) { callback(data); })
        .catch(function (err) { console.error("Error fetching " + key + ":", err); callback([]); });
}

function saveToServer(endpoint, data, callback) {
    fetch(SERVER_URL + "/api/" + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data)
    })
        .then(function (r) {
            if (r.status === 401) { window.location.href = "login.html"; return; }
            return r.json();
        })
        .then(function (result) { if (callback) callback(result); })
        .catch(function (err) { console.error("Error saving:", err); alert("Failed to save. Make sure the server is running!"); });
}

function deleteFromServer(endpoint, callback) {
    fetch(SERVER_URL + "/api/" + endpoint, { method: "DELETE", credentials: "include" })
        .then(function (r) {
            if (r.status === 401) { window.location.href = "login.html"; return; }
            return r.json();
        })
        .then(function (result) { if (callback) callback(result); })
        .catch(function (err) { console.error("Error deleting:", err); });
}

// UPI POPUP MODAL (shown after adding new patient)
function showUPIModal(patientId, patientName) {
    let overlay = document.getElementById("upi-modal-overlay");
    if (!overlay) return;
    document.getElementById("modal-upi-id").innerText = patientId;
    document.getElementById("modal-patient-name").innerText = patientName;
    overlay.classList.add("show");
}

function closeUPIModal() {
    let overlay = document.getElementById("upi-modal-overlay");
    if (overlay) overlay.classList.remove("show");
}

function copyUPI() {
    let upi = document.getElementById("modal-upi-id").innerText;
    navigator.clipboard.writeText(upi).then(function () {
        let btn = document.getElementById("copy-upi-btn");
        if (btn) { btn.innerText = "✅ Copied!"; setTimeout(function () { btn.innerText = "📋 Copy ID"; }, 2000); }
    }).catch(function() {
        // Fallback
        let ta = document.createElement("textarea");
        ta.value = upi;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        let btn = document.getElementById("copy-upi-btn");
        if (btn) { btn.innerText = "✅ Copied!"; setTimeout(function () { btn.innerText = "📋 Copy ID"; }, 2000); }
    });
}

// UPI LOOKUP — search patients by ID or Name
function lookupPatientByUID(inputVal, onFound, onNotFound) {
    if (!inputVal || inputVal.trim() === "") {
        if (onNotFound) onNotFound("Please enter a Patient ID (e.g. P001) or Patient Name.");
        return;
    }
    getData("patients", function (patients) {
        let found = null;
        let query = inputVal.trim().toLowerCase();
        // Exact match first (ID or name)
        for (let i = 0; i < patients.length; i++) {
            if (patients[i].patient_id.toLowerCase() === query || patients[i].name.toLowerCase() === query) {
                found = patients[i]; break;
            }
        }
        // Partial name match fallback
        if (!found) {
            for (let i = 0; i < patients.length; i++) {
                if (patients[i].name.toLowerCase().includes(query)) { found = patients[i]; break; }
            }
        }
        if (found) { if (onFound) onFound(found); }
        else { if (onNotFound) onNotFound("No patient found for \"" + inputVal.trim() + "\". Please add the patient first."); }
    });
}

function showPatientInfoCard(patient) {
    let card = document.getElementById("patient-info-card");
    let notFound = document.getElementById("patient-not-found-msg");
    if (!card) return;
    if (notFound) notFound.classList.remove("visible");
    card.classList.add("visible");
    let badge = card.querySelector(".patient-badge");
    if (badge) badge.innerText = patient.patient_id;
    let setEl = function (id, val) { let el = document.getElementById(id); if (el) el.innerText = val || "—"; };
    setEl("info-name", patient.name);
    setEl("info-mobile", patient.mobile);
    setEl("info-age", patient.age + " yrs");
    setEl("info-gender", patient.gender);
    setEl("info-problem", patient.problem);
    setEl("info-visit", formatDate(patient.visit_date));
}

function showNotFoundMsg(msg) {
    let card = document.getElementById("patient-info-card");
    let notFound = document.getElementById("patient-not-found-msg");
    if (card) card.classList.remove("visible");
    if (notFound) { notFound.innerText = "⚠️ " + msg; notFound.classList.add("visible"); }
}

// PATIENT DATALIST (autocomplete with both ID and Name)
function populatePatientDatalist() {
    let datalist = document.getElementById("patientNames");
    if (!datalist) return;
    getData("patients", function (patients) {
        datalist.innerHTML = "";
        for (let i = 0; i < patients.length; i++) {
            let o1 = document.createElement("option");
            o1.value = patients[i].patient_id;
            o1.label = patients[i].name;
            datalist.appendChild(o1);
            let o2 = document.createElement("option");
            o2.value = patients[i].name;
            datalist.appendChild(o2);
        }
    });
}

function savePatient(event) {
    event.preventDefault();
    let mobileValue = document.getElementById("mobile").value;
    if (!/^\d{10}$/.test(mobileValue)) { alert("Mobile number must be exactly 10 digits!"); return; }

    fetch(SERVER_URL + "/api/patients/next-id", { credentials: "include" })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            let patient = {
                patient_id: data.nextId,
                name: document.getElementById("name").value,
                mobile: mobileValue,
                email: document.getElementById("email") ? document.getElementById("email").value : "",
                age: document.getElementById("age").value,
                gender: document.getElementById("gender").value,
                address: document.getElementById("address").value,
                problem: document.getElementById("problem").value,
                visit_date: document.getElementById("visitDate").value
            };
            saveToServer("patients", patient, function () {
                document.getElementById("add-patient-form").reset();
                showUPIModal(patient.patient_id, patient.name);
            });
        })
        .catch(function (err) { console.error(err); alert("Failed to save patient. Make sure the server is running!"); });
}

function searchPatients() {
    let searchId     = (document.getElementById("searchId")     ? document.getElementById("searchId").value     : "").toLowerCase();
    let searchName   = (document.getElementById("searchName")   ? document.getElementById("searchName").value   : "").toLowerCase();
    let searchMobile = (document.getElementById("searchMobile") ? document.getElementById("searchMobile").value : "");
    let searchDate   = (document.getElementById("searchDate")   ? document.getElementById("searchDate").value   : "");

    getData("patients", function (patients) {
        let results = [];
        for (let i = 0; i < patients.length; i++) {
            let p = patients[i];
            let matchId     = searchId     === "" || p.patient_id.toLowerCase().includes(searchId);
            let matchName   = searchName   === "" || p.name.toLowerCase().includes(searchName);
            let matchMobile = searchMobile === "" || p.mobile.includes(searchMobile);
            let matchDate   = searchDate   === "" || (p.visit_date && p.visit_date.split("T")[0] === searchDate);
            if (matchId && matchName && matchMobile && matchDate) results.push(p);
        }
        displayPatients(results);
    });
}

function displayPatients(patientsArray) {
    let tbody = document.getElementById("patient-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (patientsArray.length === 0) {
        tbody.innerHTML = "<tr><td colspan='6' style='text-align:center; color:#888; padding:24px;'>No patients found</td></tr>";
        return;
    }
    for (let i = 0; i < patientsArray.length; i++) {
        let p = patientsArray[i];
        let tr = document.createElement("tr");
        tr.innerHTML =
            "<td><span class='badge badge-info'>" + p.patient_id + "</span></td>" +
            "<td><strong>" + p.name + "</strong></td>" +
            "<td>" + p.mobile + "</td>" +
            "<td>" + p.problem + "</td>" +
            "<td>" + (p.visit_date ? p.visit_date.split("T")[0] : "") + "</td>" +
            "<td><button class='btn-sm btn-info' onclick=\"viewPatientDetails('" + p.patient_id + "')\">👁 View</button></td>";
        tbody.appendChild(tr);
    }
}

function viewPatientDetails(patientId) {
    fetch(SERVER_URL + "/api/patients/" + patientId, { credentials: "include" })
        .then(function (r) { return r.json(); })
        .then(function (p) {
            if (p.error) { alert("Patient not found!"); return; }
            alert(
                "Patient Details\n═══════════════════\n" +
                "ID:      " + p.patient_id + "\n" +
                "Name:    " + p.name + "\n" +
                "Age:     " + p.age + "\n" +
                "Gender:  " + p.gender + "\n" +
                "Mobile:  " + p.mobile + "\n" +
                "Email:   " + (p.email || "N/A") + "\n" +
                "Address: " + p.address + "\n" +
                "Problem: " + p.problem + "\n" +
                "Visit:   " + formatDate(p.visit_date)
            );
        });
}

// DASHBOARD
function loadDashboard() {
    fetch(SERVER_URL + "/api/dashboard", { credentials: "include" })
        .then(function (r) { return r.json(); })
        .then(function (stats) {
            let t = document.getElementById("total-patients");
            let d = document.getElementById("patients-today");
            let o = document.getElementById("ongoing-treatments");
            if (t) t.innerText = stats.totalPatients;
            if (d) d.innerText = stats.patientsToday;
            if (o) o.innerText = stats.ongoingTreatments;
        })
        .catch(function (err) { console.error("Dashboard error:", err); });
}

let _allRecordsCache = [];

function loadAllRecords() {
    let tbody = document.getElementById("records-table-body");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='17' style='text-align:center;padding:24px;color:#888;'>Loading records...</td></tr>";

    getData("patients", function (patients) {
        getData("treatments", function (treatments) {
            getData("prescriptions", function (prescriptions) {
                getData("bills", function (bills) {
                    _allRecordsCache = [];
                    // patients already come newest-first from server (ORDER BY id DESC)
                    for (let i = 0; i < patients.length; i++) {
                        let p = patients[i];
                        let matchT  = findMatched(treatments,    p);
                        let matchRx = findMatched(prescriptions, p);
                        let matchB  = findMatched(bills,         p);
                        _allRecordsCache.push({ patient: p, treatment: matchT, prescription: matchRx, bill: matchB });
                    }
                    renderRecordsTable(_allRecordsCache);
                });
            });
        });
    });
}

function findMatched(arr, patient) {
    for (let j = 0; j < arr.length; j++) {
        let r = arr[j];
        if (r.patient_id === patient.patient_id ||
            r.patient_name.toLowerCase() === patient.name.toLowerCase()) {
            return r;
        }
    }
    return {};
}

function renderRecordsTable(rows) {
    let tbody = document.getElementById("records-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (rows.length === 0) {
        tbody.innerHTML = "<tr><td colspan='17' style='text-align:center;padding:28px;color:#888;'>No patient records found</td></tr>";
        return;
    }
    for (let i = 0; i < rows.length; i++) {
        let p  = rows[i].patient;
        let t  = rows[i].treatment   || {};
        let rx = rows[i].prescription || {};
        let b  = rows[i].bill        || {};
        let remaining = b.remaining_amount !== undefined ? parseFloat(b.remaining_amount) : null;
        let payStatus = remaining === null ? "—" :
            remaining <= 0
                ? "<span class='badge badge-success'>Paid</span>"
                : "<span class='badge badge-warning'>₹" + remaining.toFixed(2) + "</span>";

        // Check if all required fields are present to show Print & Email Report button
        let hasAllRequired = (
            p.name && p.name.trim() !== "" &&
            p.mobile && p.mobile.trim() !== "" &&
            p.email && p.email.trim() !== "" &&
            p.patient_id && p.patient_id.trim() !== "" &&
            p.problem && p.problem.trim() !== "" &&
            p.visit_date && p.visit_date.trim() !== "" &&
            t.treatment_name && t.treatment_name.trim() !== "" &&
            rx.medicines && rx.medicines.trim() !== ""
        );

        let tr = document.createElement("tr");
        tr.innerHTML =
            "<td><span class='badge badge-info'>" + p.patient_id + "</span></td>" +
            "<td><strong>" + p.name + "</strong></td>" +
            "<td>" + p.mobile + "</td>" +
            "<td>" + p.age + "</td>" +
            "<td>" + p.gender + "</td>" +
            "<td style='max-width:120px;'>" + p.address + "</td>" +
            "<td>" + p.problem + "</td>" +
            "<td>" + (p.visit_date ? formatDate(p.visit_date) : "—") + "</td>" +
            "<td>" + (t.treatment_name || "—") + "</td>" +
            "<td>" + (rx.treatment_given || "—") + "</td>" +
            "<td>" + (rx.medicines || "—") + "</td>" +
            "<td>" + (b.total_cost !== undefined ? "₹" + parseFloat(b.total_cost).toFixed(2) : "—") + "</td>" +
            "<td>" + (b.amount_paid !== undefined ? "₹" + parseFloat(b.amount_paid).toFixed(2) : "—") + "</td>" +
            "<td>" + payStatus + "</td>" +
            "<td>" + (t.next_date ? formatDate(t.next_date) : "—") + "</td>" +
            "<td>" + (p.created_at ? formatDate(p.created_at) : "—") + "</td>" +
            "<td style='white-space:nowrap'>" +
                "<button class='btn-sm btn-danger' onclick=\"deletePatientRecord('" + p.patient_id + "')\">🗑</button> " +
                (t.next_date ? "<button class='btn-sm btn-info' style='margin-top:3px' onclick=\"sendManualReminder('" + p.name.replace(/'/g, "\\'") + "')\">📩</button> " : "") +
                (hasAllRequired ? "<button class='btn-sm btn-report' style='margin-top:3px' onclick=\"sendPatientReport('" + p.patient_id + "')\">🖨️ Report</button>" : "") +
            "</td>";
        tbody.appendChild(tr);
    }
}

function sendPatientReport(patientId) {
    // Find the row data from cache
    let rowData = null;
    for (let i = 0; i < _allRecordsCache.length; i++) {
        if (_allRecordsCache[i].patient.patient_id === patientId) {
            rowData = _allRecordsCache[i];
            break;
        }
    }
    if (!rowData) { alert("Patient data not found!"); return; }

    let p  = rowData.patient;
    let emailTo = p.email;
    if (!emailTo) { alert("No email address on file for this patient!"); return; }

    if (!confirm("Send a full patient report to " + emailTo + "?\n\nPatient: " + p.name + " (" + p.patient_id + ")")) return;

    let btn = event.target;
    btn.disabled = true;
    btn.innerText = "Sending...";

    fetch(SERVER_URL + "/api/send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ patient_id: patientId })
    })
    .then(function (r) { return r.json(); })
    .then(function (result) {
        btn.disabled = false;
        btn.innerText = "🖨️ Report";
        if (result.error) {
            alert("❌ Error: " + result.error);
        } else {
            alert("✅ Report sent successfully to " + emailTo + "!");
        }
    })
    .catch(function () {
        btn.disabled = false;
        btn.innerText = "🖨️ Report";
        alert("❌ Failed to send report. Make sure the server is running!");
    });
}

function filterRecords() {
    let searchVal = (document.getElementById("recordsSearch") ? document.getElementById("recordsSearch").value : "").toLowerCase();
    if (!searchVal) { renderRecordsTable(_allRecordsCache); return; }
    let filtered = _allRecordsCache.filter(function (row) {
        let p = row.patient;
        return p.patient_id.toLowerCase().includes(searchVal) ||
               p.name.toLowerCase().includes(searchVal) ||
               p.mobile.includes(searchVal) ||
               p.problem.toLowerCase().includes(searchVal);
    });
    renderRecordsTable(filtered);
}

function deletePatientRecord(patientId) {
    if (confirm("Are you sure you want to completely delete this patient and ALL their records? This cannot be undone!")) {
        deleteFromServer("patients/" + patientId, function () { loadAllRecords(); });
    }
}

function sendManualReminder(patientName) {
    if (!confirm("Send SMS & Email reminder to " + patientName + "?")) return;
    fetch(SERVER_URL + "/api/send-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ patient_name: patientName })
    })
        .then(function (r) { return r.json(); })
        .then(function (result) { alert(result.error ? "Error: " + result.error : result.message); })
        .catch(function () { alert("Failed to send reminder!"); });
}

function deleteAllData() {
    if (confirm("WARNING: Delete ALL data? This cannot be undone!")) {
        deleteFromServer("delete-all", function () {
            alert("All data deleted.");
            if (document.getElementById("records-table-body")) loadAllRecords(); else location.reload();
        });
    }
}

const SCRIPT_URL = ""; // Optional: paste your own deployed Google Apps Script URL here.

function sendToGoogleSheets() {
    if (!SCRIPT_URL) { alert("Configure your Google Apps Script URL in script.js before exporting."); return; }
    if (!confirm("Send all records to Google Sheets?")) return;
    let tbody = document.getElementById("records-table-body");
    let rows = tbody.getElementsByTagName("tr");
    let allData = [];
    for (let i = 0; i < rows.length; i++) {
        let cols = rows[i].getElementsByTagName("td");
        if (cols.length > 0 && cols[0].innerText.trim() !== "No patient records found" && cols[0].innerText.trim() !== "Loading records...") {
            allData.push({
                patientId: cols[0].innerText.trim(),
                patientName: cols[1].innerText.trim(),
                mobile: cols[2].innerText.trim(),
                age: cols[3].innerText.trim(),
                gender: cols[4].innerText.trim(),
                address: cols[5].innerText.trim(),
                problem: cols[6].innerText.trim(),
                visitDate: cols[7].innerText.trim(),
                treatment: cols[8].innerText.trim(),
                prescription: cols[9].innerText.trim(),
                medicines: cols[10].innerText.trim(),
                totalBill: cols[11].innerText.trim(),
                amountPaid: cols[12].innerText.trim(),
                remainingAmount: cols[13].innerText.trim(),
                nextAppointment: cols[14].innerText.trim(),
                entryTime: cols[15].innerText.trim()
            });
        }
    }
    if (allData.length === 0) { alert("No data to send!"); return; }
    let btn = document.getElementById("export-btn");
    if (btn) { btn.innerText = "Sending..."; btn.disabled = true; }
    fetch(SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(allData) })
        .then(function (r) { return r.text(); })
        .then(function (data) {
            if (data && data.startsWith("Error")) alert("SHEETS ERROR: " + data);
            else { alert("Uploaded to Google Sheets!"); loadAllRecords(); }
            if (btn) { btn.innerText = "📤 Export to Google Sheets"; btn.disabled = false; }
        })
        .catch(function () { alert("Failed to send."); if (btn) { btn.innerText = "📤 Export to Google Sheets"; btn.disabled = false; } });
}

// EDIT PATIENT PAGE
function formatDate(dateStr) {
    if (!dateStr) return "";
    // With dateStrings:true on MySQL, dates come as "YYYY-MM-DD" plain strings.
    // If they somehow contain a T (ISO format), just take the date part.
    // NEVER pass through new Date() to avoid UTC→IST shift.
    return String(dateStr).split("T")[0].split(" ")[0];
}

function searchForEdit() {
    let input = document.getElementById("editSearchInput").value.toLowerCase();
    if (!input) { alert("Please enter a Patient ID or Name to search!"); return; }
    getData("patients", function (patients) {
        let results = patients.filter(function (p) {
            return p.patient_id.toLowerCase().includes(input) || p.name.toLowerCase().includes(input);
        });
        let table = document.getElementById("edit-search-table");
        let tbody = document.getElementById("edit-search-body");
        tbody.innerHTML = "";
        if (results.length === 0) {
            table.style.display = "table";
            tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>No patient found</td></tr>";
            return;
        }
        table.style.display = "table";
        for (let i = 0; i < results.length; i++) {
            let p = results[i];
            let tr = document.createElement("tr");
            tr.innerHTML =
                "<td><span class='badge badge-info'>" + p.patient_id + "</span></td>" +
                "<td><strong>" + p.name + "</strong></td>" +
                "<td>" + p.mobile + "</td>" +
                "<td>" + p.problem + "</td>" +
                "<td><button class='btn-sm btn-warning' onclick=\"loadPatientForEdit('" + p.patient_id + "')\">✏️ Edit</button></td>";
            tbody.appendChild(tr);
        }
    });
}

function loadPatientForEdit(patientId) {
    fetch(SERVER_URL + "/api/patients/" + patientId, { credentials: "include" })
        .then(function (r) { return r.json(); })
        .then(function (patient) {
            if (patient.error) { alert("Patient not found!"); return; }
            document.getElementById("editPatientId").value    = patient.patient_id;
            document.getElementById("editOldName").value      = patient.name;
            document.getElementById("editName").value         = patient.name;
            document.getElementById("editMobile").value       = patient.mobile;
            document.getElementById("editEmail").value        = patient.email || "";
            document.getElementById("editAge").value          = patient.age;
            document.getElementById("editGender").value       = patient.gender;
            document.getElementById("editAddress").value      = patient.address;
            document.getElementById("editProblem").value      = patient.problem;
            document.getElementById("editVisitDate").value    = formatDate(patient.visit_date);
            document.getElementById("editing-label").innerText = "✏️ Editing: " + patient.patient_id + " — " + patient.name;
            document.getElementById("edit-section").style.display = "block";

            // Load treatment records
            getData("treatments", function (treatments) {
                let matched = treatments.filter(function (t) {
                    return t.patient_id === patient.patient_id || t.patient_name.toLowerCase() === patient.name.toLowerCase();
                });
                let treatArea = document.getElementById("treatment-edit-area");
                if (matched.length > 0) {
                    let html = "<p style='color:#28a745;font-size:13px;'><b>✅ " + matched.length + " treatment record(s) found:</b></p><div class='table-responsive'><table><thead><tr><th>Treatment</th><th>Step Done</th><th>Remaining</th><th>Next Date</th><th>Action</th></tr></thead><tbody>";
                    for (let i = 0; i < matched.length; i++) {
                        let t = matched[i];
                        html += "<tr><td>" + (t.treatment_name || "") + "</td><td>" + (t.step_completed || "") + "</td><td>" + (t.remaining_steps || 0) + "</td><td>" + formatDate(t.next_date) + "</td><td><button type='button' class='btn-sm btn-warning' onclick='loadTreatmentIntoForm(" + JSON.stringify(t).replace(/'/g, "\\'") + ")'>Edit</button></td></tr>";
                    }
                    html += "</tbody></table></div>";
                    treatArea.innerHTML = html;
                    loadTreatmentIntoForm(matched[0]);
                } else {
                    treatArea.innerHTML = "<p class='no-record'>No treatment records. Fill fields below to add new.</p>";
                    ["editTreatmentId","editTreatmentName","editStepCompleted","editRemainingSteps","editNextDate"].forEach(function(id) { document.getElementById(id).value = ""; });
                }
            });

            // Load prescription records
            getData("prescriptions", function (prescriptions) {
                let matched = prescriptions.filter(function (p2) {
                    return p2.patient_id === patient.patient_id || p2.patient_name.toLowerCase() === patient.name.toLowerCase();
                });
                let presArea = document.getElementById("prescription-edit-area");
                if (matched.length > 0) {
                    let html = "<p style='color:#28a745;font-size:13px;'><b>✅ " + matched.length + " prescription record(s) found:</b></p><div class='table-responsive'><table><thead><tr><th>Treatment Given</th><th>Medicines</th><th>Date</th><th>Action</th></tr></thead><tbody>";
                    for (let i = 0; i < matched.length; i++) {
                        let px = matched[i];
                        html += "<tr><td>" + (px.treatment_given || "") + "</td><td>" + (px.medicines || "") + "</td><td>" + formatDate(px.date) + "</td><td><button type='button' class='btn-sm btn-warning' onclick='loadPrescriptionIntoForm(" + JSON.stringify(px).replace(/'/g, "\\'") + ")'>Edit</button></td></tr>";
                    }
                    html += "</tbody></table></div>";
                    presArea.innerHTML = html;
                    loadPrescriptionIntoForm(matched[0]);
                } else {
                    presArea.innerHTML = "<p class='no-record'>No prescription records. Fill fields below to add new.</p>";
                    ["editPrescriptionId","editTreatmentGiven","editMedicines","editNotes","editPrescriptionDate"].forEach(function(id) { document.getElementById(id).value = ""; });
                }
            });

            // Load billing records
            getData("bills", function (bills) {
                let matched = bills.filter(function (b) {
                    return b.patient_id === patient.patient_id || b.patient_name.toLowerCase() === patient.name.toLowerCase();
                });
                let billArea = document.getElementById("billing-edit-area");
                if (matched.length > 0) {
                    let html = "<p style='color:#28a745;font-size:13px;'><b>✅ " + matched.length + " billing record(s) found:</b></p><div class='table-responsive'><table><thead><tr><th>Treatment</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Date</th><th>Action</th></tr></thead><tbody>";
                    for (let i = 0; i < matched.length; i++) {
                        let bl = matched[i];
                        html += "<tr><td>" + (bl.treatment || "") + "</td><td>₹" + (bl.total_cost || 0) + "</td><td>₹" + (bl.amount_paid || 0) + "</td><td>₹" + (bl.remaining_amount || 0) + "</td><td>" + formatDate(bl.payment_date) + "</td><td><button type='button' class='btn-sm btn-warning' onclick='loadBillIntoForm(" + JSON.stringify(bl).replace(/'/g, "\\'") + ")'>Edit</button></td></tr>";
                    }
                    html += "</tbody></table></div>";
                    billArea.innerHTML = html;
                    loadBillIntoForm(matched[0]);
                } else {
                    billArea.innerHTML = "<p class='no-record'>No billing records. Fill fields below to add new.</p>";
                    ["editBillId","editBillTreatment","editTotalCost","editAmountPaid","editRemainingAmount","editPaymentDate"].forEach(function(id) { document.getElementById(id).value = ""; });
                }
            });

            document.getElementById("edit-section").scrollIntoView({ behavior: "smooth" });
        })
        .catch(function () { alert("Failed to load patient data."); });
}

function loadTreatmentIntoForm(t) {
    document.getElementById("editTreatmentId").value     = t.id || "";
    document.getElementById("editTreatmentName").value   = t.treatment_name || "";
    document.getElementById("editStepCompleted").value   = t.step_completed || "";
    document.getElementById("editRemainingSteps").value  = t.remaining_steps || "";
    document.getElementById("editNextDate").value        = formatDate(t.next_date);
}

function loadPrescriptionIntoForm(p) {
    document.getElementById("editPrescriptionId").value    = p.id || "";
    document.getElementById("editTreatmentGiven").value   = p.treatment_given || "";
    document.getElementById("editMedicines").value        = p.medicines || "";
    document.getElementById("editNotes").value            = p.notes || "";
    document.getElementById("editPrescriptionDate").value = formatDate(p.date);
}

function loadBillIntoForm(b) {
    document.getElementById("editBillId").value          = b.id || "";
    document.getElementById("editBillTreatment").value   = b.treatment || "";
    document.getElementById("editTotalCost").value       = b.total_cost || "";
    document.getElementById("editAmountPaid").value      = b.amount_paid || "";
    document.getElementById("editRemainingAmount").value = b.remaining_amount || "";
    document.getElementById("editPaymentDate").value     = formatDate(b.payment_date);
}

function calcRemaining() {
    let total = parseFloat(document.getElementById("editTotalCost").value) || 0;
    let paid  = parseFloat(document.getElementById("editAmountPaid").value) || 0;
    document.getElementById("editRemainingAmount").value = (total - paid).toFixed(2);
}

function updatePatient(event) {
    event.preventDefault();
    let patientId   = document.getElementById("editPatientId").value;
    let oldName     = document.getElementById("editOldName").value;
    let mobileValue = document.getElementById("editMobile").value;
    if (!/^\d{10}$/.test(mobileValue)) { alert("Mobile number must be exactly 10 digits!"); return; }
    let newName = document.getElementById("editName").value;

    let patientData = {
        name: newName, old_name: oldName,
        mobile: mobileValue,
        email: document.getElementById("editEmail").value,
        age: document.getElementById("editAge").value,
        gender: document.getElementById("editGender").value,
        address: document.getElementById("editAddress").value,
        problem: document.getElementById("editProblem").value,
        visit_date: document.getElementById("editVisitDate").value
    };

    fetch(SERVER_URL + "/api/patients/" + patientId, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patientData)
    })
        .then(function (r) { return r.json(); })
        .then(function (result) {
            if (result.error) { alert("Error: " + result.error); return; }

            // Save treatment
            let treatmentId   = document.getElementById("editTreatmentId").value;
            let treatmentName = document.getElementById("editTreatmentName").value;
            if (treatmentName !== "") {
                let treatmentData = {
                    patient_id: patientId, patient_name: newName,
                    treatment_name: treatmentName,
                    step_completed: document.getElementById("editStepCompleted").value,
                    remaining_steps: parseInt(document.getElementById("editRemainingSteps").value) || 0,
                    next_date: document.getElementById("editNextDate").value
                };
                if (treatmentId) {
                    fetch(SERVER_URL + "/api/treatments/" + treatmentId, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(treatmentData) }).catch(console.error);
                } else {
                    fetch(SERVER_URL + "/api/treatments", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(treatmentData) }).catch(console.error);
                }
            }

            // Save prescription
            let prescriptionId = document.getElementById("editPrescriptionId").value;
            let treatmentGiven = document.getElementById("editTreatmentGiven").value;
            if (treatmentGiven !== "") {
                let prescriptionData = {
                    patient_id: patientId, patient_name: newName,
                    treatment_given: treatmentGiven,
                    medicines: document.getElementById("editMedicines").value,
                    notes: document.getElementById("editNotes").value,
                    date: document.getElementById("editPrescriptionDate").value
                };
                if (prescriptionId) {
                    fetch(SERVER_URL + "/api/prescriptions/" + prescriptionId, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(prescriptionData) }).catch(console.error);
                } else {
                    fetch(SERVER_URL + "/api/prescriptions", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(prescriptionData) }).catch(console.error);
                }
            }

            // Save bill
            let billId        = document.getElementById("editBillId").value;
            let billTreatment = document.getElementById("editBillTreatment").value;
            if (billTreatment !== "") {
                let totalCost  = parseFloat(document.getElementById("editTotalCost").value) || 0;
                let amountPaid = parseFloat(document.getElementById("editAmountPaid").value) || 0;
                let billData   = {
                    patient_id: patientId, patient_name: newName,
                    treatment: billTreatment,
                    total_cost: totalCost, amount_paid: amountPaid,
                    remaining_amount: totalCost - amountPaid,
                    payment_date: document.getElementById("editPaymentDate").value
                };
                if (billId) {
                    fetch(SERVER_URL + "/api/bills/" + billId, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(billData) }).catch(console.error);
                } else {
                    fetch(SERVER_URL + "/api/bills", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(billData) }).catch(console.error);
                }
            }

            alert("✅ All records for " + patientId + " updated successfully!");
            cancelEdit();
            document.getElementById("edit-search-table").style.display = "none";
            document.getElementById("editSearchInput").value = "";
        })
        .catch(function () { alert("Failed to update. Make sure the server is running!"); });
}

function cancelEdit() {
    document.getElementById("edit-section").style.display = "none";
    document.getElementById("edit-patient-form").reset();
}

// PATIENT SERVICE PAGE — Combined Treatment + Prescription + Billing
let _currentServicePatient = null;

function serviceUPILookup() {
    let input = document.getElementById("serviceUIDInput").value.trim();
    if (!input) { showNotFoundMsg("Please enter a Patient ID (e.g. P001) or Patient Name."); return; }

    lookupPatientByUID(input,
        function (patient) {
            _currentServicePatient = patient;
            showPatientInfoCard(patient);
            // Unlock form sections
            document.querySelectorAll(".service-form-section").forEach(function (el) {
                el.classList.remove("form-section-disabled");
            });
            // Load existing records for this patient
            loadPatientServiceRecords(patient);
        },
        function (errMsg) {
            _currentServicePatient = null;
            showNotFoundMsg(errMsg);
            document.querySelectorAll(".service-form-section").forEach(function (el) {
                el.classList.add("form-section-disabled");
            });
        }
    );
}

function loadPatientServiceRecords(patient) {
    getData("treatments", function (treatments) {
        let matched = treatments.filter(function (t) {
            return t.patient_id === patient.patient_id || t.patient_name.toLowerCase() === patient.name.toLowerCase();
        });
        renderServiceTreatmentsList(matched);
    });
    getData("prescriptions", function (prescriptions) {
        let matched = prescriptions.filter(function (p) {
            return p.patient_id === patient.patient_id || p.patient_name.toLowerCase() === patient.name.toLowerCase();
        });
        renderServicePrescriptionsList(matched);
    });
    getData("bills", function (bills) {
        let matched = bills.filter(function (b) {
            return b.patient_id === patient.patient_id || b.patient_name.toLowerCase() === patient.name.toLowerCase();
        });
        renderServiceBillsList(matched);
    });
}

function renderServiceTreatmentsList(treatments) {
    let container = document.getElementById("service-treatments-list");
    if (!container) return;
    if (treatments.length === 0) { container.innerHTML = "<p class='no-record'>No treatment records yet for this patient.</p>"; return; }
    let html = "<div class='table-responsive'><table><thead><tr><th>Treatment</th><th>Step Done</th><th>Remaining</th><th>Next Date</th></tr></thead><tbody>";
    for (let i = 0; i < treatments.length; i++) {
        let t = treatments[i];
        html += "<tr><td>" + (t.treatment_name || "") + "</td><td>" + (t.step_completed || "") + "</td><td>" + (t.remaining_steps || 0) + "</td><td>" + formatDate(t.next_date) + "</td></tr>";
    }
    html += "</tbody></table></div>";
    container.innerHTML = html;
}

function renderServicePrescriptionsList(prescriptions) {
    let container = document.getElementById("service-prescriptions-list");
    if (!container) return;
    if (prescriptions.length === 0) { container.innerHTML = "<p class='no-record'>No prescription records yet for this patient.</p>"; return; }
    let html = "<div class='table-responsive'><table><thead><tr><th>Treatment Given</th><th>Medicines</th><th>Notes</th><th>Date</th></tr></thead><tbody>";
    for (let i = 0; i < prescriptions.length; i++) {
        let p = prescriptions[i];
        html += "<tr><td>" + (p.treatment_given || "") + "</td><td>" + (p.medicines || "") + "</td><td>" + (p.notes || "") + "</td><td>" + formatDate(p.date) + "</td></tr>";
    }
    html += "</tbody></table></div>";
    container.innerHTML = html;
}

function renderServiceBillsList(bills) {
    let container = document.getElementById("service-bills-list");
    if (!container) return;
    if (bills.length === 0) { container.innerHTML = "<p class='no-record'>No billing records yet for this patient.</p>"; return; }
    let html = "<div class='table-responsive'><table><thead><tr><th>Treatment</th><th>Total (₹)</th><th>Paid (₹)</th><th>Remaining (₹)</th><th>Status</th><th>Date</th></tr></thead><tbody>";
    for (let i = 0; i < bills.length; i++) {
        let b = bills[i];
        let rem = parseFloat(b.remaining_amount || 0);
        let badge = rem <= 0 ? "<span class='badge badge-success'>Paid</span>" : "<span class='badge badge-warning'>Pending</span>";
        html += "<tr><td>" + (b.treatment || "") + "</td><td>₹" + parseFloat(b.total_cost || 0).toFixed(2) + "</td><td>₹" + parseFloat(b.amount_paid || 0).toFixed(2) + "</td><td>₹" + rem.toFixed(2) + "</td><td>" + badge + "</td><td>" + formatDate(b.payment_date) + "</td></tr>";
    }
    html += "</tbody></table></div>";
    container.innerHTML = html;
}

function switchServiceTab(tabName) {
    document.querySelectorAll(".service-tab").forEach(function (btn) { btn.classList.remove("active"); });
    document.getElementById("tab-btn-" + tabName).classList.add("active");
    document.querySelectorAll(".tab-pane").forEach(function (pane) { pane.classList.remove("active"); });
    document.getElementById("tab-" + tabName).classList.add("active");
}

function saveServiceTreatment(event) {
    event.preventDefault();
    if (!_currentServicePatient) { alert("⚠️ Please look up a patient first using their Patient ID."); return; }
    let treatment = {
        patient_id: _currentServicePatient.patient_id,
        patient_name: _currentServicePatient.name,
        treatment_name: document.getElementById("svc-treatmentName").value,
        step_completed: document.getElementById("svc-stepCompleted").value,
        remaining_steps: parseInt(document.getElementById("svc-remainingSteps").value) || 0,
        next_date: document.getElementById("svc-nextDate").value
    };
    saveToServer("treatments", treatment, function () {
        alert("✅ Treatment saved for " + _currentServicePatient.patient_id + " (" + _currentServicePatient.name + ")!");
        document.getElementById("service-treatment-form").reset();
        loadPatientServiceRecords(_currentServicePatient);
    });
}

function saveServicePrescription(event) {
    event.preventDefault();
    if (!_currentServicePatient) { alert("⚠️ Please look up a patient first using their Patient ID."); return; }
    let prescription = {
        patient_id: _currentServicePatient.patient_id,
        patient_name: _currentServicePatient.name,
        treatment_given: document.getElementById("svc-treatmentGiven").value,
        medicines: document.getElementById("svc-medicines").value,
        notes: document.getElementById("svc-notes").value,
        date: document.getElementById("svc-prescriptionDate").value
    };
    saveToServer("prescriptions", prescription, function () {
        alert("✅ Prescription saved for " + _currentServicePatient.patient_id + " (" + _currentServicePatient.name + ")!");
        document.getElementById("service-prescription-form").reset();
        loadPatientServiceRecords(_currentServicePatient);
    });
}

function saveServiceBill(event) {
    event.preventDefault();
    if (!_currentServicePatient) { alert("⚠️ Please look up a patient first using their Patient ID."); return; }
    let totalCost  = parseFloat(document.getElementById("svc-totalCost").value) || 0;
    let amountPaid = parseFloat(document.getElementById("svc-amountPaid").value) || 0;
    let bill = {
        patient_id: _currentServicePatient.patient_id,
        patient_name: _currentServicePatient.name,
        treatment: document.getElementById("svc-billTreatment").value,
        total_cost: totalCost,
        amount_paid: amountPaid,
        remaining_amount: totalCost - amountPaid,
        payment_date: document.getElementById("svc-paymentDate").value
    };
    saveToServer("bills", bill, function () {
        alert("✅ Bill saved for " + _currentServicePatient.patient_id + " (" + _currentServicePatient.name + ")!");
        document.getElementById("service-bill-form").reset();
        document.getElementById("svc-remainingAmount").value = "";
        loadPatientServiceRecords(_currentServicePatient);
    });
}

function calcServiceRemaining() {
    let total = parseFloat(document.getElementById("svc-totalCost").value) || 0;
    let paid  = parseFloat(document.getElementById("svc-amountPaid").value) || 0;
    document.getElementById("svc-remainingAmount").value = (total - paid).toFixed(2);
}

// DOMContentLoaded — Page Initialization
document.addEventListener("DOMContentLoaded", function () {
    // Form event listeners
    if (document.getElementById("add-patient-form"))          document.getElementById("add-patient-form").addEventListener("submit", savePatient);
    if (document.getElementById("edit-patient-form"))         document.getElementById("edit-patient-form").addEventListener("submit", updatePatient);
    if (document.getElementById("service-treatment-form"))    document.getElementById("service-treatment-form").addEventListener("submit", saveServiceTreatment);
    if (document.getElementById("service-prescription-form")) document.getElementById("service-prescription-form").addEventListener("submit", saveServicePrescription);
    if (document.getElementById("service-bill-form"))         document.getElementById("service-bill-form").addEventListener("submit", saveServiceBill);

    // Enter key support for lookups
    let uidInput   = document.getElementById("serviceUIDInput");
    if (uidInput)  uidInput.addEventListener("keydown",  function (e) { if (e.key === "Enter") { e.preventDefault(); serviceUPILookup(); } });
    let editSearch = document.getElementById("editSearchInput");
    if (editSearch) editSearch.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); searchForEdit(); } });

    // Auth check + page init
    checkAuth().then(function (user) {
        if (!user) return;
        populatePatientDatalist();
        if (document.getElementById("total-patients"))       loadDashboard();
        if (document.getElementById("records-table-body"))   loadAllRecords();
        if (document.getElementById("patient-table-body") && document.getElementById("searchName")) {
            getData("patients", function (patients) { displayPatients(patients); });
        }
        // Disable service forms until patient is looked up
        if (document.getElementById("service-treatment-form") || document.getElementById("service-prescription-form") || document.getElementById("service-bill-form")) {
            document.querySelectorAll(".service-form-section").forEach(function (el) { el.classList.add("form-section-disabled"); });
        }
    });
});
