-- Nhật ký truy cập chỉ được ghi thêm: chặn sửa/xoá từng dòng, kể cả từ mã ứng dụng.
-- Xoá theo hạn lưu trữ (nếu có) làm bằng tài khoản quản trị CSDL, tắt trigger có ghi biên bản.
CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs là nhật ký chỉ ghi thêm: không được % dòng', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_school_id_idx" ON "audit_logs" USING btree ("school_id","id");
