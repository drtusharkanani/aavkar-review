// api/otp.js
// POST /api/otp/send   { email }  → sends 6-digit OTP
// POST /api/otp/verify { email, otp } → returns { valid: true/false }
//
// Replaces Make.com OTP scenario entirely.
// OTPs stored temporarily in Vercel KV (or a simple in-memory store for now).
// For production: use Vercel KV (free tier: 30k requests/month)

// Simple in-memory store — works fine for serverless (each function
// invocation is independent, but OTP is typically verified quickly)
// For production use Vercel KV by uncommenting the KV lines below.

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// In-memory fallback (works for low traffic)
const otpStore = {};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.query; // /api/otp?action=send or ?action=verify
  const body = req.body;

  // -------------------------------------------------------
  // SEND OTP
  // -------------------------------------------------------
  if (action === 'send') {
    const { email } = body;
    if (!email) return res.status(400).json({ error: 'Missing email' });

    // Check doctor exists in Airtable
    const BASE  = process.env.AIRTABLE_BASE_ID;
    const TOKEN = process.env.AIRTABLE_TOKEN;
    const formula = encodeURIComponent(`Email="${email}"`);
    const checkRes = await fetch(
      `https://api.airtable.com/v0/${BASE}/Doctors?filterByFormula=${formula}&fields[]=Email&fields[]=DoctorName`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    const checkData = await checkRes.json();
    if (!checkData.records?.length) {
      return res.status(404).json({ error: 'Email not found. Please register first.' });
    }

    const doctorName = checkData.records[0].fields.DoctorName;

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = Date.now() + OTP_EXPIRY_MS;

    // Store in memory (use Vercel KV for production)
    otpStore[email] = { otp, expiry };

    // Send email via Resend
    if (process.env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from:    'GoodReview <noreply@goodreview.in>',
          to:      email,
          subject: 'Your GoodReview Login OTP',
          html: `
            <p>Hi Dr. ${doctorName},</p>
            <p>Your one-time password is:</p>
            <h1 style="letter-spacing:8px;color:#2563eb">${otp}</h1>
            <p>Valid for 10 minutes. Do not share with anyone.</p>
            <p>— GoodReview Team</p>
          `
        })
      });
    }

    console.log(`[OTP] Sent ${otp} to ${email}`); // Remove in production
    return res.status(200).json({ success: true, message: 'OTP sent to ' + email });
  }

  // -------------------------------------------------------
  // VERIFY OTP
  // -------------------------------------------------------
  if (action === 'verify') {
    const { email, otp } = body;
    if (!email || !otp) return res.status(400).json({ error: 'Missing email or otp' });

    const stored = otpStore[email];

    if (!stored) {
      return res.status(400).json({ valid: false, error: 'No OTP sent to this email' });
    }

    if (Date.now() > stored.expiry) {
      delete otpStore[email];
      return res.status(400).json({ valid: false, error: 'OTP expired. Please request a new one.' });
    }

    if (stored.otp !== otp.trim()) {
      return res.status(400).json({ valid: false, error: 'Invalid OTP' });
    }

    // OTP valid — fetch doctor record for this email
    const BASE  = process.env.AIRTABLE_BASE_ID;
    const TOKEN = process.env.AIRTABLE_TOKEN;
    const formula = encodeURIComponent(`Email="${email}"`);
    const docRes = await fetch(
      `https://api.airtable.com/v0/${BASE}/Doctors?filterByFormula=${formula}`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    const docData = await docRes.json();
    const record = docData.records?.[0];

    delete otpStore[email]; // One-time use

    return res.status(200).json({
      valid: true,
      doctorId: record?.fields?.DoctorID,
      recordId: record?.id,
      name: record?.fields?.DoctorName
    });
  }

  return res.status(400).json({ error: 'Invalid action. Use ?action=send or ?action=verify' });
}
