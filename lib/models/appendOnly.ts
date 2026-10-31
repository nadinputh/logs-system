import type { Schema } from "mongoose";

const BLOCKED_QUERY_OPS = [
  "updateOne",
  "updateMany",
  "replaceOne",
  "findOneAndUpdate",
  "findOneAndReplace",
  "findOneAndDelete",
  "deleteOne",
  "deleteMany",
] as const;

/**
 * Makes a collection append-only at the model layer. The ledger rules (CLAUDE.md
 * §4) were convention only: any future route, script or typo could `$set` a Log
 * or delete an AuditLog row and nothing would stop it. Inserts (`create`,
 * `insertMany`) stay open; every mutation through Mongoose throws.
 *
 * Maintenance that must touch history (scripts/purge-legacy-selfies.ts) goes
 * through the native driver (`Model.collection`), which bypasses these hooks on
 * purpose and so stays visible in review.
 */
export function appendOnly(schema: Schema, name: string) {
  const refuse = () => {
    throw new Error(`${name} is append-only`);
  };
  for (const op of BLOCKED_QUERY_OPS) schema.pre(op, refuse);
  schema.pre("bulkWrite", refuse);
  schema.pre("save", function () {
    if (!this.isNew) refuse();
  });
  schema.pre("deleteOne", { document: true, query: false }, refuse);
}
