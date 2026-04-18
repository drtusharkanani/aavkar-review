// api/payment-verify.js
// POST /api/payment-verify
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, doctorId }
//
// Verifies Razorpay signature SERVER-SIDE (secure).
// Then activates the doctor in Airtable.

import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, doctorId } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment fields' });
  }

  try {
    // --- Step 1: Verify Razorpay signature ---
    const secret = process.env.RAZORPAY_KEY_SECRET;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      console.error('Signature mismatch!');
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    // --- Step 2: Calculate expiry date based on plan ---
    const BASE  = process.env.AIRTABLE_BASE_ID;
    const TOKEN = process.env.AIRTABLE_TOKEN;
    const HEADERS = {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    };

    // Get the owner's record
    const formula = encodeURIComponent(`OwnerID=${doctorId}`);
    const getRes = await fetch(
      `https://api.airtable.com/v0/${BASE}/Doctors?filterByFormula=${formula}&fields[]=Plan`,
      { headers: HEADERS }
    );
    const getData = await getRes.json();
    const record = getData.records?.[0];
    if (!record) return res.status(404).json({ error: 'Business not found' });

    const plan = record.fields.Plan || 'starter_1yr';
    const expiryDate = calcExpiry(plan);

    // --- Step 3: Activate business in Airtable ---
    await fetch(
      `https://api.airtable.com/v0/${BASE}/Doctors/${record.id}`,
      {
        method: 'PATCH',
        headers: HEADERS,
        body: JSON.stringify({
          fields: {
            Active:      true,
            PaymentType: 'Online',
            ExpiryDate:  expiryDate,
          }
        })
      }
    );

    // --- Step 4: Send activation email ---
    if (process.env.RESEND_API_KEY) {
      const nameRes = await fetch(
        `https://api.airtable.com/v0/${BASE}/Doctors?filterByFormula=${formula}&fields[]=OwnerName&fields[]=Email`,
        { headers: HEADERS }
      );
      const nameData = await nameRes.json();
      const doc = nameData.records?.[0]?.fields;
      if (doc?.Email) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from:    'GoodReview <noreply@goodreview.in>',
            to:      doc.Email,
            subject: 'Your GoodReview page is now LIVE!',
            html: `
              <h2>Congratulations, ${doc.OwnerName}!</h2>
              <p>Your payment is confirmed and your review page is now live.</p>
              <p><a href="https://goodreview.in/review.html?id=${doctorId}">
                View your review page
              </a></p>
              <p>Share this link with your customers to collect reviews.</p>
              <p>Plan expires: ${expiryDate}</p>
              <p>— GoodReview Team</p>
            `
          })
        });
      }
    }

    return res.status(200).json({
      success: true,
      activated: true,
      expiryDate,
      reviewUrl: `https://goodreview.in/review.html?id=${doctorId}`
    });

  } catch (err) {
    console.error('payment-verify.js error:', err);
    return res.status(500).json({ error: 'Server error', detail: err.message });
  }
}

function calcExpiry(plan) {
  const d = new Date();
  const years = plan.includes('5yr') ? 5 : plan.includes('2yr') ? 2 : 1;
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}
