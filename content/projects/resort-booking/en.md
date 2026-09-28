## Overview

A resort booking system with two sides:

- **Guests** — sign up, log in with an email OTP, browse and book rooms, enter guest details, view booking history and manage their account.
- **Staff / owner** — a staff dashboard, booking management, room and photo management, member management and reports.

## Architecture

```
client/ (HTML + JS)  ─┐
employee/ (HTML + JS) ┴─▶  Express API  ─▶  PostgreSQL
                            │
                            ├─▶ Google Cloud Storage (room photos)
                            └─▶ Email (Nodemailer / Resend) + node-cron
```

- Routes split by feature: `auth`, `booking`, `room`, `staff`, `dashboard`, `report-owner`, …
- Authentication with JWT plus email OTP
- Scheduled background jobs with node-cron
- Schema scripts for both PostgreSQL and Oracle

## Deployment

Hosted on Render. The free tier sleeps when idle, so the first request can take 30–60 seconds.
