## 9. Mirror to the local stack (optional)

Run this only after every write above has succeeded and the run summary is stored.

1. Create an empty scratch folder `<MIRROR_DIR>` (outside the repo). Read the `papers`, `conferences`, `journals` and `meta` collections of {{ARTIFACT_URL}} with ArtifactData, setting `out_dir` to `<MIRROR_DIR>`, paging with `query.cursor`. Never read or save anything under `data/users`: it holds private API keys.
2. Import it into the local stack:
   `docker compose -f <REPO_PATH>/infra/docker-compose.yml run --rm -v "<MIRROR_DIR>:/in:ro" app node import.js /in`
3. If the command fails (Docker not running, stack never started), say so in the run report and carry on. The mirror is a convenience; the artifact stays the source of truth.
