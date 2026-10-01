/** Re-train the xG model from shots already in the database. `npm run xg:train -- --seasons=20242025,20252026` */
import { rescoreAll, trainFromDatabase } from "../lib/stats/model-io";

const seasons = process.argv.find((a) => a.startsWith("--seasons="))?.split("=")[1]?.split(",").map(Number);
trainFromDatabase({ seasons });
rescoreAll();
