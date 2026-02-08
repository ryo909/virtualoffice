alter table public.news_posts
  alter column "order" set default 0;

update public.news_posts
  set "order" = 0
where "order" is null;

alter table public.news_posts
  alter column "order" set not null;
