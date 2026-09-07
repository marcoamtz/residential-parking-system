import { useQuery } from "@tanstack/react-query";
import { api } from "./lib/api";

export function App() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await api.api.health.$get();
      return res.json();
    },
  });

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Residential Parking</h1>
      <p className="mt-2 text-sm text-gray-600">
        API status: {health.isPending ? "checking…" : (health.data?.status ?? "unreachable")}
      </p>
    </main>
  );
}
