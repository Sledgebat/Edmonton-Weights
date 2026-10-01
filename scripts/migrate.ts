/** Creates or upgrades the SQLite database (db/edmontonweights.sqlite, or DATABASE_URL). */
import { databasePath, openDb } from "../db";

openDb();
console.log(`Database ready: ${databasePath()}`);
