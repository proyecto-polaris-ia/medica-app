export function EmptyState({ message = 'No hay registros.' }: { message?: string }) {
  return (
    <div className="rounded-lg border bg-white py-12 text-center text-gray-600">
      <p>{message}</p>
    </div>
  );
}
