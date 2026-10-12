import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export const RESTAURANT_TIME_ZONE = "Europe/Helsinki";

export const restaurantToday = (now: Date = new Date()) =>
  dayjs(now).tz(RESTAURANT_TIME_ZONE).format("YYYY-MM-DD");

const calendarDate = (date: string) => {
  const parsed = dayjs.utc(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || parsed.format("YYYY-MM-DD") !== date)
    throw new Error("Invalid restaurant calendar date");
  return parsed;
};

// EN: Advance the date label first, then resolve both midnights in Helsinki to include the whole 23/25-hour DST day.
// FI: Siirrä ensin päivämäärää ja muunna molemmat keskiyöt Helsingin aikaan, jotta koko 23/25 tunnin kesäaikapäivä sisältyy väliin.
export const restaurantDateRange = (from: string, to: string) => {
  calendarDate(from);
  const nextDate = calendarDate(to).add(1, "day").format("YYYY-MM-DD");
  if (from > to) throw new Error("Invalid restaurant calendar range");
  return {
    submittedFrom: dayjs.tz(from, RESTAURANT_TIME_ZONE).toISOString(),
    submittedBefore: dayjs.tz(nextDate, RESTAURANT_TIME_ZONE).toISOString(),
  };
};
