/* ---------- shared blocks ---------- */
function loadingBlock(){return `<div class="empty"><span>Loading…</span></div>`}
function emptyBlock(t,s){return `<div class="empty"><b>${esc(t)}</b><span style="max-width:52ch">${esc(s)}</span></div>`}
function notFound(kind,href,label){return `<div class="empty"><b>This ${kind} isn't in the radar</b><a href="${href}">Back to ${label}</a></div>`}
