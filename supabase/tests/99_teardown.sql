-- ---------------------------------------------------------------------------
-- Tear the harness down.
--
-- Run this after a test session. The `http` extension in particular is real
-- SSRF surface — the database can make arbitrary outbound requests while it is
-- installed — so it should not be left enabled on a shared or production
-- project just because the tests once needed it.
-- ---------------------------------------------------------------------------

drop schema if exists monetiq_test cascade;
drop extension if exists http;
