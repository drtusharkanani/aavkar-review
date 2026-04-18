// api/upgrade-plan.js
// POST — upgrade or renew an existing business plan
// Body: { recordId, plan, paymentId }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  const { recordId, plan, paymentId } = req.body

  if (!recordId || !plan) {
    return res.status(400).json({ error: 'Missing recordId or plan' })
  }

  const TOKEN   = process.env.AIRTABLE_TOKEN
  const BASE_ID = process.env.AIRTABLE_BASE_ID
  const HEADERS = {
    Authorization:  `Bearer ${TOKEN}`,
    'Content-Type': 'application/json'
  }

  try {
    // ── Calculate new expiry ──────────────────────────────────────
    const years = plan.includes('5yr') ? 5 : plan.includes('2yr') ? 2 : 1
    const expiry = new Date()
    expiry.setFullYear(expiry.getFullYear() + years)
    const expiryDate = expiry.toISOString().split('T')[0]

    // ── Shipping status for premium/ultimate ──────────────────────
    const fields = {
      Plan:        plan,
      ExpiryDate:  expiryDate,
      Active:      true,
      PaymentType: paymentId ? 'Online' : 'Coupon',
    }
    if (plan.startsWith('premium') || plan.startsWith('ultimate')) {
      fields.ShippingStatus = 'Pending'
    }

    // ── Update Airtable ───────────────────────────────────────────
    const atRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/Doctors/${recordId}`,
      { method: 'PATCH', headers: HEADERS, body: JSON.stringify({ fields }) }
    )

    if (!atRes.ok) {
      const err = await atRes.json()
      return res.status(500).json({ error: err.error?.message || 'Airtable update failed' })
    }

    const atData = await atRes.json()
    const f      = atData.fields

    // ── Send confirmation email ───────────────────────────────────
    if (process.env.RESEND_API_KEY && f.Email) {
      const PLAN_LABELS = {
        starter_1yr:'Starter 1 Year', starter_2yr:'Starter 2 Years', starter_5yr:'Starter 5 Years',
        premium_1yr:'Premium 1 Year', premium_2yr:'Premium 2 Years', premium_5yr:'Premium 5 Years',
        ultimate_1yr:'Ultimate 1 Year',ultimate_2yr:'Ultimate 2 Years',ultimate_5yr:'Ultimate 5 Years'
      }
      const firstName  = (f.OwnerName || 'there').split(' ')[0]
      const planLabel  = PLAN_LABELS[plan] || plan
      const expiryFmt  = new Date(expiryDate).toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })
      const shippingNote = (plan.startsWith('premium') || plan.startsWith('ultimate'))
        ? `<p style="background:#FFF3E8;border-radius:8px;padding:12px;font-size:13px;color:#B85C00;margin:14px 0">📦 Your new NFC card / Standee will be shipped within 5–7 working days.</p>`
        : ''

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from:    'GoodReview <noreply@goodreview.in>',
          to:      [f.Email],
          subject: `✅ Plan upgraded to ${planLabel} — GoodReview`,
          html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F7F7FC;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px">
  <div style="background:linear-gradient(135deg,#1A7A4A,#27AE60);border-radius:16px;padding:28px 24px;text-align:center;margin-bottom:16px">
    <div style="font-size:12px;color:rgba(255,255,255,0.85);letter-spacing:2px;margin-bottom:8px">⭐ GOODREVIEW</div>
    <div style="font-size:28px;margin-bottom:8px">🎉</div>
    <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:4px">Plan Upgraded!</div>
    <div style="font-size:14px;color:rgba(255,255,255,0.9)">${f.BusinessName || 'Your Business'}</div>
  </div>
  <div style="background:#fff;border-radius:16px;padding:24px;box-shadow:0 2px 16px rgba(0,0,0,0.08);margin-bottom:14px">
    <p style="font-size:15px;color:#1A1A2E;margin-bottom:16px">Hi ${firstName}, your plan has been successfully upgraded!</p>
    <div style="background:#E8F5EE;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:11px;color:#5A5A7A;text-transform:uppercase;margin-bottom:4px">New Plan</div>
      <div style="font-size:16px;font-weight:800;color:#1A7A4A">${planLabel}</div>
      <div style="font-size:13px;color:#5A5A7A;margin-top:4px">Active until <strong>${expiryFmt}</strong></div>
    </div>
    <div style="background:#F7F7FC;border-radius:10px;padding:12px;margin-bottom:14px;font-size:13px;color:#5A5A7A">
      ✅ Your QR code and NFC card stay the same — no reprinting needed.<br>
      ✅ Your review page is active and updated.
    </div>
    ${shippingNote}
    <div style="text-align:center">
      <a href="https://goodreview.in/dashboard.html" style="display:inline-block;background:#FF6B00;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:700">View Dashboard →</a>
    </div>
  </div>
  <div style="text-align:center;padding:16px;font-size:12px;color:#5A5A7A">
    Questions? <a href="https://wa.me/917984939486" style="color:#FF6B00;font-weight:700">WhatsApp +91 79849 39486</a>
  </div>
</div></body></html>`
        })
      }).catch(() => {})
    }

    return res.status(200).json({ success: true, plan, expiryDate })

  } catch (err) {
    console.error('upgrade-plan error:', err)
    return res.status(500).json({ error: err.message || 'Server error' })
  }
}
