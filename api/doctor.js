// api/doctor.js
// GET /api/doctor?id=101
// Returns doctor public data — no token exposed to frontend

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  try {
    const formula = encodeURIComponent(`DoctorID=${id}`);
    const fields = [
      'DoctorID','DoctorName','Degree','Specialty',
      'Hospital','City','Area','State',
      'GMB URL','Plan','Active','CustomTags',
      'Rating','ReviewCount','ReferralCode'
    ].map(f => `fields[]=${encodeURIComponent(f)}`).join('&');

    const url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Doctors?filterByFormula=${formula}&${fields}`;

    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}` }
    });

    if (!r.ok) throw new Error(`Airtable error ${r.status}`);
    const data = await r.json();

    if (!data.records?.length) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const doc = data.records[0].fields;

    // Only return if active
    if (!doc.Active) {
      return res.status(403).json({ error: 'This page is not active' });
    }

    return res.status(200).json({
      id:          doc.DoctorID,
      name:        doc.DoctorName,
      degree:      doc.Degree,
      specialty:   doc.Specialty,
      hospital:    doc.Hospital,
      city:        doc.City,
      area:        doc.Area,
      state:       doc.State,
      gmbUrl:      doc['GMB URL'],
      plan:        doc.Plan,
      customTags:  doc.CustomTags ? JSON.parse(doc.CustomTags) : [],
      rating:      doc.Rating || 5.0,
      reviewCount: doc.ReviewCount || 0,
      referralCode: doc.ReferralCode,
    });

  } catch (err) {
    console.error('doctor.js error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

