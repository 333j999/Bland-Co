import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { assertBackend } from "./security";

// Simple key/value store for singletons (e.g. "site:settings").
export const get = query({
  args: { secret: v.string(), key: v.string() },
  handler: async (ctx, { secret, key }) => {
    assertBackend(secret);
    const row = await ctx.db
      .query("kv")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    return row ? row.value : null;
  },
});

export const set = mutation({
  args: { secret: v.string(), key: v.string(), value: v.any() },
  handler: async (ctx, { secret, key, value }) => {
    assertBackend(secret);
    const row = await ctx.db
      .query("kv")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { value });
    } else {
      await ctx.db.insert("kv", { key, value });
    }
    return value;
  },
});

export const remove = mutation({
  args: { secret: v.string(), key: v.string() },
  handler: async (ctx, { secret, key }) => {
    assertBackend(secret);
    const row = await ctx.db
      .query("kv")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (row) await ctx.db.delete(row._id);
    return true;
  },
});
