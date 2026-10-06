const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// Your development/test email
const DEV_EMAIL = 'aadilsameer22@gmail.com';

async function sendEmail(to, subject, html) {
    // During development, send everything to your email
    const recipient = process.env.NODE_ENV === 'production'
        ? to
        : DEV_EMAIL;

    if (!process.env.RESEND_API_KEY) {
        console.log(`[EMAIL MOCK] To: ${recipient} | Subject: ${subject}`);
        return { id: 'mock' };
    }

    return resend.emails.send({
        from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
        to: recipient,
        subject,
        html
    });
}

async function sendDoctorAlert(doctorEmail, patientName, message) {
    return sendEmail(
        doctorEmail,
        `CareLoop Alert — ${patientName}`,
        `
      <h2>CareLoop Care Alert</h2>
      <p>${message}</p>
      <p>Log in to CareLoop to take action.</p>
    `
    );
}

async function sendClosureEmail(doctorEmail, patientName, journeyId) {
    return sendEmail(
        doctorEmail,
        `✅ Care Loop Closed — ${patientName}`,
        `
      <h2>All care actions verified</h2>
      <p>
        Journey for <strong>${patientName}</strong> is now closed.
      </p>
      <p>
        <a href="${process.env.FRONTEND_URL}/journey/${journeyId}">
          View audit trail →
        </a>
      </p>
    `
    );
}

module.exports = {
    sendEmail,
    sendDoctorAlert,
    sendClosureEmail
};