-- HISTORICAL MYSQL SCRIPT ONLY. Not part of PostgreSQL deployment or migrations.
-- Destructive: retained for reference, not for execution on a live database.
DELETE FROM `PmacActivityLog`
WHERE `action` = 'MEMBER_TAGS_UPDATED';

DROP TABLE IF EXISTS `PmacMemberTag`;
