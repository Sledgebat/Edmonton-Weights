/** Creates or upgrades the SQLite database (db/oil-country-hub.sqlite, or DATABASE_URL). */
import { databasePath, openDb } from "../db";

openDb();
console.log(`Database ready: ${databasePath()}`);
