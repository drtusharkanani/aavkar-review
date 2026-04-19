// ── Cloudflare KV sync helper ─────────────────────────────────────
async function syncToFallback(id, gmbUrl) {
  const workerUrl    = process.env.CF_WORKER_URL
  const workerSecret = process.env.CF_WORKER_SECRET
  if (!workerUrl || !workerSecret || !id || !gmbUrl) return
  try {
    await fetch(`${workerUrl}/fallback/sync`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': workerSecret },
      body:    JSON.stringify({ id: String(id), gmbUrl })
    })
  } catch (e) {
    console.error('KV sync failed (non-critical):', e.message)
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

  const {
    recordId,
    languages, customTags, selectedTags, nameVariations,
    gmbUrl, city, area, state,
    tagline, greetingMessage, photoUrl, coverUrl,
    businessHours, whatsapp, socialLinks, nfcDesign,
    prefix, gender, reviewStyle
  } = req.body

  if (!recordId) return res.status(400).json({ error: 'Missing recordId' })

  // Build update fields
  const fields = {}
  if (languages        !== undefined) fields['Languages']       = languages
  if (customTags       !== undefined) fields['CustomTags']      = customTags
  if (selectedTags     !== undefined) fields['SelectedTags']    = selectedTags
  if (nameVariations   !== undefined) fields['NameVariations']  = nameVariations
  if (gmbUrl           !== undefined) fields['GMB URL']         = gmbUrl
  if (city             !== undefined) fields['City']            = city
  if (area             !== undefined) fields['Area']            = area
  if (state            !== undefined) fields['State']           = state
  if (tagline          !== undefined) fields['Tagline']         = tagline
  if (greetingMessage  !== undefined) fields['GreetingMessage'] = greetingMessage
  if (photoUrl         !== undefined) fields['PhotoURL']        = photoUrl
  if (coverUrl         !== undefined) fields['CoverURL']        = coverUrl
  if (businessHours    !== undefined) fields['BusinessHours']   = businessHours
  if (whatsapp         !== undefined) fields['WhatsApp']        = whatsapp
  if (socialLinks      !== undefined) fields['SocialLinks']     = socialLinks
  if (nfcDesign        !== undefined) fields['NFCDesign']       = nfcDesign
  if (prefix           !== undefined) fields['Prefix']          = prefix
  if (gender           !== undefined) fields['Gender']          = gender
  if (reviewStyle      !== undefined) fields['ReviewStyle']     = reviewStyle

  try {
    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Doctors/${recordId}`,
      {
        method:  'PATCH',
        headers: {
          'Authorization': `Bearer ${process.env.AIRTABLE_TOKEN}`,
          'Content-Type':  'application/json'
        },
        body: JSON.stringify({ fields })
      }
    )
    const data = await airtableRes.json()
    if (!airtableRes.ok) {
      console.error('Airtable error:', data)
      return res.status(500).json({ error: 'Failed to update. Please try again.' })
    }

    // Sync updated GMB URL to Cloudflare KV fallback (if changed)
    if (gmbUrl) {
      try {
        const idRes  = await fetch(
          `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/Doctors/${recordId}?fields[]=OwnerID&fields[]=GMB+URL`,
          { headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}` } }
        )
        const idData  = await idRes.json()
        const ownerId = idData.fields?.OwnerID
        if (ownerId) await syncToFallback(ownerId, gmbUrl)
      } catch(e) {
        console.error('KV sync lookup failed (non-critical):', e.message)
      }
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Update error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
}
