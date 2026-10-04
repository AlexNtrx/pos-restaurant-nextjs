import "client-only";

type Reply = { status?: number; data: unknown; etag?: string };
type Loader = (etag: string | undefined, signal: AbortSignal) => Promise<Reply>;
type Job = {
  controller: AbortController;
  promise: Promise<unknown>;
  users: number;
};
type Entry = { data?: unknown; etag?: string; job?: Job };

const aborted = () => new DOMException("Catalog read cancelled", "AbortError");

// EN: Stored bodies are reusable only after a new authorized 304; failures never serve stale catalog data.
// FI: Tallennettua sisältöä käytetään vain uuden hyväksytyn 304-vastauksen jälkeen; virhetilanteissa ei palauteta vanhaa luetteloa.
export class RevalidatedCache {
  private entries = new Map<string, Entry>();

  clear() {
    for (const entry of this.entries.values()) entry.job?.controller.abort();
    this.entries.clear();
  }

  async read(
    key: string,
    load: Loader,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (signal?.aborted) throw aborted();
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {};
      this.entries.set(key, entry);
    }
    const current = entry;
    if (!current.job) {
      const controller = new AbortController();
      const job: Job = { controller, users: 0, promise: Promise.resolve() };
      current.job = job;
      job.promise = Promise.resolve().then(async () => {
        try {
          const reply = await load(current.etag, controller.signal);
          if (controller.signal.aborted || this.entries.get(key) !== current)
            throw aborted();
          if (reply.status === 304) {
            if (current.data === undefined || !current.etag)
              throw new Error("Catalog cache body missing");
            return current.data;
          }
          // EN: Bound retained bodies to eight entries of at most 2 MiB each; pending requests are not evicted.
          // FI: Säilytä enintään kahdeksan korkeintaan 2 MiB:n sisältöä; käynnissä olevia pyyntöjä ei poisteta.
          if (
            reply.etag &&
            JSON.stringify(reply.data).length * 2 <= 2 * 1024 * 1024
          ) {
            current.data = reply.data;
            current.etag = reply.etag;
          } else {
            delete current.data;
            delete current.etag;
          }
          return reply.data;
        } catch (error) {
          if (this.entries.get(key) === current) this.entries.delete(key);
          throw error;
        } finally {
          delete current.job;
          if (this.entries.get(key) === current) {
            this.entries.delete(key);
            if (current.etag) this.entries.set(key, current);
          }
          while (this.entries.size > 8) {
            const candidate = [...this.entries].find(([, value]) => !value.job);
            if (!candidate) break;
            this.entries.delete(candidate[0]);
          }
        }
      });
    }
    const job = current.job;
    // EN: Cancel only this subscriber; abort the shared request once no consumers remain.
    // FI: Peruuta vain tämä tilaaja; keskeytä yhteinen pyyntö, kun käyttäjiä ei enää ole.
    job.users++;
    let rejectAbort: (reason: unknown) => void = () => {};
    const cancellation = new Promise<never>((_, reject) => {
      rejectAbort = reject;
    });
    const cancel = () => rejectAbort(aborted());
    signal?.addEventListener("abort", cancel, { once: true });
    job.controller.signal.addEventListener("abort", cancel, { once: true });
    try {
      // EN: Each caller receives its own body so local edits cannot contaminate other consumers or the retained snapshot.
      // FI: Jokainen kutsuja saa oman sisältönsä, jotta paikalliset muutokset eivät muuta muiden sisältöä tai tallennettua tilannekuvaa.
      return structuredClone(await Promise.race([job.promise, cancellation]));
    } finally {
      signal?.removeEventListener("abort", cancel);
      job.controller.signal.removeEventListener("abort", cancel);
      if (--job.users === 0 && current.job === job) {
        if (this.entries.get(key) === current) this.entries.delete(key);
        job.controller.abort();
      }
    }
  }
}

export const catalogReads = new RevalidatedCache();
export const invalidateCatalogCache = () => catalogReads.clear();
