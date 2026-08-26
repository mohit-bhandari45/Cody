CREATE TABLE pr_reviews (
    id SERIAL PRIMARY KEY,
    owner TEXT NOT NULL,
    repo TEXT NOT NULL,
    pr_number INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    last_reviewed_sha TEXT,
    last_comment_id BIGINT,
    last_issues JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (owner, repo, pr_number)
);

CREATE TABLE review_runs (
  id SERIAL PRIMARY KEY,
  pr_review_id INT REFERENCES pr_reviews(id) ON DELETE CASCADE,
  commit_sha TEXT NOT NULL,
  comment_id BIGINT,
  summary TEXT,
  issues JSONB,
  file_count INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (pr_review_id, commit_sha)
);