# Startmenyn med konto och community: förslag och frågor

Raw result of the owner's brainstorming pass, 2026-11-14, as handed to
the session (Swedish, unedited). Source material, not authoritative.
The comparison with the spec and with what is built is
`notes/start-menu-sync-prep.md`.

---

Underlag från ett brainstormningpass. Det är ett förslag att pröva mot den pågående implementeringen, inte en spec.

## Problemet

- Menyn har för många likvärdiga rader (Profile, Scripts, History, Spotlights, Account, Credits, About).
- Det syns inte vad som skiljer en profile från ett account.
- Det syns inte om man är inloggad, eller vems profiler och scripts man tittar på.
- Community ska gå att nå direkt från menyn.

## Föreslagen struktur: tre zoner och en fotrad

```
  GÄST                              INLOGGAD

  ⌂  ENTER MUME                     ⌂  ENTER MUME
  ────────◆────────                 ────────◆────────
  On this device · log in           ole · synced
  Settings   (default)              Settings   (warrior)
  Scripts                           Scripts
  History                           History
  ────────◆────────                 ────────◆────────
  ✦ COMMUNITY   3 new               ✦ COMMUNITY   3 new
       about                             about
```

1. Spela: Enter MUME, som i dag.
2. Mitt: en ägarrad följd av Settings, Scripts och History.
3. Allas: Community, avgränsad på samma sätt som Enter MUME och med räknare.
4. Fotrad: About, nedtonad.

Menyn har samma form inloggad och utloggad. Bara ägarraden och innehållet skiljer.

## Förslagen bakom strukturen

- Account blir en ägarrad i stället för ett menyval. Den står som rubrik över "mitt" och säger var sakerna bor: On this device · log in eller <kontonamn> · synced. Klick öppnar kontomenyn. Kontot äger, och profilen är en av sakerna som ägs.
- Profile byter namn till Settings. En profile är en vald settings-fil och har inget med karaktär eller konto att göra. När kontonamn syns i ett community läses "profile" lätt som en publik användarsida. Settings (default) säger vad raden är och vilken uppsättning som är vald.
- Scripts är kvar som egen rad, bredvid Settings och inte under. De hör till kontot eller enheten, inte till den valda settings-profilen.
- History, Spotlights och Credits blir en rad, History. Alla tre är vyer på samma sparade pass. Flikar: Sessions (logg, statistik, uppspelning, export, publish), Spotlights (montaget) och Diary.
- Credits byter namn till Diary. "Credits" läses som "tack till".
- Community heter Community i menyn. Det är sakligt som övriga rader. Hall of Fame (topplistan) och Random Runes (anslagstavlan) är delar inne på sidan.

## Gäst och inloggad

Grundregeln är bestämd: utloggad ser du enhetens saker, inloggad ser du kontots saker, aldrig en blandning.

| | Gäst | Inloggad |
|---|---|---|
| Konto krävs för att spela | Nej | |
| Settings-profiler | Default och example plus egna, på enheten | Kontots, synkade |
| Scripts | Bundlade plus egna, på enheten | Kontots, synkade |
| Sparade pass | Alla sparas lokalt, med uppspelning och export | Sparas i kontot |
| Spotlights och Diary | Finns inte | Bygger bara på kontots pass |
| Publicera logg | Nej | Ja, bredvid exportvalen i History |
| Community | Läsa loggar och Random Runes | Även kommentera, betygsätta och skriva |
| Namn i community | | Kontonamn, inte anonymt |

Förslag på övergångarna:

- Första inloggningen: om enheten har egna saker får man frågan om de ska följa med till kontot. Det ska vara en flytt och inte en kopia, så att det inte uppstår två versioner som glider isär.
- Utloggning: kontots saker tas bort från enheten och man är tillbaka på enhetens egna, oftast startuppsättningen. Dialogen säger att allt ligger kvar i kontot.
- Man förblir inloggad tills man själv loggar ut.

## Har vi tänkt på detta?

1. Ska Spotlights och Diary vara dolda eller synliga men låsta för gäster? Låsta flikar med "create an account to unlock" visar vad man får med ett konto. Dolda ger en renare gästvy.
2. Följer gästens lokala pass med vid "ta med"? Om ja börjar Spotlights och Diary med innehåll direkt efter att kontot skapats.
3. Vad räknar räknaren vid Community? Förslaget är nya publicerade loggar sedan senaste besöket, vilket fungerar även för gäster. Random Runes räknas inte, för då visar den alltid något.
4. Var syns reaktioner på ens egna loggar? Förslaget är en egen markering på ägarraden eller i kontomenyn, skild från räknaren.
5. Hur syns det i History att ett pass är publicerat, och var drar man tillbaka det? Förslaget är en "published"-markering på passet.
6. Vad ser en gäst där kommentarsfält och betyg sitter? Förslaget är "log in to comment" på samma plats, inte ett tomrum.
7. Vad händer med osynkade ändringar vid utloggning? De bör synkas först, annars behövs en varning.
8. Ligger Random Runes på Community-sidan bredvid loggarna eller som egen flik? Tanken hittills är en ruta vid sidan.
9. Stämmer namnbytena med vad som redan är byggt? Settings, Diary och sammanslagningen under History rör menytexter och navigering i implementeringen av konton.
