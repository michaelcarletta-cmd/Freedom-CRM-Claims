-- Rename twilio_sid to telnyx_message_id for clarity
ALTER TABLE public.sms_messages 
RENAME COLUMN twilio_sid TO telnyx_message_id;