/**
 * Catch-up listings (SPEC §3): past programmes the provider recorded, from
 * `get_simple_data_table`, for channels with `tv_archive`. Fetched when the
 * user opens a channel's catch-up list and kept in memory for 15 minutes.
 */

import { EPG_FRESH_MS, archivedProgrammes, type LiveChannel, type Programme } from "@tuner/core";
import { activeClient } from "./session";

const cache = new Map<number, { at: number; programmes: Programme[] }>();

export async function loadArchive(channel: LiveChannel): Promise<Programme[]> {
  const now = Date.now();
  const hit = cache.get(channel.id);
  if (hit && now - hit.at < EPG_FRESH_MS) return hit.programmes;
  const client = await activeClient();
  if (!client) return [];
  const entries = await client.simpleDataTable(channel.id);
  const programmes = archivedProgrammes(entries, now, channel.tvArchiveDays);
  cache.set(channel.id, { at: now, programmes });
  return programmes;
}
