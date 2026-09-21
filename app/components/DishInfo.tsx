import type { Dish } from "@/lib/dishes";

export default function DishInfo({ dish }: { dish: Dish }) {
  return (
    <article className="rounded-2xl border border-line bg-card p-5 shadow-sm" aria-label={dish.name}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-display text-3xl font-extrabold leading-none">{dish.name}</h3>
        <span className="rounded-full bg-sun/30 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide">{dish.kind}</span>
      </div>
      {dish.alsoCalled.length > 0 && <p className="mt-1 text-sm text-muted">Also called {dish.alsoCalled.join(", ")}</p>}
      <p className="mt-3 leading-relaxed">{dish.blurb}</p>
      <dl className="mt-4 grid gap-2 text-sm">
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 font-semibold text-muted">Made with</dt>
          <dd>
            <ul className="flex flex-wrap gap-1.5">
              {dish.ingredients.map((i) => (
                <li key={i} className="rounded-full border border-line bg-paper px-2 py-0.5">
                  {i}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 font-semibold text-muted">Found in</dt>
          <dd>{dish.where}</dd>
        </div>
      </dl>
    </article>
  );
}
