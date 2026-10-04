export type AuditAction = "note.create" | "note.delete";

/**
 * Builds the audit row for a write. It is returned unexecuted so callers can
 * put it in the same D1 batch (one transaction) as the write it records.
 */
export function auditStatement(
  db: D1Database,
  userId: string,
  action: AuditAction,
  resourceId: string,
): D1PreparedStatement {
  return db
    .prepare("INSERT INTO audit_log (user_id, action, resource_id, timestamp) VALUES (?, ?, ?, ?)")
    .bind(userId, action, resourceId, Date.now());
}
