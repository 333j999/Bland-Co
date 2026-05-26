import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // One row per item across every list resource (inventory, enquiries, valuations,
  // testimonials, consultations). `data` holds the item exactly as the API/admin sends
  // it — flexible by design — and `recId` is the public id (e.g. "inv_ab12cd34") that the
  // existing API contract and front-end already use.
  records: defineTable({
    resource: v.string(),
    recId: v.string(),
    data: v.any(),
  })
    .index("by_resource", ["resource"])
    .index("by_recId", ["recId"]),

  // Singletons such as site settings (hero video URL, etc.).
  kv: defineTable({
    key: v.string(),
    value: v.any(),
  }).index("by_key", ["key"]),
});
