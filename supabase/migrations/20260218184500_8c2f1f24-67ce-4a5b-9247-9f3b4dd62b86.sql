-- Default AI knowledge basin retrieval settings used by Darwin KB-first mode
INSERT INTO public.global_automation_settings (
  setting_key,
  setting_value,
  description
)
VALUES (
  'ai_knowledge_basin_settings',
  '{
    "pool_size": 500,
    "top_k": 10,
    "per_document_cap": 3,
    "strict_mode": false,
    "status_filter": ["completed", "processed"],
    "category_filter": [],
    "tag_filter": []
  }'::jsonb,
  'AI knowledge basin retrieval settings (pool/top_k/per_document_cap/filters/strict mode)'
)
ON CONFLICT (setting_key) DO NOTHING;
