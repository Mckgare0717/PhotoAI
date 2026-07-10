# Deployment guides

Both guides use the same `docker-compose.prod.yml` + Caddy stack at the repo
root; only the provider steps differ.

- **[oracle.md](oracle.md)** — Oracle Cloud Always Free Ampere A1
  (4 OCPU / 24GB, arm64) in UK South (London). £0/month. **Recommended.**
- **[aws.md](aws.md)** — AWS EC2 `t3a.large` in eu-west-2 (London).
  ~$60–75/month on-demand. Requires a paid-plan account (the free plan
  blocks instance types this stack needs).

Provider-independent checklist (secrets, GDPR paperwork, threshold tuning)
lives in the root [README](../README.md#deploying-to-production).
