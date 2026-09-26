# Tier 4 — Stretch / Platform (NOT IMPLEMENTED)

Placeholder for the Tier 4 platform extension (later prompt). Planned scope:

- Versioned public REST API (`/api/v1/*`) with API keys
- Webhooks (submission events, signed deliveries, retry queue)
- Participation / winner certificates (PDF + verification codes)
- Publicly verifiable judge records (hash-chained result ledger)
- Embeddable gallery widget (`embed.js` + oEmbed-style endpoint)
- Bulk import/export (events, teams, projects, results CSV/JSON)

Backend returns `501 Not Implemented` for `/api/webhooks/*` and
`/api/certificates/*`.
