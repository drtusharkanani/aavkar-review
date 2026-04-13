// Temporary redirect — delete this file after 2 days
// All traffic now goes to /api/business
export default async function handler(req, res) {
  const { id } = req.query
  return res.redirect(301, `/api/business?id=${id || ''}`)
}
