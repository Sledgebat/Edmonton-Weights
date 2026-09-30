/** Five small dots: a nod to the five Cups. Decorative only. */
export function Rivets({ className = "", size = 6 }: { className?: string; size?: number }) {
  return (
    <span aria-hidden="true" className={`inline-flex items-center gap-[0.35em] ${className}`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className="inline-block rounded-full bg-current"
          style={{ width: size, height: size }}
        />
      ))}
    </span>
  );
}
