import GuestFlow from "./GuestFlow";

export default async function GuestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <GuestFlow slug={slug} />;
}
