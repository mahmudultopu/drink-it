# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's private reporting instead: open the repository's **Security** tab and choose **Report a vulnerability**.
Include what you found, how to reproduce it and, if you can, what you think the impact is.

You can expect an acknowledgement within a few days. Confirmed issues are fixed as quickly as their severity
warrants, and the reporter is credited in the release notes unless they prefer to stay anonymous.

## Supported versions

Only the latest release on the `main` branch receives security fixes.

## What is in scope

The storefront, the JSON API (`/api/*`) and the admin dashboard (`/admin`) as shipped in this repository.
Out of scope: problems in third-party hosting platforms, and denial-of-service by raw traffic volume
(put the site behind a CDN or the host's firewall for that).

## How the application protects itself

| Area                | Measures                                                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passwords           | scrypt (N = 2^15, r = 8, p = 1) with a random salt per password. Parameters are stored with each hash, so they can be raised later and old hashes are upgraded at the next login. Hashing runs asynchronously with a concurrency cap.             |
| Sessions            | Signed, expiring tokens in `HttpOnly`, `SameSite=Lax` cookies (`Secure` and the `__Host-` prefix over HTTPS). Customer and admin tokens carry a type, so one cannot be replayed as the other. Admin sessions end when the admin password changes. |
| Brute force         | Login attempts are rate limited per visitor, and failed attempts are tracked per account and per visitor-and-account. A constant amount of hashing work is done whether or not the account exists.                                                |
| CSRF                | State-changing requests must be JSON, must not be flagged cross-site by `Sec-Fetch-Site`, and must carry a matching `Origin` when one is sent.                                                                                                    |
| XSS                 | All dynamic markup is built with an escaping template tag. A strict Content-Security-Policy forbids inline scripts and any script, image, font or connection that is not same-origin.                                                             |
| Clickjacking        | `frame-ancestors 'none'` and `X-Frame-Options: DENY`.                                                                                                                                                                                             |
| Transport           | `Strict-Transport-Security` and `upgrade-insecure-requests` when `DRINKIT_SECURE_COOKIES=1`.                                                                                                                                                      |
| Input handling      | Bodies are size-limited (checked before reading), validated server side and stripped of control characters. Prices, discounts, delivery fees and stock are always recomputed on the server.                                                       |
| Customer data       | Order lookup needs both the order number and the phone number. An account only lists orders placed while logged in to it. The public activity feed shows no personal data.                                                                        |
| Exports             | Spreadsheet cells that start with `=`, `+`, `-` or `@` are neutralised in the admin CSV export.                                                                                                                                                   |
| Files               | Path traversal is rejected, dot files and source folders are never served, and data files are written atomically with owner-only permissions.                                                                                                     |
| Operational hygiene | Request and header timeouts, graceful shutdown, no stack traces in responses, and no server software banner.                                                                                                                                      |

## Running it safely

- Serve the site over HTTPS only and set `DRINKIT_SECURE_COOKIES=1`.
- Set `DRINKIT_TRUST_PROXY` to the number of reverse proxies in front of the app (usually `1`), otherwise
  per-visitor rate limits see only the proxy's address.
- Set `DRINKIT_SECRET` to a random string of at least 32 characters when you run more than one instance, or
  want sessions to survive moving the data folder.
- Use a long admin passphrase (`DRINKIT_ADMIN_PASSWORD`, 12+ characters), or keep the generated one that
  is printed on first start. `node server.js --reset-admin` issues a new one and ends all admin sessions.
- Back up the `data/` folder; it holds orders, customer accounts and password hashes. Never commit it.
- The built-in JSON-file storage is meant for a single server process. For several instances or high
  volume, replace `server/db.js` with a real database.
- Replace the placeholder bKash, Nagad and Rocket numbers in `data/site.json` before taking real payments;
  the admin dashboard warns while they are still placeholders.
