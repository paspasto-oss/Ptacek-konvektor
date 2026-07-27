# Ptáček → POHODA konvertor

Jednostránková webová aplikácia, ktorá premení XML výdajku od spoločnosti Ptáček na XML doklad typu **Vydaná objednávka** pre ekonomický systém POHODA.

Aplikácia beží iba v prehliadači. Nahraná výdajka ani mapovanie skladových kódov sa neposielajú na server.

## Použitie

1. Otvorte `index.html` alebo GitHub Pages verziu aplikácie.
2. Nahrajte XML výdajku od Ptáčka.
3. Skontrolujte kódy v stĺpci **Kód POHODA**.
4. Skontrolujte množstvo, nákupnú cenu a sadzbu DPH.
5. Stiahnite vygenerovaný XML súbor.
6. V POHODE použite **Súbor → Dátová komunikácia → XML import/export**.
7. V agende **Príjemky** následne použite **Záznam/Prenos → Vydané objednávky**.

## Dôležité správanie

- Skutočná jednotková nákupná cena sa počíta ako `VATBaseAmount ÷ Quantity`.
- Pole `UnitPrice` vo výdajke Ptáčka je spravidla cenníková cena pred zľavou a nemá sa používať ako obstarávacia cena.
- Položkové názvy sa pri skladových položkách do XML neposielajú. POHODA ich načíta zo skladových kariet podľa kódu.
- Každý použitý **Kód POHODA musí existovať na skladovej karte**. Ak karta neexistuje, položku pred exportom odškrtnite alebo kartu najprv založte v POHODE.
- Hodnota **Dodané** sa exportuje ako `0`, aby sa objednávka dala následne preniesť do príjemky.
- Mapovanie dodávateľských kódov na kódy POHODA sa ukladá iba do `localStorage` daného prehliadača a dá sa exportovať/importovať ako JSON.

## Súbory

- `index.html` – kompletná aplikácia bez externých knižníc

## GitHub Pages

Pre publikovanie nastavte v repozitári:

**Settings → Pages → Deploy from a branch → main → /root**

Potom bude aplikácia dostupná na adrese:

`https://paspasto-oss.github.io/Ptacek-konvektor/`
