# Gate relay (fixed egress for CofePlus)

Vercel functions leave from rotating IPs. CofePlus asked us to send live Gate
traffic through one fixed address instead:

```
kafei-admin (Vercel sin1) -> 139.59.226.215:443 -> service-gate.cofeplus.com:443 (8.153.75.138)
```

The relay is a plain TCP passthrough (Nginx `stream`). TLS runs end to end
between kafei-admin and the Gate, so the relay holds no certificate, key or
token. The request URL, SNI, certificate name, Host header and JWT are all
unchanged. Only the socket destination changes.

A fixed IP changes and pins the path. It does not by itself guarantee the Gate
is reachable, so keep an eye on the tests below.

## The server

| | |
| --- | --- |
| Provider | DigitalOcean, project `kafei` |
| Droplet | `kafei-gate-relay` (id 606067001), SGP1, Ubuntu 24.04, 1 vCPU / 512 MB, $4/mo |
| Public IP | `139.59.226.215` (inbound and outbound, this is the IP CofePlus sees) |
| SSH user | `root`, key only (password login is off) |
| SSH key | `~/.ssh/kafei_gate_relay` on Lester's Mac, public half saved in DigitalOcean as `kafei-gate-relay` |
| Firewall | ufw: 22 and 443 in |
| Config | `/etc/nginx/nginx.conf` (copy of `nginx.conf` in this folder) |
| Log | `/var/log/nginx/relay.log` |

The IP stays the same for the life of the droplet. Destroying and recreating
the droplet gives a new IP, which CofePlus and Vercel would both need.

## Connect

```bash
ssh -i ~/.ssh/kafei_gate_relay root@139.59.226.215
```

On another machine, copy `~/.ssh/kafei_gate_relay` over first (`chmod 600`),
or add a new public key to `/root/.ssh/authorized_keys`. If the key is lost,
use the Droplet Console in the DigitalOcean panel (Droplet, Access, Launch
Droplet Console) and add a new key there.

## Everyday commands (on the droplet)

```bash
# Is the relay up and listening on 443
systemctl status nginx --no-pager && ss -ltn | grep ':443'
```

```bash
# Watch relayed connections live (sni, upstream, connect time)
tail -f /var/log/nginx/relay.log
```

```bash
# Droplet to Gate, bypassing nginx. Expect 200.
curl -sS -m 10 -o /dev/null -w '%{http_code} connect=%{time_connect}s total=%{time_total}s\n' https://service-gate.cofeplus.com/health/liveness
```

```bash
# After editing /etc/nginx/nginx.conf
nginx -t && systemctl reload nginx
```

To push the config from this repo:

```bash
scp -i ~/.ssh/kafei_gate_relay infra/gate-relay/nginx.conf root@139.59.226.215:/etc/nginx/nginx.conf && ssh -i ~/.ssh/kafei_gate_relay root@139.59.226.215 'nginx -t && systemctl reload nginx'
```

## Test the whole path from any machine

Through the relay, with the real hostname for SNI and certificate checks.
Expect `200`:

```bash
curl -sS -m 10 -o /dev/null -w '%{http_code} %{time_total}s\n' --resolve service-gate.cofeplus.com:443:139.59.226.215 https://service-gate.cofeplus.com/health/liveness
```

Any other hostname is dropped by the relay (curl reports `000`):

```bash
curl -sS -m 6 -o /dev/null -w '%{http_code}\n' --resolve example.com:443:139.59.226.215 https://example.com/
```

## Turn it on in kafei-admin

1. Vercel, kafei-admin, Environment Variables: add
   `COFEPLUS_LIVE_CONNECT_IP=139.59.226.215` (Production), then redeploy.
2. Call the diagnostics route on the deployed app a few times:

```bash
curl -sS -H "x-diag-token: $COFEPLUS_DIAG_TOKEN" https://<admin-domain>/api/diag/cofeplus
```

The response has `relayIp` plus three extra probes per round: `relay tcp 443`,
`relay liveness no auth`, `relay pod status with auth`. They should pass
consistently, including on runs where the direct probes fail.

3. Then one controlled live order. Retries of the same order reuse the same
   `Idempotency-Key` (`lib/cofeplus/queue.ts` builds it from the order id). If
   a dispatch call times out or returns an unclear result, check the order's
   dispatch status on the Gate before retrying, so a drink is never made twice.

Only the live host uses the relay. `service-gate.test.cofeplus.com` always
connects directly.

## Rollback

Remove `COFEPLUS_LIVE_CONNECT_IP` in Vercel and redeploy. Traffic goes direct
again. The droplet can stay or be destroyed.

## If something breaks

- Relay probes fail, droplet-to-Gate curl passes: nginx problem. Check
  `systemctl status nginx` and `/var/log/nginx/error.log`.
- Droplet-to-Gate curl fails: the path from DigitalOcean to the Gate is down.
  The relay cannot fix that. Roll back and tell CofePlus, giving them
  `139.59.226.215` as the source IP and the time.
- CofePlus changes the Gate address: update `8.153.75.138` in `nginx.conf`,
  push and reload. `dig +short service-gate.cofeplus.com` shows the current one.

## Security notes

- Port 443 is open to the internet because Vercel has no fixed source range.
  The relay only forwards connections whose SNI is the Gate hostname, to one
  pinned upstream, with a per-IP connection cap. Anything else is closed.
- The relay cannot read or change traffic. TLS is end to end and the client
  still verifies the Gate certificate against the real hostname.
