import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { assertBackend } from "./security";

// List every item for a resource, returning the stored payloads (same shape the
// front-end and admin already expect).
export const list = query({
  args: { secret: v.string(), resource: v.string() },
  handler: async (ctx, { secret, resource }) => {
    assertBackend(secret);
    const rows = await ctx.db
      .query("records")
      .withIndex("by_resource", (q) => q.eq("resource", resource))
      .collect();
    return rows.map((r) => r.data);
  },
});

export const get = query({
  args: { secret: v.string(), recId: v.string() },
  handler: async (ctx, { secret, recId }) => {
    assertBackend(secret);
    const row = await ctx.db
      .query("records")
      .withIndex("by_recId", (q) => q.eq("recId", recId))
      .unique();
    return row ? row.data : null;
  },
});

export const create = mutation({
  args: { secret: v.string(), resource: v.string(), recId: v.string(), data: v.any() },
  handler: async (ctx, { secret, resource, recId, data }) => {
    assertBackend(secret);
    await ctx.db.insert("records", { resource, recId, data });
    return data;
  },
});

export const update = mutation({
  args: { secret: v.string(), recId: v.string(), patch: v.any() },
  handler: async (ctx, { secret, recId, patch }) => {
    assertBackend(secret);
    const row = await ctx.db
      .query("records")
      .withIndex("by_recId", (q) => q.eq("recId", recId))
      .unique();
    if (!row) return null;
    const data = { ...row.data, ...patch };
    await ctx.db.patch(row._id, { data });
    return data;
  },
});

export const remove = mutation({
  args: { secret: v.string(), recId: v.string() },
  handler: async (ctx, { secret, recId }) => {
    assertBackend(secret);
    const row = await ctx.db
      .query("records")
      .withIndex("by_recId", (q) => q.eq("recId", recId))
      .unique();
    if (!row) return null;
    const data = row.data;
    await ctx.db.delete(row._id);
    return data;
  },
});
