-- 当前数据库按最新 Schema 从零建立，username 必须为必填字段。
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
