-- Add SignNow/Make webhook URL to company branding
ALTER TABLE public.company_branding 
ADD COLUMN IF NOT EXISTS signnow_make_webhook_url TEXT;