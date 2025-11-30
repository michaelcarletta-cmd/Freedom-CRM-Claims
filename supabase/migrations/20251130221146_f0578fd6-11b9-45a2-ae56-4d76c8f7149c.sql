-- Create task_automations table for default tasks
create table public.task_automations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  trigger_type text not null check (trigger_type in ('on_claim_creation', 'on_status_change')),
  trigger_status text, -- which status triggers this (null for on_claim_creation)
  priority text default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date_offset integer default 0, -- days from trigger date
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table public.task_automations enable row level security;

-- Admins can manage task automations
create policy "Admins can manage task automations"
on public.task_automations
for all
using (has_role(auth.uid(), 'admin'));

-- Staff can view task automations
create policy "Staff can view task automations"
on public.task_automations
for select
using (has_role(auth.uid(), 'admin') or has_role(auth.uid(), 'staff'));

-- Add index for active automations
create index idx_task_automations_active on public.task_automations(is_active) where is_active = true;

-- Trigger to update updated_at
create trigger update_task_automations_updated_at
before update on public.task_automations
for each row
execute function public.update_updated_at_column();

-- Function to create tasks from automations
create or replace function public.create_tasks_from_automations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  automation record;
  task_due_date date;
begin
  -- For new claims (INSERT)
  if TG_OP = 'INSERT' then
    for automation in 
      select * from public.task_automations 
      where is_active = true 
      and trigger_type = 'on_claim_creation'
    loop
      task_due_date := current_date + automation.due_date_offset;
      
      insert into public.tasks (
        claim_id,
        title,
        description,
        priority,
        due_date,
        status
      ) values (
        NEW.id,
        automation.title,
        automation.description,
        automation.priority,
        task_due_date,
        'pending'
      );
    end loop;
  end if;
  
  -- For status changes (UPDATE)
  if TG_OP = 'UPDATE' and OLD.status is distinct from NEW.status then
    for automation in 
      select * from public.task_automations 
      where is_active = true 
      and trigger_type = 'on_status_change'
      and trigger_status = NEW.status
    loop
      task_due_date := current_date + automation.due_date_offset;
      
      insert into public.tasks (
        claim_id,
        title,
        description,
        priority,
        due_date,
        status
      ) values (
        NEW.id,
        automation.title,
        automation.description,
        automation.priority,
        task_due_date,
        'pending'
      );
    end loop;
  end if;
  
  return NEW;
end;
$$;

-- Trigger on claims table for task automation
create trigger trigger_create_tasks_from_automations
after insert or update on public.claims
for each row
execute function public.create_tasks_from_automations();