# Eve Agent Runbook — Monitoring and Rollback

Operational guide for the Eve WhatsApp agent once Stage 6 routing is live. The
legacy agent continues to run in parallel and remains the fallback.

## Feature flag

`WHATSAPP_EVE_ENABLED` controls which agent handles inbound WhatsApp messages:

- `true` / `1` / `yes` → Eve agent (forwarded to `/eve/v1/whatsapp`).
- `false` (or unset) → legacy agent.

The flag is read per request, so it takes effect immediately after a redeploy.
Meta's webhook URL stays pointed at `/api/whatsapp/webhook` in both modes; the
route decides internally.

## Enable Eve

```bash
vercel env add WHATSAPP_EVE_ENABLED production
# value: true
vercel --prod
```

## Quick rollback (to legacy)

```bash
vercel env add WHATSAPP_EVE_ENABLED production
# value: false
vercel --prod
```

Rollback takes ~2 minutes. No Meta webhook URL change is required.

## Monitoring

### Vercel Agent Runs
- URL: `https://vercel.com/<team>/<project>/observability/agent-runs`
- Shows every Eve session: tool calls and results, model reasoning, token usage,
  timing, and errors.

### Vercel logs
- URL: `https://vercel.com/<team>/<project>/logs`
- Filter by `whatsapp_webhook_route` to see the routing decision, or by
  `webhook.` (legacy AI observability) to trace the legacy path.
- The route logs a structured JSON record per POST with `agent` = `eve` or
  `legacy`, the `correlationId`, and the inbound `messageId` when available.

### Key metrics / targets
| Metric | Target |
| --- | --- |
| Error rate | < 5% |
| Response time | < 3 s |
| Success rate | > 95% |

## Alerting (suggested in Vercel)

- Error rate > 5%.
- 95th-percentile response time > 5 s.
- Spike in Eve forward failures (search logs for `forwarding error`).

## Common issues

### Eve agent not responding
1. Check Vercel logs for `forwarding error` or `[Eve]`.
2. Confirm `WHATSAPP_EVE_ENABLED=true` and `WHATSAPP_*` credentials are present.
3. Check Vercel Agent Runs for session errors.
4. Roll back to legacy if the issue persists.

### High error rate
1. Inspect Vercel Agent Runs for failing tool calls.
2. Check Supabase connectivity.
3. Check Meta Graph API status.
4. Roll back if unresolved.

### Slow responses
1. Check Vercel Agent Runs for slow tool calls.
2. Check Supabase query latency.
3. Consider scaling Vercel functions.

## Rollback checklist

- [ ] Set `WHATSAPP_EVE_ENABLED=false`.
- [ ] Redeploy to production (`vercel --prod`).
- [ ] Verify Meta webhook still points at `/api/whatsapp/webhook`.
- [ ] Confirm the legacy agent responds.
- [ ] Check logs for errors.
- [ ] Notify the team.
- [ ] Investigate the cause, fix, and re-test before re-enabling Eve.
