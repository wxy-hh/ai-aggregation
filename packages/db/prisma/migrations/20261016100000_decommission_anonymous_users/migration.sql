-- 彻底下线匿名设备认证：级联清理存量匿名用户与关联数据，并移除对应数据列

-- 1. 级联清理所有历史存量的匿名用户（外键关联均有 ON DELETE CASCADE，关联表记录自动同步删除）
DELETE FROM "users" WHERE "isAnonymous" = true;

-- 2. 移除设备指纹哈希唯一索引与列
DROP INDEX IF EXISTS "users_deviceHash_key";

ALTER TABLE "users" DROP COLUMN IF EXISTS "isAnonymous";
ALTER TABLE "users" DROP COLUMN IF EXISTS "deviceHash";
