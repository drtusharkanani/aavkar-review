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
    businessHours, whatsapp, socialLinks
  } = req.body

  if (!recordId) return res.status(400).json({ error: 'Missing recordId' })

  // Build update fields
  const fields = {}
  if (languages    !== undefined) fields['Languages']    = languages
  if (customTags   !== undefined) fields['CustomTags']   = customTags
  if (selectedTags     !== undefined) fields['SelectedTags']    = selectedTags
  if (nameVariations  !== undefined) fields['NameVariations'] = nameVariations
  if (gmbUrl       !== undefined) fields['GMB URL']      = gmbUrl
  if (city         !== undefined) fields['City']         = city
  if (area         !== undefined) fields['Area']         = area
  if (state            !== undefined) fields['State']          = state
  if (tagline          !== undefined) fields['Tagline']        = tagline
  if (greetingMessage  !== undefined) fields['GreetingMessage'] = greetingMessage
  if (photoUrl         !== undefined) fields['PhotoURL']        = photoUrl
  if (coverUrl         !== undefined) fields['CoverURL']        = coverUrl
  if (businessHours    !== undefined) fields['BusinessHours']   = businessHours
  if (whatsapp         !== undefined) fields['WhatsApp']        = whatsapp
  if (socialLinks      !== undefined) fields['SocialLinks']     = socialLinks

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

    return res.status(200).json({ success: true })

  } catch (err) {
    console.error('Update error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
}
