-- Clear all data failed with "audit_log is append-only; UPDATE": deleting a person sets
-- audit_log.actor_id to null (on delete set null), which is an UPDATE of the audit log. Allowed
-- now, but only while public.clear_shop_data runs and only when actor_id is the single column
-- that changes; the audit log can still never be deleted or edited otherwise.
create or replace function private.reject_modification()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_setting('fincrew.clearing', true) = 'on' then
    if tg_table_name <> 'audit_log' then
      return coalesce(old, new);
    end if;
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'actor_id') = (to_jsonb(old) - 'actor_id') then
      return new;
    end if;
  end if;
  raise exception '% is append-only; % is not allowed', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end;
$$;
