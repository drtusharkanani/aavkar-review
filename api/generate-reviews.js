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
    tags,       // array of tag labels
    lang        // single language string — always determined by client
  } = req.body

  if (!businessName || !tags?.length || !lang) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const tagCount = tags.length
  const sizeDesc = tagCount === 1
    ? 'one detailed sentence (15-20 words)'
    : tagCount === 2
    ? 'one medium sentence (8-12 words)'
    : 'one short sentence (4-7 words)'

  const locationHint = area && city ? `${area}, ${city}` : city || ''
  const tagList = tags.join(', ')

  const prompt = `You are writing 2 unique, natural-sounding Google Maps reviews for "${businessName}"${subCategory ? `, a ${subCategory}` : ''}${locationHint ? ` in ${locationHint}` : ''}.

The customer experienced: ${tagList}

Write exactly 2 reviews, both in ${lang}. Rules:
- Length: ${sizeDesc} per review (${tagCount} tag${tagCount > 1 ? 's' : ''} selected)
- Both reviews must be DIFFERENT from each other — different words, different structure
- Sound like a real customer wrote it — natural, human
- No "Highly recommend!" closers — use natural endings or none
- One review may mention the location "${locationHint}" naturally if available
- Write in the NATIVE SCRIPT of ${lang} (Hindi = Devanagari, Gujarati = ગુજરાતી script, Hinglish = Hindi words in Roman/English letters)

Return ONLY a valid JSON array — no explanation, no markdown, no backticks:
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
        max_tokens: 600,
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
