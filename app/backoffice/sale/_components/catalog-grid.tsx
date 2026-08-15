import config from "@/app/config";
import type { Food } from "@/lib/sale-contracts";

export type CatalogStatus = "loading" | "ready" | "error";

type CatalogGridProps = {
  foods: Food[];
  disabled: boolean;
  status: CatalogStatus;
  emptyDescription: string;
  onRetry: () => void;
  onSelect: (foodId: number) => void;
};

const productGridClassName =
  "grid grid-cols-[repeat(2,158px)] gap-[12px] md:grid-cols-[repeat(3,158px)] xl:grid-cols-[repeat(4,181px)]";

function ProductCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="h-[202px] w-[158px] overflow-hidden rounded-[10px] border border-border bg-surface xl:h-[220px] xl:w-[181px]"
    >
      <div className="h-[118px] bg-[#efece6] xl:h-[136px]" />
      <div className="flex h-[84px] flex-col gap-2 p-[12px]">
        <div className="h-3.5 w-[min(128px,100%)] rounded bg-[#efece6]" />
        <div className="h-4 w-[72px] rounded bg-[#efece6]" />
      </div>
    </div>
  );
}

function CatalogMessage({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-60 w-full flex-col items-center justify-center gap-2.5 overflow-hidden rounded-[10px] border border-border bg-surface px-10 py-12 text-center">
      <p className="text-[18px] leading-[22px] font-semibold text-foreground">
        {title}
      </p>
      <p className="text-sm leading-[18px] text-muted-foreground">
        {description}
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-0.5 flex h-10 w-[140px] items-center justify-center rounded-lg bg-olive text-sm font-semibold text-primary-foreground hover:bg-[#656455] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none active:bg-[#5d5c4f]"
        >
          Yritä uudelleen
        </button>
      ) : null}
    </div>
  );
}

export default function CatalogGrid({
  foods,
  disabled,
  status,
  emptyDescription,
  onRetry,
  onSelect,
}: CatalogGridProps) {
  if (status === "loading") {
    return (
      <div className={productGridClassName} aria-label="Ruokalistaa ladataan">
        {Array.from({ length: 6 }, (_, index) => (
          <ProductCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (status === "error") {
    return (
      <CatalogMessage
        title="Ruokalistaa ei voitu ladata"
        description="Tarkista yhteys ja yritä uudelleen."
        onRetry={onRetry}
      />
    );
  }

  if (foods.length === 0) {
    return (
      <CatalogMessage title="Ei tuotteita" description={emptyDescription} />
    );
  }

  return (
    <div className={productGridClassName}>
      {foods.map((food) => (
        <button
          type="button"
          key={food.id}
          disabled={disabled}
          onClick={() => onSelect(food.id)}
          className="group h-[202px] w-[158px] overflow-hidden rounded-[10px] border border-border bg-surface p-0 text-left transition-[border-color,background-color] hover:border-action focus-visible:border-2 focus-visible:border-action focus-visible:ring-0 focus-visible:outline-none active:bg-[#efece6] disabled:cursor-wait xl:h-[220px] xl:w-[181px]"
        >
          <div className="-mx-px h-[118px] w-[calc(100%+2px)] shrink-0 overflow-hidden bg-[#efece6] xl:h-[136px]">
            <img
              src={config.apiServer + "/uploads/" + food.img}
              alt={food.name}
              className="h-full w-full object-cover group-active:opacity-[0.86]"
            />
          </div>
          <div className="-mx-px flex h-[84px] w-[calc(100%+2px)] shrink-0 flex-col gap-1 overflow-hidden p-[12px]">
            <span className="line-clamp-2 h-9 text-sm leading-[18px] font-semibold tracking-[0.1px] text-foreground">
              {food.name}
            </span>
            <span className="h-5 text-base leading-5 font-semibold tracking-[0.1px] text-action">
              {food.price.toLocaleString("fi-FI", {
                minimumFractionDigits: 2,
              })}{" "}
              €
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
