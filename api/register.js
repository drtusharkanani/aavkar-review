// api/register.js
// POST /api/register

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body;
  const required = ['name', 'email', 'phone', 'plan'];
  for (const f of required) {
    if (!body[f]) return res.status(400).json({ error: `Missing field: ${f}` });
  }

  try {
    const BASE    = process.env.AIRTABLE_BASE_ID;
    const TOKEN   = process.env.AIRTABLE_TOKEN;
    const HEADERS = {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    };

    // Step 1: Get highest existing DoctorID
    const listUrl  = `https://api.airtable.com/v0/${BASE}/Doctors?fields[]=DoctorID&sort[0][field]=DoctorID&sort[0][direction]=desc&maxRecords=1`;
    const listRes  = await fetch(listUrl, { headers: HEADERS });
    const listData = await listRes.json();
    const lastId   = listData.records?.[0]?.fields?.DoctorID || 100;
    const newId    = lastId + 1;

    // Step 2: Create new Airtable row
    const createRes = await fetch(
      `https://api.airtable.com/v0/${BASE}/Doctors`,
      {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({
          fields: {
            DoctorID:       newId,
            DoctorName:     body.name,
            Degree:         body.degree || '',
            Specialty:      body.specialty || '',
            Hospital:       body.hospital || '',
            City:           body.city || '',
            Area:           body.area || '',
            State:          body.state || '',
            Phone:          body.phone,
            Email:          body.email,
            'GMB URL':      body.gmbUrl || '',
            Plan:           body.plan,
            PaymentType:    body.paymentType || 'Online',
            Active:         false,
            ReviewCount:    0,
            ReferralCode:   `GR${newId}`,
            CustomTags:     body.customTags || '[]',
            ShippingStatus: (body.plan || '').includes('premium') || (body.plan || '').includes('ultimate')
                            ? 'Pending' : 'Not Required',
          }
        })
      }
    );

    if (!createRes.ok) {
      const err = await createRes.json();
      throw new Error(JSON.stringify(err));
    }

    const created  = await createRes.json();
    const recordId = created.id;

    // Step 3: Send welcome email via Resend (non-fatal if it fails)
    try {
      if (process.env.RESEND_API_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'GoodReview <noreply@goodreview.in>',
            to:      body.email,
            subject: `Welcome to GoodReview, ${body.name}!`,
            html: `
              <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
                <h2 style="color:#0a7c6e;">Welcome, ${body.name}!</h2>
                <p>Your registration is received successfully.</p>
                <p>Your <strong>Doctor ID is #${newId}</strong>.</p>
                <p>Your review page will be live at:</p>
                <p><a href="https://goodreview.in/review.html?id=${newId}" style="color:#0a7c6e;font-weight:bold;">
                  goodreview.in/review.html?id=${newId}
                </a></p>
                <p>We will activate your page within 24 hours of payment confirmation.</p>
                <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
                <p style="font-size:13px;color:#666;">Questions? WhatsApp: +91 7984939486</p>
                <p style="font-size:13px;color:#666;">— GoodReview Team</p>
              </div>
            `
          })
        });
      }
    } catch (emailErr) {
      console.log('Email send skipped:', emailErr.message);
    }

    return res.status(200).json({
      success:      true,
      doctorId:     newId,
      recordId,
      referralCode: `GR${newId}`,
      reviewUrl:    `https://goodreview.in/review.html?id=${newId}`
    });

  } catch (err) {
    console.error('register.js error:', err);
    return res.status(500).json({ error: 'Registration failed', detail: err.message });
  }
}
