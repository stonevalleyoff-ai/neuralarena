-- Neural Arena (supabase.sql), dans le Supabase des jeux (« Vallée de pierre »)
-- Les cerveaux des joueurs, gardés avec leur compte. Tout est préfixé « na_ » ; rien des autres jeux n'est touché.
--   na_cerveaux          une ligne par cerveau. Table fermée : on n'y accède que par les fonctions ci-dessous.
--   na_mes_cerveaux()    les cerveaux du compte connecté, avec leurs poids.
--   na_garder(cerveau)   crée ou met à jour un cerveau du compte connecté (douze au plus par compte).
--   na_oublier(id)       supprime un cerveau du compte connecté.
--   na_classement()      les cinquante meilleurs cerveaux publiés, sans leurs poids. Ouvert à tous.
--   na_prendre(id)       un cerveau publié (ou à soi), avec ses poids, pour l'affronter ou l'adopter. Ouvert à tous.
-- Le dressage se fait dans le navigateur : le classement (elo) est celui que le jeu déclare. C'est un prototype, pas un arbitre.
-- Un compte supprimé emporte ses cerveaux (on delete cascade). Pour tout retirer : la fin de ce fichier.

create table public.na_cerveaux (
  id uuid primary key,
  utilisateur uuid not null references auth.users (id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 24),
  format text not null default 'na-1' check (format ~ '^na-[0-9]{1,3}$'),            -- la forme du réseau : un jeu plus récent sait lire les anciennes
  poids text not null check (char_length(poids) between 16 and 12000 and poids ~ '^[A-Za-z0-9+/]+={0,2}$'),   -- les poids, en base64
  elo int not null default 1000 check (elo between 400 and 3000),
  generation int not null default 0 check (generation between 0 and 10000000),
  stats jsonb not null default '{}'::jsonb check (jsonb_typeof(stats) = 'object' and pg_column_size(stats) <= 8000),   -- niveau, profil, courbe
  public boolean not null default false,                                             -- publié : visible au classement, et prenable
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);
comment on table public.na_cerveaux is 'Neural Arena : les cerveaux des joueurs. Accès uniquement par na_mes_cerveaux, na_garder, na_oublier, na_classement, na_prendre.';
create index na_cerveaux_utilisateur on public.na_cerveaux (utilisateur);
create index na_cerveaux_classement on public.na_cerveaux (elo desc) where public;

alter table public.na_cerveaux enable row level security;
revoke all on public.na_cerveaux from anon, authenticated;

create function public.na_mes_cerveaux() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  moi uuid := auth.uid();
begin
  if moi is null then raise exception 'compte requis'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nom', c.nom, 'format', c.format, 'poids', c.poids, 'elo', c.elo, 'generation', c.generation,
      'stats', c.stats, 'public', c.public, 'maj_le', c.maj_le) order by c.cree_le), '[]'::jsonb)
    from public.na_cerveaux c where c.utilisateur = moi);
end $$;

create function public.na_garder(cerveau jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  moi uuid := auth.uid();
  v_id uuid := (cerveau ->> 'id')::uuid;
  v_nom text := left(btrim(regexp_replace(coalesce(cerveau ->> 'nom', ''), '[[:cntrl:]<>]', '', 'g')), 24);
  a_qui uuid;
begin
  if moi is null then raise exception 'compte requis'; end if;
  if v_id is null then raise exception 'cerveau sans identifiant'; end if;
  if v_nom = '' then v_nom := 'Sans nom'; end if;
  select c.utilisateur into a_qui from public.na_cerveaux c where c.id = v_id;
  if a_qui is not null and a_qui <> moi then raise exception 'ce cerveau appartient à un autre compte'; end if;
  if a_qui is null and (select count(*) from public.na_cerveaux c where c.utilisateur = moi) >= 12 then raise exception 'douze cerveaux au plus par compte'; end if;
  insert into public.na_cerveaux as c (id, utilisateur, nom, format, poids, elo, generation, stats, public)
  values (v_id, moi, v_nom, coalesce(cerveau ->> 'format', 'na-1'), cerveau ->> 'poids', coalesce((cerveau ->> 'elo')::int, 1000),
    coalesce((cerveau ->> 'generation')::int, 0), coalesce(cerveau -> 'stats', '{}'::jsonb), coalesce((cerveau ->> 'public')::boolean, false))
  on conflict (id) do update set nom = excluded.nom, format = excluded.format, poids = excluded.poids, elo = excluded.elo, generation = excluded.generation,
    stats = excluded.stats, public = excluded.public, maj_le = now()
  where c.utilisateur = moi;
  return jsonb_build_object('id', v_id, 'maj_le', now());
end $$;

create function public.na_oublier(id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  moi uuid := auth.uid();
  n int;
begin
  if moi is null then raise exception 'compte requis'; end if;
  delete from public.na_cerveaux c where c.id = na_oublier.id and c.utilisateur = moi;
  get diagnostics n = row_count;
  return jsonb_build_object('supprime', n);
end $$;

-- le classement : les cerveaux publiés, les mieux classés d'abord. Ni poids, ni identifiant de compte : le pseudo seulement.
create function public.na_classement() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  moi uuid := auth.uid();
begin
  return (select coalesce(jsonb_agg(l.ligne order by l.elo desc, l.maj_le), '[]'::jsonb) from (
    select c.elo, c.maj_le, jsonb_build_object('id', c.id, 'nom', c.nom, 'elo', c.elo, 'generation', c.generation, 'profil', c.stats -> 'profil', 'maj_le', c.maj_le,
      'auteur', coalesce(nullif(left(btrim(u.raw_user_meta_data ->> 'pseudo'), 16), ''), 'Anonyme'), 'a_moi', c.utilisateur = moi) as ligne
    from public.na_cerveaux c join auth.users u on u.id = c.utilisateur
    where c.public order by c.elo desc, c.maj_le limit 50) l);
end $$;

create function public.na_prendre(id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  moi uuid := auth.uid();
begin
  return (select jsonb_build_object('id', c.id, 'nom', c.nom, 'format', c.format, 'poids', c.poids, 'elo', c.elo, 'generation', c.generation, 'profil', c.stats -> 'profil',
      'auteur', coalesce(nullif(left(btrim(u.raw_user_meta_data ->> 'pseudo'), 16), ''), 'Anonyme'))
    from public.na_cerveaux c join auth.users u on u.id = c.utilisateur
    where c.id = na_prendre.id and (c.public or c.utilisateur = moi));
end $$;

revoke execute on function public.na_mes_cerveaux(), public.na_garder(jsonb), public.na_oublier(uuid), public.na_classement(), public.na_prendre(uuid) from public, anon;
grant execute on function public.na_mes_cerveaux(), public.na_garder(jsonb), public.na_oublier(uuid) to authenticated;
grant execute on function public.na_classement(), public.na_prendre(uuid) to anon, authenticated;

-- Pour tout retirer :
--   drop function public.na_mes_cerveaux(), public.na_garder(jsonb), public.na_oublier(uuid), public.na_classement(), public.na_prendre(uuid);
--   drop table public.na_cerveaux;
