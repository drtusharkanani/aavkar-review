export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  const { tagName, context, language, businessType, businessName } = req.body

  if (!tagName || !language) {
    return res.status(400).json({ error: 'tagName and language required' })
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'AI not configured' })

  const LANG_INSTRUCTIONS = {
    English:  'Respond in English only.',
    Hindi:    'Respond in Hindi (Devanagari script) only.',
    Gujarati: 'Respond in Gujarati (Gujarati script) only.',
    Hinglish: 'Respond in Hinglish — Hindi + English mixed in Latin script.',
    Marathi:  'Respond in Marathi (Devanagari script) only.',
    Tamil:    'Respond in Tamil (Tamil script) only.',
    Telugu:   'Respond in Telugu (Telugu script) only.',
    Kannada:  'Respond in Kannada (Kannada script) only.',
  }

  const langInstruction = LANG_INSTRUCTIONS[language] || LANG_INSTRUCTIONS.English

  const prompt = `You generate short review phrases for Google reviews.

Business: ${businessName || 'local business'}
Type: ${businessType || 'general'}
Customer tag (any language/script): "${tagName}"
Customer context: "${context || 'positive experience'}"
${langInstruction}

Generate 3 short review phrases (5-12 words each) about this specific tag.
Sound natural, warm, genuine — like a real customer.
Use the context to make it personal and specific.

Return ONLY a JSON array of 3 strings. No explanation, no markdown.
Example: ["phrase one","phrase two","phrase three"]`

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (!aiRes.ok) {
      console.error('Anthropic error:', await aiRes.text())
      return res.status(500).json({ error: 'AI generation failed' })
    }

    const aiData  = await aiRes.json()
    const rawText = aiData.content?.[0]?.text?.trim() || '[]'

    let phrases = []
    try {
      phrases = JSON.parse(rawText.replace(/```json|```/g, '').trim())
      if (!Array.isArray(phrases)) phrases = [rawText]
    } catch (_) {
      phrases = [rawText]
    }

    while (phrases.length < 3) phrases.push(phrases[0] || tagName)
    phrases = phrases.slice(0, 3)

    return res.status(200).json({ phrases, language })

  } catch (err) {
    console.error('Server error:', err)
    return res.status(500).json({ error: 'Server error' })
  }
}
