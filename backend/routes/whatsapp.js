// backend/routes/whatsapp.js
const express = require('express');
const router = express.Router();
const { supabase } = require('../superbase');
const { transition } = require('../services/stateMachine');
const { sendWhatsAppMessage, sendFamilyCaregiverAlert } = require('../services/twilio');
const Groq = require('groq-sdk');

const groqApiKey = process.env.GROQ_API_KEY || 'dummy_key';
const groq = new Groq({ apiKey: groqApiKey });

/**
 * Groq 5-Intent Classifier Engine
 */
async function classifyIntentWithGroq(userText) {
  try {
    if (!process.env.GROQ_API_KEY) {
      console.warn('[Groq Classifier] No GROQ_API_KEY set, defaulting intent classification.');
      const upperText = userText.toUpperCase();
      if (upperText.includes('CONFIRM') || upperText.includes('YES') || upperText.includes('OK')) return 'CONFIRM';
      if (upperText.includes('PAIN') || upperText.includes('URGENT') || upperText.includes('EMERGENCY')) return 'URGENT';
      if (upperText.includes('RESCHEDULE') || upperText.includes('CANCEL') || upperText.includes('LATER')) return 'RESCHEDULE';
      return 'QUESTION';
    }

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are an AI intent classifier for a healthcare patient management system.
Classify the incoming patient message into EXACTLY ONE of the following 5 intents:
1. CONFIRM - Patient confirms, accepts, or agrees to an appointment/test.
2. RESCHEDULE - Patient wants to change the date, time, or postpone.
3. URGENT - Patient reports severe pain, emergency symptoms, or acute distress.
4. QUESTION - Patient asks a question about care, preparation, or instructions.
5. OTHER - Unrelated or general casual text.

Respond ONLY with a JSON object in this exact format:
{"intent": "CONFIRM"}`
        },
        {
          role: 'user',
          content: userText
        }
      ],
      response_format: { type: 'json_object' }
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    return parsed.intent || 'OTHER';
  } catch (err) {
    console.error('[Groq Classifier] Error running intent classification:', err.message);
    return 'OTHER';
  }
}

/**
 * Browser Health Check Endpoint
 * GET /api/whatsapp/inbound
 */
router.get('/inbound', (req, res) => {
  res.json({
    status: 'active',
    message: 'WhatsApp inbound webhook service is running. Send POST requests with patient payloads to trigger intent classification.'
  });
});

/**
 * Inbound Twilio Webhook Listener
 * POST /api/whatsapp/inbound
 */
router.post('/inbound', async (req, res) => {
  try {
    const incomingText = req.body.Body || req.body.text || '';
    const rawFrom = req.body.From || '';
    const cleanPhone = rawFrom.replace('whatsapp:', '').trim();

    console.log(`[WhatsApp Webhook] Inbound message from ${cleanPhone}: "${incomingText}"`);

    // 1. Classify intent via Groq
    const intent = await classifyIntentWithGroq(incomingText);
    console.log(`[WhatsApp Webhook] Classified Intent: ${intent}`);

    // 2. Identify patient by phone number
    const { data: patient } = await supabase
      .from('patients')
      .select('id, name')
      .eq('phone', cleanPhone)
      .single();

    let replyMessage = "Thank you for your response. CareLoop has updated your health record.";

    if (patient) {
      // Find latest pending or active care action
      const { data: actions } = await supabase
        .from('care_actions')
        .select('*')
        .eq('patient_id', patient.id)
        .in('state', ['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (actions && actions.length > 0) {
        const action = actions[0];

        if (intent === 'CONFIRM') {
          await transition(action.id, 'COMPLETED', 'Patient', 'Confirmed via WhatsApp', { raw_reply: incomingText });
          replyMessage = `Thank you, ${patient.name}. Your appointment confirmation has been recorded!`;
        } else if (intent === 'URGENT') {
          await transition(action.id, 'ESCALATED', 'Patient', 'Reported urgent symptoms via WhatsApp', { raw_reply: incomingText });
          replyMessage = `We have flagged your message as URGENT. A doctor or care coordinator is reviewing your record immediately.`;
          
          // Trigger Bonus 2: Parallel Family Caregiver Alert
          await sendFamilyCaregiverAlert(patient.id, `Urgent symptom reported by ${patient.name}: "${incomingText}"`);
        } else if (intent === 'RESCHEDULE') {
          replyMessage = `Your request to reschedule has been received. Our team will contact you shortly with available time slots.`;
        } else if (intent === 'QUESTION') {
          replyMessage = `Your question has been routed to your care team. They will reply shortly.`;
        }
      }
    }

    // 3. Send WhatsApp reply back
    await sendWhatsAppMessage(cleanPhone, replyMessage);

    // Return TwiML response to Twilio
    res.type('text/xml').send('<Response></Response>');
  } catch (err) {
    console.error('[WhatsApp Webhook Error]', err);
    res.status(500).send('<Response></Response>');
  }
});

module.exports = router;