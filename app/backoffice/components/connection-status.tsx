export type ConnectionCheck = {
  state: "checking" | "verified" | "unavailable" | "offline";
  checkedAt: number | null;
};

const checkedTime = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function ConnectionStatus({ check }: { check: ConnectionCheck }) {
  const label = {
    checking: "Yhteyttä tarkistetaan…",
    verified: "Palvelin vastasi",
    unavailable: "Yhteyttä ei voitu varmistaa",
    offline: "Laite offline",
  }[check.state];
  return (
    <div
      role="status"
      className="space-y-1 text-xs"
      aria-label="Yhteystarkistus"
    >
      <p
        className={
          check.state === "verified"
            ? "m-0 text-[#94d1ad]"
            : "m-0 text-[#e7e5de]"
        }
      >
        {label}
      </p>
      {check.state === "verified" && check.checkedAt !== null && (
        <p className="m-0 text-[10px] text-[#c6c3b5]">
          Tarkistettu {checkedTime.format(check.checkedAt)}
        </p>
      )}
      {check.state === "unavailable" && (
        <p className="m-0 text-[10px] text-[#c6c3b5]">
          Tarkista yhteys. Päivitä sivu tarvittaessa.
        </p>
      )}
      {check.state === "offline" && (
        <p className="m-0 text-[10px] text-[#c6c3b5]">
          Tarkista laitteen verkkoyhteys.
        </p>
      )}
    </div>
  );
}
