/**
 * Simple loading spinner component.
 */

export function Loader() {
  return (
    <div className="flex items-center justify-center py-2">
      <div className="w-5 h-5 border-2 border-tg-button border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
