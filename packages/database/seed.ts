import { EventStatus, OrderType, PaymentStatus, SeatAllocationStatus, TicketStatus, TicketTypeStatus, UserRole, prisma } from "./src/index.js";
import { demoEvents, demoOrganizers, seedIds } from "./src/seed-data.js";
import { localizedDemoContent } from "./src/demo-translations.js";

const eventDate = new Date("2026-12-20T00:00:00.000Z");
const eventTime = new Date("1970-01-01T19:00:00.000Z");
const stockImage = (photoId: string) => `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1400&q=85`;
const galleryImagePool: Record<string, string[]> = {
  music: ["photo-1492684223066-81342ee5ff30", "photo-1514525253161-7a46d19cd819", "photo-1501386761578-eac5c94b800a", "photo-1542751371-adc38448a05e"],
  nightlife: ["photo-1514525253161-7a46d19cd819", "photo-1492684223066-81342ee5ff30", "photo-1501386761578-eac5c94b800a"],
  festival: ["photo-1501386761578-eac5c94b800a", "photo-1512389142860-9c449e58a543", "photo-1492684223066-81342ee5ff30"],
  business: ["photo-1540575467063-178a50c2df87", "photo-1551836022-d5d88e9218df", "photo-1521737711867-e3b97375f902", "photo-1505373877841-8d25f7d46678"],
  education: ["photo-1532094349884-543bc11b234d", "photo-1452780212940-6f5c0d14d848", "photo-1540575467063-178a50c2df87"],
  workshop: ["photo-1565193566173-7a0ee3dbe261", "photo-1452780212940-6f5c0d14d848", "photo-1464822759023-fed622ff2c3b", "photo-1528698827591-e19ccd7bc23d"],
  food: ["photo-1488459716781-31db52582fe9", "photo-1414235077428-338989a2e8c0", "photo-1519167758481-83f550bb49b3", "photo-1528698827591-e19ccd7bc23d"],
  theatre: ["photo-1507676184212-d03ab07a01bf", "photo-1489599849927-2ee91cede3ba", "photo-1585699324551-f6c3097c29a4", "photo-1564399579883-451a5d44ec08"],
  comedy: ["photo-1585699324551-f6c3097c29a4", "photo-1507676184212-d03ab07a01bf", "photo-1489599849927-2ee91cede3ba"],
  family: ["photo-1512389142860-9c449e58a543", "photo-1472162072942-cd5147eb3902", "photo-1564399579883-451a5d44ec08", "photo-1528698827591-e19ccd7bc23d"],
  sport: ["photo-1552674605-db6ffd4facb5", "photo-1542751371-adc38448a05e", "photo-1501386761578-eac5c94b800a"],
  other: ["photo-1528698827591-e19ccd7bc23d", "photo-1519167758481-83f550bb49b3", "photo-1488459716781-31db52582fe9"],
};

function galleryUrlsFor(eventId: string, category: string, posterUrl: string | null): string[] {
  const pool = galleryImagePool[category] ?? galleryImagePool.other!;
  const candidates = pool.map(stockImage).filter((url) => url !== posterUrl);
  const offset = Number(eventId.slice(-3)) % candidates.length;
  return [candidates[offset]!, candidates[(offset + 1) % candidates.length]!];
}

type DemoLayoutKind = "whole_tables" | "numbered_rows" | "per_seat_tables" | "standing_zones" | "mixed_studio" | "mini_stadium" | "cabaret" | "theatre_balcony" | "expo_islands";
type EditorObject = {
  id: string; type: "table_rect" | "table_round" | "seat" | "row" | "zone" | "prop" | "entrance";
  name: string; x: number; y: number; width: number; height: number; rotation: number; color: string;
  colorOverride: boolean; locked: boolean; zIndex: number; tariffId: string | null; price: number | null;
  deposit: number; parentId: string | null; side: "top" | "right" | "bottom" | "left" | null;
  number: number; attachedOrder: number; saleMode: "whole_table" | "per_seat"; seatOffset: number;
  description: string; capacity: number; opacity: number; points: Array<{ x: number; y: number }>;
  curvature: number; reverse: boolean; startNumber: number; entranceType: "in" | "out" | "both";
};

function fixtureId(namespace: number, eventId: string, index: number): string {
  const eventNumber = Number(eventId.slice(-3));
  return `${String(namespace).padStart(8, "0")}-0000-4000-8000-${String(eventNumber).padStart(6, "0")}${String(index).padStart(6, "0")}`;
}

function editorObject(id: string, type: EditorObject["type"], name: string, x: number, y: number, patch: Partial<EditorObject> = {}): EditorObject {
  return {
    id, type, name, x, y, width: type === "seat" ? 0.45 : type === "row" ? 6 : 1.6,
    height: type === "seat" || type === "row" ? 0.45 : 1, rotation: 0,
    color: type === "seat" ? "#065F46" : "#5B21B6", colorOverride: false, locked: false,
    zIndex: type === "zone" ? -10 : 0, tariffId: null, price: null, deposit: 0,
    parentId: null, side: null, number: 1, attachedOrder: 0, saleMode: "whole_table",
    seatOffset: 0.35, description: "", capacity: 0, opacity: 0.15, points: [], curvature: 0,
    reverse: false, startNumber: 1, entranceType: "both", ...patch,
  };
}

async function seedDemoLayout(eventId: string, kind: DemoLayoutKind, currency = "KZT"): Promise<void> {
  const layoutId = fixtureId(4, eventId, 1);
  if (kind === "mini_stadium") {
    await prisma.$transaction(async (transaction) => {
      await transaction.order.deleteMany({ where: { id: fixtureId(2, eventId, 1) } });
      await transaction.seat.deleteMany({ where: { venueLayoutId: layoutId } });
      await transaction.venueRow.deleteMany({ where: { venueLayoutId: layoutId } });
      await transaction.ticketType.deleteMany({ where: { eventId, venueObjectId: { not: null } } });
    });
  }
  const multiplier = currency === "UZS" ? 10 : currency === "RUB" ? 0.25 : 1;
  const palette: Record<DemoLayoutKind, string[]> = {
    whole_tables: ["#047857", "#9333EA", "#C2410C", "#CA8A04"],
    numbered_rows: ["#1D4ED8", "#D97706", "#A21CAF", "#0F766E"],
    per_seat_tables: ["#0F766E", "#BE123C", "#2563EB", "#7C3AED"],
    standing_zones: ["#15803D", "#C2410C", "#7E22CE", "#0369A1"],
    mixed_studio: ["#0F766E", "#9333EA", "#B45309", "#BE185D"],
    mini_stadium: ["#059669", "#7C3AED", "#0284C7", "#DB2777"],
    cabaret: ["#BE123C", "#B45309", "#6D28D9", "#0F766E"],
    theatre_balcony: ["#1D4ED8", "#7C3AED", "#C2410C", "#047857"],
    expo_islands: ["#0369A1", "#15803D", "#C2410C", "#9333EA"],
  };
  const tariffs = [
    { id: fixtureId(9, eventId, 1), name: "Стандарт", color: palette[kind][0]!, price: Math.round(1_500_000 * multiplier) },
    { id: fixtureId(9, eventId, 2), name: "VIP", color: palette[kind][1]!, price: Math.round(3_500_000 * multiplier) },
    { id: fixtureId(9, eventId, 3), name: "Нижний ярус", color: palette[kind][2]!, price: Math.round(2_400_000 * multiplier) },
    { id: fixtureId(9, eventId, 4), name: "Platinum", color: palette[kind][3]!, price: Math.round(5_500_000 * multiplier) },
  ];
  const objects: EditorObject[] = [];
  const tables: Array<{ object: EditorObject; seats: EditorObject[] }> = [];
  const rows: Array<{ object: EditorObject; seats: EditorObject[] }> = [];
  const sellableSeats: Array<{ object: EditorObject; ticketTypeId: string; price: number }> = [];
  let objectIndex = 1;
  let seatIndex = 1;

  const addTable = (name: string, x: number, y: number, shape: "rect" | "round", saleMode: "whole_table" | "per_seat", count: number, tariff = 0) => {
    const table = editorObject(fixtureId(5, eventId, objectIndex++), shape === "round" ? "table_round" : "table_rect", name, x, y, {
      width: shape === "round" ? 1.8 : 2.4, height: shape === "round" ? 1.8 : 1.2,
      saleMode, tariffId: tariffs[tariff]!.id, deposit: 0,
    });
    const seats: EditorObject[] = [];
    for (let i = 0; i < count; i += 1) {
      let sx = x, sy = y, side: EditorObject["side"] = null, rotation = 0;
      if (shape === "round") {
        const angle = i / count * Math.PI * 2 - Math.PI / 2;
        sx = Math.round((x + Math.cos(angle) * 1.25) * 100) / 100;
        sy = Math.round((y + Math.sin(angle) * 1.25) * 100) / 100;
        rotation = ((angle * 180 / Math.PI + 630) % 360) - 180;
      } else {
        const top = i < Math.ceil(count / 2), sideIndex = top ? i : i - Math.ceil(count / 2);
        const sideCount = top ? Math.ceil(count / 2) : Math.floor(count / 2);
        sx = Math.round((x - table.width / 2 + table.width * (sideIndex + 1) / (sideCount + 1)) * 100) / 100;
        sy = y + (top ? -1 : 1) * (table.height / 2 + table.seatOffset);
        side = top ? "top" : "bottom";
        rotation = top ? 0 : 180;
      }
      seats.push(editorObject(fixtureId(7, eventId, seatIndex++), "seat", `Место ${i + 1}`, sx, sy, {
        parentId: table.id, side, number: i + 1, attachedOrder: i + 1, rotation,
        tariffId: tariffs[tariff]!.id, deposit: 0,
      }));
    }
    objects.push(table, ...seats); tables.push({ object: table, seats });
  };

  const addRow = (name: string, x: number, y: number, count: number, tariff = 0, curvature = 0, width = 8, rotation = 0) => {
    const row = editorObject(fixtureId(6, eventId, objectIndex++), "row", name, x, y, { width, curvature, rotation, tariffId: tariffs[tariff]!.id });
    const angle = rotation * Math.PI / 180;
    const seats = Array.from({ length: count }, (_, index) => {
      const offset = -width / 2 + width * (index + .5) / count;
      return editorObject(fixtureId(7, eventId, seatIndex++), "seat", `Место ${index + 1}`, Math.round((x + Math.cos(angle) * offset) * 100) / 100, Math.round((y + Math.sin(angle) * offset) * 100) / 100, {
        parentId: row.id, number: index + 1, attachedOrder: index + 1, rotation, tariffId: tariffs[tariff]!.id,
      });
    });
    objects.push(row, ...seats); rows.push({ object: row, seats });
  };

  const addZone = (name: string, x: number, y: number, width: number, height: number, capacity: number, tariff: number) => {
    const zone = editorObject(fixtureId(8, eventId, objectIndex++), "zone", name, x, y, {
      width, height, capacity, tariffId: tariffs[tariff]!.id, color: tariffs[tariff]!.color, opacity: 0.18,
      deposit: 0,
      points: [{ x: -width / 2, y: -height / 2 }, { x: width / 2, y: -height / 2 }, { x: width / 2, y: height / 2 }, { x: -width / 2, y: height / 2 }],
    });
    objects.push(zone);
  };

  const addStageAndEntrance = () => {
    objects.push(editorObject(fixtureId(8, eventId, objectIndex++), "prop", "Сцена", 10, 2, { width: 7, height: 1.8, description: "Главная сцена" }));
    objects.push(editorObject(fixtureId(8, eventId, objectIndex++), "entrance", "Вход", 10, 13.9, { width: 1.6, height: 0.2, rotation: 180, entranceType: "in" }));
  };

  if (kind === "whole_tables") {
    addStageAndEntrance();
    addTable("Стол 1", 5, 6, "rect", "whole_table", 6, 1); addTable("Стол 2", 10, 6, "rect", "whole_table", 6, 1);
    addTable("Стол 3", 15, 6, "rect", "whole_table", 6); addTable("Стол 4", 10, 10, "round", "whole_table", 6);
  } else if (kind === "numbered_rows") {
    addStageAndEntrance(); addRow("Ряд A", 10, 5, 12, 1, 0.5); addRow("Ряд B", 10, 8, 12); addRow("Ряд C", 10, 11, 12);
  } else if (kind === "per_seat_tables") {
    addStageAndEntrance(); addTable("Команда A", 5, 7, "round", "per_seat", 6, 1);
    addTable("Команда B", 10, 7, "round", "per_seat", 6); addTable("Команда C", 15, 7, "round", "per_seat", 6);
  } else if (kind === "standing_zones") {
    addStageAndEntrance(); addZone("Фан-зона", 7, 8, 8, 7, 350, 0); addZone("VIP-зона", 15.5, 8, 5, 7, 100, 1);
  } else if (kind === "mixed_studio") {
    addStageAndEntrance(); addTable("Банкетный стол", 5, 6, "rect", "whole_table", 6, 1);
    addTable("Chef table", 11, 6, "round", "per_seat", 6, 1); addRow("Ряд у сцены", 10, 10, 8); addZone("Барная зона", 17, 9, 3, 6, 40, 0);
  } else if (kind === "cabaret") {
    objects.push(editorObject(fixtureId(8, eventId, objectIndex++), "prop", "ЖИВАЯ СЦЕНА", 10, 2, { width: 6.5, height: 1.6, color: "#7F1D1D", description: "Камерная сцена с живой музыкой" }));
    objects.push(editorObject(fixtureId(8, eventId, objectIndex++), "entrance", "Вход во двор", 10, 13.8, { width: 1.8, height: .2, rotation: 180, entranceType: "in" }));
    addTable("Стол у сцены", 5, 5.7, "round", "whole_table", 6, 1);
    addTable("Стол у сцены", 15, 5.7, "round", "whole_table", 6, 1);
    addTable("Общий стол", 5, 10, "rect", "per_seat", 6);
    addTable("Общий стол", 15, 10, "rect", "per_seat", 6);
    addZone("Танцевальная площадка", 10, 8, 4.5, 3.5, 45, 0);
    objects.push(editorObject(fixtureId(8, eventId, objectIndex++), "prop", "БАР", 18.8, 8.5, { width: 1.3, height: 4, color: "#0F766E", description: "Безалкогольный бар" }));
  } else if (kind === "theatre_balcony") {
    objects.push(editorObject(fixtureId(8, eventId, objectIndex++), "prop", "ЭКРАН", 12, 2.2, { width: 12, height: 1.3, color: "#1E3A8A", description: "Киноэкран" }));
    objects.push(editorObject(fixtureId(8, eventId, objectIndex++), "entrance", "Вход A", 6, 21, { width: 1.4, height: .25, rotation: 180, entranceType: "in" }));
    objects.push(editorObject(fixtureId(8, eventId, objectIndex++), "entrance", "Вход B", 18, 21, { width: 1.4, height: .25, rotation: 180, entranceType: "in" }));
    addRow("Партер A", 12, 6, 16, 3, .08, 15);
    addRow("Партер B", 12, 8.6, 18, 2, .12, 17);
    addRow("Партер C", 12, 11.2, 20, 0, .15, 19);
    addRow("Балкон A", 12, 15.2, 18, 1, .18, 17);
    addRow("Балкон B", 12, 17.8, 20, 0, .2, 19);
    objects.push(editorObject(fixtureId(8, eventId, objectIndex++), "prop", "ЦЕНТРАЛЬНЫЙ ПРОХОД", 12, 12.8, { width: 1.1, height: 1.1, color: "#CBD5E1", description: "Проход к балкону" }));
  } else if (kind === "expo_islands") {
    objects.push(editorObject(fixtureId(8, eventId, objectIndex++), "prop", "ЭТНО-СЦЕНА", 16, 2.3, { width: 9, height: 1.6, color: "#7C2D12", description: "Концертная и демонстрационная сцена" }));
    objects.push(editorObject(fixtureId(8, eventId, objectIndex++), "entrance", "Главный вход", 16, 21.7, { width: 2.2, height: .25, rotation: 180, entranceType: "in" }));
    addZone("Гастрономия", 7, 7.5, 9, 5.5, 180, 0);
    addZone("Семейные мастерские", 24.5, 7.5, 9, 5.5, 90, 1);
    addTable("Мастера керамики", 6, 16, "rect", "whole_table", 6, 2);
    addTable("Текстиль и вышивка", 16, 16, "rect", "whole_table", 6, 2);
    addTable("Дерево и орнамент", 26, 16, "rect", "whole_table", 6, 2);
  } else {
    objects.push(editorObject(fixtureId(8, eventId, objectIndex++), "prop", "ГЛАВНАЯ СЦЕНА", 36, 4, { width: 22, height: 4.5, color: "#3B0764", description: "After Hours main stage" }));
    objects.push(editorObject(fixtureId(8, eventId, objectIndex++), "prop", "ПОДИУМ", 36, 9.5, { width: 4, height: 7, color: "#6D28D9", description: "Центральный подиум" }));
    // Preserve the stable row IDs from the first stadium fixture; IDs 3 and 4 belonged to the retired standing zones.
    objectIndex = 5;
    for (let row = 0; row < 5; row += 1) {
      addRow(`VIP A${row + 1}`, 27, 14.5 + row * 1.15, 12, 3, .08, 11);
      addRow(`VIP B${row + 1}`, 45, 14.5 + row * 1.15, 12, 3, .08, 11);
    }
    for (let row = 0; row < 8; row += 1) addRow(`Партер ${row + 1}`, 36, 23 + row * 1.15, 28, row < 3 ? 3 : 1, .15 + row * .04, 22);
    for (let row = 0; row < 7; row += 1) {
      addRow(`Запад ${row + 1}`, 10 + row * 1.05, 27.5, 22, row < 3 ? 2 : 0, .2, 17, 90);
      addRow(`Восток ${row + 1}`, 62 - row * 1.05, 27.5, 22, row < 3 ? 2 : 0, .2, 17, 90);
    }
    for (let row = 0; row < 6; row += 1) addRow(`Север ${row + 1}`, 36, 39.5 + row * 1.05, 32, row < 2 ? 2 : 0, .35, 28);
    objects.push(editorObject(fixtureId(8, eventId, objectIndex++), "entrance", "Вход A", 18, 47.85, { width: 3, height: .3, rotation: 180, entranceType: "in" }));
    objects.push(editorObject(fixtureId(8, eventId, objectIndex++), "entrance", "Вход B", 36, 47.85, { width: 3, height: .3, rotation: 180, entranceType: "in" }));
    objects.push(editorObject(fixtureId(8, eventId, objectIndex++), "entrance", "Вход C", 54, 47.85, { width: 3, height: .3, rotation: 180, entranceType: "in" }));
  }

  const room = kind === "mini_stadium" ? { widthM: 72, heightM: 48 }
    : kind === "theatre_balcony" ? { widthM: 24, heightM: 23 }
      : kind === "expo_islands" ? { widthM: 32, heightM: 24 }
        : { widthM: 20, heightM: 14 };
  const layoutJson = {
    version: 2, room, editor: { version: 1, objects, tariffs },
    tables: tables.map(({ object, seats }) => ({
      tableId: object.id, x: object.x - object.width / 2, y: object.y - object.height / 2,
      width: object.width, height: object.height, rotation: object.rotation,
      shape: object.type === "table_round" ? "round" : "rectangle", preset: "custom",
      seats: seats.map((seat) => ({ number: seat.number, x: 50 + (seat.x - object.x) / object.width * 100, y: 50 + (seat.y - object.y) / object.height * 100, ...(seat.side ? { side: seat.side } : {}) })),
    })),
    rows: rows.map(({ object, seats }) => ({ rowId: object.id, x: object.x - object.width / 2, y: object.y - object.height / 2, width: object.width, height: object.height, rotation: object.rotation, seatCount: seats.length, seatSpacing: 0.45 })),
    stage: null,
  };
  await prisma.venueLayout.upsert({
    where: { eventId },
    create: { id: layoutId, eventId, templateName: `Демо-схема: ${kind}`, layoutJson },
    update: { templateName: `Демо-схема: ${kind}`, layoutJson },
  });

  for (const [index, { object, seats }] of tables.entries()) {
    await prisma.table.upsert({
      where: { id: object.id },
      create: { id: object.id, venueLayoutId: layoutId, number: index + 1, name: object.name, seats: seats.length, price: tariffs.find((tariff) => tariff.id === object.tariffId)!.price, deposit: object.deposit, currency, saleMode: object.saleMode },
      update: { number: index + 1, name: object.name, seats: seats.length, price: tariffs.find((tariff) => tariff.id === object.tariffId)!.price, deposit: object.deposit, currency, saleMode: object.saleMode },
    });
  }
  for (const [index, { object }] of rows.entries()) {
    await prisma.venueRow.upsert({
      where: { id: object.id },
      create: { id: object.id, venueLayoutId: layoutId, number: index + 1, name: object.name, price: tariffs.find((tariff) => tariff.id === object.tariffId)!.price, deposit: object.deposit, currency },
      update: { number: index + 1, name: object.name, price: tariffs.find((tariff) => tariff.id === object.tariffId)!.price, deposit: object.deposit, currency },
    });
  }
  for (const seat of objects.filter((object) => object.type === "seat")) {
    const parent = objects.find((object) => object.id === seat.parentId);
    const individuallySold = parent?.type === "row" || parent?.saleMode === "per_seat";
    let ticketTypeId: string | null = null;
    if (individuallySold) {
      ticketTypeId = fixtureId(3, eventId, seatIndex++);
      const tariff = tariffs.find((item) => item.id === seat.tariffId)!;
      await prisma.ticketType.upsert({
        where: { venueObjectId: seat.id },
        create: { id: ticketTypeId, eventId, venueObjectId: seat.id, name: `${seat.name} · ${seat.id}`, price: tariff.price, deposit: 0, currency, quantityTotal: 1, status: TicketTypeStatus.active },
        update: { eventId, name: `${seat.name} · ${seat.id}`, price: tariff.price, deposit: 0, currency, quantityTotal: 1, status: TicketTypeStatus.active },
      });
      sellableSeats.push({ object: seat, ticketTypeId, price: tariff.price });
    }
    await prisma.seat.upsert({
      where: { id: seat.id },
      create: { id: seat.id, venueLayoutId: layoutId, tableId: parent?.type.startsWith("table_") ? parent.id : null, rowId: parent?.type === "row" ? parent.id : null, number: seat.number, label: seat.name, sortOrder: seat.attachedOrder, ticketTypeId },
      update: { tableId: parent?.type.startsWith("table_") ? parent.id : null, rowId: parent?.type === "row" ? parent.id : null, number: seat.number, label: seat.name, sortOrder: seat.attachedOrder, ticketTypeId },
    });
  }
  const occupiedIndexes = kind === "numbered_rows" ? [2, 8, 17, 29] : kind === "per_seat_tables" ? [1, 7, 14] : kind === "mini_stadium" ? sellableSeats.map((_, index) => index).filter((index) => index % 13 === 4).slice(0, 40) : [];
  const occupiedSeats = occupiedIndexes.map((index) => sellableSeats[index]).filter((seat) => seat !== undefined);
  if (occupiedSeats.length) {
    const orderId = fixtureId(2, eventId, 1);
    const paidAt = new Date("2026-09-20T10:00:00.000Z");
    const amount = occupiedSeats.reduce((total, seat) => total + seat.price, 0);
    await prisma.order.upsert({
      where: { id: orderId },
      create: {
        id: orderId, type: OrderType.ticket, amount, currency: "KZT", paymentStatus: PaymentStatus.paid,
        termsAcceptedAt: paidAt, checkoutSnapshot: { eventId, source: "demo-seat-fixture", seatIds: occupiedSeats.map(({ object }) => object.id) },
      },
      update: {
        type: OrderType.ticket, amount, currency: "KZT", paymentStatus: PaymentStatus.paid,
        termsAcceptedAt: paidAt, checkoutSnapshot: { eventId, source: "demo-seat-fixture", seatIds: occupiedSeats.map(({ object }) => object.id) },
      },
    });
    await prisma.payment.upsert({
      where: { id: fixtureId(2, eventId, 2) },
      create: {
        id: fixtureId(2, eventId, 2), orderId, provider: "seed", providerPaymentId: `seed-${eventId}`,
        providerRequestKey: `seed-request-${eventId}`, amount, currency: "KZT", status: PaymentStatus.paid,
      },
      update: { orderId, amount, currency: "KZT", status: PaymentStatus.paid },
    });
    for (const [index, seat] of occupiedSeats.entries()) {
      const ticketId = fixtureId(2, eventId, 10 + index);
      await prisma.ticket.upsert({
        where: { id: ticketId },
        create: {
          id: ticketId, ticketTypeId: seat.ticketTypeId, orderId, qrToken: `seed-seat-${eventId}-${seat.object.id}`,
          status: TicketStatus.active, paidAt, activatedAt: paidAt, seatLabelSnapshot: seat.object.name,
        },
        update: {
          ticketTypeId: seat.ticketTypeId, orderId, status: TicketStatus.active,
          paidAt, activatedAt: paidAt, seatLabelSnapshot: seat.object.name,
        },
      });
      await prisma.seatAllocation.upsert({
        where: { id: fixtureId(1, eventId, index + 1) },
        create: {
          id: fixtureId(1, eventId, index + 1), seatId: seat.object.id, orderId, ticketId,
          status: SeatAllocationStatus.active,
        },
        update: { seatId: seat.object.id, orderId, ticketId, status: SeatAllocationStatus.active, releasedAt: null, consumedAt: null },
      });
      await prisma.ticketType.update({ where: { id: seat.ticketTypeId }, data: { quantitySold: 1 } });
    }
  }
  for (const zone of objects.filter((object) => object.type === "zone")) {
    const tariff = tariffs.find((item) => item.id === zone.tariffId)!;
    await prisma.ticketType.upsert({
      where: { venueObjectId: zone.id },
      create: { id: fixtureId(3, eventId, seatIndex++), eventId, venueObjectId: zone.id, name: `${zone.name} · ${zone.id}`, price: tariff.price, deposit: zone.deposit, currency, quantityTotal: zone.capacity, status: TicketTypeStatus.active },
      update: { eventId, name: `${zone.name} · ${zone.id}`, price: tariff.price, deposit: zone.deposit, currency, quantityTotal: zone.capacity, status: TicketTypeStatus.active },
    });
  }
}

async function seed(): Promise<void> {
  const organizer = await prisma.user.upsert({
    where: { telegramId: 1_000_000_001n },
    create: {
      id: seedIds.organizer,
      telegramId: 1_000_000_001n,
      role: UserRole.organizer,
      name: "Анна Организатор",
      photoUrl: "https://example.com/seed/organizer.jpg",
      phone: "+77010000001",
      email: "organizer@example.com",
    },
    update: {
      role: UserRole.organizer,
      name: "Анна Организатор",
      photoUrl: "https://example.com/seed/organizer.jpg",
      phone: "+77010000001",
      email: "organizer@example.com",
    },
  });

  const event = await prisma.event.upsert({
    where: { id: seedIds.event },
    create: {
      id: seedIds.event,
      organizerId: organizer.id,
      sourceLocale: "ru",
      title: "Ночной фестиваль Алматы",
      category: "festival",
      countryCode: "KZ",
      city: "Алматы",
      posterUrl: stockImage("photo-1501386761578-eac5c94b800a"),
      galleryUrls: galleryUrlsFor(seedIds.event, "festival", stockImage("photo-1501386761578-eac5c94b800a")),
      announcement: "Один вечер музыки, гастрономии и новых знакомств.",
      description: "Демонстрационное опубликованное мероприятие для локальной разработки.",
      program: "19:00 — открытие; 20:00 — концерт; 23:00 — завершение.",
      rules: "Вход по действующему QR-билету.",
      visitTerms: "Гостям необходимо иметь документ, удостоверяющий личность.",
      cancellationTerms: "Возврат возможен не позднее чем за 48 часов до начала.",
      paymentMode: "full_payment",
      showFullAmountForDeposit: false,
      depositTerms: null,
      extraConditions: "Мероприятие предназначено для гостей старше 18 лет.",
      date: eventDate,
      time: eventTime,
      timezone: "Asia/Almaty",
      ageRestriction: 18,
      venueName: "Event Hall Almaty",
      address: "проспект Абая, 1, Алматы",
      status: EventStatus.published,
    },
    update: {
      organizerId: organizer.id,
      sourceLocale: "ru",
      title: "Ночной фестиваль Алматы",
      category: "festival",
      countryCode: "KZ",
      city: "Алматы",
      posterUrl: stockImage("photo-1501386761578-eac5c94b800a"),
      galleryUrls: galleryUrlsFor(seedIds.event, "festival", stockImage("photo-1501386761578-eac5c94b800a")),
      announcement: "Один вечер музыки, гастрономии и новых знакомств.",
      description: "Демонстрационное опубликованное мероприятие для локальной разработки.",
      program: "19:00 — открытие; 20:00 — концерт; 23:00 — завершение.",
      rules: "Вход по действующему QR-билету.",
      visitTerms: "Гостям необходимо иметь документ, удостоверяющий личность.",
      cancellationTerms: "Возврат возможен не позднее чем за 48 часов до начала.",
      date: eventDate,
      time: eventTime,
      timezone: "Asia/Almaty",
      ageRestriction: 18,
      paymentMode: "full_payment",
      showFullAmountForDeposit: false,
      depositTerms: null,
      extraConditions: "Мероприятие предназначено для гостей старше 18 лет.",
      venueName: "Event Hall Almaty",
      address: "проспект Абая, 1, Алматы",
      status: EventStatus.published,
    },
  });

  for (const locale of ["kk", "en"] as const) {
    const translation = localizedDemoContent("seed", locale, {
      paymentMode: "full_payment",
      venueName: "Event Hall Almaty",
      address: "проспект Абая, 1, Алматы",
    });
    await prisma.eventTranslation.upsert({
      where: { eventId_locale: { eventId: event.id, locale } },
      create: { eventId: event.id, locale, ...translation, origin: "manual", translatedFrom: null, sourceHash: null },
      update: { ...translation, origin: "manual", translatedFrom: null, sourceHash: null },
    });
  }

  const ticketTypes = await Promise.all([
    prisma.ticketType.upsert({
      where: { id: seedIds.standardTicketType },
      create: {
        id: seedIds.standardTicketType,
        eventId: event.id,
        name: "Стандарт",
        price: 1_500_000,
        deposit: 0,
        currency: "KZT",
        quantityTotal: 200,
        description: "Общий вход на мероприятие.",
        restrictions: "18+",
        status: TicketTypeStatus.active,
      },
      update: {
        price: 1_500_000,
        deposit: 0,
        currency: "KZT",
        quantityTotal: 200,
        status: TicketTypeStatus.active,
      },
    }),
    prisma.ticketType.upsert({
      where: { id: seedIds.vipTicketType },
      create: {
        id: seedIds.vipTicketType,
        eventId: event.id,
        name: "VIP",
        price: 3_000_000,
        deposit: 0,
        currency: "KZT",
        quantityTotal: 50,
        description: "Приоритетный вход и доступ в VIP-зону.",
        restrictions: "18+",
        status: TicketTypeStatus.active,
      },
      update: {
        price: 3_000_000,
        deposit: 0,
        currency: "KZT",
        quantityTotal: 50,
        status: TicketTypeStatus.active,
      },
    }),
  ]);

  const venueLayout = await prisma.venueLayout.upsert({
    where: { eventId: event.id },
    create: {
      id: seedIds.venueLayout,
      eventId: event.id,
      templateName: "Основной зал — 5 столов",
      layoutJson: {
        version: 1,
        canvas: { width: 1000, height: 600 },
        tables: [],
      },
    },
    update: {
      templateName: "Основной зал — 5 столов",
      layoutJson: {
        version: 1,
        canvas: { width: 1000, height: 600 },
        tables: [],
      },
    },
  });

  const tables = await Promise.all(
    Array.from({ length: 5 }, (_, index) => {
      const number = index + 1;
      return prisma.table.upsert({
        where: {
          venueLayoutId_number: {
            venueLayoutId: venueLayout.id,
            number,
          },
        },
        create: {
          venueLayoutId: venueLayout.id,
          number,
          name: `Стол ${number}`,
          seats: number === 5 ? 8 : 6,
          price: number === 5 ? 60_000_000 : 50_000_000,
          deposit: 0,
          currency: "KZT",
          description: "Стол в основном зале.",
        },
        update: {
          name: `Стол ${number}`,
          seats: number === 5 ? 8 : 6,
          price: number === 5 ? 60_000_000 : 50_000_000,
          deposit: 0,
          currency: "KZT",
        },
      });
    }),
  );

  await prisma.venueLayout.update({
    where: { id: venueLayout.id },
    data: {
      layoutJson: {
        version: 1,
        canvas: { width: 1000, height: 600 },
        tables: tables.map((table, index) => ({
          tableId: table.id,
          x: 80 + index * 170,
          y: 180,
          width: 120,
          height: 90,
        })),
      },
    },
  });

  // Extra fixtures keep the local catalog and organizer workspace useful for
  // demos, covering search, locations, payment policies and event lifecycles.
  for (const profile of demoOrganizers) {
    await prisma.user.upsert({
      where: { telegramId: profile.telegramId },
      create: {
        id: profile.id,
        telegramId: profile.telegramId,
        role: UserRole.organizer,
        name: profile.name,
        photoUrl: profile.photoUrl,
      },
      update: {
        role: UserRole.organizer,
        name: profile.name,
        photoUrl: profile.photoUrl,
      },
    });
  }

  for (const demo of demoEvents) {
    const status = "status" in demo ? EventStatus[demo.status] : EventStatus.published;
    const eventFields = {
      organizerId: demo.organizerId,
      title: demo.title,
      category: demo.category,
      sourceLocale: "ru",
      countryCode: "countryCode" in demo ? demo.countryCode : "KZ",
      city: demo.city,
      posterUrl: demo.posterUrl,
      galleryUrls: galleryUrlsFor(demo.id, demo.category, demo.posterUrl),
      announcement: demo.announcement,
      description: demo.description,
      program: demo.program,
      rules: demo.rules,
      visitTerms: demo.visitTerms,
      cancellationTerms: demo.cancellationTerms,
      paymentMode: demo.paymentMode,
      showFullAmountForDeposit: demo.showFullAmountForDeposit,
      depositTerms: demo.depositTerms,
      extraConditions: demo.extraConditions,
      date: new Date(`${demo.date}T00:00:00.000Z`),
      time: new Date(`1970-01-01T${demo.time}:00.000Z`),
      timezone: demo.timezone,
      ageRestriction: demo.ageRestriction,
      venueName: demo.venueName,
      address: demo.address,
      status,
      publishedAt: status === EventStatus.draft ? null : new Date(demo.publishedAt),
    };
    const event = await prisma.event.upsert({
      where: { id: demo.id },
      create: { id: demo.id, ...eventFields },
      update: eventFields,
    });

    const currency = "currency" in demo ? demo.currency : "KZT";
    for (const ticket of demo.ticketTypes) {
      const ticketStatus = "status" in ticket ? TicketTypeStatus[ticket.status] : TicketTypeStatus.active;
      const isInternal = "isInternal" in ticket ? ticket.isInternal : false;
      await prisma.ticketType.upsert({
        where: { id: ticket.id },
        create: {
          id: ticket.id,
          eventId: event.id,
          name: ticket.name,
          price: ticket.price,
          deposit: ticket.deposit,
          currency,
          quantityTotal: ticket.quantityTotal,
          description: ticket.description,
          restrictions: ticket.restrictions,
          status: ticketStatus,
          isInternal,
        },
        update: {
          eventId: event.id,
          name: ticket.name,
          price: ticket.price,
          deposit: ticket.deposit,
          currency,
          quantityTotal: ticket.quantityTotal,
          description: ticket.description,
          restrictions: ticket.restrictions,
          status: ticketStatus,
          isInternal,
        },
      });
    }
    for (const locale of ["kk", "en"] as const) {
      const translation = localizedDemoContent(demo.id, locale, demo);
      await prisma.eventTranslation.upsert({
        where: { eventId_locale: { eventId: event.id, locale } },
        create: { eventId: event.id, locale, ...translation, origin: "manual", translatedFrom: null, sourceHash: null },
        update: { ...translation, origin: "manual", translatedFrom: null, sourceHash: null },
      });
    }
    if ("layout" in demo) await seedDemoLayout(event.id, demo.layout, currency);
  }

  console.log(
    JSON.stringify({
      organizer: organizer.name,
      event: event.title,
      totalSeedEvents: demoEvents.length + 1,
      ticketTypes: ticketTypes.length,
      venueLayout: venueLayout.templateName,
      tables: tables.length,
      demoEvents: demoEvents.length,
    }),
  );
}

try {
  await seed();
} finally {
  await prisma.$disconnect();
}
