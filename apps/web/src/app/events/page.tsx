import { ru } from "@event-platform/shared-types";

import { PublicEventsBrowser } from "../../components/public-events-browser";
import { PageShell, SectionHeading } from "../../components/ui";

export default function EventsPage() {
  return <PageShell>
    <SectionHeading title={ru.publicEvent.catalogTitle} description={ru.publicEvent.catalogDescription} />
    <PublicEventsBrowser />
  </PageShell>;
}
