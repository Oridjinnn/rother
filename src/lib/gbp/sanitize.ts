/**
 * Sanitize error messages and API responses to prevent filesystem path exposure.
 *
 * Node.js filesystem errors always include the full path (e.g.
 * "ENOENT: no such file or directory, open '/home/user/project/file.json'").
 * This utility strips those paths and replaces them with a safe placeholder.
 */

const PATH_PATTERN = /(?:'[^']*'|"[^"]*"|[`][^`]*[`])/g;

export function sanitizeErrorMessage(message: string): string {
  return message.replace(PATH_PATTERN, "'<path>'");
}

export function sanitizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return sanitizeErrorMessage(message);
}

export function safeError(msg: string): string {
  return msg.replace(/:\s*'[^']*'/g, "").replace(/:\s*"[^"]*"/g, "");
}
