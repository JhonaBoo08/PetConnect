-- Retired clinic identities remain as historical authors, but have no application access.
UPDATE users SET status = 'DISABLED' WHERE role = 'CLINIC';
UPDATE push_devices d JOIN users u ON u.id = d.user_id SET d.enabled = 0 WHERE u.role <> 'OWNER' OR u.status <> 'ACTIVE';
UPDATE scheduled_notifications s JOIN users u ON u.id = s.user_id SET s.status = 'CANCELLED', s.claimed_at = NULL WHERE u.role <> 'OWNER' AND s.status IN ('PENDING', 'PROCESSING');
