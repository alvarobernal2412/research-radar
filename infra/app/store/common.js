class Conflict extends Error {
  constructor(version) { super("version conflict"); this.code = "conflict"; this.version = version; }
}

function split(p) {
  const i = p.lastIndexOf("/");
  return { collection: p.slice(0, i), id: p.slice(i + 1) };
}

// A path is 2+ segments of safe characters; "." and ".." are never a segment.
const SEG = /^[A-Za-z0-9_\-.~:@+]+$/;
function validPath(p) {
  const segs = String(p).split("/");
  return segs.length >= 2 && segs.every((s) => SEG.test(s) && !/^\.+$/.test(s));
}

module.exports = { Conflict, split, validPath };
