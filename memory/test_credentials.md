# Focus PMS — Test Credentials

## IMPORTANT
Real employees' passwords (incl. Kiran's) have been set by the client and are NOT known. Do NOT reset any real user's password and do NOT accept invites for real users.

## How to authenticate for testing
Mint a JWT for any user (valid 12h) — this does not change their password:
```
cd /app/backend && python3 /app/scripts/mint_token.py <email>
```
- API: `Authorization: Bearer <token>`
- UI: open `/login`, run `localStorage.setItem('fe_token','<token>')`, then navigate to `/app/dashboard`.

## Users (email → role)
- kiran@focusengineering.in — Super Administrator (+ Operations functional KPIs)
- manoj.mohan@focusengineering.in — Head of Department (TARGETS_CONFIGURE, TARGETS_APPROVE, KPI_ACTUAL_VALIDATE)
- dj.sir@focusengineering.in — Management Board (view + TARGETS_APPROVE)
- vijaydevadas@focusengineering.in — MIS & Business Analyst (contributor)
- satvinder.kaur@focusengineering.in — Marketing Manager (contributor)
- sales@focusengineering.in — Kabir Baweja, Sales & Marketing Contributor (email edited by client)
- kriti.singh@focusengineering.in, mounika.naidu@focusengineering.in — Contributors
- Inactive / flagged: testuser1b@ (is_test), vijay.devadas@ and kabir.baweja@ (is_duplicate) — excluded from reporting.

## Original bootstrap (historical)
- kiran@focusengineering.in / Kiran@123 was the bootstrap password; it has since been changed by the client.
