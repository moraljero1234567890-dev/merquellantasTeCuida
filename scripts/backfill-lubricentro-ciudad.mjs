// One-time backfill: the lubricentros pilot only ran in Yumbo, so every order
// recorded so far belongs to that city. Stamp ciudad = "Yumbo" on all existing
// orders that don't already have it. From here on the city is derived from the
// logged-in user (session.user.ciudad) at create time — this script is NOT part
// of that flow, just a one-shot fix for the pilot data.
//
// Idempotent: only touches orders whose ciudad isn't already "Yumbo", so
// re-running after success is a no-op.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { MongoClient } from "mongodb";

// Uppercase to match the convention used by the users collection (ciudad is
// stored as "YUMBO", "CALI", ... there). New orders are stamped from
// session.user.ciudad, so past and future Yumbo orders must use the same form
// or the city filter (exact match) would split them into two groups.
const CIUDAD = "YUMBO";
const COLLECTION = "lubricentro_ordenes";

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB || "merque_bienestar");
const ordenes = db.collection(COLLECTION);

const total = await ordenes.countDocuments({});
const needing = await ordenes.countDocuments({ ciudad: { $ne: CIUDAD } });

console.log(`${COLLECTION}: ${total} órdenes en total; ${needing} sin ciudad="${CIUDAD}".`);

if (needing === 0) {
  console.log("Nada que actualizar — ya están todas en Yumbo. Saliendo.");
  await client.close();
  process.exit(0);
}

const res = await ordenes.updateMany(
  { ciudad: { $ne: CIUDAD } },
  { $set: { ciudad: CIUDAD } },
);

console.log(`Actualizadas ${res.modifiedCount} órdenes -> ciudad="${CIUDAD}".`);

const remaining = await ordenes.countDocuments({ ciudad: { $ne: CIUDAD } });
console.log(`Verificación: quedan ${remaining} órdenes sin ciudad="${CIUDAD}".`);

await client.close();
