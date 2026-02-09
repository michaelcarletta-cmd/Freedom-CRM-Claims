
-- Update task reminders to 8:00 AM Eastern (13:00 UTC)
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'task-reminders-daily'),
  schedule := '0 13 * * *'
);

-- Update RD check tracking to Eastern-aligned times: 8AM, 2PM, 8PM, 2AM ET = 13, 19, 1, 7 UTC
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'process-rd-check-tracking'),
  schedule := '0 1,7,13,19 * * *'
);
