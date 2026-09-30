import ServiceCallQueue from "./_components/service-call-queue";

export default function ServiceCallsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl p-5 font-sans sm:p-8">
      <h1 className="mb-3 font-heading text-3xl font-semibold">
        Palvelukutsut
      </h1>
      <ServiceCallQueue />
    </main>
  );
}
