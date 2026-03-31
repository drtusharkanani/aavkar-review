// api/increment-count.js
// POST /api/increment-count
// Body: { doctorId }
// Increments ReviewCount by 1 for free plan doctors

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { doctorId } = req.body;
  if (!doctorId) return res.status(400).json({ error: 'Missing doctorId' });

  try {
    const BASE    = process.env.AIRTABLE_BASE_ID;
    const TOKEN   = process.env.AIRTABLE_TOKEN;
    const HEADERS = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

    // Get current record
    const formula = encodeURIComponent(`DoctorID=${doctorId}`);
    const getRes  = await fetch(
      `https://api.airtable.com/v0/${BASE}/Doctors?filterByFormula=${formula}&fields[]=ReviewCount&fields[]=Plan`,
      { headers: HEADERS }
    );
    const getData = await getRes.json();
    const record  = getData.records?.[0];
    if (!record) return res.status(404).json({ error: 'Doctor not found' });

    // Only increment for free plan
    if (record.fields.Plan !== 'free') {
      return res.status(200).json({ success: true, skipped: true });
    }

    const newCount = (record.fields.ReviewCount || 0) + 1;

    await fetch(`https://api.airtable.com/v0/${BASE}/Doctors/${record.id}`, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify({ fields: { ReviewCount: newCount } })
    });

    return res.status(200).json({ success: true, newCount });

  } catch (err) {
    console.error('increment-count error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
