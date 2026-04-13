export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

  const AIRTABLE_TOKEN   = process.env.AIRTABLE_TOKEN
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID

  const { recordId, languages, customTags, gmbUrl, city, area, state } = req.body

  if (!recordId) return res.status(400).json({ error: 'recordId required' })

  // Whitelist — only these fields can be updated
  // Plan, OwnerID, Email, Phone can NEVER be changed via this endpoint
  const fields = {}
  if (languages  !== undefined) fields.Languages  = typeof languages === 'string' ? languages : JSON.stringify(languages)
  if (customTags !== undefined) fields.CustomTags = typeof customTags === 'string' ? customTags : JSON.stringify(customTags)
  if (gmbUrl)                   fields['GMB URL'] = gmbUrl
  if (city)                     fields.City       = city
  if (area  !== undefined)      fields.Area       = area
  if (state !== undefined)      fields.State      = state

  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ error: 'No fields to update' })
  }

  try {
    const updateRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Doctors/${recordId}`,
      {
        method:  'PATCH',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fields })
      }
    )

    if (!updateRes.ok) {
      const errText = await updateRes.text()
      console.error('Airtable update error:', errText)
      return res.status(500).json({ error: 'Failed to update profile' })
    }

    return res.status(200).json({ success: true })

  } catch (err) {
    console.error('Update error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
}
