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

    // 1 month free access from today
    const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                         .toISOString().split('T')[0];

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
            Active:         true,
            ExpiryDate:     expiryDate,
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

    // Step 3: Send welcome email with QR code (non-fatal if it fails)
    try {
      if (process.env.RESEND_API_KEY) {
        const reviewUrl = `https://goodreview.in/review.html?id=${newId}`;
        const qrUrl     = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(reviewUrl)}`;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from:    'GoodReview <noreply@goodreview.in>',
            to:      body.email,
            subject: `Welcome to GoodReview! Your review page is LIVE, ${body.name}`,
            html: `
              <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a2e3b;">

                <div style="text-align:center;margin-bottom:24px;">
                  <div style="display:inline-block;background:#0a7c6e;color:white;font-size:22px;font-weight:800;padding:10px 24px;border-radius:50px;letter-spacing:1px;">
                    ✚ GoodReview
                  </div>
                </div>

                <h2 style="color:#0a7c6e;margin-bottom:8px;">Welcome, ${body.name}!</h2>
                <p style="color:#6b8191;margin-bottom:20px;">Your registration is confirmed. Here are your details:</p>

                <div style="background:#f4f9f8;border-radius:12px;padding:16px;margin-bottom:24px;">
                  <table style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:6px 0;color:#6b8191;font-size:13px;">Doctor ID</td><td style="padding:6px 0;font-weight:700;color:#0d2340;">#${newId}</td></tr>
                    <tr><td style="padding:6px 0;color:#6b8191;font-size:13px;">Name</td><td style="padding:6px 0;font-weight:600;color:#0d2340;">${body.name}</td></tr>
                    <tr><td style="padding:6px 0;color:#6b8191;font-size:13px;">Hospital</td><td style="padding:6px 0;font-weight:600;color:#0d2340;">${body.hospital || '—'}</td></tr>
                    <tr><td style="padding:6px 0;color:#6b8191;font-size:13px;">Plan</td><td style="padding:6px 0;font-weight:600;color:#0d2340;">${body.plan.replace(/_/g,' ').toUpperCase()}</td></tr>
                    <tr><td style="padding:6px 0;color:#6b8191;font-size:13px;">Free Access Until</td><td style="padding:6px 0;font-weight:700;color:#27ae60;">${expiryDate}</td></tr>
                    <tr><td style="padding:6px 0;color:#6b8191;font-size:13px;">Referral Code</td><td style="padding:6px 0;font-weight:700;color:#c9993a;">GR${newId}</td></tr>
                  </table>
                </div>

                <div style="text-align:center;margin-bottom:24px;">
                  <p style="font-weight:700;color:#0d2340;margin-bottom:12px;">📱 Your Patient Review QR Code</p>
                  <img src="${qrUrl}" alt="QR Code" width="200" height="200"
                       style="border:2px solid #d4e8e5;border-radius:12px;padding:10px;background:white;">
                  <p style="font-size:12px;color:#6b8191;margin-top:8px;">
                    Print this and place it at your reception desk.<br>
                    Patients scan → review generates → posts on Google!
                  </p>
                </div>

                <div style="text-align:center;margin-bottom:24px;">
                  <a href="${reviewUrl}"
                     style="display:inline-block;background:#0a7c6e;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">
                    🔗 View Your Review Page
                  </a>
                </div>

                <div style="background:#e8f7f5;border:1px solid #b0ddd8;border-radius:10px;padding:14px;margin-bottom:20px;">
                  <p style="font-size:13px;color:#0a7c6e;margin:0;">
                    ✅ <strong>Your review page is now LIVE!</strong><br>
                    Share your QR code with patients today.<br>
                    Free access valid for <strong>30 days</strong> from registration.
                  </p>
                </div>

                <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
                <p style="font-size:12px;color:#aac3be;text-align:center;">
                  Questions? WhatsApp us at <strong>+91 7984939486</strong><br>
                  <a href="https://goodreview.in" style="color:#0a7c6e;">goodreview.in</a>
                </p>

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
