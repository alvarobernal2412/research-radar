## 9. Mirror to the local stack (optional)

Run this only after every write above has succeeded and the run summary is stored.

1. Create an empty scratch folder `<MIRROR_DIR>` (outside the repo). Read the `papers`, `conferences`, `journals` and `meta` collections of {{ARTIFACT_URL}} with ArtifactData, setting `out_dir` to `<MIRROR_DIR>`, paging with `query.cursor`. Use this radar's prefix on every path (none for the first radar, otherwise `radars/<id>/`, as stated at the top of this prompt), and also copy this radar's registry document (`radars/<id>`, where it exists) so the radar menu works in the mirror. Never read or save anything under `data/users` (it holds private API keys) or `scanlock`.
2. If you run in a session that reaches the computer only through device tools (`device_bash`, `device_stage_files`, `device_commit_files`), `out_dir` lands in the session, not on the computer. Copy the folder to `<MIRROR_DIR>` on the computer with `device_stage_files` and `device_commit_files`, and run every command below with `device_bash`.
3. Import it into the local stack:
   `docker compose -f <REPO_PATH>/infra/docker-compose.yml run --rm -v "<MIRROR_DIR>:/in:ro" app node import.js /in`
4. If a command fails (Docker not running, stack never started), say so in the run report and carry on. The mirror is a convenience; the artifact stays the source of truth.
