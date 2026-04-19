export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')
  res.setHeader('Cache-Control', 'no-store')

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'Missing id' })

  const AIRTABLE_TOKEN   = process.env.AIRTABLE_TOKEN
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID
  const TABLE            = 'Doctors'

  const fields = [
    'OwnerID','OwnerName','Qualification','BusinessName','SubCategory',
    'BusinessType','City','Area','State','Phone','Email','GMB URL',
    'Plan','Active','PaymentType','ExpiryDate','ReviewCount','Rating',
    'ReferralCode','ReferralCount','ShippingStatus','CustomTags','Languages',
    'SelectedTags','NameVariations',
    'Tagline','GreetingMessage','PhotoURL','CoverURL','BusinessHours','WhatsApp','SocialLinks','Gender','Prefix','NFCDesign'
  ]

  const formula = `({OwnerID}=${parseInt(id)})`
  const url =
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE}` +
    `?filterByFormula=${encodeURIComponent(formula)}` +
    `&fields[]=${fields.join('&fields[]=')}`

  try {
    const atRes = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    })

    if (!atRes.ok) {
      console.error('Airtable error:', await atRes.text())
      return res.status(500).json({ error: 'Database error' })
    }

    const data = await atRes.json()

    if (!data.records?.length) {
      return res.status(404).json({ error: 'Business not found' })
    }

    const r = data.records[0].fields

    // Inactive check
    if (!r.Active) {
      return res.status(403).json({
        error: 'inactive',
        ownerName:    r.OwnerName    || '',
        businessName: r.BusinessName || ''
      })
    }

    // Expiry check — free plan never expires, only capped at 10 reviews
    const plan = r.Plan || 'free'
    if (plan !== 'free' && r.ExpiryDate) {
      const expiry = new Date(r.ExpiryDate)
      const today  = new Date()
      today.setHours(0, 0, 0, 0)
      if (expiry < today) {
        return res.status(403).json({
          error: 'expired',
          ownerName:    r.OwnerName    || '',
          businessName: r.BusinessName || ''
        })
      }
    }

    // Parse languages safely — fallback to 4 defaults
    let languages = ['English', 'Hindi', 'Gujarati', 'Hinglish']
    if (r.Languages) {
      try { languages = JSON.parse(r.Languages) } catch (_) {}
    }

    // Parse owner custom tags (legacy — kept for fallback)
    let ownerCustomTags = []
    if (r.CustomTags) {
      try { ownerCustomTags = JSON.parse(r.CustomTags) } catch (_) {}
    }

    // Parse selected tags
    let selectedTags = []
    if (r.SelectedTags) {
      try { selectedTags = JSON.parse(r.SelectedTags) } catch (_) {}
    }
    if (selectedTags.length === 0 && ownerCustomTags.length > 0) {
      selectedTags = ownerCustomTags.map(label => ({ id: null, label, type: 'custom' }))
    }

    // Parse name variations (used by AI — never shown to visitor)
    let nameVariations = []
    if (r.NameVariations) {
      try { nameVariations = JSON.parse(r.NameVariations) } catch (_) {}
    }

    // Customer custom tag limit derived from plan
    let customerCustomTagLimit = 0
    if      (plan.startsWith('ultimate')) customerCustomTagLimit = 5
    else if (plan.startsWith('premium'))  customerCustomTagLimit = 2

    // Free plan review cap
    const isFreePlan    = plan === 'free'
    const freeReviewCap = 10
    const reviewCount   = r.ReviewCount || 0

    if (isFreePlan && reviewCount >= freeReviewCap) {
      return res.status(403).json({
        error: 'free_limit_reached',
        ownerName:    r.OwnerName    || '',
        businessName: r.BusinessName || ''
      })
    }

    return res.status(200).json({
      id:                     parseInt(id),
      ownerName:              r.OwnerName     || '',
      qualification:          r.Qualification  || '',
      businessName:           r.BusinessName   || '',
      subCategory:            r.SubCategory    || '',
      businessType:           r.BusinessType   || 'doctor_health',
      city:                   r.City           || '',
      area:                   r.Area           || '',
      state:                  r.State          || '',
      gmbUrl:                 r['GMB URL']     || '',
      plan,
      isFreePlan,
      reviewCount,
      freeReviewCap,
      customerCustomTagLimit,
      rating:                 r.Rating         || null,
      referralCode:           r.ReferralCode   || '',
      languages,
      ownerCustomTags,
      selectedTags,
      nameVariations,
      // Personalization fields
      tagline:         r.Tagline         || '',
      greetingMessage: r.GreetingMessage || '',
      photoUrl:        r.PhotoURL        || '',
      coverUrl:        r.CoverURL        || '',
      businessHours:   r.BusinessHours   || '',
      whatsapp:        r.WhatsApp        || '',
      socialLinks:     (() => { try { return r.SocialLinks ? JSON.parse(r.SocialLinks) : {} } catch(_){ return {} } })(),
      gender:          (r.Gender || 'neutral').toLowerCase(),
      prefix:          r.Prefix || '',
      nfcDesign:       r.NFCDesign || '',
      // Dashboard fields
      active:         r.Active          !== false,
      paymentType:    r.PaymentType     || '',
      expiryDate:     r.ExpiryDate      || null,
      shippingStatus: r.ShippingStatus  || '',
      referralCount:  r.ReferralCount   || 0,
    })

  } catch (err) {
    console.error('Server error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
}
