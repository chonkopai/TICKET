import { MarketingCampaigns } from "../../_components/marketing-campaigns";

export default async function CampaignsPage({ params }: PageProps<"/organizer/events/[id]/campaigns">) {
  const { id } = await params;
  return <MarketingCampaigns eventId={id} />;
}
