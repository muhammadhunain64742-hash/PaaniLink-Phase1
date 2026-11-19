# PaaniLink – API Contract

All requests go to `/api/...` and send and receive JSON.
After login, every request sends the header `Authorization: Bearer <token>`.
A refused request answers with an error status and `{ "error": "message" }`.

| Method | Path | Who | What it does |
|---|---|---|---|
| POST | /api/auth/login | everyone | `{phone, password}` → `{token, user}` |
| POST | /api/auth/register | everyone | Customer sign-up `{name, phone, cnic, password, zoneId, address}` |
| GET | /api/zones, /api/rates | everyone | Zones (with `hydrantIds`) and tanker rates |
| POST / PATCH / DELETE | /api/zones, /api/hydrants, /api/tankers | admin | Add, edit, delete |
| PATCH | /api/rates/:id | admin | `{commercial, subsidised}` |
| GET / POST / PATCH / DELETE | /api/users | admin | Staff accounts. Filters: `role`, `hydrantId`, `q` |
| GET | /api/bookings | all roles | Each role sees only its own part. Filters: `status`, `type`, `q`; `_sort`, `_order`; `_page`, `_limit` (total in `X-Total-Count`) |
| POST | /api/bookings | customer | `{type, size, date, hydrantId, address}`; price and first status are set by the server |
| PATCH | /api/bookings/:id | officer, operator, driver, customer | `{status}` (operator also sends `tankerId`, `driverId`; driver may send `failReason`) |
| GET | /api/bookings/:id/history | all roles | Every status change of a booking |
| GET / POST | /api/subsidyApplications | customer, officer | Apply for subsidy / list |
| PATCH | /api/subsidyApplications/:id | officer | `{status: "Approved" or "Rejected"}` |
| GET / POST | /api/disputes | customer, officer | Complaint about a delivered booking |
| PATCH | /api/disputes/:id | officer | `{resolution}` |
| GET | /api/reports/summary | admin | Totals and bookings per hydrant |

### Booking statuses
Pending Approval → Approved → Assigned → Filled → Dispatched → Arrived → Delivered → Confirmed
(also Rejected, Cancelled, Failed, Disputed)
