## Running under Codex
You are running non-interactively (`codex exec` or a Codex automation), so nobody can answer a question. Never ask for confirmation: decide, and record the decision under `issues` in `meta/run`.

The scan needs the network (api.openalex.org, publisher and venue pages) and the local radar server named by `RADAR_URL`. If a command fails because the sandbox blocks network access or the server, do not retry in a loop: write `meta/run` with `status: "failed"` and the issue "sandbox blocked network access" if the server is still reachable, delete `scanlock/current`, and stop.

Your final message is the report: it is saved to the scan log.
