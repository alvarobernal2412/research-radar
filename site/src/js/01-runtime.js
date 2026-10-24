/* ---------- host runtime ---------- */
// The page reaches its host through capabilities: db, user, sample, mcp, downloads.
// Claude's artifact host provides them as window.claude; the self-hosted server (infra/app) provides window.radarRuntime.
function runtimeHost(){
  if(window.claude&&window.claude.use)return window.claude;
  if(window.radarRuntime&&window.radarRuntime.use)return window.radarRuntime;
  return null;
}
function rtKind(){return window.claude&&window.claude.use?"claude":window.radarRuntime&&window.radarRuntime.use?"self-hosted":"none"}
async function rtUse(name){const h=runtimeHost();return h?h.use(name):null}
