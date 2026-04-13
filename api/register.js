import { Resend } from 'resend'
import QRCode from 'qrcode'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const AIRTABLE_TOKEN   = process.env.AIRTABLE_TOKEN
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID
  const RESEND_API_KEY   = process.env.RESEND_API_KEY
  const TABLE            = 'Doctors'
  const BASE_URL         = 'https://goodreview.in'

  const {
    ownerName, qualification, businessName, phone, email,
    city, area, state, gmbUrl, referralCode,
    businessType, subCategory, languages, customTags,
    plan, paymentId, paymentType
  } = req.body

  // ── Basic validation ─────────────────────────────────────────
  if (!ownerName || !businessName || !phone || !email || !city || !gmbUrl || !businessType || !plan) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    // ── Step 1: Get next OwnerID ────────────────────────────────
    // Fetch all records sorted by OwnerID descending to get max
    const listUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE}`
      + `?fields[]=OwnerID&sort[0][field]=OwnerID&sort[0][direction]=desc&maxRecords=1`

    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    })
    const listData = await listRes.json()
    const lastId = listData.records?.[0]?.fields?.OwnerID || 100
    const newId  = lastId + 1

    // ── Step 2: Calculate expiry ────────────────────────────────
    // Free plan: no expiry | Paid: based on duration suffix
    let expiryDate = null
    if (plan !== 'free') {
      const days = plan.endsWith('5yr') ? 1825
                 : plan.endsWith('2yr') ? 730
                 : 365
      const expiry = new Date()
      expiry.setDate(expiry.getDate() + days)
      expiryDate = expiry.toISOString().split('T')[0]
    }

    // ── Step 3: Build Airtable record ──────────────────────────
    const referralCodeNew = `GR${newId}`

    // Handle referral — find referring owner and increment their count
    if (referralCode) {
      try {
        const refFilter = encodeURIComponent(`({ReferralCode}="${referralCode.toUpperCase()}")`)
        const refRes = await fetch(
          `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE}?filterByFormula=${refFilter}&fields[]=ReferralCount`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        )
        const refData = await refRes.json()
        if (refData.records?.length) {
          const refRecord  = refData.records[0]
          const refCount   = (refRecord.fields.ReferralCount || 0) + 1
          await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE}/${refRecord.id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ fields: { ReferralCount: refCount } })
          })
        }
      } catch (_) { /* referral update failure is non-critical */ }
    }

    const fields = {
      OwnerID:        newId,
      OwnerName:      ownerName,
      Qualification:  qualification || '',
      BusinessName:   businessName,
      SubCategory:    subCategory   || '',
      BusinessType:   businessType,
      City:           city,
      Area:           area          || '',
      State:          state         || '',
      Phone:          phone,
      Email:          email,
      'GMB URL':      gmbUrl,
      Plan:           plan,
      Active:         true,
      PaymentType:    paymentType   || 'Free',
      ReviewCount:    0,
      ReferralCode:   referralCodeNew,
      ReferralCount:  0,
      ShippingStatus: needsShipping(plan) ? 'Pending' : 'Not Required',
      Languages:      languages     || '["English","Hindi","Gujarati","Hinglish"]',
      CustomTags:     customTags    || '[]',
    }

    // Only set ExpiryDate for paid plans
    if (expiryDate) fields.ExpiryDate = expiryDate

    // ── Step 4: Create Airtable record ─────────────────────────
    const createRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields })
      }
    )

    if (!createRes.ok) {
      const err = await createRes.text()
      console.error('Airtable create error:', err)
      return res.status(500).json({ error: 'Failed to create record' })
    }

    // ── Step 5: Generate QR code as base64 PNG ─────────────────
    const reviewUrl = `${BASE_URL}/review.html?id=${newId}`
    let qrDataUrl = ''
    try {
      qrDataUrl = await QRCode.toDataURL(reviewUrl, {
        width: 400,
        margin: 2,
        color: { dark: '#1A1A2E', light: '#FFFFFF' }
      })
    } catch (_) { /* QR generation failure non-critical */ }

    // ── Step 6: Send welcome email ─────────────────────────────
    if (RESEND_API_KEY && email) {
      try {
        const resend = new Resend(RESEND_API_KEY)

        const planLabel  = getPlanLabel(plan)
        const expiryText = expiryDate
          ? `Your plan is active until <strong>${formatDate(expiryDate)}</strong>.`
          : `Your Free plan is active with up to <strong>10 reviews</strong>.`

        const shippingText = needsShipping(plan)
          ? `<p style="background:#FFF3E8;border-radius:8px;padding:12px 16px;font-size:13px;color:#B85C00">
               📦 Your physical items (NFC card / Standee) will be shipped to ${city} within 5–7 working days.
             </p>`
          : ''

        const qrImg = qrDataUrl
          ? `<div style="text-align:center;margin:20px 0">
               <img src="${qrDataUrl}" width="200" height="200" alt="QR Code"
                    style="border-radius:12px;border:4px solid #FF6B00"/>
               <p style="font-size:12px;color:#5A5A7A;margin-top:8px">Your QR Code — print and display at your business</p>
             </div>`
          : ''

        await resend.emails.send({
          from:    'GoodReview <noreply@goodreview.in>',
          to:      email,
          subject: `🎉 Welcome to GoodReview — Your review page is live!`,
          html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F7FC;font-family:'Nunito',Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#FF6B00,#F5A623);border-radius:16px;padding:28px 24px;text-align:center;margin-bottom:16px">
    <div style="font-size:12px;font-weight:700;color:rgba(255,255,255,0.85);letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">⭐ GOODREVIEW</div>
    <div style="font-size:24px;font-weight:800;color:#fff;margin-bottom:4px">You're Live, ${ownerName.split(' ')[0]}!</div>
    <div style="font-size:14px;color:rgba(255,255,255,0.9)">${businessName}</div>
  </div>

  <!-- Main card -->
  <div style="background:#fff;border-radius:16px;padding:24px;box-shadow:0 2px 16px rgba(0,0,0,0.08);margin-bottom:14px">
    <p style="font-size:15px;color:#1A1A2E;margin-bottom:16px">
      Your GoodReview page is active. Customers can now scan the QR code or visit the link below to leave you a Google review in seconds.
    </p>

    <!-- Review URL -->
    <div style="background:#F7F7FC;border-radius:10px;padding:14px;margin-bottom:16px;text-align:center">
      <div style="font-size:11px;font-weight:700;color:#5A5A7A;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Your Review Page</div>
      <a href="${reviewUrl}" style="font-size:14px;font-weight:800;color:#FF6B00;text-decoration:none">${reviewUrl}</a>
    </div>

    ${qrImg}

    <!-- Plan info -->
    <div style="background:#E8F5EE;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:11px;font-weight:700;color:#5A5A7A;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">Your Plan</div>
      <div style="font-size:15px;font-weight:800;color:#1A7A4A">${planLabel}</div>
      <div style="font-size:13px;color:#5A5A7A;margin-top:4px">${expiryText}</div>
    </div>

    ${shippingText}

    <!-- Details -->
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="padding:6px 0;color:#5A5A7A;width:40%">Business ID</td><td style="padding:6px 0;font-weight:700;color:#1A1A2E">${newId}</td></tr>
      <tr><td style="padding:6px 0;color:#5A5A7A">Referral Code</td><td style="padding:6px 0;font-weight:700;color:#FF6B00">${referralCodeNew}</td></tr>
      <tr><td style="padding:6px 0;color:#5A5A7A">City</td><td style="padding:6px 0;font-weight:700;color:#1A1A2E">${city}${area ? ', ' + area : ''}</td></tr>
    </table>
  </div>

  <!-- Tips -->
  <div style="background:#fff;border-radius:16px;padding:20px;box-shadow:0 2px 16px rgba(0,0,0,0.08);margin-bottom:14px">
    <div style="font-size:14px;font-weight:800;color:#1A1A2E;margin-bottom:12px">🚀 How to get more reviews</div>
    <div style="font-size:13px;color:#5A5A7A;line-height:1.8">
      ✅ Print the QR code and place it at your reception / counter<br>
      ✅ Ask customers to scan after their visit<br>
      ✅ Share your review link on WhatsApp<br>
      ✅ Add to your Instagram / Facebook bio
    </div>
  </div>

  <!-- Support -->
  <div style="text-align:center;padding:16px;font-size:12px;color:#5A5A7A">
    Questions? WhatsApp us at <a href="https://wa.me/917984939486" style="color:#FF6B00;font-weight:700">+91 79849 39486</a><br>
    or email <a href="mailto:support.goodreview@gmail.com" style="color:#FF6B00">support.goodreview@gmail.com</a><br><br>
    <a href="${BASE_URL}" style="color:#FF6B00;font-weight:700">goodreview.in</a>
  </div>

</div>
</body>
</html>`
        })
      } catch (emailErr) {
        console.error('Email send error:', emailErr)
        // Non-critical — registration still succeeds
      }
    }

    // ── Step 7: Return success ──────────────────────────────────
    return res.status(200).json({
      success:    true,
      ownerId:    newId,
      reviewUrl,
      plan,
      expiryDate: expiryDate || null,
      referralCode: referralCodeNew
    })

  } catch (err) {
    console.error('Register error:', err)
    return res.status(500).json({ error: 'Registration failed. Please try again.' })
  }
}

// ── Helpers ─────────────────────────────────────────────────────
function needsShipping(plan) {
  return plan.startsWith('premium') || plan.startsWith('ultimate')
}

function getPlanLabel(plan) {
  const map = {
    free:         'Free Plan',
    starter_1yr:  'Starter — 1 Year',
    starter_2yr:  'Starter — 2 Years',
    starter_5yr:  'Starter — 5 Years',
    premium_1yr:  'Premium — 1 Year',
    premium_2yr:  'Premium — 2 Years',
    premium_5yr:  'Premium — 5 Years',
    ultimate_1yr: 'Ultimate — 1 Year',
    ultimate_2yr: 'Ultimate — 2 Years',
    ultimate_5yr: 'Ultimate — 5 Years',
  }
  return map[plan] || plan
}

function formatDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })
}
