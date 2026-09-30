import { prisma } from "./src/index.js";
import { demoEvents, seedIds } from "./src/seed-data.js";
import { venueLayoutSchemaAny } from "../shared-types/src/index.js";

try {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: seedIds.event },
    include: {
      organizer: true,
      ticketTypes: { orderBy: { name: "asc" } },
      venueLayout: {
        include: { tables: { orderBy: { number: "asc" } } },
      },
    },
  });

  if (event.ticketTypes.length !== 2) throw new Error("Expected two seeded ticket types");
  if (event.venueLayout?.tables.length !== 5) throw new Error("Expected five seeded tables");
  const geometry = event.venueLayout.layoutJson as { tables?: Array<{ tableId: string }> };
  if (geometry.tables?.length !== 5) throw new Error("Expected geometry for every seeded table");
  if (!event.venueLayout.tables.every((table) => geometry.tables?.some((item) => item.tableId === table.id))) {
    throw new Error("Expected seeded geometry IDs to resolve to layout tables");
  }

  const demos = await prisma.event.findMany({
    where: { id: { in: demoEvents.map(({ id }) => id) } },
    include: {
      ticketTypes: true,
      venueLayout: { include: { tables: true, rows: true, seats: { include: { allocations: true } } } },
    },
  });
  if (demos.length !== demoEvents.length) throw new Error(`Expected ${demoEvents.length} demo events, received ${demos.length}`);
  for (const demo of demos) {
    if (demo.venueLayout && !venueLayoutSchemaAny.safeParse(demo.venueLayout.layoutJson).success) {
      throw new Error(`Demo venue layout is invalid: ${demo.id}`);
    }
  }
  const byId = new Map(demos.map((demo) => [demo.id, demo]));
  const requireDemo = (suffix: number) => byId.get(`00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`) ?? (() => { throw new Error(`Missing demo event ${suffix}`); })();
  const wholeTables = requireDemo(217);
  if (wholeTables.venueLayout?.tables.filter(({ saleMode }) => saleMode === "whole_table").length !== 4) throw new Error("Expected four whole-table gala fixtures");
  const numberedRows = requireDemo(218);
  if (numberedRows.venueLayout?.rows.length !== 3 || numberedRows.venueLayout.seats.length !== 36) throw new Error("Expected three numbered rows with 36 seats");
  if (numberedRows.venueLayout.seats.flatMap(({ allocations }) => allocations).filter(({ status }) => status === "active").length !== 4) throw new Error("Expected four occupied numbered-row seat fixtures");
  const perSeat = requireDemo(219);
  if (perSeat.venueLayout?.tables.some(({ saleMode }) => saleMode !== "per_seat") || perSeat.venueLayout?.seats.length !== 18) throw new Error("Expected 18 per-seat table places");
  if (perSeat.venueLayout.seats.flatMap(({ allocations }) => allocations).filter(({ status }) => status === "active").length !== 3) throw new Error("Expected three occupied per-seat table fixtures");
  const zones = requireDemo(220);
  if (zones.ticketTypes.filter(({ venueObjectId }) => venueObjectId !== null).length !== 2) throw new Error("Expected two standing-zone ticket types");
  if (requireDemo(221).status !== "draft" || requireDemo(225).status !== "cancelled" || requireDemo(226).status !== "completed") throw new Error("Expected draft, cancelled and completed lifecycle fixtures");
  if (!requireDemo(222).ticketTypes.every(({ price }) => price === 0)) throw new Error("Expected a free-registration fixture");
  if (requireDemo(223).ticketTypes.filter(({ isInternal }) => isInternal).length !== 1) throw new Error("Expected an internal corporate invitation tariff");
  const stadium = requireDemo(227);
  if (stadium.venueLayout?.rows.length !== 38 || stadium.venueLayout.seats.length !== 844) throw new Error("Expected the mini-stadium fixture to contain 38 sections and 844 selectable seats");
  if (stadium.ticketTypes.some(({ venueObjectId }) => venueObjectId?.startsWith("00000008"))) throw new Error("Expected the mini-stadium fixture to offer seat selection without standing-zone products");
  if (stadium.venueLayout.seats.flatMap(({ allocations }) => allocations).filter(({ status }) => status === "active").length !== 40) throw new Error("Expected 40 occupied mini-stadium seat fixtures");

  console.log(
    JSON.stringify({
      event: event.title,
      organizer: event.organizer.name,
      ticketTypes: event.ticketTypes.map((ticketType) => ticketType.name),
      venueLayout: event.venueLayout.templateName,
      tables: event.venueLayout.tables.map((table) => table.number),
      demoEvents: demos.length,
      demoLayouts: demos.filter(({ venueLayout }) => venueLayout !== null).length,
    }),
  );
} finally {
  await prisma.$disconnect();
}
