-- NEXT GITADORA VERSION TEMPLATE
-- Fill the 3 values below when the next version is announced.
-- This creates the new version only. It does NOT copy scores or HOT flags.
-- After creation, import the new version's master with its returned version_id.
-- Also create js/eamusement-sync/<eamusement_slug>.js for the new official site.

begin;

update public.game_versions
set is_current = false
where is_current = true;

insert into public.game_versions(
  code,
  name,
  eamusement_slug,
  sort_order,
  is_current
)
values (
  'NEXT_VERSION_CODE',
  'NEXT VERSION NAME',
  'gitadora_next_version_slug',
  (select coalesce(max(sort_order),0) + 1 from public.game_versions),
  true
)
returning id, code, name;

commit;

-- Expected behavior after this:
-- * The version selector automatically shows the new version.
-- * User skill totals for the new version are 0.00 until new scores are registered/synced.
-- * Old HOT/OTHER and difficulties remain preserved in the old version.
-- * New master rows should be inserted with the new version_id and is_hot=false initially.
-- * On the first score registration/sync for the same title + Part,
--   play_option and private_comment are inherited from the latest previous version.
-- * The version-specific sync script filename must exactly match eamusement_slug:
--   js/eamusement-sync/gitadora_next_version_slug.js
