// seed-kv.js
// api/seed-kv.js — ONE TIME USE: backfill all existing businesses into Cloudflare KV
// Run once: visit https://goodreview.in/api/seed-kv?secret=YOUR_CRON_SECRET
// Delete this file after running.

export default async function handler(req, res) {
  if (req.query.secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const AIRTABLE_TOKEN   = process.env.AIRTABLE_TOKEN
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID
  const CF_WORKER_URL    = process.env.CF_WORKER_URL
  const CF_WORKER_SECRET = process.env.CF_WORKER_SECRET

  if (!CF_WORKER_URL || !CF_WORKER_SECRET) {
    return res.status(500).json({ error: 'CF_WORKER_URL or CF_WORKER_SECRET not set in Vercel env vars' })
  }

  // Fetch all active businesses with GMB URLs
  let allRecords = []
  let offset     = null

  do {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Doctors`
      + `?fields[]=OwnerID&fields[]=GMB+URL&fields[]=Active`
      + `&filterByFormula=AND({Active}=TRUE(),{GMB+URL}!="")`
      + (offset ? `&offset=${offset}` : '')

    const res2   = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } })
    const data   = await res2.json()
    allRecords   = allRecords.concat(data.records || [])
    offset       = data.offset || null
  } while (offset)

  // Sync each to KV
  const results = { synced: [], failed: [] }

  for (const rec of allRecords) {
    const id     = rec.fields?.OwnerID
    const gmbUrl = rec.fields?.['GMB URL']
    if (!id || !gmbUrl) continue

    try {
      const r = await fetch(`${CF_WORKER_URL}/fallback/sync`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Worker-Secret': CF_WORKER_SECRET },
        body:    JSON.stringify({ id: String(id), gmbUrl })
      })
      if (r.ok) results.synced.push(id)
      else results.failed.push(id)
    } catch(e) {
      results.failed.push(id)
    }
  }

  return res.status(200).json({
    success: true,
    total: allRecords.length,
    ...results,
    message: 'Done! Delete api/seed-kv.js from your repo now.'
  })
}
