-- ============================================================
-- THE WALL — AUTO-MODERAZIONE
-- Post/commenti "puliti" -> pubblicati subito (approved = true).
-- Se contengono una parola/marcatore della blocklist -> restano in
-- coda (approved = false) per la revisione manuale.
-- L'approvazione la decide un trigger nel database: il browser NON
-- puo aggirarla.
-- Esegui in: Supabase -> SQL Editor -> New query -> Run
-- ============================================================

-- 1) LISTA parole/marcatori che mandano un contenuto in revisione manuale
create table if not exists public.wall_blocklist (
    word text primary key
);
alter table public.wall_blocklist enable row level security;  -- nessuna policy: invisibile ad anon

-- Marcatori di spam/link di default. Aggiungi o togli parole quando vuoi
-- (Table Editor -> wall_blocklist). Il confronto e case-insensitive e "contiene":
-- es. la parola "http" blocca http/https; occhio alle parole troppo corte.
insert into public.wall_blocklist(word) values
  ('http'),('www.'),('t.me'),('wa.me'),('bit.ly'),('telegram'),('whatsapp'),
  ('onlyfans'),('viagra'),('casino'),('porn'),('sexcam')
on conflict do nothing;

-- 2) FUNZIONE che decide l'approvazione automatica
create or replace function public.wall_automod()
returns trigger language plpgsql security definer set search_path = public as $$
declare hit boolean;
begin
  select exists(
    select 1 from public.wall_blocklist b
    where (coalesce(new.body,'') || ' ' || coalesce(new.author,'')) ilike ('%' || b.word || '%')
  ) into hit;
  new.approved := not hit;   -- pulito => pubblicato subito; parola vietata => in coda
  return new;
end $$;

-- 3) TRIGGER su post e commenti
drop trigger if exists trg_wall_automod_posts on public.wall_posts;
create trigger trg_wall_automod_posts before insert on public.wall_posts
  for each row execute function public.wall_automod();

drop trigger if exists trg_wall_automod_comments on public.wall_comments;
create trigger trg_wall_automod_comments before insert on public.wall_comments
  for each row execute function public.wall_automod();

-- 4) POLICY di inserimento: ora l'approvazione la governa il trigger,
--    non piu il client. (Il trigger sovrascrive sempre "approved".)
drop policy if exists "insert pending posts" on public.wall_posts;
create policy "insert posts" on public.wall_posts
  for insert to anon with check (true);

drop policy if exists "insert pending comments" on public.wall_comments;
create policy "insert comments" on public.wall_comments
  for insert to anon with check (true);

-- ============================================================
-- USO QUOTIDIANO
-- Aggiungere una parola da bloccare:
--   insert into public.wall_blocklist(word) values ('parola') on conflict do nothing;
-- Togliere una parola:
--   delete from public.wall_blocklist where word = 'parola';
-- Vedere la coda (contenuti trattenuti):
--   select id, created_at, author, body from public.wall_posts where approved = false order by created_at;
-- Rimuovere un post gia pubblicato (rimetterlo in coda):
--   update public.wall_posts set approved = false where id = '...';
-- ============================================================
