export default function Loading() {
  return (
    <div className="page-shell space-y-4 px-0">
      <div className="skeleton h-9 w-40 rounded-lg" />
      <div className="skeleton mt-2 h-4 w-56 max-w-full rounded-md" />
      <div className="skeleton h-28 w-full rounded-[14px]" />
      <div className="skeleton h-16 w-full rounded-[14px]" />
      <div className="skeleton h-16 w-full rounded-[14px]" />
    </div>
  );
}
