-- Runs once, when the development database volume is first initialized.
-- The integration tests reset and migrate this database, never laverdu_dev.
CREATE DATABASE laverdu_test OWNER laverdu;
