import { prisma } from "./src/index.js";
import { seedIds } from "./src/seed-data.js";

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

  console.log(
    JSON.stringify({
      event: event.title,
      organizer: event.organizer.name,
      ticketTypes: event.ticketTypes.map((ticketType) => ticketType.name),
      venueLayout: event.venueLayout.templateName,
      tables: event.venueLayout.tables.map((table) => table.number),
    }),
  );
} finally {
  await prisma.$disconnect();
}
