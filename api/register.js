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
    const listUrl = `https://api.airtable.com/v0/${BASE}/Doctors?fields[]=DoctorID&sort[0][field]=DoctorID&sort[0][direction]=desc&maxRecords=1`;
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
            from: 'GoodReview <onboarding@resend.dev> ,
            to:      body.email,
            subject: `Welcome to GoodReview, ${body.name}!`,
            html: `
              <h2>Welcome, ${body.name}!</h2>
              <p>Your registration is received. Your Doctor ID is <strong>#${newId}</strong>.</p>
              <p>Your review page will be live at:<br>
                <a href="https://goodreview.in/review.html?id=${newId}">
                  goodreview.in/review.html?id=${newId}
                </a>
              </p>
              <p>We will activate your page within 24 hours of payment confirmation.</p>
              <p>Questions? WhatsApp: +91 7984939486</p>
              <p>— GoodReview Team</p>
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
