// Optional browser bridge to real disposable SQL, never a remote Supabase database.
import pg from "pg";
export async function operationsSnapshot(mode) {
  const url = process.env.DEIPO_TEST_DATABASE_URL;
  if (
    !url ||
    !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname)
  )
    throw Error("Disposable localhost database required");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("begin");
    if (mode === "empty")
      await client.query(
        "update public.storefront_config set current_drop_id=null,next_drop_id=null",
      );
    else {
      const row = (
        await client.query(
          "select d.id from public.drops d join public.order_items i on i.drop_id=d.id join public.order_fulfillment f on f.order_id=i.order_id where d.name='Operations fixture' order by f.created_at desc limit 1",
        )
      ).rows[0];
      if (!row)
        throw Error(
          "Run test:operations:db first to create disposable fixtures",
        );
      await client.query(
        "update public.storefront_config set current_drop_id=$1,next_drop_id=null",
        [row.id],
      );
    }
    await client.query(
      "select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true)",
    );
    await client.query("set local role authenticated");
    return (await client.query("select public.ops_command_center() v")).rows[0]
      .v;
  } finally {
    await client.query("rollback");
    await client.end();
  }
}
