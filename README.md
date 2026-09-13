# Yoghen & Shalini engagement invitation

Run `python3 server.py`, then open http://localhost:8080.

Edit `config.json` to change `closesAt` (exclusive cutoff, Malaysia +08:00), `background` or `backgroundPosition`. Default accepts replies through 11 October 2026 and closes at midnight on 12 October. Settings are read on every API request; no restart needed. Put your photograph in `dist/assets/` and set `background` to `/assets/your-photo.jpg`. The current couple image is the supplied photo with its white background edited to maroon.

Responses are stored in `data/reservations.sqlite3`, outside the publicly served folder. Both attending and declining replies are saved. Guest count and meal are required only for attending replies. Server enforces validation and cutoff, including when a form was opened before the deadline. Retry submissions use an idempotency key. No attendee records are publicly exposed.

This server is for local testing only. The `docs/` folder is the GitHub Pages version for `engagementreservation.yoghenshalini.com`. It keeps the same UI, uses `docs/CNAME` for the custom subdomain, and is prepared for Supabase inserts once `supabaseUrl` and `supabaseAnonKey` are filled in inside `docs/app.js`.

For Supabase, run `supabase-schema.sql` in the SQL editor. The public website only receives insert permission through row level security; visitor browsers cannot read the reservation list.

Event details follow the supplied ecard: Yoghender & Shalini, 24 October 2026, 6:30 PM, Hotel Continental, Level 12, 5, Jalan Penang, George Town, 10000 George Town, Pulau Pinang. Mobile layouts include safe-area padding, 16px inputs, reduced-motion support, and native dropdowns.
