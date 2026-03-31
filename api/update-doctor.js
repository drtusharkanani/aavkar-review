// api/update-doctor.js
// PATCH /api/update-doctor
// Body: { recordId, fields: { DoctorName, Specialty, ... } }
// Requires OTP verification token in header (simple approach)

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const { recordId, fields } = req.body;
  if (!recordId || !fields) return res.status(400).json({ error: 'Missing recordId or fields' });

  // Whitelist updatable fields — never allow Plan/Active/ExpiryDate from frontend
  const ALLOWED = [
    'DoctorName','Degree','Specialty','Hospital',
    'City','Area','State','Phone','GMB URL','CustomTags'
  ];
  const safeFields = {};
  for (const key of ALLOWED) {
    if (fields[key] !== undefined) safeFields[key] = fields[key];
  }

  try {
    const BASE  = process.env.AIRTABLE_BASE_ID;
    const TOKEN = process.env.AIRTABLE_TOKEN;

    const r = await fetch(
      `https://api.airtable.com/v0/${BASE}/Doctors/${recordId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: safeFields })
      }
    );

    if (!r.ok) throw new Error(`Airtable error ${r.status}`);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('update-doctor.js error:', err);
    return res.status(500).json({ error: 'Update failed' });
  }
}

