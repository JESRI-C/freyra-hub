# GoFreyra Rapportmotor 2.0

## Udgivelseskandidat 18. november 2026

Den offentliggjorte kode `7bd94a4` bestod typekontrol, stagingbygning og Wranglers strenge lokale prøveudgivelse. Versionsopslag, login, feltrute og rapportgodkendelse returnerede HTTP 200 lokalt. Alle 774 filer i to udpakninger af testpakken matchede byggeoutputtet. Testpakkens SHA-256 er `67a97890acd3b4e951862792fe148363a1d0d8a43a348f21bc4ab1573791c5fb`. Den eksisterende stagingadresse viste den 18. november kl. 10.15 dansk tid fortsat `4be325d`. Udgivelse til denne adresse afventer adgang til ejerkontoen. [Offentlig kode 7bd94a4](https://github.com/JESRI-C/freyra-hub/commit/7bd94a4710f43bb75f4be4855057f51f75ee64e4)

Den første fulde lokale testkørsel på `7bd94a4` gav fem fejl i én testfil. Da testens router fik den manglende funktion `useLoaderData`, bestod alle 3.947 tests i 291 filer på 624,19 sekunder. Rettelsen ændrede kun testfilen. GitHub viste ved kontrollen ingen CI-kørsler eller indberettede checks på de to revisioner. [Testrettelse 675483d](https://github.com/JESRI-C/freyra-hub/commit/675483d3b06273382584b28e28890b79b1c9e709)

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
