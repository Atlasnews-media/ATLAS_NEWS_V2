import { format } from "prettier";

export async function serializeCanonicalJson(value) {
  return format(JSON.stringify(value), { parser: "json" });
}
