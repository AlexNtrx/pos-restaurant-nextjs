const codeMessages = new Map(
  Object.entries({
    INVALID_TAX_APPROVAL_QUERY:
      "Tarkista hyväksyntähistorian sivunumero ja yritä uudelleen.",
    INVALID_TAX_APPROVAL_REQUEST:
      "Tarkista hyväksynnän tositekentät ja vahvistukset. Syötteet säilyvät.",
    TAX_APPROVAL_SOURCE_CHANGED:
      "Valittu versio tai myyjätiedot ovat muuttuneet. Tarkista uusin luonnos ja tallenna tarvittaessa uusi versio.",
    TAX_APPROVAL_INCOMPLETE:
      "Täydennä todelliset tarkistustiedot. Tarkistuspäivä ei saa olla tulevaisuudessa.",
    TAX_APPROVAL_IDEMPOTENCY_CONFLICT:
      "Pyyntöavain kuuluu eri hyväksyntäpyyntöön. Tarkista aiempi tulos ja hyväksyntähistoria.",
    TAX_POLICY_APPROVAL_ALREADY_EXISTS:
      "Tästä versiosta on jo hyväksyntä. Lue alkuperäinen kirjaus hyväksyntähistoriasta.",
    TAX_APPROVAL_CONFLICT:
      "Samanaikainen muutos esti kirjauksen. Tarkista aiempi yritys samalla pyyntöavaimella.",
    TAX_POLICY_APPROVAL_INVALID:
      "Tallennettua hyväksyntää ei voida lukea. Pyydä ylläpitäjää selvittämään tiedot ennen uutta yritystä.",
    INVALID_TAX_PUBLICATION_QUERY:
      "Valitse tallennettu verokäytännön versio ja yritä uudelleen.",
    TAX_POLICY_REVISION_NOT_FOUND:
      "Valittua versiota ei löytynyt. Päivitä versiohistoria ja valitse versio uudelleen.",
    TAX_POLICY_REVISION_INVALID:
      "Tallennetun version tiedot ovat virheelliset. Tarkista luonnos ja luo tarvittaessa uusi versio. Vanhaa versiota ei muuteta.",
    INVALID_TAX_POLICY_REQUEST:
      "Tarkista version pyyntö tai sivunumero. Tietoja ei muutettu.",
    TAX_POLICY_REVIEW_INCOMPLETE:
      "Tallennettu luonnos on puutteellinen. Tarkista luonnos ja korjaa mainitut kohdat ennen version tallentamista.",
    TAX_POLICY_DRAFT_INVALID:
      "Tallennettua luonnosta ei voida tarkistaa. Lataa uusin luonnos ja tallenna kelvolliset tiedot ennen jatkamista.",
    INVALID_TAX_DRAFT:
      "Tarkista ALV-luonnoksen kentät. Prosentin on oltava yli 0 ja enintään 100, päivämäärän kelvollinen. Kentät säilyvät.",
    TAX_DRAFT_CONFLICT:
      "Toinen välilehti muutti luonnosta. Tarkista uusin luonnos ennen tallentamista. Omat kentät säilyvät.",
    RESTAURANT_SETUP_REQUIRED:
      "Tallenna ensin ravintolan perustiedot ja tarkista uusin luonnos.",
    RECEIPT_SETUP_REQUIRED:
      "Kuitin tiedot ovat puutteelliset. Pyydä ylläpitäjää tarkistamaan ravintolan tiedot ja kassahenkilön nimi ennen maksamista. Maksua ei tallennettu.",
    QUOTE_CHANGED:
      "Hinta on muuttunut. Tarkista tilauksen sisältö ja uusi summa ennen jatkamista.",
    CHECKOUT_TOTAL_MISMATCH:
      "Maksettava summa on muuttunut. Tarkista uusi summa ennen maksamista.",
    FOOD_UNAVAILABLE:
      "Tuote ei ole enää saatavilla. Tarkista tilauksen sisältö.",
    SIZE_UNAVAILABLE:
      "Valittu koko ei ole enää saatavilla. Valitse toinen koko.",
    TASTE_UNAVAILABLE:
      "Valittu lisävalinta ei ole enää saatavilla. Tarkista valinnat.",
    STALE_VERSION:
      "Tilauksen tila on muuttunut. Päivitä tiedot ennen jatkamista.",
    ORDER_NOT_CANCELLABLE:
      "Tilausta ei voi enää perua tässä vaiheessa. Tarkista tilauksen nykyinen tila.",
    ORDER_NOT_FOUND: "Tilausta ei löytynyt. Päivitä tilauslista.",
    TABLE_SESSION_INACTIVE:
      "Pöytäistunto ei ole enää avoinna. Tarkista aiemman yrityksen tila ennen uuden aloittamista.",
    TABLE_SESSION_MISMATCH:
      "Tilaus kuuluu eri pöytäistuntoon. Tarkista valittu pöytä.",
    INSUFFICIENT_CASH: "Vastaanotettu rahamäärä ei riitä. Tarkista rahamäärä.",
    EMPTY_ORDER:
      "Tilauksessa ei ole tuotteita. Lisää tuotteet ennen jatkamista.",
    ORDER_TOO_LARGE:
      "Tilauksessa on liian monta tuotetta. Vähennä tuotteiden määrää.",
    PAYMENT_REQUIRED: "Tilaus on maksettava ennen jatkamista.",
    ORDER_NOT_PAID:
      "Tilauksella ei ole voimassa olevaa maksua. Tarkista maksutiedot.",
    IDEMPOTENCY_CONFLICT:
      "Aiemman yrityksen tiedot eivät vastaa tätä pyyntöä. Tarkista aiempi yritys; älä aloita uutta maksua tai tilausta.",
    CHECKOUT_CONFLICT:
      "Maksun tilaa ei voitu vahvistaa. Tarkista aiempi maksu samalla yrityksellä.",
    REFUND_CONFLICT:
      "Palautuksen tila on muuttunut. Tarkista sama palautusyritys ennen jatkamista.",
    REFUND_ALREADY_COMPLETED:
      "Palautus on jo vahvistettu. Tarkista palautuksen tiedot.",
    REFUND_NOT_FOUND: "Palautusta ei löytynyt. Päivitä tilauksen tiedot.",
    REFUND_SCOPE_CONFLICT:
      "Palautus ei ole mahdollinen tälle tilaukselle. Tarkista tilauksen maksutiedot.",
  }),
);

export const messageTranslations = new Map(
  Object.entries({
    "Organization is not configured":
      "Ravintolan tiedot puuttuvat. Tallenna tiedot kohdassa Asetukset → Ravintolan tiedot ennen kuitin tulostamista.",
    "Receipt setup is incomplete; ask an administrator to check restaurant settings before payment":
      "Kuitin tiedot ovat puutteelliset. Pyydä ylläpitäjää tarkistamaan ravintolan tiedot ja kassahenkilön nimi ennen maksamista. Maksua ei tallennettu.",
    "Receipt identity snapshot is invalid":
      "Kuitin tallennetut myyjätiedot ovat virheelliset. Pyydä ylläpitäjää tarkistamaan kuitti; älä maksa uudelleen.",
    "Username is already in use":
      "Käyttäjätunnus on jo käytössä. Valitse toinen tunnus.",
    "Food category name is already in use":
      "Tuoteryhmän nimi on jo käytössä. Valitse toinen nimi.",
    "Size name is already in use for this category":
      "Koon nimi on jo käytössä tässä tuoteryhmässä. Valitse toinen nimi.",
    "Taste name is already in use for this category":
      "Lisävalinnan nimi on jo käytössä tässä tuoteryhmässä. Valitse toinen nimi.",
    "Name must be 1-120 characters":
      "Nimen on oltava 1–120 merkkiä pitkä. Tarkista nimi.",
    "Remark must be at most 500 characters":
      "Kuvaus voi olla enintään 500 merkkiä pitkä. Lyhennä kuvausta.",
    "Sign in with the original account before submitting this draft":
      "Kirjaudu alkuperäisellä tilillä ennen tämän luonnoksen lähettämistä.",
    "Saved checkout is invalid; check its outcome before a new attempt":
      "Tallennetun maksuyrityksen tiedot ovat virheelliset. Tarkista sen tulos ennen uuden yrityksen aloittamista.",
    "Account changed; recover this request with its original account":
      "Käyttäjätili on vaihtunut. Tarkista tämä yritys alkuperäisellä tilillä.",
  }),
);
export const localizedMessages = new Set(messageTranslations.values());

// EN: Translate known server codes without altering the original error; outcome logic still needs its status and code.
// FI: Käännä tunnetut palvelinkoodit muuttamatta alkuperäistä virhettä; tuloksen käsittely tarvitsee edelleen sen tilan ja koodin.
export function responseMessage(
  data: unknown,
  status: number | undefined,
  fallback: string,
): string {
  if (status === 401) return "Istunto on vanhentunut. Kirjaudu uudelleen.";
  if (status === 403)
    return "Sinulla ei ole oikeutta tähän toimintoon. Pyydä apua ylläpitäjältä.";
  if (data && typeof data === "object") {
    const body = data as { code?: unknown; message?: unknown; error?: unknown };
    const codeText =
      typeof body.code === "string" ? codeMessages.get(body.code) : undefined;
    const message = body.message ?? body.error;
    const translated =
      typeof message === "string"
        ? messageTranslations.get(message)
        : undefined;
    if (codeText || translated) return codeText ?? translated!;
  }
  if (status === 429)
    return `${fallback} Pyyntöjä on liikaa. Odota hetki ennen jatkamista.`;
  if (status === 409)
    return `${fallback} Tiedot ovat muuttuneet. Tarkista nykyinen tila ennen jatkamista.`;
  if (status === 400 || status === 422)
    return `${fallback} Tarkista syötetyt tiedot.`;
  if (status === 404)
    return `${fallback} Valittua tietoa ei löytynyt. Päivitä näkymä.`;
  if (status !== undefined && status >= 500)
    return `${fallback} Palvelimessa on häiriö. Tarkista toiminnon tila ennen jatkamista.`;
  return fallback;
}
