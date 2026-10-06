import type { EventLocalizedContent, EventLocale } from "@event-platform/shared-types";

type DemoCopy = Pick<EventLocalizedContent, "title" | "description" | "program">;
type LocaleCopy = Record<"kk" | "en", DemoCopy>;

const demoCopy: Record<string, LocaleCopy> = {
  "00000000-0000-4000-8000-000000000201": {
    kk: { title: "Мәскеу джазы: қалалық түн", description: "Трио мен қонақ музыканттар классикалық джазды заманауи аранжировкамен орындайды. Көрермендер үстелдер мен би алаңы бар жайлы залға жиналады.", program: "18:30 — есіктер ашылады; 19:00 — джаз триосы; 20:30 — арнайы қонақ; 22:00 — финалдық джем." },
    en: { title: "Moscow Jazz: An Evening in the City", description: "A resident trio and guest musicians bring classic jazz together with fresh arrangements. Settle in at a table or join the dance floor in an intimate venue.", program: "18:30 — doors open; 19:00 — jazz trio; 20:30 — special guest; 22:00 — closing jam." },
  },
  "00000000-0000-4000-8000-000000000202": {
    kk: { title: "Tashkent Tech & Product Meetup", description: "Өнім менеджерлері, дизайнерлер, әзірлеушілер және негізін қалаушылар өнімді іске қосу, аналитика және жасанды интеллект құралдарын талқылайды. Бағдарламаға баяндамалар мен еркін нетворкинг кіреді.", program: "10:00 — тіркеу; 11:00 — негізгі баяндама; 12:00 — практикалық сессиялар; 15:00 — пікірталас; 17:30 — нетворкинг." },
    en: { title: "Tashkent Tech & Product Meetup", description: "Product managers, designers, developers and founders share practical lessons on launches, analytics and AI tools across Uzbekistan’s growing market. The day pairs talks with open networking.", program: "10:00 — registration; 11:00 — keynote; 12:00 — practical sessions; 15:00 — panel; 17:30 — networking." },
  },
  "00000000-0000-4000-8000-000000000203": {
    kk: { title: "Керамика шеберханасы: Күзгі шеңбер", description: "Үш сағат ішінде сазды қалыптауды, бұйымды әрлеуді және безендіруді үйренесіз. Дайын кесе күйдірілгеннен кейін шеберханадан алынады.", program: "11:00 — танысу; 11:30 — қыш шеңбері; 13:00 — безендіру; 14:00 — шай." },
    en: { title: "Ceramics Workshop: Autumn Wheel", description: "Shape, trim and decorate a clay cup during a relaxed three-hour workshop. The studio will fire the finished piece and let you know when it is ready to collect.", program: "11:00 — welcome; 11:30 — pottery wheel; 13:00 — decorating; 14:00 — tea." },
  },
  "00000000-0000-4000-8000-000000000204": {
    kk: { title: "Жергілікті брендтердің түнгі маркеты", description: "Қаладағы тәуелсіз брендтер киім, керамика және үйге арналған заттарын ұсынады. Қонақтарды шағын концерттер мен жергілікті ас мәзірі күтеді.", program: "16:00 — маркет ашылады; 17:00 — диджей-сет; 19:00 — ас шеберлерінің таныстырылымы; 21:00 — жанды музыка." },
    en: { title: "Local Makers Night Market", description: "Independent makers present clothing, ceramics and home goods alongside a curated food corner. Short live sets keep the market moving into the evening.", program: "16:00 — market opens; 17:00 — DJ set; 19:00 — food showcase; 21:00 — live music." },
  },
  "00000000-0000-4000-8000-000000000205": {
    kk: { title: "«Дала үні» спектаклінің премьерасы", description: "Үш ұрпақтың тарихы өзгермелі декорациялар мен сахнадағы жанды музыка арқылы баяндалады. Қойылымнан кейін көрермендер режиссермен және актерлермен кездеседі.", program: "18:00 — қонақтарды қарсы алу; 19:00 — спектакль; 21:00 — шығармашылық кездесу." },
    en: { title: "Premiere: Voice of the Steppe", description: "The story of three generations unfolds through live music and a set that changes in full view of the audience. Stay after the performance for a conversation with the cast and director.", program: "18:00 — doors; 19:00 — performance; 21:00 — cast and director conversation." },
  },
  "00000000-0000-4000-8000-000000000206": {
    kk: { title: "Қысқы шамдар отбасылық фестивалі", description: "Саябақ жарық инсталляцияларына, балалар шеберханаларына және шағын қойылымдарға толады. Кештің соңында ортақ жарық шоуы өтеді.", program: "14:00 — саябақ ашылады; 15:00 — балалар шеберханалары; 17:00 — қойылым; 19:00 — жарық шоуы." },
    en: { title: "Winter Lights Family Festival", description: "Explore illuminated installations, children’s workshops and short performances across the park. The evening ends with a shared light show.", program: "14:00 — park opens; 15:00 — children’s workshops; 17:00 — performance; 19:00 — light show." },
  },
  "00000000-0000-4000-8000-000000000212": {
    kk: { title: "Neon Nights: Алматыдағы түнгі сахна", description: "Қала диджейлері бірнеше музыкалық кеңістікте өнер көрсетеді. Негізгі сахнада жарық шоуы, ал демалыс аймағында бар мен гардероб болады.", program: "21:00 — есіктер ашылады; 22:00 — warm-up; 23:30 — live set; 01:00 — басты DJ-сет." },
    en: { title: "Neon Nights: Almaty After Dark", description: "Local DJs take over several dance spaces, led by a main stage with a custom light show. A lounge and coat check are available on site.", program: "21:00 — doors; 22:00 — warm-up; 23:30 — live set; 01:00 — headline DJ set." },
  },
  "00000000-0000-4000-8000-000000000213": {
    kk: { title: "«Күлкілі әрі шынайы» стендап кеші", description: "Шағын сахнада комиктер жаңа материалдарын және көрермен сүйіп қалған нөмірлерін ұсынады. Кеш соңында артисттермен қысқа кездесу өтеді.", program: "19:00 — есіктер ашылады; 20:00 — стендап бағдарламасы; 22:00 — финал және кездесу." },
    en: { title: "Stand-up Night: Funny and Honest", description: "A close-up comedy show with new material and audience favourites. Meet the performers in the foyer after the final set.", program: "19:00 — doors; 20:00 — comedy sets; 22:00 — finale and meet-and-greet." },
  },
  "00000000-0000-4000-8000-000000000214": {
    kk: { title: "Мәскеу көшелерінің фотокурсы", description: "Практикалық сабақ композицияны, жарықпен жұмысты және көшедегі портретті қамтиды. Камерамен де, смартфонмен де қатысуға болады.", program: "10:00 — қысқа сабақ; 12:00 — фотосеруен; 15:00 — кадрларды талдау; 17:00 — серияны жинақтау." },
    en: { title: "Moscow Street Photography Day", description: "A hands-on class in composition, natural light and candid portraits, followed by a guided photo walk. Bring a camera or a charged smartphone.", program: "10:00 — introduction; 12:00 — photo walk; 15:00 — image review; 17:00 — final edit." },
  },
  "00000000-0000-4000-8000-000000000215": {
    kk: { title: "Urban Run & Wellness Day", description: "Кез келген дайындық деңгейіне арналған спорт күні. Қатысушылар 5 км жүгіруді, жаттықтырушымен жаттығуды және қалалық денсаулық аймағын таңдай алады.", program: "08:00 — тіркеу; 09:00 — қыздыру; 09:30 — 5 км жүгіру; 11:00 — функционалдық жаттығу." },
    en: { title: "Urban Run & Wellness Day", description: "An open sports morning for every fitness level. Choose the 5K route, join a coach-led session and explore the wellness area.", program: "08:00 — check-in; 09:00 — warm-up; 09:30 — 5K run; 11:00 — functional training." },
  },
  "00000000-0000-4000-8000-000000000216": {
    kk: { title: "Ташкент қолөнері мен дәм фестивалі", description: "Керамика, тоқыма және зергерлік өнер шеберлері жұмыстарын көрсетіп, ашық сабақтар өткізеді. Қонақтар жергілікті тағамдардан дәм тата алады.", program: "11:00 — ашылу; 12:00 — шеберлік сабақтары; 15:00 — этно-концерт; 18:00 — кешкі маркет." },
    en: { title: "Tashkent Craft & Flavours Festival", description: "Ceramic, textile and jewellery makers share their work through demonstrations and hands-on sessions. Local food stalls serve regional favourites throughout the day.", program: "11:00 — opening; 12:00 — workshops; 15:00 — folk music; 18:00 — evening market." },
  },
  "00000000-0000-4000-8000-000000000217": {
    kk: { title: "«Жарқын кеш» қайырымдылық гала-кеші", description: "Кәсіпкерлер, өнерпаздар және қорлар қайырымдылық аукционы мен музыкалық бағдарламаға жиналады. Билет компанияларға арналған жеке банкет үстелін қамтиды.", program: "18:30 — қонақтарды қарсы алу; 19:30 — кешкі ас; 20:30 — аукцион; 22:00 — музыка." },
    en: { title: "Zharkyn Keş Charity Gala", description: "Business leaders, artists and community organisations meet for dinner, a charity auction and live music. Groups can reserve a private banquet table.", program: "18:30 — reception; 19:30 — dinner; 20:30 — charity auction; 22:00 — live music." },
  },
  "00000000-0000-4000-8000-000000000218": {
    kk: { title: "Астанадағы кинопремьера және режиссермен кездесу", description: "Қазақстандық жаңа фильмді көріп, көрсетілімнен кейін режиссер мен актерлерге сұрақ қойыңыз. Кинотеатрда орындар қатар мен нөмір бойынша белгіленген.", program: "18:00 — зал ашылады; 19:00 — фильм; 21:00 — талқылау; 21:40 — автограф-сессия." },
    en: { title: "Astana Film Premiere & Director Q&A", description: "See a new Kazakh film and stay for questions with the director and cast. Every seat in the auditorium is numbered.", program: "18:00 — doors; 19:00 — screening; 21:00 — Q&A; 21:40 — signing." },
  },
  "00000000-0000-4000-8000-000000000219": {
    kk: { title: "Cyber Arena Finals: командалық орындар", description: "Финалдық матчтарды үлкен экраннан көріп, сүйікті командаңыздың үстеліндегі орынды таңдаңыз. Сахнада комментаторлар мен арнайы шоу-матч болады.", program: "12:00 — ашылу; 13:00 — жартылай финал; 17:00 — шоу-матч; 19:00 — финал." },
    en: { title: "Cyber Arena Finals: Team Seats", description: "Watch the final matches on the main screen and choose a seat at your favourite team table. The programme includes live commentary and a show match.", program: "12:00 — doors; 13:00 — semi-finals; 17:00 — show match; 19:00 — final." },
  },
  "00000000-0000-4000-8000-000000000220": {
    kk: { title: "Qazaq Indie Fest: екі фан-аймақ", description: "Жергілікті инди-топтар мен арнайы қонақтар жабық сахнада өнер көрсетеді. Билет таңдалған фан-аймаққа кіруге мүмкіндік береді.", program: "16:00 — кіру; 17:00 — жаңа топтар; 20:00 — басты орындаушылар; 23:00 — аяқталуы." },
    en: { title: "Qazaq Indie Fest: Two Fan Zones", description: "A line-up of local indie acts and special guests takes over the indoor venue. Your ticket includes access to the fan zone selected at checkout.", program: "16:00 — doors; 17:00 — emerging bands; 20:00 — headliners; 23:00 — close." },
  },
  "00000000-0000-4000-8000-000000000221": {
    kk: { title: "Food Lab: кешкі ас, бар және жанды сахна", description: "Бұл демонстрациялық жобада қонақ үстелдері, жеке орындар және бар аймағы бар аралас жоспар көрсетіледі. Жарияланатын нұсқада мәзір мен сахна бағдарламасы толықтырылады.", program: "18:00 — welcome; 19:00 — chef table; 21:00 — жанды музыка." },
    en: { title: "Food Lab: Dinner, Bar & Live Stage", description: "This demo plan combines group tables, individual seats and a standing bar area. Menu details and the stage programme will be confirmed before sales open.", program: "18:00 — welcome; 19:00 — chef’s table; 21:00 — live set." },
  },
  "00000000-0000-4000-8000-000000000222": {
    kk: { title: "Ашық зертханалар күні", description: "Университет зертханаларына экскурсия жасап, химия тәжірибелерін және робототехниканы көріңіз. Қонақтар алдын ала таңдалған уақыт ағынына тіркеледі.", program: "10:00 — бірінші топ; 12:00 — химия шоуы; 14:00 — робототехника; 16:00 — соңғы топ." },
    en: { title: "Open Labs Day", description: "Visit university labs, see chemistry demonstrations and try a robotics session. Registration is available in timed entry slots.", program: "10:00 — first session; 12:00 — chemistry show; 14:00 — robotics; 16:00 — final session." },
  },
  "00000000-0000-4000-8000-000000000223": {
    kk: { title: "Басшыларға арналған келіссөз практикумы", description: "Бір күндік практикумда кейстерді талдап, қиын әңгімелерді жаттықтырасыз. Қатысу билетіне жұмыс дәптері мен кофе-үзіліс кіреді.", program: "09:30 — тіркеу; 10:00 — стратегия; 12:00 — кейстер; 14:00 — рөлдік жаттығу; 17:00 — қорытынды." },
    en: { title: "Negotiation Workshop for Leaders", description: "Work through practical cases and rehearse high-stakes conversations with an experienced facilitator. The ticket includes a workbook and refreshments.", program: "09:30 — check-in; 10:00 — strategy; 12:00 — cases; 14:00 — role-play; 17:00 — wrap-up." },
  },
  "00000000-0000-4000-8000-000000000224": {
    kk: { title: "Музейдегі отбасылық түн", description: "Музей кешкі уақытта отбасыларға арналған театрландырылған тур мен балалар тапсырмаларын ұсынады. Сенсорлық сезімталдығы бар қонақтар үшін дыбысы төмен тыныш маршрут бар.", program: "18:00 — отбасылық маршрут; 20:00 — спектакль; 21:30 — тыныш сеанс; 23:00 — жабылу." },
    en: { title: "Family Night at the Museum", description: "Explore the galleries through a family route with small activities for children. A quieter visit with softened lighting and reduced sound is also available.", program: "18:00 — family trail; 20:00 — performance; 21:30 — quiet session; 23:00 — close." },
  },
  "00000000-0000-4000-8000-000000000225": {
    kk: { title: "Үлкен Алматы көліне пленэр (ауа райына байланысты тоқтатылды)", description: "Суретшімен бірге тауда өтетін пленэр мен трансфер жоспарланған еді. Іс-шара тоқтатылды, ал төленген тапсырыстар қайтаруға жіберіледі.", program: "07:00 — жиналу; 09:00 — пленэр; 13:00 — түскі ас; 16:00 — оралу." },
    en: { title: "Big Almaty Lake Plein Air (Cancelled)", description: "The planned day included a guided painting session in the mountains and return transport. The event has been cancelled and paid orders are eligible for a refund.", program: "07:00 — meet-up; 09:00 — painting session; 13:00 — lunch; 16:00 — return." },
  },
  "00000000-0000-4000-8000-000000000226": {
    kk: { title: "Central Asia Product Conference 2026", description: "Өнім мамандары баяндамаларға, практикалық шеберханаларға және кәсіби байланыс сессияларына жиналды. Іс-шара аяқталды; бұл жазба ұйымдастырушы мұрағатында сақталған.", program: "09:00 — тіркеу; 10:00 — негізгі баяндама; 14:00 — шеберханалар; 18:00 — жабылу." },
    en: { title: "Central Asia Product Conference 2026", description: "Product professionals came together for talks, practical workshops and networking. The event has ended and remains in the organiser’s archive.", program: "09:00 — registration; 10:00 — keynote; 14:00 — workshops; 18:00 — close." },
  },
  "00000000-0000-4000-8000-000000000227": {
    kk: { title: "Nomad Live — стадиондағы концерт", description: "Nomad Live сахнада жарық шоуы мен қонақ орындаушыларды ұсынады. Бұл ойдан шығарылған демонстрациялық афиша стадион сызбасын, трибуналарды және орын таңдауын көрсетуге арналған.", program: "17:30 — кіру қақпалары ашылады; 19:30 — арнайы қонақ; 21:00 — басты шоу; 23:00 — аяқталуы." },
    en: { title: "Nomad Live: Stadium Night", description: "Nomad Live brings a full light show and guest performers to the arena. This fictional demo listing showcases a stadium plan with stands, VIP blocks and seat selection.", program: "17:30 — gates open; 19:30 — special guest; 21:00 — headline show; 23:00 — close." },
  },
  "00000000-0000-4000-8000-000000000228": {
    kk: { title: "Shymkent Saz & Street Food кеші", description: "Шымкенттік музыканттар заманауи өңдеудегі дәстүрлі әуендерді орындайды. Қонақтар ортақ үстелдерде тағамнан дәм татып, шағын ашық сахнаны тамашалайды.", program: "17:00 — аула ашылады; 18:00 — тағам жәрмеңкесі; 19:00 — тірі музыка; 21:30 — финалдық сет." },
    en: { title: "Shymkent Saz & Street Food Night", description: "Shymkent musicians reinterpret regional sounds on an intimate outdoor stage. Share a table, explore the food stalls and stay for the evening set.", program: "17:00 — courtyard opens; 18:00 — food market; 19:00 — live music; 21:30 — closing set." },
  },
  "00000000-0000-4000-8000-000000000229": {
    kk: { title: "Түркістанның қолөнер және ас фестивалі", description: "Керамика, кесте және ағаш ою шеберлері жұмыстарын таныстырады. Күндізгі бағдарламаға балаларға арналған шеберханалар, аспаздық таныстырылым және жанды этно-сахна кіреді.", program: "10:00 — ашылу; 11:00 — қолөнер сабақтары; 14:00 — аспаздық таныстырылым; 17:00 — этно-концерт." },
    en: { title: "Turkestan Crafts & Cuisine Festival", description: "Ceramic, embroidery and woodwork makers demonstrate their craft throughout the day. Families can join workshops, sample local food and enjoy a live folk stage.", program: "10:00 — opening; 11:00 — craft workshops; 14:00 — food showcase; 17:00 — folk concert." },
  },
  seed: {
    kk: { title: "Алматыдағы түнгі фестиваль", description: "Жергілікті орындаушылар мен аспаздар қаладағы кешкі фестивальге жиналады. Қонақтар жанды музыка, шағын тағам аймағы және демалыс кеңістігін тамашалайды.", program: "19:00 — есіктер ашылады; 20:00 — концерт; 23:00 — аяқталуы." },
    en: { title: "Almaty Night Festival", description: "Local performers and chefs come together for an evening festival in the city. Explore the live stage, food corner and relaxed lounge areas.", program: "19:00 — doors open; 20:00 — concert; 23:00 — close." },
  },
};

const sharedTerms: Record<"kk" | "en", Pick<EventLocalizedContent, "rules" | "visitTerms" | "cancellationTerms" | "depositTerms" | "extraConditions">> = {
  kk: {
    rules: "Кіру кезінде әр қонақ жарамды QR-билетін көрсетуі керек. Өтетін орын қызметкерлерінің нұсқауларын орындаңыз.",
    visitTerms: "Есіктер басталу уақытынан шамамен 30 минут бұрын ашылады. Кіру кезінде QR-билетті дайындап қойыңыз.",
    cancellationTerms: "Қайтарым ұйымдастырушының төлем кезінде көрсетілген шарттарына сәйкес рәсімделеді.",
    depositTerms: "Онлайн депозит орынды растайды және іс-шараның толық құнына есептеледі. Қалған сома болса, ол өткізу орнында төленеді.",
    extraConditions: "Қолжетімділік пен өткізу орнына қатысты қосымша мәліметтер іс-шара парақшасында көрсетілген.",
  },
  en: {
    rules: "Each guest must present a valid QR ticket at the entrance. Please follow the venue team’s instructions.",
    visitTerms: "Doors usually open around 30 minutes before the start. Have your QR ticket ready when you arrive.",
    cancellationTerms: "Refunds follow the organiser’s terms shown during checkout.",
    depositTerms: "The online deposit confirms your place and is credited toward the full event price. Any remaining balance is paid at the venue.",
    extraConditions: "Accessibility and venue details are listed on the event page.",
  },
};

export function localizedDemoContent(
  eventId: string,
  locale: EventLocale,
  source: Pick<EventLocalizedContent, "address"> & { paymentMode: "deposit" | "full_payment" },
): EventLocalizedContent {
  if (locale !== "kk" && locale !== "en") throw new Error(`Missing ${locale} demo translation for ${eventId}`);
  const copy = demoCopy[eventId]?.[locale];
  if (!copy) throw new Error(`Missing ${locale} demo translation for ${eventId}`);
  const terms = sharedTerms[locale];
  return {
    ...terms,
    ...copy,
    address: source.address,
    rules: terms.rules,
    visitTerms: terms.visitTerms,
    cancellationTerms: terms.cancellationTerms,
    depositTerms: source.paymentMode === "deposit" ? terms.depositTerms : null,
    extraConditions: terms.extraConditions,
  };
}
