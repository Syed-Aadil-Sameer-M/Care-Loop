// backend/services/twilio.js
const twilio = require('twilio');
const { supabase } = require('../superbase');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

const client = (accountSid && authToken) ? twilio(accountSid, authToken) : null;

/**
 * Sends an outbound WhatsApp message using Twilio SDK (with console logging fallback).
 */
async function sendWhatsAppMessage(toPhone, messageBody) {
  try {
    if (!client) {
      console.warn('[Twilio Service] Credentials missing or mocked. Message logged below:');
      console.log(`[Twilio Mock Dispatch] To: ${toPhone} | Message: ${messageBody}`);
      return { success: true, mocked: true };
    }

    const formattedTo = toPhone.startsWith('whatsapp:') ? toPhone : `whatsapp:${toPhone}`;

    const message = await client.messages.create({
      body: messageBody,
      from: fromPhone,
      to: formattedTo
    });

    console.log(`[Twilio Service] WhatsApp message sent. SID: ${message.sid}`);
    return { success: true, sid: message.sid };
  } catch (err) {
    console.error('[Twilio Service] Error sending message:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Bonus 2: Parallel Family Caregiver WhatsApp Messaging
 */
async function sendFamilyCaregiverAlert(patientId, messageBody) {
  try {
    const { data: patient, error } = await supabase
      .from('patients')
      .select('family_phone, family_name')
      .eq('id', patientId)
      .single();

    if (error || !patient || !patient.family_phone) {
      console.log(`[Twilio Service] No family caregiver registered for patient: ${patientId}`);
      return { success: false, reason: 'No family phone registered' };
    }

    const alertText = `[CareLoop Family Alert] Update regarding your family member: ${messageBody}`;
    console.log(`[Twilio Service] Triggering parallel alert to family caregiver (${patient.family_name || 'Caregiver'})...`);

    return await sendWhatsAppMessage(patient.family_phone, alertText);
  } catch (err) {
    console.error('[Twilio Service] Error sending caregiver alert:', err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  sendWhatsAppMessage,
  sendFamilyCaregiverAlert
};