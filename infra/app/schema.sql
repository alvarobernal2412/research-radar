-- One row per artifact-database document; mirrors the artifact's path model.
-- path "papers/<id>" -> collection "papers"; "data/users/local/marks" -> collection "data/users/local".
CREATE TABLE IF NOT EXISTS docs (
  path       text PRIMARY KEY,
  collection text NOT NULL,
  id         text NOT NULL,
  data       jsonb NOT NULL,
  version    integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS docs_collection_idx ON docs (collection);
