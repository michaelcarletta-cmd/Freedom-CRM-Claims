-- Reapply simple bootstrap RLS policy so primary admin can manage roles

alter table public.user_roles enable row level security;

drop policy if exists "primary_admin_manage_roles_bootstrap" on public.user_roles;

create policy "primary_admin_manage_roles_bootstrap"
  on public.user_roles
  as permissive
  for all
  to authenticated
  using (auth.uid() = '9c362364-cb1b-4b4b-880d-b1a455a9e468'::uuid)
  with check (auth.uid() = '9c362364-cb1b-4b4b-880d-b1a455a9e468'::uuid);
