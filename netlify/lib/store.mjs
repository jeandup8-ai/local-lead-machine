import { getStore } from "@netlify/blobs";
export function prospectStore() {
  const s = getStore({ name: "prospects", consistency: "strong" });
  return {
    get: (k) => s.get(k, { type: "json" }),
    set: (k, v) => s.setJSON(k, v),
  };
}
