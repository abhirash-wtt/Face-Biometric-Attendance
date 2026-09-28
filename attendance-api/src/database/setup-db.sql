-- Run through setup-db.ps1, which passes the app credentials from attendance-api/.env:
--   psql -v db_user=... -v db_password=... -v db_name=... -f setup-db.sql
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'db_user', :'db_password')
WHERE NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = :'db_user')\gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db_name')\gexec

\c :"db_name"

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

GRANT ALL ON SCHEMA public TO :"db_user";
GRANT ALL ON ALL TABLES IN SCHEMA public TO :"db_user";
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO :"db_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO :"db_user";
