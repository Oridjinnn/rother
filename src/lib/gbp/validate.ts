const VALID_COMPETITOR_ID_RE = /^[a-zA-Z0-9_-]+$/;
const MAX_COMPETITOR_ID_LEN = 64;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateCompetitorId(id: string): string {
  if (typeof id !== "string" || id.length === 0) {
    throw new ValidationError(
      `Invalid competitor_id: must be a non-empty string${
        typeof id === "string" ? ", got empty string" : `, got ${typeof id}`
      }`,
    );
  }
  if (id.includes("\x00")) {
    throw new ValidationError("Invalid competitor_id: contains null byte");
  }
  if (id.startsWith("-") || id.endsWith("-")) {
    throw new ValidationError("Invalid competitor_id: cannot start or end with hyphen");
  }
  if (id.includes("..")) {
    throw new ValidationError("Invalid competitor_id: contains '..' (path traversal)");
  }
  if (id.includes("/") || id.includes("\\")) {
    throw new ValidationError("Invalid competitor_id: contains path separator");
  }
  if (id.length > MAX_COMPETITOR_ID_LEN) {
    throw new ValidationError(
      `Invalid competitor_id: length ${id.length} exceeds maximum ${MAX_COMPETITOR_ID_LEN}`,
    );
  }
  if (!VALID_COMPETITOR_ID_RE.test(id)) {
    throw new ValidationError(
      "Invalid competitor_id: must match alphanumeric, hyphens, underscores only",
    );
  }
  return id;
}
