export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')

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
    'SelectedTags'
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

    // Parse selected tags (new — owner-selected tags shown on review page)
    // Format: [{id, label, type}] where type = 'quality' | 'preset' | 'custom'
    let selectedTags = []
    if (r.SelectedTags) {
      try { selectedTags = JSON.parse(r.SelectedTags) } catch (_) {}
    }

    // If no selectedTags yet, fall back to showing ownerCustomTags as custom type
    if (selectedTags.length === 0 && ownerCustomTags.length > 0) {
      selectedTags = ownerCustomTags.map(label => ({ id: null, label, type: 'custom' }))
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
    })

  } catch (err) {
    console.error('Server error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
}
