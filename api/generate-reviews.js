export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    businessName,
    subCategory,
    city,
    area,
    nameVariations, // array of name variations e.g. ["Dr. Jinkal","Dr. Dihora"]
    tags,           // array of tag labels
    lang            // single language string — always determined by client
  } = req.body

  if (!businessName || !tags?.length || !lang) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const tagCount = tags.length
  // Always generate full natural reviews regardless of tag count
  const sizeDesc = '2 to 3 natural sentences covering the customer experience'

  const locationHint = area && city ? `${area}, ${city}` : city || ''
  const tagList = tags.join(', ')

  const prompt = `You are writing 2 unique, natural-sounding Google Maps reviews for "${businessName}"${subCategory ? `, a ${subCategory}` : ''}${locationHint ? ` in ${locationHint}` : ''}.

The customer experienced: ${tagList}

${gender === 'female'
  ? "IMPORTANT: The owner/doctor is FEMALE. Always use female pronouns (she/her/hers) when referring to the doctor. NEVER use he/him."
  : gender === 'male'
  ? "IMPORTANT: The owner/doctor is MALE. Always use male pronouns (he/him/his) when referring to the doctor. NEVER use she/her."
  : "Use the doctor's name or 'the doctor' instead of pronouns — avoid he/she entirely."}

You MUST return exactly 2 reviews in the JSON array — never 1, never 3. Both in ${lang}. Rules:
- Length: ${sizeDesc} — do NOT write one-word or ultra-short reviews
- Both reviews must be DIFFERENT from each other — different words, different structure
- Sound like a real customer wrote it — natural, human
- No "Highly recommend!" closers — use natural endings or none
- One review may mention the location "${locationHint}" naturally if available
- Write in the NATIVE SCRIPT of ${lang} strictly following these rules:
  * English = plain natural English only
  * Hindi = PURE Devanagari script ONLY — zero English words — every single word must be in Hindi Devanagari script (e.g. "डॉक्टर ने बहुत ध्यान से जांच की और सही इलाज दिया। फीस भी उचित थी।")
  * Gujarati = 50% of reviews in Gujlish (Gujarati script + English words mixed, e.g. "Doctor ખૂબ helpful છે, fees reasonable છે") AND 50% in PURE Gujarati Lipi where even English words are written in Gujarati script (e.g. "ડૉક્ટર ખૂબ હેલ્પફુલ છે, ડાયગ્નોસિસ બરાબર કર્યું, ફીસ રીઝનેબલ છે"). Since you write 2 reviews — make review 1 Gujlish and review 2 pure Gujarati lipi.
  * Hinglish = Hindi words in Roman/English letters mixed with English (e.g. "Bahut achhe doctor hain, sab kuch clearly samjhaya, staff bhi helpful tha") — NO Devanagari script
  * Marathi = PURE Devanagari Marathi script — zero English words (e.g. "डॉक्टरांनी खूप काळजीपूर्वक तपासले. खूप चांगला अनुभव.")
  * Tamil = PURE Tamil script — zero English words (e.g. "மருத்துவர் மிகவும் கவனமாக பரிசோதித்தார்.")
  * Telugu = PURE Telugu script — zero English words (e.g. "డాక్టర్ చాలా జాగ్రత్తగా పరీక్షించారు.")
  * Kannada = PURE Kannada script — zero English words (e.g. "ವೈದ್ಯರು ತುಂಬಾ ಕಾಳಜಿಯಿಂದ ತಪಾಸಿದರು.")

CRITICAL: Return ONLY a valid JSON array with EXACTLY 2 objects — no explanation, no markdown, no backticks:
[
  {"text": "first review here", "lang": "${lang}"},
  {"text": "second review here", "lang": "${lang}"}
]`

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages:   [{ role: 'user', content: prompt }]
      })
    })

    const aiData = await aiRes.json()
    const raw    = aiData.content?.[0]?.text || ''

    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.error('AI did not return JSON:', raw)
      return res.status(500).json({ error: 'AI response parse error' })
    }

    const reviews = JSON.parse(jsonMatch[0])
    if (!Array.isArray(reviews) || reviews.length === 0) {
      return res.status(500).json({ error: 'Invalid AI response' })
    }

    return res.status(200).json({ reviews })

  } catch (err) {
    console.error('generate-reviews error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
}
