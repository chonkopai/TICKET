import { EventStatus, TicketTypeStatus, UserRole, prisma } from "./src/index.js";
import { demoEvents, demoOrganizers, seedIds } from "./src/seed-data.js";

const eventDate = new Date("2026-12-20T00:00:00.000Z");
const eventTime = new Date("1970-01-01T19:00:00.000Z");

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
      title: "Ночной фестиваль Алматы",
      category: "festival",
      city: "Алматы",
      posterUrl: "https://example.com/seed/event-poster.jpg",
      announcement: "Один вечер музыки, гастрономии и новых знакомств.",
      description: "Демонстрационное опубликованное мероприятие для локальной разработки.",
      program: "19:00 — открытие; 20:00 — концерт; 23:00 — завершение.",
      rules: "Вход по действующему QR-билету.",
      visitTerms: "Гостям необходимо иметь документ, удостоверяющий личность.",
      cancellationTerms: "Возврат возможен не позднее чем за 48 часов до начала.",
      paymentMode: "deposit",
      showFullAmountForDeposit: true,
      depositTerms: "Депозит полностью засчитывается в счёт заказа на площадке.",
      extraConditions: "Мероприятие предназначено для гостей старше 18 лет.",
      date: eventDate,
      time: eventTime,
      timezone: "Asia/Almaty",
      venueName: "Event Hall Almaty",
      address: "проспект Абая, 1, Алматы",
      status: EventStatus.published,
    },
    update: {
      organizerId: organizer.id,
      title: "Ночной фестиваль Алматы",
      category: "festival",
      city: "Алматы",
      date: eventDate,
      time: eventTime,
      timezone: "Asia/Almaty",
      paymentMode: "deposit",
      showFullAmountForDeposit: true,
      depositTerms: "Депозит полностью засчитывается в счёт заказа на площадке.",
      status: EventStatus.published,
    },
  });

  const ticketTypes = await Promise.all([
    prisma.ticketType.upsert({
      where: { id: seedIds.standardTicketType },
      create: {
        id: seedIds.standardTicketType,
        eventId: event.id,
        name: "Стандарт",
        price: 1_500_000,
        deposit: 300_000,
        currency: "KZT",
        quantityTotal: 200,
        description: "Общий вход на мероприятие.",
        restrictions: "18+",
        status: TicketTypeStatus.active,
      },
      update: {
        price: 1_500_000,
        deposit: 300_000,
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
        deposit: 500_000,
        currency: "KZT",
        quantityTotal: 50,
        description: "Приоритетный вход и доступ в VIP-зону.",
        restrictions: "18+",
        status: TicketTypeStatus.active,
      },
      update: {
        price: 3_000_000,
        deposit: 500_000,
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
          deposit: number === 5 ? 20_000_000 : 15_000_000,
          currency: "KZT",
          description: "Стол в основном зале.",
        },
        update: {
          name: `Стол ${number}`,
          seats: number === 5 ? 8 : 6,
          price: number === 5 ? 60_000_000 : 50_000_000,
          deposit: number === 5 ? 20_000_000 : 15_000_000,
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

  // Extra published fixtures keep the local catalog useful for demos and
  // exercise search, date, recent/popular and payment-policy states.
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
    const eventFields = {
      organizerId: demo.organizerId,
      title: demo.title,
      category: demo.category,
      city: demo.city,
      posterUrl: demo.posterUrl,
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
      venueName: demo.venueName,
      address: demo.address,
      status: EventStatus.published,
      publishedAt: new Date(demo.publishedAt),
    };
    const event = await prisma.event.upsert({
      where: { id: demo.id },
      create: { id: demo.id, ...eventFields },
      update: eventFields,
    });

    for (const ticket of demo.ticketTypes) {
      await prisma.ticketType.upsert({
        where: { id: ticket.id },
        create: {
          id: ticket.id,
          eventId: event.id,
          name: ticket.name,
          price: ticket.price,
          deposit: ticket.deposit,
          currency: "KZT",
          quantityTotal: ticket.quantityTotal,
          description: ticket.description,
          restrictions: ticket.restrictions,
          status: TicketTypeStatus.active,
        },
        update: {
          eventId: event.id,
          name: ticket.name,
          price: ticket.price,
          deposit: ticket.deposit,
          currency: "KZT",
          quantityTotal: ticket.quantityTotal,
          description: ticket.description,
          restrictions: ticket.restrictions,
          status: TicketTypeStatus.active,
        },
      });
    }
  }

  console.log(
    JSON.stringify({
      organizer: organizer.name,
      event: event.title,
      ticketTypes: ticketTypes.length,
      venueLayout: venueLayout.templateName,
      tables: tables.length,
    }),
  );
}

try {
  await seed();
} finally {
  await prisma.$disconnect();
}
