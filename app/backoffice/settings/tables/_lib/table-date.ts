export function formatTableDate(value: string) {
  return new Intl.DateTimeFormat("fi-FI", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
