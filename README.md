# adinapak.github.io

## Meal log setup

The homepage DoorDash card and `belly.html` archive read public meal data from Supabase. Writes happen only from server-side scripts/endpoints.

### Supabase

Run the `meal_logs` section in `supabase-schema.sql`. It creates `public.meal_logs`, public-read RLS, and a partial unique index to prevent duplicate DoorDash rows for the same `doordash_activity_date`.

Create a public Supabase Storage bucket named `meal-images` for Twilio MMS uploads.

### Vercel environment variables

- `ALLOWED_MMS_FROM`
- `TWILIO_FROM_NUMBER`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET` (defaults to `meal-images`)
- `OPENAI_API_KEY` (optional, for short food-only image descriptions)

Point the Twilio inbound SMS/MMS webhook to `/api/meal-log-sms`.
