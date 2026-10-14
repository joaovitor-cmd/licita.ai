export const priceRecordSchemaSql=`
CREATE TABLE IF NOT EXISTS price_records (
 id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 number text NOT NULL, title text NOT NULL, agency text NOT NULL,
 opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
 document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
 owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
 starts_on date NOT NULL, ends_on date NOT NULL, notes text NOT NULL DEFAULT '',
 items jsonb NOT NULL DEFAULT '[]', revision integer NOT NULL DEFAULT 1, archived boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_on>=starts_on)
);
CREATE INDEX IF NOT EXISTS price_records_list ON price_records(organization_id,archived,ends_on,id);
CREATE TABLE IF NOT EXISTS price_record_events (
 id uuid PRIMARY KEY, record_id uuid NOT NULL REFERENCES price_records(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES users(id) ON DELETE SET NULL, type text NOT NULL, description text NOT NULL,
 snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS price_record_events_list ON price_record_events(record_id,created_at,id);
`;
