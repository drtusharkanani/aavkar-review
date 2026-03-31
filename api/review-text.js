// api/review-text.js
// POST /api/review-text  { doctorId, text, rating }  → stores for 15 min
// GET  /api/review-text?docid=101                    → retrieves
//
// Used by the bookmarklet to auto-fill Google Maps review dialog.
// Simple in-memory store (sufficient for the use case — review is
// generated and used within seconds/minutes).

const store = {}; // { doctorId: { text, rating, ts } }

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — bookmarklet fetches review text
  if (req.method === 'GET') {
    const { docid } = req.query;
    if (!docid) return res.status(400).json({ error: 'Missing docid' });

    const entry = store[docid];
    if (!entry) return res.status(404).json({ text: null });

    // Expire after 15 minutes
    if (Date.now() - entry.ts > 15 * 60 * 1000) {
      delete store[docid];
      return res.status(404).json({ text: null });
    }

    return res.status(200).json({ text: entry.text, rating: entry.rating });
  }

  // POST — review.html stores review text when "Copy & Review" is clicked
  if (req.method === 'POST') {
    const { doctorId, text, rating } = req.body;
    if (!doctorId || !text) return res.status(400).json({ error: 'Missing doctorId or text' });

    store[doctorId] = { text, rating: rating || 5, ts: Date.now() };
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

