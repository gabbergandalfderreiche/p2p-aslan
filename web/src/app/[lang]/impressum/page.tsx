import type { Metadata } from "next";
import { Field, LegalPage } from "@/components/LegalPage";
import { BRAND } from "@/lib/brand";
import { LEGAL } from "@/lib/legal";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    title: `${t.legal.impressumTitle} – ${BRAND.name}`,
    alternates: { languages: { de: "/de/impressum", en: "/en/impressum" } },
  };
}

export default async function Impressum() {
  const t = await getDictionary();
  const locale = await getLocale();
  const en = locale === "en";

  return (
    <LegalPage title={t.legal.impressumTitle}>
      <h2>{en ? "Operator" : "Betreiber"}</h2>
      <p>
        <Field value={LEGAL.operator} />
        <br />
        <Field value={en ? LEGAL.legalFormEn : LEGAL.legalForm} />
        <br />
        <Field value={LEGAL.street} />
        <br />
        <Field value={LEGAL.city} />
        <br />
        {en ? "Switzerland" : LEGAL.country}
      </p>

      <h2>{en ? "Contact" : "Kontakt"}</h2>
      <p>
        E-Mail: <Field value={LEGAL.email} />
      </p>

      <h2>{en ? "Responsible person" : "Verantwortliche Person"}</h2>
      <p>
        <Field value={LEGAL.responsiblePerson} />
      </p>

      <h2>Register</h2>
      <p>
        <Field value={en ? LEGAL.registerEn : LEGAL.register} />
        {LEGAL.uid && (
          <>
            <br />
            <Field value={LEGAL.uid} />
          </>
        )}
      </p>

      {en ? (
        <>
          <h2>Disclaimer</h2>
          <p>
            {BRAND.name} is a user interface for smart contracts on the Base Sepolia testnet and is in a beta phase.
            Bets use tUSD only, a test token with no value that anyone can get for free and that cannot be exchanged
            for money. No real-money gambling is offered. The smart contracts are publicly viewable but have not been
            externally audited yet.
          </p>
          <p>
            Football results are taken from football-data.org and confirmed through the UMA Optimistic Oracle; the
            operator does not set them and cannot change a confirmed result. Claims in custom bets are written by
            users and stored on the blockchain; the operator does not check them and
            cannot remove them. The operators of external links (e.g. block explorers, faucets) are solely
            responsible for their content.
          </p>

          <h2>Copyright</h2>
          <p>The source code of the smart contracts and the website is licensed under the MIT license.</p>
        </>
      ) : (
        <>
          <h2>Haftungsausschluss</h2>
          <p>
            {BRAND.name} ist eine Benutzeroberfläche für Smart Contracts im Base-Sepolia-Testnetz und befindet sich
            in einer Beta-Phase. Gewettet wird nur mit tUSD, einem Test-Token ohne Wert, den jeder gratis erhält und
            der nicht in Geld umgetauscht werden kann. Geldspiele mit echtem Geld werden nicht angeboten. Die Smart
            Contracts sind öffentlich einsehbar, wurden aber noch nicht extern geprüft.
          </p>
          <p>
            Fussballergebnisse stammen von football-data.org und werden über das UMA Optimistic Oracle bestätigt;
            der Betreiber legt sie nicht fest und kann ein bestätigtes Ergebnis nicht ändern. Die Behauptungen in
            eigenen Wetten schreiben die Nutzer selbst; sie stehen auf der Blockchain, werden vom
            Betreiber nicht geprüft und können von ihm nicht entfernt werden. Für Inhalte externer Links (z. B.
            Block-Explorer, Faucets) sind ausschliesslich deren Betreiber verantwortlich.
          </p>

          <h2>Urheberrecht</h2>
          <p>Der Quellcode der Smart Contracts und der Website steht unter der MIT-Lizenz.</p>
        </>
      )}
    </LegalPage>
  );
}
