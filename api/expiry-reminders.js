// api/expiry-reminders.js
// Vercel Cron Job — runs daily at 8am IST (2:30am UTC)
// Sends renewal reminder emails at 30 days and 7 days before expiry
// Zero cost — uses existing Resend + Airtable env vars

export default async function handler(req, res) {
  // Security: only allow Vercel cron calls (or manual GET for testing)
  const authHeader = req.headers['authorization']
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && req.method !== 'GET') {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const AIRTABLE_TOKEN   = process.env.AIRTABLE_TOKEN
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID
  const RESEND_API_KEY   = process.env.RESEND_API_KEY
  const TABLE            = 'Doctors'
  const BASE_URL         = 'https://goodreview.in'

  const today     = new Date()
  today.setHours(0, 0, 0, 0)

  // Target dates: 30 days out and 7 days out
  const date30 = new Date(today); date30.setDate(today.getDate() + 30)
  const date7  = new Date(today); date7.setDate(today.getDate() + 7)

  function fmt(d) { return d.toISOString().split('T')[0] }

  const results = { sent: [], skipped: [], errors: [] }

  for (const { daysLeft, targetDate } of [
    { daysLeft: 30, targetDate: date30 },
    { daysLeft: 7,  targetDate: date7  }
  ]) {
    // Fetch businesses expiring on this exact date, active, paid plan
    const formula = encodeURIComponent(
      `AND({ExpiryDate}="${fmt(targetDate)}", {Active}=TRUE(), {Plan}!="free", {Plan}!="")`
    )
    const fields = ['OwnerID','OwnerName','BusinessName','Email','Plan','ExpiryDate','City']
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE}`
      + `?filterByFormula=${formula}&fields[]=${fields.join('&fields[]=')}`

    let records = []
    try {
      const atRes  = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } })
      const atData = await atRes.json()
      records = atData.records || []
    } catch (e) {
      results.errors.push(`Airtable fetch failed for ${daysLeft}d: ${e.message}`)
      continue
    }

    for (const rec of records) {
      const f = rec.fields
      if (!f.Email) { results.skipped.push(`${f.OwnerID} — no email`); continue }

      const firstName   = (f.OwnerName || 'there').split(' ')[0]
      const expiryFormatted = new Date(f.ExpiryDate).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric'
      })
      const isUrgent    = daysLeft === 7
      const subject     = isUrgent
        ? `⚠️ Your GoodReview page expires in 7 days — Renew now`
        : `📅 Your GoodReview plan expires in 30 days`

      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F7F7FC;font-family:Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px">
  <div style="background:${isUrgent ? 'linear-gradient(135deg,#E24B4A,#c0392b)' : 'linear-gradient(135deg,#FF6B00,#F5A623)'};border-radius:16px;padding:28px 24px;text-align:center;margin-bottom:16px">
    <div style="font-size:12px;color:rgba(255,255,255,0.85);letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">⭐ GOODREVIEW</div>
    <div style="font-size:28px;margin-bottom:8px">${isUrgent ? '⚠️' : '📅'}</div>
    <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:4px">${isUrgent ? 'Expiring in 7 Days!' : 'Renew in 30 Days'}</div>
    <div style="font-size:14px;color:rgba(255,255,255,0.9)">${f.BusinessName || 'Your Business'}</div>
  </div>

  <div style="background:#fff;border-radius:16px;padding:24px;box-shadow:0 2px 16px rgba(0,0,0,0.08);margin-bottom:14px">
    <p style="font-size:15px;color:#1A1A2E;margin-bottom:16px">Hi ${firstName},</p>
    <p style="font-size:14px;color:#5A5A7A;line-height:1.7;margin-bottom:16px">
      Your GoodReview subscription for <strong>${f.BusinessName || 'your business'}</strong> expires on
      <strong style="color:${isUrgent ? '#E24B4A' : '#FF6B00'}">${expiryFormatted}</strong>
      — that's <strong>${daysLeft} days away</strong>.
    </p>
    ${isUrgent
      ? `<div style="background:#FEEBEB;border-radius:10px;padding:14px;margin-bottom:16px;border-left:4px solid #E24B4A">
           <strong style="color:#E24B4A">⚠️ Action needed:</strong>
           <span style="color:#5A5A7A;font-size:13px"> After expiry your review page will go offline. Your QR code and NFC card will stop working.</span>
         </div>`
      : `<div style="background:#FFF3E8;border-radius:10px;padding:14px;margin-bottom:16px;border-left:4px solid #FF6B00">
           <strong style="color:#FF6B00">Good news:</strong>
           <span style="color:#5A5A7A;font-size:13px"> Your QR code and NFC card stay the same after renewal — no reprinting needed.</span>
         </div>`
    }
    <div style="text-align:center;margin:20px 0">
      <a href="${BASE_URL}/register.html" style="display:inline-block;background:${isUrgent ? '#E24B4A' : '#FF6B00'};color:#fff;padding:15px 32px;border-radius:12px;text-decoration:none;font-size:16px;font-weight:800">
        🔄 Renew My Plan Now →
      </a>
    </div>
    <p style="font-size:13px;color:#5A5A7A;text-align:center">
      Or WhatsApp us directly:
      <a href="https://wa.me/917984939486" style="color:#FF6B00;font-weight:700">+91 79849 39486</a>
    </p>
  </div>

  <div style="background:#E8F5EE;border-radius:12px;padding:16px;margin-bottom:14px">
    <div style="font-size:13px;font-weight:800;color:#1A7A4A;margin-bottom:8px">✅ What renewing keeps you:</div>
    <div style="font-size:13px;color:#5A5A7A;line-height:1.8">
      ✓ Review page stays live and active<br>
      ✓ Same QR code — no reprinting<br>
      ✓ Same NFC card — no replacement<br>
      ✓ All your reviews and settings saved
    </div>
  </div>

  <div style="text-align:center;padding:16px;font-size:12px;color:#5A5A7A">
    Questions? WhatsApp <a href="https://wa.me/917984939486" style="color:#FF6B00;font-weight:700">+91 79849 39486</a>
    or <a href="mailto:support.goodreview@gmail.com" style="color:#FF6B00">support.goodreview@gmail.com</a>
    <br><br>
    <a href="${BASE_URL}" style="color:#FF6B00;text-decoration:none;font-weight:700">goodreview.in</a>
  </div>
</div></body></html>`

      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method:  'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from:    'GoodReview <noreply@goodreview.in>',
            to:      [f.Email],
            subject,
            html
          })
        })
        if (emailRes.ok) {
          results.sent.push(`${f.OwnerID} — ${f.Email} — ${daysLeft}d warning`)
        } else {
          const err = await emailRes.json()
          results.errors.push(`${f.OwnerID} — email failed: ${err.message}`)
        }
      } catch (e) {
        results.errors.push(`${f.OwnerID} — exception: ${e.message}`)
      }
    }
  }

  console.log('Expiry reminders result:', JSON.stringify(results))
  return res.status(200).json({
    success: true,
    date:    fmt(today),
    ...results
  })
}
