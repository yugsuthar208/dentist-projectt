module.exports = {
    email: {
        enabled: process.env.EMAIL_ENABLED === "true",
        service: process.env.SMTP_SERVICE || "gmail",
        user: process.env.SMTP_USER || "",
        password: process.env.SMTP_PASSWORD || ""
    },
    sms: {
        enabled: process.env.SMS_ENABLED === "true",
        apiKey: process.env.FAST2SMS_API_KEY || ""
    },
    reminder: {
        hoursBeforeAppointment: 2,
        checkIntervalCron: "*/30 * * * *"
    }
};
