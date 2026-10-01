/** Bring stored shots up to the current definitions and re-score them with lib/stats/xg-model.json. No download. */
import { getDb } from "../db";
import { applyDefinitionFixes, rescoreAll } from "../lib/stats/model-io";

applyDefinitionFixes();
rescoreAll();
getDb().$client.pragma("wal_checkpoint(TRUNCATE)");
