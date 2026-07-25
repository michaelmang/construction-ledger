import { ChangeOrderForm } from "./ChangeOrderForm";

export default async function NewChangeOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">New Change Order</h2>
      <ChangeOrderForm jobId={Number(id)} />
    </div>
  );
}
