# GoFreyra Rapportmotor 2.0

## Udgivelseskandidat 18. november 2026

Kildekandidat `4949100` bestod typekontrol, stagingbygning, Wranglers lokale prøveudgivelse og fire lokale HTTP-kontroller. Alle 774 filer i to udpakninger matchede byggeoutputtet. Den eksisterende stagingadresse viste ved kontrollen den 18. november den tidligere version `4be325d`. Udgivelse til denne adresse afventer adgang til ejerkontoen.

Rapportmotoren bruger projektets eksisterende registreringer, originalfiler, undersøgelsesrunder og rapportversioner. Under **Verificering** kan en projektredaktør knytte et foto til en bestemt vandløbsstrækning, beskrive en observation og sende den til faglig gennemgang. Et enkelt kildefoto beholder sin neutrale betegnelse. En læser kan åbne det valgte foto med sin aktuelle projektadgang.

Ved import til en rapport medtages de citerede kilder, den gemte strækningsversion, stationeringen og opmålingsmetoden. Andre afsnit beholder deres kilder. En faglig godkendelse knytter sig til den rapportversion, som den ansvarlige har gennemgået.

En lokal browserprøve på denne version fulgte et originalfoto og en eksisterende vandløbslinje gennem editoren til en genåbnet rapportkladde og eksport i PDF og Word. Den separate gennemgang blev udført af en teknisk testbruger. Fotopunktet afventer den faglige afgørelse.

## Haderslevs fotoregister, kortudsnit og feltprøver

| Prøve | Verificeret | Udestående pilotaccept |
| --- | --- | --- |
| A · Vandløbsrapport | 437 originaler på 5.655.120.369 bytes gennem neutral upload og kort. En separat lokal serverprøve genlæste alle filer og kontrollerede hver SHA-256 og ophavspost. | Samlet forløb fra projektoprettelse til rapport med en indlogget pilotredaktør. |
| B · Broer | En lokal mobilprøve samlede to registreringer med fotos og positioner i én rapport. | Registrering på fysisk telefon med faktiske konstruktioner og GPS. |
| C · Natur | Lokal prøve med område, observationer, metode og naturtilstandsrapport. | Aktuelle feltfund, kontrolleret areal og faglig gennemgang. |
| D · Før og efter | Tre billedpar med seks originaler og dokumenterede kildebeskrivelser kunne genåbnes i PDF og Word. | Faglig bekræftelse af billedpar og konklusioner. |
| E · Rapportgodkendelse | Afvisning, rettelse og fornyet gennemgang blev fastholdt i seks lokale rapportrevisioner. | Pilotens fagansvarlige afviser og godkender en bestemt version i staging. |

I tidligere stagingprojekter matchede 42 originale filer registerets kontrolsummer og de gemte filversioner. Otte forskellige originaler havde allerede gemte tilknytninger til en undersøgelsesrunde. De afventer faglig fotopunktgennemgang. De lokale serverprøver brugte afgrænsede testroller og en lokal filmodtager.

Scrumstatus er **2** for originaler og samlet rapport og **3** for de faglige registreringsforløb. Det næste acceptpunkt er én samlet prøve på den eksisterende stagingadresse. [Scrumplan S02, S05 og S06](UDVIKLINGSPLAN_SAMLING_2026-11-02.md)
