// In-memory OTP store — resets on cold start, sufficient for short-lived OTPs
const otpStore = new Map()

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, email, otp } = req.body
  const RESEND_API_KEY   = process.env.RESEND_API_KEY
  const AIRTABLE_TOKEN   = process.env.AIRTABLE_TOKEN
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID

  if (!email) return res.status(400).json({ error: 'Email required' })

  // ── SEND OTP ──────────────────────────────────────────────────
  if (action === 'send') {
    // Check email exists in Airtable
    const filter = encodeURIComponent(`({Email}="${email.toLowerCase()}")`)
    const atRes  = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Doctors?filterByFormula=${filter}&fields[]=OwnerID&fields[]=OwnerName&fields[]=BusinessName&fields[]=NameVariations`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    )
    const atData = await atRes.json()

    if (!atData.records?.length) {
      return res.status(404).json({ error: 'No account found with this email address.' })
    }

    // Generate 6-digit OTP
    const code    = Math.floor(100000 + Math.random() * 900000).toString()
    const expires = Date.now() + 10 * 60 * 1000 // 10 minutes

    // Store OTP
    otpStore.set(email.toLowerCase(), { code, expires, attempts: 0 })

    const record    = atData.records[0].fields
    const ownerName = record.OwnerName || 'there'

    // Send email via Resend
    if (RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method:  'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from:    'GoodReview <noreply@goodreview.in>',
            to:      [email],
            subject: `${code} — Your GoodReview login code`,
            html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F7F7FC;font-family:Arial,sans-serif">
<div style="max-width:480px;margin:0 auto;padding:20px">
  <div style="background:linear-gradient(135deg,#FF6B00,#F5A623);border-radius:16px;padding:24px;text-align:center;margin-bottom:16px">
    <div style="font-size:12px;color:rgba(255,255,255,0.85);letter-spacing:2px;margin-bottom:8px">⭐ GOODREVIEW</div>
    <div style="font-size:20px;font-weight:800;color:#fff">Login Code</div>
  </div>
  <div style="background:#fff;border-radius:16px;padding:24px;box-shadow:0 2px 16px rgba(0,0,0,0.08);text-align:center">
    <p style="font-size:15px;color:#1A1A2E;margin-bottom:20px">Hi ${ownerName.split(' ')[0]}, here is your login code:</p>
    <div style="background:#F7F7FC;border-radius:12px;padding:20px;margin-bottom:20px">
      <div style="font-size:42px;font-weight:800;letter-spacing:12px;color:#FF6B00">${code}</div>
    </div>
    <p style="font-size:13px;color:#5A5A7A">This code expires in <strong>10 minutes</strong>.<br>Do not share this code with anyone.</p>
  </div>
  <div style="background:#E8F5EE;border-radius:12px;padding:16px;margin-top:12px;text-align:center">
    <p style="font-size:12px;color:#1A7A4A;margin-bottom:8px;font-weight:700">⚙️ Manage Your Review Page</p>
    <p style="font-size:12px;color:#5A5A7A;margin-bottom:10px">Update your Google link, languages, and tags anytime.</p>
    <a href="https://goodreview.in/edit.html" style="display:inline-block;background:#1A7A4A;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Edit My Profile →</a>
  </div>
  <div style="text-align:center;padding:16px;font-size:12px;color:#5A5A7A">
    If you didn't request this, ignore this email.<br>
    <a href="https://goodreview.in" style="color:#FF6B00;text-decoration:none;">goodreview.in</a>
  </div>
</div></body></html>`
          })
        })
      } catch (e) {
        console.error('Email send error:', e)
        return res.status(500).json({ error: 'Failed to send OTP email. Please try again.' })
      }
    }

    return res.status(200).json({
      success: true,
      message: `OTP sent to ${email}`,
      ownerId: atData.records[0].fields.OwnerID
    })
  }

  // ── VERIFY OTP ────────────────────────────────────────────────
  if (action === 'verify') {
    if (!otp) return res.status(400).json({ error: 'OTP required' })

    const stored = otpStore.get(email.toLowerCase())

    if (!stored) {
      return res.status(400).json({ error: 'No OTP found. Please request a new code.' })
    }

    if (Date.now() > stored.expires) {
      otpStore.delete(email.toLowerCase())
      return res.status(400).json({ error: 'OTP expired. Please request a new code.' })
    }

    stored.attempts++
    if (stored.attempts > 5) {
      otpStore.delete(email.toLowerCase())
      return res.status(400).json({ error: 'Too many attempts. Please request a new code.' })
    }

    if (stored.code !== otp.toString()) {
      return res.status(400).json({ error: `Incorrect code. ${5 - stored.attempts} attempts remaining.` })
    }

    // OTP correct — delete it and return business data
    otpStore.delete(email.toLowerCase())

    // Fetch full business data
    const filter = encodeURIComponent(`({Email}="${email.toLowerCase()}")`)
    const atRes  = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Doctors?filterByFormula=${filter}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    )
    const atData = await atRes.json()

    if (!atData.records?.length) {
      return res.status(404).json({ error: 'Account not found.' })
    }

    const r = atData.records[0]
    const f = r.fields

    let languages = ['English', 'Hindi', 'Gujarati', 'Hinglish']
    try { if (f.Languages) languages = JSON.parse(f.Languages) } catch (_) {}

    let customTags = []
    try { if (f.CustomTags) customTags = JSON.parse(f.CustomTags) } catch (_) {}

    let selectedTags = []
    try { if (f.SelectedTags) selectedTags = JSON.parse(f.SelectedTags) } catch (_) {}

    let nameVariations = []
    try { if (f.NameVariations) nameVariations = JSON.parse(f.NameVariations) } catch (_) {}

    const plan = f.Plan || 'free'
    let tagLimit = 0
    if (plan.startsWith('ultimate')) tagLimit = 5
    else if (plan.startsWith('premium')) tagLimit = 2

    return res.status(200).json({
      success: true,
      recordId: r.id,
      business: {
        ownerId:      f.OwnerID,
        ownerName:    f.OwnerName    || '',
        businessName: f.BusinessName || '',
        subCategory:  f.SubCategory  || '',
        businessType: f.BusinessType || '',
        city:         f.City         || '',
        area:         f.Area         || '',
        state:        f.State        || '',
        gmbUrl:       f['GMB URL']   || '',
        plan,
        tagLimit,
        languages,
        customTags,
        selectedTags,
        nameVariations,
        // Dashboard stats
        active:         f.Active          !== false,
        reviewCount:    f.ReviewCount     || 0,
        rating:         f.Rating          || null,
        referralCount:  f.ReferralCount   || 0,
        expiryDate:     f.ExpiryDate      || null,
        paymentType:    f.PaymentType     || '',
        shippingStatus: f.ShippingStatus  || '',
        // Personalization fields
        tagline:         f.Tagline         || '',
        greetingMessage: f.GreetingMessage || '',
        photoUrl:        f.PhotoURL        || '',
        coverUrl:        f.CoverURL        || '',
        businessHours:   f.BusinessHours   || '',
        whatsapp:        f.WhatsApp        || '',
        socialLinks:     (() => { try { return f.SocialLinks ? JSON.parse(f.SocialLinks) : {} } catch(_){ return {} } })(),
      }
    })
  }

  return res.status(400).json({ error: 'Invalid action. Use send or verify.' })
}
