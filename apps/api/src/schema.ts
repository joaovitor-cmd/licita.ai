// Deliberately isolated from any earlier Prisma tables. No destructive migration.
import {searchSchemaSql} from './search-schema.js';
export const schema = `
CREATE SCHEMA IF NOT EXISTS workspace_v2;
SET LOCAL search_path TO workspace_v2, public;
CREATE TABLE IF NOT EXISTS collection_cursors (
  scope text PRIMARY KEY, cursor jsonb, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY, organization_id uuid, actor_id uuid, action text NOT NULL, target text, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_org_idx ON audit_logs(organization_id,occurred_at DESC);
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY, name text NOT NULL, tax_id text, is_demo boolean NOT NULL DEFAULT false,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  preferences jsonb NOT NULL DEFAULT '{"inApp":true,"email":false}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS email_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  settings jsonb NOT NULL, password_ciphertext text, verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE email_settings ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS platform_email_settings (
  organization_id text PRIMARY KEY CHECK (organization_id='platform'),
  settings jsonb NOT NULL, password_ciphertext text, verified_at timestamptz,
  revision integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS members (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('ADMIN','MEMBER')),
  PRIMARY KEY (organization_id,user_id)
);
-- Do not replay the tour for existing accounts; only future users start pending.
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'DISMISSED'
 CHECK (onboarding_status IN ('PENDING','SEEN','DISMISSED','COMPLETED'));
ALTER TABLE users ALTER COLUMN onboarding_status SET DEFAULT 'PENDING';
ALTER TABLE users ADD COLUMN IF NOT EXISTS home_page text NOT NULL DEFAULT 'overview' CHECK(home_page IN ('overview','radar'));
CREATE TABLE IF NOT EXISTS search_profiles (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 name text NOT NULL, description text NOT NULL DEFAULT '', filters jsonb NOT NULL,
 revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS search_profiles_name_unique ON search_profiles(organization_id,lower(name));
ALTER TABLE search_profiles ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
REVOKE ALL ON search_profiles FROM PUBLIC;
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiration_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS commercial_plans (
 code text PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT '',
 planned_features jsonb NOT NULL DEFAULT '[]', revision integer NOT NULL DEFAULT 1
);
INSERT INTO commercial_plans(code,name) VALUES ('initial','Plano inicial'),('professional','Plano profissional'),('complete','Plano completo') ON CONFLICT DO NOTHING;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_code text NOT NULL DEFAULT 'complete' REFERENCES commercial_plans(code);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS access_revision integer NOT NULL DEFAULT 1;
ALTER TABLE members ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS default_tracking_owner_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE members ADD COLUMN IF NOT EXISTS last_access_at timestamptz;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS environment_id uuid REFERENCES organizations(id);
ALTER TABLE commercial_plans ADD COLUMN IF NOT EXISTS max_companies integer NOT NULL DEFAULT 1 CHECK(max_companies BETWEEN 1 AND 100);
ALTER TABLE commercial_plans ADD COLUMN IF NOT EXISTS enforce_features boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS organizations_environment ON organizations(environment_id);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE TABLE IF NOT EXISTS console_admins (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id),
 name text NOT NULL,email text NOT NULL UNIQUE,password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('OWNER','ADMIN','VIEWER')),active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),last_login_at timestamptz
);
CREATE TABLE IF NOT EXISTS console_sessions (
 token_hash text PRIMARY KEY,admin_id uuid NOT NULL REFERENCES console_admins(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS console_sessions_expiration ON console_sessions(expires_at);
CREATE TABLE IF NOT EXISTS console_invites (
 token_hash text PRIMARY KEY,admin_id uuid NOT NULL REFERENCES console_admins(id) ON DELETE CASCADE,expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS reset_tokens (
  token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
-- Company registration is independent from commercial interests/search profiles.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_revision integer NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS catalog (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('PRODUCT','SERVICE')), name text NOT NULL,
  description text NOT NULL DEFAULT '', category text NOT NULL DEFAULT '', keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS catalog_org_idx ON catalog(organization_id);
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS unit_cost numeric(20,4) CHECK(unit_cost>=0);
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS sale_price numeric(20,4) CHECK(sale_price>=0);
ALTER TABLE catalog ADD COLUMN IF NOT EXISTS price_basis text CHECK(price_basis IN ('PER_UNIT','ONE_TIME','MONTHLY','YEARLY'));
CREATE TABLE IF NOT EXISTS catalog_imports (
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 request_id uuid NOT NULL, input_hash text NOT NULL, result jsonb NOT NULL,
 imported_by uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,request_id)
);
CREATE TABLE IF NOT EXISTS opportunities (
  id uuid PRIMARY KEY, canonical_key text NOT NULL UNIQUE, title text NOT NULL, description text NOT NULL DEFAULT '',
  agency text NOT NULL DEFAULT '', state text, city text, modality text, sphere text, value numeric(20,2),
  published_at timestamptz, opens_at timestamptz, closes_at timestamptz, status text,
  url text, source_code text NOT NULL, source_name text NOT NULL, documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_hash text NOT NULL, raw jsonb, demo_org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  synced_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS opportunities_dates_idx ON opportunities(closes_at,published_at);
CREATE INDEX IF NOT EXISTS opportunities_state_idx ON opportunities(state,modality);
CREATE INDEX IF NOT EXISTS opportunities_demo_idx ON opportunities(demo_org_id);
CREATE SEQUENCE IF NOT EXISTS opportunity_public_code_seq;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS public_code bigint;
UPDATE opportunities SET public_code=nextval('opportunity_public_code_seq') WHERE public_code IS NULL;
ALTER TABLE opportunities ALTER COLUMN public_code SET DEFAULT nextval('opportunity_public_code_seq');
ALTER TABLE opportunities ALTER COLUMN public_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS opportunities_public_code_idx ON opportunities(public_code);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source_updated_at timestamptz;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS review_attempted_at timestamptz;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS attachment_error text;
CREATE TABLE IF NOT EXISTS opportunity_sources (
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  source_code text NOT NULL, external_id text NOT NULL, synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_code,external_id)
);
CREATE TABLE IF NOT EXISTS edital_analyses (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN ('PENDING','RUNNING','READY','PARTIAL','FAILED')),
 source_fingerprint text NOT NULL, result jsonb, error text,
 created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS edital_analyses_lookup ON edital_analyses(organization_id,opportunity_id,created_at DESC);
ALTER TABLE edital_analyses ADD COLUMN IF NOT EXISTS progress jsonb NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS edital_analyses_active ON edital_analyses(organization_id,opportunity_id) WHERE status IN ('PENDING','RUNNING');
CREATE TABLE IF NOT EXISTS edital_reviews (
 analysis_id uuid NOT NULL REFERENCES edital_analyses(id) ON DELETE CASCADE,
 topic text NOT NULL, state text NOT NULL CHECK(state IN ('PENDING','REVIEWED','ATTENTION')),
 notes text NOT NULL DEFAULT '', actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(analysis_id,topic)
);
CREATE TABLE IF NOT EXISTS trackings (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'IDENTIFIED' CHECK(stage IN ('IDENTIFIED','IN_ANALYSIS','WILL_PARTICIPATE','PROPOSAL_SENT','WON','LOST','DISCARDED')),
  owner_id uuid REFERENCES users(id), deadline timestamptz, expected_value numeric(20,2),
  outcome_reason text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,opportunity_id)
);
CREATE INDEX IF NOT EXISTS trackings_org_idx ON trackings(organization_id);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS radar_order_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE trackings ADD COLUMN IF NOT EXISTS board_position bigint;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM trackings WHERE board_position IS NULL) THEN
 WITH ranked AS (SELECT id,row_number() OVER(PARTITION BY organization_id,stage ORDER BY updated_at DESC,id)*1024 position FROM trackings) UPDATE trackings t SET board_position=ranked.position FROM ranked WHERE t.id=ranked.id AND t.board_position IS NULL;
END IF; END $$;
ALTER TABLE trackings ALTER COLUMN board_position SET DEFAULT 0;
ALTER TABLE trackings ALTER COLUMN board_position SET NOT NULL;
CREATE INDEX IF NOT EXISTS trackings_board_position_idx ON trackings(organization_id,stage,board_position,id);
CREATE INDEX IF NOT EXISTS trackings_org_stage_order_idx ON trackings(organization_id,stage,updated_at DESC,id);
CREATE INDEX IF NOT EXISTS trackings_org_order_idx ON trackings(organization_id,updated_at DESC,id);
ALTER TABLE trackings ADD COLUMN IF NOT EXISTS outcome_category text CHECK(outcome_category IN ('PRICE','DOCUMENTATION','TECHNICAL','DEADLINE','REGION','STRATEGY','COMPETITION','OTHER'));
CREATE INDEX IF NOT EXISTS trackings_commercial_idx ON trackings(organization_id,created_at DESC,id);
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY, tracking_id uuid NOT NULL REFERENCES trackings(id) ON DELETE CASCADE,
  title text NOT NULL, done boolean NOT NULL DEFAULT false, deadline timestamptz,
  owner_id uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_tracking_idx ON tasks(tracking_id);
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY, tracking_id uuid NOT NULL REFERENCES trackings(id) ON DELETE CASCADE,
  type text NOT NULL, title text NOT NULL, description text NOT NULL DEFAULT '',
  actor_id uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_tracking_idx ON events(tracking_id,created_at DESC);
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL, category text NOT NULL DEFAULT 'Outros', expires_at timestamptz, file_name text NOT NULL,
  mime_type text NOT NULL, size integer NOT NULL, content bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_org_idx ON documents(organization_id);
CREATE TABLE IF NOT EXISTS preparation_documents (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
 title text NOT NULL, notes text NOT NULL DEFAULT '',
 document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
 state text NOT NULL DEFAULT 'MISSING' CHECK(state IN ('MISSING','LINKED','REVIEWED','UPDATE')),
 source_analysis_id uuid REFERENCES edital_analyses(id) ON DELETE SET NULL,
 source_topic text, source_evidence jsonb,
 reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL, reviewed_at timestamptz, review_version text,
 revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS preparation_documents_scope ON preparation_documents(organization_id,opportunity_id);
ALTER TABLE preparation_documents ADD COLUMN IF NOT EXISTS review_version text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_analysis_id uuid REFERENCES edital_analyses(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_topic text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_evidence jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS tasks_analysis_topic ON tasks(tracking_id,source_analysis_id,source_topic) WHERE source_analysis_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS preparation_analysis_topic ON preparation_documents(organization_id,opportunity_id,source_analysis_id,source_topic) WHERE source_analysis_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS checklist_templates (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 name text NOT NULL, items jsonb NOT NULL, revision integer NOT NULL DEFAULT 1,
 archived boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checklist_templates_org ON checklist_templates(organization_id);
CREATE TABLE IF NOT EXISTS checklist_applications (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
 template_id text NOT NULL, template_revision integer NOT NULL, template_name text NOT NULL,
 items jsonb NOT NULL, created_tasks integer NOT NULL, created_documents integer NOT NULL, skipped integer NOT NULL,
 actor_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,opportunity_id,template_id,template_revision)
);
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL, description text NOT NULL DEFAULT '', read boolean NOT NULL DEFAULT false,
  url text NOT NULL DEFAULT '/app', dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,dedupe_key)
);
CREATE INDEX IF NOT EXISTS notifications_org_idx ON notifications(organization_id,created_at DESC);
CREATE TABLE IF NOT EXISTS email_deliveries (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
 recipient text NOT NULL, subject text NOT NULL, body text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENDING','SENT','FAILED','UNKNOWN','BLOCKED','CANCELLED')),
 attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 3,
 next_attempt_at timestamptz NOT NULL DEFAULT now(), accepted_at timestamptz, last_error text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(notification_id,recipient)
);
CREATE INDEX IF NOT EXISTS email_deliveries_due ON email_deliveries(next_attempt_at) WHERE status IN ('PENDING','BLOCKED');
CREATE INDEX IF NOT EXISTS email_deliveries_org ON email_deliveries(organization_id,created_at DESC);
CREATE TABLE IF NOT EXISTS email_delivery_attempts (
 id bigserial PRIMARY KEY, delivery_id uuid NOT NULL REFERENCES email_deliveries(id) ON DELETE CASCADE,
 number integer NOT NULL, status text NOT NULL DEFAULT 'STARTED', error text,
 started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, UNIQUE(delivery_id,number)
);
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'ALERT';
CREATE TABLE IF NOT EXISTS digest_settings (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false, send_time text NOT NULL DEFAULT '08:00',
 recipient_ids jsonb NOT NULL DEFAULT '[]', revision integer NOT NULL DEFAULT 1,
 cursor_at timestamptz NOT NULL DEFAULT now(), cursor_id uuid NOT NULL DEFAULT 'ffffffff-ffff-ffff-ffff-ffffffffffff'
);
CREATE TABLE IF NOT EXISTS digest_runs (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 run_day date NOT NULL, items jsonb NOT NULL, scanned integer NOT NULL, remaining boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,run_day)
);
CREATE INDEX IF NOT EXISTS opportunities_digest_cursor ON opportunities(created_at,id);
CREATE TABLE IF NOT EXISTS simulations (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL, inputs jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS simulations_org_idx ON simulations(organization_id);
ALTER TABLE simulations ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS sync_runs (
  id uuid PRIMARY KEY, source_code text NOT NULL, organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  status text NOT NULL CHECK(status IN ('PENDING','RUNNING','SUCCEEDED','FAILED','PARTIAL')),
  records_read integer NOT NULL DEFAULT 0, records_created integer NOT NULL DEFAULT 0, records_updated integer NOT NULL DEFAULT 0,
  error text, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS sync_runs_source_idx ON sync_runs(source_code,started_at DESC);
CREATE TABLE IF NOT EXISTS opportunity_item_pages (
 opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
 page integer NOT NULL CHECK(page BETWEEN 1 AND 400), payload jsonb NOT NULL,
 checked_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(opportunity_id,page)
);
CREATE TABLE IF NOT EXISTS commercial_proposals (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
 name text NOT NULL, current_revision integer NOT NULL DEFAULT 0,
 create_request_id uuid NOT NULL, create_input_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,create_request_id)
);
CREATE INDEX IF NOT EXISTS commercial_proposals_lookup ON commercial_proposals(organization_id,opportunity_id,updated_at DESC,id);
CREATE TABLE IF NOT EXISTS commercial_proposal_versions (
 proposal_id uuid NOT NULL REFERENCES commercial_proposals(id) ON DELETE CASCADE,
 revision integer NOT NULL, request_id uuid NOT NULL, input_hash text NOT NULL,
 body jsonb NOT NULL, company_snapshot jsonb NOT NULL, source_snapshots jsonb NOT NULL,
 catalog_snapshots jsonb NOT NULL DEFAULT '[]',
 opportunity_snapshot jsonb NOT NULL DEFAULT '{}',
 source_fingerprint text NOT NULL, totals jsonb NOT NULL,
 actor_id uuid REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(proposal_id,revision), UNIQUE(proposal_id,request_id)
);
ALTER TABLE commercial_proposal_versions ADD COLUMN IF NOT EXISTS catalog_snapshots jsonb NOT NULL DEFAULT '[]';
ALTER TABLE commercial_proposal_versions ADD COLUMN IF NOT EXISTS opportunity_snapshot jsonb NOT NULL DEFAULT '{}';
CREATE TABLE IF NOT EXISTS change_alert_settings (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 settings jsonb NOT NULL, revision integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS opportunity_changes (
 id uuid PRIMARY KEY, opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
 types jsonb NOT NULL, before_data jsonb NOT NULL, after_data jsonb NOT NULL, detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS opportunity_changes_lookup ON opportunity_changes(opportunity_id,detected_at DESC,id);
CREATE TABLE IF NOT EXISTS agency_watches (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 name text NOT NULL, agency_cnpj text NOT NULL, terms jsonb NOT NULL DEFAULT '[]', excluded_terms jsonb NOT NULL DEFAULT '[]',
 states jsonb NOT NULL DEFAULT '[]', active boolean NOT NULL DEFAULT true, revision integer NOT NULL DEFAULT 1,
 active_since timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agency_watches_name ON agency_watches(organization_id,lower(name));
CREATE INDEX IF NOT EXISTS agency_watches_active ON agency_watches(agency_cnpj) WHERE active;
CREATE TABLE IF NOT EXISTS agency_watch_hits (
 watch_id uuid NOT NULL REFERENCES agency_watches(id) ON DELETE CASCADE,
 opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
 rule_snapshot jsonb NOT NULL, detected_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(watch_id,opportunity_id)
);
CREATE INDEX IF NOT EXISTS agency_watch_hits_history ON agency_watch_hits(watch_id,detected_at DESC,opportunity_id);
CREATE TABLE IF NOT EXISTS opportunity_change_reviews (
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 change_id uuid NOT NULL REFERENCES opportunity_changes(id) ON DELETE CASCADE,
 reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,change_id)
);
CREATE TABLE IF NOT EXISTS opportunity_relations (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 previous_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
 new_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE, evidence jsonb NOT NULL,
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','CONFIRMED','REJECTED')),
 revision integer NOT NULL DEFAULT 1, reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
 reviewed_at timestamptz, detected_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,previous_id,new_id)
);
CREATE INDEX IF NOT EXISTS opportunity_relations_org ON opportunity_relations(organization_id,previous_id,new_id);
${searchSchemaSql}
`;
