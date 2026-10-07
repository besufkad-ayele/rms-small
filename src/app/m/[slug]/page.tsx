import { loadPublicVenueAction } from "@/app/m/actions";
import { PublicMenuOrder } from "@/components/public/PublicMenuOrder";

export default async function PublicMenuPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const res = await loadPublicVenueAction(slug);
  if ("error" in res) {
    return (
      <main className="min-h-dvh bg-stone px-4 py-16 text-center">
        <p className="font-display text-2xl">This menu is not available</p>
        <p className="mt-2 text-sm text-ink/55">{res.error}</p>
      </main>
    );
  }
  return (
    <main className="min-h-dvh bg-stone px-4 py-6">
      <header className="mx-auto mb-5 max-w-5xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal">
          Order online
        </p>
        <h1 className="font-display text-3xl">{res.venue.name}</h1>
        <p className="text-sm text-ink/55">
          {[res.venue.address, res.venue.city, res.venue.phone]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>
      <PublicMenuOrder venue={res.venue} items={res.items} />
    </main>
  );
}
