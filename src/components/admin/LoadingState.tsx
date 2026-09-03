export function LoadingState({ message = 'Cargando...' }: { message?: string }) {
  return (
    <div className="py-12 text-center text-gray-600">
      <p>{message}</p>
    </div>
  );
}
