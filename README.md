# Ravintola POS – Frontend

Ravintola POS yhdistää kassamyynnin, pöytäkohtaiset QR-tilaukset ja keittiön tilausten käsittelyn samaan työnkulkuun.

Tämä repository sisältää henkilökunnan kassa-, keittiö- ja tarjoilijanäkymät sekä asiakkaan QR-tilausnäkymän.

- [Backend repository](https://github.com/AlexNtrx/pos-restaurant-backend)
- [Julkaistu frontend](https://pos-restaurant-nextjs.vercel.app)
- [Frontend-julkaisut](https://github.com/AlexNtrx/pos-restaurant-nextjs/releases)
- [Backend-julkaisut](https://github.com/AlexNtrx/pos-restaurant-backend/releases)

## Toiminnot

- Kassamyynti paikan päällä ruokailuun ja mukaan otettaville tilauksille, kuitit ja uudelleentulostus.
- Asiakkaan QR-menu, annoskoot ja lisävalinnat, tilaaminen ja tilausten seuranta.
- Pöytäistunnot, tilausten vastaanotto, keittiökäsittely ja tarjoilun vahvistaminen.
- Henkilökunnan, ruokalistan, ravintolan asetusten ja raporttien hallinta.

Backend vahvistaa käyttöoikeudet, hinnat ja summat palvelinpuolella.

## Teknologiat ja vaatimukset

Next.js 16 (React 19), TypeScript, Tailwind CSS 4, Radix UI, Axios ja Vitest.

Tarvitset Node.js 24:n, npm:n, käynnissä olevan backendin ja aktiivisen henkilökuntatunnuksen. Tämä repository ei luo tietokantaa tai käyttäjätilejä.

## Käynnistys paikallisesti

```bash
git clone https://github.com/AlexNtrx/pos-restaurant-nextjs.git
cd pos-restaurant-nextjs
npm ci
```

Luo `.env.local` projektin juureen:

```dotenv
NEXT_PUBLIC_API_SERVER=http://localhost:3001
```

Arvo on backendin osoite ilman `/api`-polkua. Sovellus lisää polun itse. Älä lisää salaisuuksia `NEXT_PUBLIC_*`-muuttujiin.

Käynnistä backend sen README-ohjeiden mukaan ja suorita frontend:

```bash
npm run dev
```

Avaa [http://localhost:3000/signin](http://localhost:3000/signin) ja kirjaudu sisään aktiivisella henkilökuntatunnuksella.

## Tarkistukset

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run format:check
```

## Rajaukset

- Ostoskoriluonnokset tallennetaan selaimeen, eivätkä ne synkronoidu laitteiden välillä.
- Tilauspäivitykset käyttävät kyselyitä; reaaliaikaisia päivityksiä ei ole toteutettu.
- Pöytäistunnolla on yksi lasku; laskun jakamista ei ole toteutettu.
- Asiakastilejä, verkkomaksuja, toimituksia, varastonhallintaa, pöytävarauksia ja kanta-asiakasohjelmaa ei ole toteutettu.

## Julkaisun tila

`v2.0.0` on julkaistu lähdekoodiversio. Tuotantotarkistukset ja pilotin hyväksyntä ovat vielä kesken.
