export const sourceReconciliationSchemaSql=`
CREATE TABLE IF NOT EXISTS opportunity_source_observations (
 id uuid PRIMARY KEY, opportunity_id uuid NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
 source_code text NOT NULL, external_id text NOT NULL, source_url text,
 reported_updated_at timestamptz, consulted_at timestamptz NOT NULL DEFAULT now(),
 decision text NOT NULL CHECK(decision IN ('accepted','rejected','conflicting')),
 reason text NOT NULL, snapshot jsonb NOT NULL, UNIQUE(opportunity_id,source_code)
);
CREATE INDEX IF NOT EXISTS opportunity_observations_recent_idx ON opportunity_source_observations(opportunity_id,consulted_at DESC);
`;
