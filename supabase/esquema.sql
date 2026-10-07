-- FridgeNFC · esquema de Supabase
--
-- Ejecuta este archivo entero en Supabase → SQL Editor. Se puede repetir sin
-- romper nada: crea lo que falta y actualiza las funciones.
--
-- Modelo de seguridad: la tabla `items` queda cerrada para la clave pública
-- (anon). La app solo usa las cuatro funciones de abajo, y todas exigen el id
-- de la lista (`p_sala`). Quien no conoce el id de una lista no puede leerla
-- ni tocarla, y nadie puede listar las listas de los demás.

-- ── Tabla ──────────────────────────────────────────────────────────────────

create table if not exists public.items (
  id          uuid        primary key default gen_random_uuid(),
  room_id     text        not null,
  name        text        not null,
  done        boolean     not null default false,
  added_by    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Si la tabla venía de la versión anterior, añade lo que le falta.
-- Las restricciones van con «not valid»: se aplican a lo nuevo sin revisar
-- las filas que ya hubiera (así no falla si alguna antigua no cumple).
alter table public.items add column if not exists updated_at timestamptz not null default now();

alter table public.items drop constraint if exists items_room_id_formato;
alter table public.items add constraint items_room_id_formato check (room_id ~ '^[a-z0-9]{12,32}$') not valid;

alter table public.items drop constraint if exists items_name_largo;
alter table public.items add constraint items_name_largo check (char_length(btrim(name)) between 1 and 60) not valid;

alter table public.items drop constraint if exists items_added_by_largo;
alter table public.items add constraint items_added_by_largo check (added_by is null or char_length(added_by) <= 30) not valid;

create index if not exists items_room_created_idx on public.items (room_id, created_at);

-- ── Seguridad: tabla cerrada ───────────────────────────────────────────────

alter table public.items enable row level security;

-- La política de la versión anterior dejaba leer y escribir todo a cualquiera.
drop policy if exists "acceso libre por room_id" on public.items;

revoke all on public.items from anon, authenticated;

-- ── Funciones que usa la app ───────────────────────────────────────────────

-- Lista de una nevera.
create or replace function public.listar_items(p_sala text)
returns setof public.items
language sql
stable
security definer
set search_path = public
as $$
  select *
  from items
  where room_id = p_sala
  order by created_at;
$$;

-- Añade un elemento (o lo actualiza si ya existe ese id en esa misma lista).
-- El id lo genera el móvil, así que repetir la llamada no duplica nada.
create or replace function public.guardar_item(
  p_sala   text,
  p_id     uuid,
  p_nombre text,
  p_quien  text default null
)
returns public.items
language plpgsql
security definer
set search_path = public
as $$
declare
  fila items;
begin
  insert into items (id, room_id, name, added_by)
  values (p_id, p_sala, btrim(p_nombre), nullif(btrim(coalesce(p_quien, '')), ''))
  on conflict (id) do update
    set name = excluded.name,
        added_by = excluded.added_by,
        updated_at = now()
    where items.room_id = p_sala
  returning * into fila;
  return fila;
end;
$$;

-- Marca un elemento como comprado (true) o pendiente (false).
create or replace function public.marcar_item(p_sala text, p_id uuid, p_hecho boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update items
  set done = p_hecho, updated_at = now()
  where id = p_id and room_id = p_sala;
$$;

-- Borra varios elementos de una lista.
create or replace function public.borrar_items(p_sala text, p_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  delete from items
  where room_id = p_sala and id = any(p_ids);
$$;

revoke all on function public.listar_items(text)                     from public;
revoke all on function public.guardar_item(text, uuid, text, text)   from public;
revoke all on function public.marcar_item(text, uuid, boolean)       from public;
revoke all on function public.borrar_items(text, uuid[])             from public;

grant execute on function public.listar_items(text)                   to anon, authenticated;
grant execute on function public.guardar_item(text, uuid, text, text) to anon, authenticated;
grant execute on function public.marcar_item(text, uuid, boolean)     to anon, authenticated;
grant execute on function public.borrar_items(text, uuid[])           to anon, authenticated;

-- ── Opcional: limpieza ─────────────────────────────────────────────────────
-- Borra lo comprado hace más de 30 días. Para programarlo: Database →
-- Extensions → pg_cron, y después:
--   select cron.schedule('fridgenfc-limpieza', '0 4 * * *',
--     $$delete from public.items where done and updated_at < now() - interval '30 days'$$);
