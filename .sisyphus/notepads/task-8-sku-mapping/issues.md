# Task 8 - SKU Mapping Issues

## Problem: Supabase DNS Unresolvable

### Issue
DNS resolution fails for Supabase project URLs from this machine.

```
socket.gaierror: [Errno 8] nodename nor servname provided, or not known
host: NXDOMAIN
curl: HTTP_CODE:000 (connection failed)
```

### Verification
- Internet: Working (google.com accessible)
- supabase.com: Accessible (HTTP 200)
- Project URLs: NOT resolvable (DNS failure)

### Project Ref Discrepancy (CRITICAL)
Three different refs found:
- JWT ref: `fapnuczapcatelxxmrail` (matches .env.local)
- list_projects returned: `fapnuczaprtelxxmrail`
- Script had: `fapnuczapcktelxxmrail`

These are all DIFFERENT strings - possible project configuration issue.

### DNS Configuration
- Primary DNS: 100.100.100.100 (Tailscale VPN)
- Fallback DNS: 1.1.1.1 (Cloudflare)
- Both fail to resolve *.supabase.co project URLs

### Root Cause
Tailscale VPN DNS intercepts queries but cannot resolve external *.supabase.co domains.

### Workaround Available
- MCP tool `list_projects` works (uses Supabase internal infrastructure)
- Other MCP database operations fail with "permission denied"
- Script created at `/tmp/build_sku_mapping.py` - configured with correct URL from JWT/env

### Next Steps
1. Run `python3 /tmp/build_sku_mapping.py` once DNS is working
2. Verify output at `/tmp/sku_to_id.json`
3. Check evidence at `.sisyphus/evidence/task-8-sku-mapping.log`

### Possible Solutions
1. Disconnect Tailscale VPN and use default DNS
2. Add Supabase DNS to trusted domains in Tailscale
3. Use Supabase CLI (has built-in DNS handling)
4. Verify project ref is correct with Supabase dashboard
