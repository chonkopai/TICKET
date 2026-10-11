import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
export const pg = require(require.resolve('pg', { paths: [dirname(require.resolve('@prisma/adapter-pg'))] }));
export function assertIsolated(connection) {
  const url = new URL(connection);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !/^\/event_platform_v2_(fresh|legacy)_\d+$/.test(url.pathname)) {
    throw new Error('Only an isolated local v2 rehearsal database may be mutated');
  }
  return url.pathname.slice(1);
}
export async function rehearsalConnection(directory, kind = 'legacy') {
  const connections = JSON.parse(await readFile(`${directory}/connections.json`, 'utf8'));
  assertIsolated(connections[kind]);
  return connections[kind];
}

// IDs, exact rows/snapshots and money grouped by currency/status, never numeric floats.
export async function financialEvidence(client) {
  const result = { rows: {}, totals: {} };
  for (const table of ['Order', 'Payment', 'Deposit', 'RefundRequest', 'Ticket', 'Booking', 'TicketReservation', 'SeatAllocation', 'GroupPass', 'TableHold', 'Seat']) {
    result.rows[table] = (await client.query(`SELECT count(*)::text AS count, md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id),'')) AS digest FROM "${table}" t`)).rows[0];
  }
  for (const [table, status] of [['Order','paymentStatus'], ['Payment','status'], ['Deposit','status'], ['RefundRequest','status']]) {
    result.totals[table] = (await client.query(`SELECT btrim(currency) AS currency,"${status}"::text AS status,count(*)::text AS count,sum(amount)::text AS minor_total FROM "${table}" GROUP BY 1,2 ORDER BY 1,2`)).rows;
  }
  for (const [table, fields] of [['TicketType',['id','eventId','price','deposit','currency','quantityTotal','quantitySold','venueObjectId','status']], ['Table',['id','venueLayoutId','price','deposit','currency','seats','saleMode','status']], ['VenueRow',['id','venueLayoutId','price','deposit','currency','status']], ['VenueLayout',['id','eventId','layoutJson','revision']]]) {
    result.rows[table] = (await client.query(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(jsonb_build_array(${fields.map(f=>`"${f}"`).join(',')})::text),'' ORDER BY id),'')) AS digest FROM "${table}"`)).rows[0];
  }
  return result;
}
