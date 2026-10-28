import type { Metadata } from "next";
import { Field, LegalPage } from "@/components/LegalPage";
import { BRAND } from "@/lib/brand";
import { LEGAL } from "@/lib/legal";
import { LOCALE_COOKIE } from "@/i18n";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    title: `${t.legal.privacyTitle} – ${BRAND.name}`,
    alternates: { languages: { de: "/de/datenschutz", en: "/en/datenschutz" } },
  };
}

export default async function Datenschutz() {
  const t = await getDictionary();
  const locale = await getLocale();

  return (
    <LegalPage title={t.legal.privacyTitle}>{locale === "en" ? <English /> : <German />}</LegalPage>
  );
}


function German() {
  return (
    <>
      <p>
        Diese Erklärung beschreibt, welche Personendaten beim Besuch dieser Website und bei der Nutzung der{" "}
        {BRAND.name}-App bearbeitet werden. Sie richtet sich nach dem Schweizer Datenschutzgesetz (DSG) und, soweit
        anwendbar, der EU-Datenschutz-Grundverordnung (DSGVO).
      </p>

      <h2>Verantwortlich</h2>
      <p>
        <Field value={LEGAL.operator} />, <Field value={LEGAL.street} />, <Field value={LEGAL.city} />, {LEGAL.country}
        <br />
        E-Mail: <Field value={LEGAL.email} />
      </p>

      <h2>Kurz zusammengefasst</h2>
      <ul>
        <li>Kein Benutzerkonto, keine Registrierung, keine Angabe von Name oder E-Mail nötig.</li>
        <li>Keine Werbe-Tracker, keine persönlichen Profile. Für anonyme Besucherzahlen nutzen wir Vercel Web Analytics – ohne Cookies. Ein Cookie speichert nur deine Sprachwahl.</li>
        <li>Schriften werden von unserem eigenen Server ausgeliefert, nicht von Google.</li>
        <li>
          Transaktionen auf der Blockchain sind öffentlich und dauerhaft – das ist eine Eigenschaft der Blockchain,
          nicht dieser Website.
        </li>
      </ul>

      <h2>Hosting (Vercel)</h2>
      <p>
        Die Website wird bei Vercel Inc., USA, gehostet. Beim Aufruf verarbeitet Vercel technisch notwendige Daten
        wie IP-Adresse, Zeitpunkt, aufgerufene Seite und Browser-Angaben in Server-Protokollen, um die Seite
        auszuliefern und vor Missbrauch zu schützen. Die Übermittlung in die USA erfolgt auf Grundlage des Swiss-U.S.
        bzw. EU-U.S. Data Privacy Framework bzw. von Standardvertragsklauseln. Rechtsgrundlage ist unser berechtigtes
        Interesse an einem sicheren Betrieb.
      </p>

      <h2>Besucherstatistik (Vercel Web Analytics)</h2>
      <p>
        Um zu sehen, welche Seiten genutzt werden, verwenden wir Vercel Web Analytics. Erfasst werden die
        aufgerufene Seite, die verweisende Seite, Land, Gerätetyp, Browser und Betriebssystem. Es werden keine
        Cookies gesetzt und keine Profile über mehrere Websites gebildet. Zur Unterscheidung von Besuchen bildet
        Vercel aus Merkmalen der Anfrage einen anonymen Wert, der nach spätestens 24 Stunden verworfen wird.
        Rechtsgrundlage ist unser berechtigtes Interesse an der Verbesserung der Website.
      </p>

      <h2>Verbindung mit einer Wallet</h2>
      <p>
        Wenn du eine Wallet verbindest, liest die App deine öffentliche Wallet-Adresse, dein Test-Guthaben und deine
        Wetten in den {BRAND.name}-Contracts. Diese Daten stehen ohnehin öffentlich auf der Blockchain. Wir speichern sie
        nicht auf eigenen Servern.
      </p>
      <ul>
        <li>
          <b>Blockchain-Abfragen:</b> Dein Browser sendet Leseanfragen und signierte Transaktionen an einen RPC-Knoten
          des Base-Netzwerks (standardmässig <code>sepolia.base.org</code>, betrieben von Coinbase). Dabei sind deine
          IP-Adresse und deine Wallet-Adresse für den Betreiber des Knotens sichtbar.
        </li>
        <li>
          <b>Anmeldung mit Passkey (Base Account):</b> Diese Wallet wird von Coinbase bereitgestellt. Die Anmeldung
          läuft in einem Fenster von Coinbase; es gilt deren Datenschutzerklärung. Wir erhalten nur deine
          Wallet-Adresse, keine biometrischen Daten.
        </li>
        <li>
          <b>Browser-Wallets</b> (z. B. MetaMask): Es gelten die Datenschutzbestimmungen des jeweiligen Anbieters.
        </li>
        <li>
          <b>Test-ETH für Gebühren:</b> Wenn du auf „Test-ETH gratis erhalten“ tippst, sendet die App deine
          Wallet-Adresse an unseren Server bei Vercel. Dieser schickt dir von unserer Wallet eine kleine Menge Test-ETH.
          Adresse und IP-Adresse werden dabei nur kurz im Arbeitsspeicher gehalten, um Mehrfachanfragen innerhalb von
          24 Stunden zu verhindern, und nicht dauerhaft gespeichert.
        </li>
      </ul>

      <h2>Cookie und Speicher in deinem Browser</h2>
      <p>
        Wenn du die Sprache umschaltest, speichern wir deine Wahl in einem Cookie (<code>{LOCALE_COOKIE}</code>, 1
        Jahr gültig), damit du beim nächsten Besuch die richtige Sprache siehst. Zusätzlich speichert die App im
        lokalen Speicher deines Browsers (localStorage), welche Wallet zuletzt verbunden war und dass du den
        Beta-Hinweis bestätigt hast, sowie ob du das helle oder dunkle Design gewählt hast. Diese Angaben dienen nur der Funktion der Seite, werden nicht für Tracking
        verwendet und lassen sich jederzeit über die Einstellungen deines Browsers löschen.
      </p>

      <h2>Blockchain-Daten</h2>
      <p>
        Wetten, ihre Behauptungstexte, Meldungen und Auszahlungen sind Transaktionen auf der öffentlichen
        Base-Sepolia-Blockchain. Sie sind für alle einsehbar und können technisch nicht gelöscht oder geändert werden. Ein Löschbegehren kann
        sich daher nicht auf Blockchain-Daten erstrecken.
      </p>

      <h2>Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Bearbeitung deiner Personendaten,
        soweit wir solche bearbeiten, sowie auf Datenherausgabe. Wende dich dafür an <Field value={LEGAL.email} />. Du
        kannst dich zudem beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB) bzw. bei der
        zuständigen Aufsichtsbehörde in deinem Land beschweren.
      </p>

      <h2>Änderungen</h2>
      <p>Wir passen diese Erklärung an, wenn sich die App ändert. Stand: {LEGAL.lastUpdated}.</p>
    </>
  );
}

function English() {
  return (
    <>
      <p>
        This policy describes which personal data is processed when you visit this website and use the {BRAND.name}{" "}
        app. It follows the Swiss Federal Act on Data Protection (FADP) and, where applicable, the EU General Data
        Protection Regulation (GDPR).
      </p>

      <h2>Controller</h2>
      <p>
        <Field value={LEGAL.operator} />, <Field value={LEGAL.street} />, <Field value={LEGAL.city} />, Switzerland
        <br />
        E-Mail: <Field value={LEGAL.email} />
      </p>

      <h2>In short</h2>
      <ul>
        <li>No user account, no registration, no name or e-mail required.</li>
        <li>No ad trackers, no personal profiles. For anonymous visitor numbers we use Vercel Web Analytics – without cookies. One cookie only stores your language choice.</li>
        <li>Fonts are served from our own server, not from Google.</li>
        <li>
          Transactions on the blockchain are public and permanent – that is a property of the blockchain, not of this
          website.
        </li>
      </ul>

      <h2>Hosting (Vercel)</h2>
      <p>
        This website is hosted by Vercel Inc., USA. When you visit it, Vercel processes technically necessary data
        such as IP address, time, requested page and browser details in server logs to deliver the site and protect
        it against abuse. Transfers to the USA are based on the Swiss-U.S. / EU-U.S. Data Privacy Framework or
        standard contractual clauses. The legal basis is our legitimate interest in secure operation.
      </p>

      <h2>Visitor statistics (Vercel Web Analytics)</h2>
      <p>
        To see which pages are used, we use Vercel Web Analytics. It records the page visited, the referring
        page, country, device type, browser and operating system. No cookies are set and no cross-site profiles
        are built. To tell visits apart, Vercel derives an anonymous value from request data that is discarded
        after 24 hours at the latest. The legal basis is our legitimate interest in improving the website.
      </p>

      <h2>Connecting a wallet</h2>
      <p>
        When you connect a wallet, the app reads your public wallet address as well as balances test balance and your bets in the{" "}
        {BRAND.name} contracts. This data is public on the blockchain anyway. We do not store it on our own servers.
      </p>
      <ul>
        <li>
          <b>Blockchain requests:</b> your browser sends read requests and signed transactions to an RPC node of the
          Base network (by default <code>sepolia.base.org</code>, operated by Coinbase). Your IP address and wallet
          address are visible to the node operator.
        </li>
        <li>
          <b>Passkey sign-in (Base Account):</b> this wallet is provided by Coinbase. Sign-in happens in a Coinbase
          window and their privacy policy applies. We only receive your wallet address, no biometric data.
        </li>
        <li>
          <b>Browser wallets</b> (e.g. MetaMask): the privacy terms of the respective provider apply.
        </li>
        <li>
          <b>Test ETH for fees:</b> when you tap “Get free test ETH”, the app sends your wallet address to our server
          at Vercel, which sends you a small amount of test ETH from our wallet. The address and IP address are only
          kept briefly in memory to prevent repeated requests within 24 hours and are not stored permanently.
        </li>
      </ul>

      <h2>Cookie and storage in your browser</h2>
      <p>
        When you switch the language, we store your choice in a cookie (<code>{LOCALE_COOKIE}</code>, valid for 1
        year) so you see the right language on your next visit. In addition, the app stores in your browser&apos;s
        local storage which wallet was last connected and that you confirmed the beta notice, and whether you picked the light or dark theme. This data only serves
        the functioning of the site, is not used for tracking, and can be deleted at any time in your browser
        settings.
      </p>

      <h2>Blockchain data</h2>
      <p>
        Bets, their claim texts, reports and payouts are transactions on the public Base Sepolia
        blockchain. They are visible to
        everyone and technically cannot be deleted or changed. A deletion request therefore cannot extend to
        blockchain data.
      </p>

      <h2>Your rights</h2>
      <p>
        You have the right to access, rectification, erasure and restriction of processing of your personal data, to
        the extent we process any, as well as to data portability. Contact <Field value={LEGAL.email} />. You can also
        lodge a complaint with the Swiss Federal Data Protection and Information Commissioner (FDPIC) or the
        competent supervisory authority in your country.
      </p>

      <h2>Changes</h2>
      <p>We update this policy when the app changes. Last updated: {LEGAL.lastUpdatedEn}.</p>
    </>
  );
}
