# Port Key Library v1.1.1 (Mudlet) — extracted

Source: https://github.com/Khazdul/MUME/blob/main/Port%20Key%20Library%20v1_1_1.mpackage
Read-only reference. Never copy code.

## TriggerGroup: keyLibrary 1.1.1

### TriggerGroup: keyLibrary

#### Trigger: locateID
patterns: [("^(.*?)\\s+-\\s+(.*?)\\s{2,}(.*?)\\s{2,}key: '(.*)'$", '1')]
```lua
--^(.*) - (.*)  (.*) key: '(.*)'$
--^(.{25})- (.{14})(.{10})key: '(.*)'$

keyLibrary.locateTempArray = keyLibrary.locateTempArray or {}

keyLibrary.locateMatches = keyLibrary.locateMatches + 1

keyLibrary.locateTempArray[keyLibrary.locateMatches] = {}
keyLibrary.locateTempArray[keyLibrary.locateMatches][1] = keyLibrary.spellQue[1] -- ID/label
keyLibrary.locateTempArray[keyLibrary.locateMatches][2] = string.trim(matches[2]) -- mob
keyLibrary.locateTempArray[keyLibrary.locateMatches][3] = string.trim(matches[3]) -- roomType
keyLibrary.locateTempArray[keyLibrary.locateMatches][4] = string.trim(matches[4]) -- distance
keyLibrary.locateTempArray[keyLibrary.locateMatches][5] = string.trim(matches[5]) -- key
keyLibrary.locateTempArray[keyLibrary.locateMatches][6] = os.time() -- time
keyLibrary.locateTempArray[keyLibrary.locateMatches][7] = 0  -- chosen (for safekey)

enableTrigger("disableLocate")

moveCursor(0,getLineCount())
deleteLine()
```

#### Trigger: disableLocate
patterns: [('^$', '1')]
```lua
if keyLibrary.locateMatches == 1 then
--  decho("<154,168,183>## Key stored: <204,218,233>$"..locateTempArray[locateMatches][1].." ("..locateTempArray[locateMatches][2]..", "..locateTempArray[locateMatches][3]..", "..locateTempArray[locateMatches][4]..")")
  keyLibrary.newKey(keyLibrary.locateTempArray[keyLibrary.locateMatches][1], keyLibrary.locateTempArray[keyLibrary.locateMatches][3], keyLibrary.locateTempArray[keyLibrary.locateMatches][5], keyLibrary.locateTempArray[keyLibrary.locateMatches][4])
elseif keyLibrary.locateMatches > 1 then
  decho("\n<154,168,183>## Located <204,218,233>"..keyLibrary.locateMatches.." <154,168,183>mobs.")
  keyLibrary.pickKey(keyLibrary.locateMatches)
end

keyLibrary.locateMatches=0
keyLibrary.removeFromSpellQue()
disableTrigger("disableLocate")
if #keyLibrary.spellQue == 0 then disableTrigger("locateID") end
```

### TriggerGroup: TV

#### Trigger: activateWatchTV
patterns: [('^You feel aware of this place.$', '1')]
```lua
keyLibrary.activateWatchTV()
```

#### Trigger: incomingLineWatchTV
patterns: [('^\\[(.+)\\] (.+)$', '1')]
```lua
local deactivateWatch = 0
--keyLibrary.incomingKeyToSent = {}
-- watch drop:
if matches[3] == "Your awareness decreases." then
keyLibrary.dropWatch(matches[2])
else
-- watch incoming line:


keyLibrary.sendWatchLineToTv(matches[2],matches[3])
keyLibrary.incomingSentKey = matches[2]
enableTrigger("afterIncomingLineWatch")
end
```

#### Trigger: afterIncomingLineWatch
patterns: [('^$', '1')]
```lua
--for i=1,#keyLibrary.incomingKeyToSent,1 do
--  keyLibrary.showTV(keyLibrary.incomingKeyToSent[i])
--end


--keyLibrary.showTV(keyLibrary.incomingKeyToSent)
keyLibrary.showTV(keyLibrary.incomingSentKey)
keyLibrary.incomingSentKey = nil
moveCursor(0,getLineCount())
deleteLine()
moveCursor(0,getLineCount())
deleteLine()
enableTrigger("promptAfterIncomingDel")
disableTrigger("afterIncomingLineWatch")
```

#### Trigger: promptAfterIncomingDel
patterns: [('^(.*)$', '1')]
```lua
moveCursor(0,getLineCount())
deleteLine()
disableTrigger("promptAfterIncomingDel")      
```

#### Trigger: spellQueRemover
patterns: [('^Argh! You cannot concentrate any more...', '1'), ('^Nah... You feel too relaxed to do that.', '1'), ('^In your dreams, or what?', '1'), ('^Alas, this location is out of range!', '1'), ('^Alas, not enough mana flows through you...', '1'), ('^Your spell backfired!', '1'), ('^Your mind fails to locate any such creature.', '1')]
```lua
keyLibrary.removeFromSpellQue()
```

#### Trigger: incomingScry
patterns: [('^You let your inner eye find the area... and you see:$', '1')]
```lua
keyLibrary.incomingScryLines = {}

enableTrigger("doneCapturingScryLines")
enableTrigger("captureScryLines")
```

#### Trigger: captureScryLines
patterns: [('^(.+)$', '1')]
```lua
keyLibrary.incomingScryLines[#keyLibrary.incomingScryLines+1] = copy2decho(matches[2])
moveCursor(0,getLineCount())
deleteLine()

```

#### Trigger: doneCapturingScryLines
patterns: [('^$', '1')]
```lua
disableTrigger("captureScryLines")
disableTrigger("doneCapturingScryLines")
keyLibrary.sendScryToTV()

```

## AliasGroup: keyLibrary 1.1.1

### AliasGroup: tv

#### Alias: watchr <key>
regex: ^watchr \$?(\w+)
```lua
if keyLibrary.getWatchKey(matches[2]) and keyLibrary.checkIfWatched(matches[2])==false then

  keyLibrary.addToSpellQue(matches[2])
  decho("<154,168,183>## Casting watch on: <204,218,233>"..matches[2].." ("..keyLibrary.getWatchKey(matches[2])..")\n")
  send ("cast n 'watch room' "..keyLibrary.getWatchKey(matches[2]).." "..matches[2])
  decho("\n")
-- display(spellQue)

elseif keyLibrary.getWatchKey(matches[2])==false then
  decho("<154,168,183>## Error! No key: <204,218,233>$"..matches[2])
elseif keyLibrary.getWatchKey(matches[2]) then
  decho("<154,168,183>## Error! Key is already watched: <204,218,233>$"..matches[2])
end
```

#### Alias: scry <key>
regex: ^scry \$?(\w+)
```lua

if keyLibrary.getScryKey(matches[2]) then
  keyLibrary.addToSpellQue(matches[2])

  decho("<154,168,183>## Casting scry on: <204,218,233>"..matches[2].." ("..keyLibrary.getScryKey(matches[2])..")\n")
  send ("cast n 'scry' "..keyLibrary.getScryKey(matches[2]))
  cecho("\n")

--  display(spellQue)

else
  decho("<154,168,183>## Error! No key: <204,218,233>$"..matches[2].."\n")
end

```

#### Alias: tv
regex: ^tv$
```lua
keyLibrary.showTV(nil,"toggle")
```

### AliasGroup: keyLibrary

#### Alias: kchange
regex: ^kchange\s+(\S+)\s+(\S+)
```lua
local foundRenameMatch = 0

if utf8.len(matches[3]) > 10 then
decho("<154,168,183>## Key names can be max 10 characters\n")
else
for i=1,#keyLibrary.keys,1 do
  if keyLibrary.keys[i][1] == matches[2] then
    keyLibrary.keys[i][1] = matches[3]
    decho("<154,168,183>## Renamed key: <204,218,233>"..matches[2].." to "..matches[3]..".")
    foundRenameMatch = 1
    keyLibrary.showKeys()
  end
end

if foundRenameMatch == 0 then
  decho("<154,168,183>## Couldn't find key: <204,218,233>"..matches[2]..".")
end
end
```

#### Alias: locatel <ID>
regex: ^locatel\s+(\S+)$
```lua
if utf8.len(matches[2]) > 10 then
decho("<154,168,183>## Key names can be max 10 characters\n")
else
keyLibrary.addToSpellQue(matches[2])
keyLibrary.flushLocateArray()
decho("<154,168,183>## Locating life on current room with keyname: <204,218,233>"..matches[2].."\n")
send("cast n 'locate life'",false)


enableTrigger("locateID")
--end
end
```

#### Alias: locatel <target> <ID>
regex: ^locatel\s+(\S+)\s+(\S+)$
```lua
if utf8.len(matches[3]) > 10 then
decho("<154,168,183>## Key names can be max 10 characters\n")
else
keyLibrary.addToSpellQue(matches[3])
keyLibrary.flushLocateArray()
decho("<154,168,183>## Locating life for: <204,218,233>"..matches[2].."<154,168,183> with keyname: <204,218,233>"..matches[3].."\n")
send("cast n 'locate life' "..matches[2],false)

enableTrigger("locateID")
end
```

#### Alias: keys
regex: ^keys$
```lua
keyLibrary.showKeys("toggle")
```

#### Alias: keyVariabelReplace
regex: ^(?!.*(^watchr|^#alias|^scry|portal|teleport))([^\$]*)\$(\w*)([^\$]*)?
```lua
local foundVariable = 0
for i=1, #keyLibrary.keys,1 do
  if keyLibrary.keys[i][1]==matches[4] then
  send((matches[3] or  "")..(keyLibrary.keys[i][3] or "")..(matches[5] or ""))
  foundVariable = 1
  end  
end

if foundVariable == 0 then
decho("<154,168,183>## Error! No variable: <204,218,233>$"..matches[3].."\n")
end
```

#### Alias: dkey
regex: ^dkey\s+(\S+)
```lua
keyLibrary.deleteKey(matches[2])
```

#### Alias: kpick
regex: ^kpick$
```lua
if #keyLibrary.locateTempArray > 0 then
keyLibrary.pickKey()
else
decho("<154,168,183>## There is currently no keys to pick from. \n")
end
```

#### Alias: skey
regex: ^skey\s+(\S+)
```lua
local foundSafeKeyPick = 0
for i=1,#keyLibrary.keys,1 do
  if keyLibrary.keys[i][1] == matches[2] then
  keyLibrary.safePicker(i)
--  decho("<154,168,183>## Safe-key set to: $"..matches[2])
  foundSafeKeyPick = 1
  end  
end

if foundSafeKeyPick == 0 then
decho("<154,168,183>## Couldn't find key: <204,218,233>"..matches[2])
end

```

#### Alias: psafe
regex: ^psafe$
```lua
local foundSafeKey = 0
for i=1,#keyLibrary.keys,1 do
  if keyLibrary.keys[i][5] == 1 then
  foundSafeKey = 1
   send("cast n 'portal' "..keyLibrary.keys[i][3],false)
   decho("<154,168,183>## Portalling to safe room: <204,218,233>"..keyLibrary.keys[i][1].."<154,168,183> with key: <204,218,233>"..keyLibrary.keys[i][3]..".\n")
  end
end

if #keyLibrary.keys > 0 then
if foundSafeKey == 0 then
  send("cast n 'portal' '"..keyLibrary.keys[1][3],false)
  decho("<154,168,183>## NO SAFE KEY, TOOK:<204,218,233>"..keyLibrary.keys[1][1].."<154,168,183> with key:<204,218,233>"..keyLibrary.keys[1][3]..".\n")
end
else
  decho("<154,168,183>## PANIC! No keys available\n")
end
```

#### Alias: krename
regex: ^krename\s+(\S+)\s+(\S+)
```lua
local foundRenameMatch = 0

if utf8.len(matches[3]) > 10 then
decho("<154,168,183>## Key names can be max 10 characters\n")
else
for i=1,#keyLibrary.keys,1 do
  if keyLibrary.keys[i][1] == matches[2] then
    keyLibrary.keys[i][1] = matches[3]
    decho("<154,168,183>## Renamed key: <204,218,233>"..matches[2].."<154,168,183> to <204,218,233>"..matches[3]..".")
    foundRenameMatch = 1
    keyLibrary.showKeys()
  end
end

if foundRenameMatch == 0 then
  decho("<154,168,183>## Couldn't find key: <204,218,233>"..matches[2]..".")
end
end
```

#### Alias: rkey
regex: ^rkey\s+(\S+)\s+(\S+)
```lua
local foundRenameMatch = 0

if utf8.len(matches[3]) > 10 then
decho("<154,168,183>## Key names can be max 10 characters\n")
else
for i=1,#keyLibrary.keys,1 do
  if keyLibrary.keys[i][1] == matches[2] then
    keyLibrary.keys[i][1] = matches[3]
    decho("<154,168,183>## Renamed key: <204,218,233>"..matches[2].."<154,168,183> to <204,218,233>"..matches[3]..".")
    foundRenameMatch = 1
    keyLibrary.showKeys()
  end
end

if foundRenameMatch == 0 then
  decho("<154,168,183>## Couldn't find key: <204,218,233>"..matches[2]..".")
end
end
```

#### Alias: nkey
regex: ^nkey\s+(\S+)\s+(\S+)
```lua
if utf8.len(matches[2]) > 10 then
decho("<154,168,183>## Key names can be max 10 characters\n")
else
keyLibrary.newKey(matches[2], "", matches[3], "")
end
```

#### Alias: kecho
regex: ^kecho\s+(\S+)\s*(\S+)?
```lua
keyLibrary.echoWatchData(matches[2],(tonumber(matches[3]) or nil))
```

#### Alias: teleport
regex: ^teleport\s+\$?(\S+)
```lua
local keyName
local keyID = 0
for i=1,#keyLibrary.keys,1 do
  if keyLibrary.keys[i][1] == matches[2] then
    keyName = keyLibrary.keys[i][3]
    keyID = 1
  end
end

if keyID == 1 then
decho("<154,168,183>## Teleporting to: <204,218,233>"..matches[2].." ("..keyName..")\n")
send ("cast n 'teleport' "..keyName,false)
else
decho("<154,168,183>## Error! No key: <204,218,233>$"..matches[2])
end


```

#### Alias: portal
regex: ^portal\s+\$?(\S+)
```lua
local keyName
local keyID = 0
for i=1,#keyLibrary.keys,1 do
  if keyLibrary.keys[i][1] == matches[2] then
    keyName = keyLibrary.keys[i][3]
    keyID = 1
  end
end

if keyID == 1 then
decho("<154,168,183>## Portaling to: <204,218,233>"..matches[2].." ("..keyName..")\n")
send ("cast n 'portal' "..keyName,false)
else
decho("<154,168,183>## Error! No key: <204,218,233>$"..matches[2])
end


```

## ScriptGroup: keyLibrary 1.1.1
```lua
keyLibrary = keyLibrary or {}
```

### ScriptGroup: tv

#### Script: TVWindows
```lua
 keyLibrary.TV_mcont = keyLibrary.TV_mcont or Adjustable.Container:new({
      name = "TV_mcont",

--      adjLabelstyle = "background-color:rgba(50,50,50,100%);border: 0px solid grey;",
--      buttonstyle=[[
--      QLabel{ border-radius: 3px; background-color: rgba(50,50,50,100%);}
--      QLabel::hover{ background-color: rgba(70,70,70,100%);}
--      ]],


      adjLabelstyle = "background-color:rgba(50,50,50,100%); border: 1px solid grey;border-radius:5px;",
      buttonstyle=[[
      QLabel{ border-radius: 1px; background-color: rgba(0,0,0,0%);}
      QLabel::hover{ background-color: rgba(70,70,70,100%);}
      ]],
      buttonsize=25,
      x="50%", y="33%",
      fontSize = 10,
--      font="Fixedsys",
      titleText = "",
      width=684, height=285,
      padding=0,
      })

keyLibrary.TV_main_cont_title = keyLibrary.TV_main_cont_title or Geyser.Label:new({
  name="TV_main_cont_title",
  x=40, y=1,
  width=200, height=18 ,
  fgColor = "ansiLightBlack",
  font="Lucide Console",
  fontSize=5,
  message = [[TV∙SYSTEM]]
  },keyLibrary.TV_mcont)
  keyLibrary.TV_main_cont_title:setStyleSheet([[background-color: rgba(0,0,0,0%)]])
  keyLibrary.TV_main_cont_title:enableClickthrough ()	
  

keyLibrary.TV_main_cont_inside = keyLibrary.TV_main_cont_inside or Geyser.Container:new({
  name="TV_main_cont_inside",
  x="0%", y=19,
  width="100%", height=-1;
},keyLibrary.TV_mcont)

keyLibrary.TV_FULL = keyLibrary.TV_FULL or Geyser.Container:new({
  name="TV_FULL",
  x="0%", y="0%",
  width="100%", height="100%";
},keyLibrary.TV_main_cont_inside)

keyLibrary.TV_UPP = keyLibrary.TV_UPP or Geyser.Container:new({
  name="TV_UPP",
  x="0%", y="0%",
  width="100%", height="50%";
},keyLibrary.TV_main_cont_inside)

keyLibrary.TV_DOWN = keyLibrary.TV_DOWN or Geyser.Container:new({
  name="TV_DOWN",
  x="0%", y="50%",
  width="100%", height="50%";
},keyLibrary.TV_main_cont_inside)

keyLibrary.TV_UL = keyLibrary.TV_UL or Geyser.Container:new({
  name="TV_UL",
  x="0%", y="0%",
  width="50%", height="50%";
},keyLibrary.TV_main_cont_inside)

keyLibrary.TV_UR = keyLibrary.TV_UR or Geyser.Container:new({
  name="TV_UR",
  x="50%", y="0%",
  width="50%", height="50%";
},keyLibrary.TV_main_cont_inside)

keyLibrary.TV_DL = keyLibrary.TV_DL or Geyser.Container:new({
  name="TV_DL",
  x="0%", y="50%",
  width="50%", height="50%";
},keyLibrary.TV_main_cont_inside)

keyLibrary.TV_DR = keyLibrary.TV_DR or Geyser.Container:new({
  name="TV_DR",
  x="50%", y="50%",
  width="50%", height="50%";
},keyLibrary.TV_main_cont_inside)

keyLibrary.TV_main_cont = keyLibrary.TV_main_cont or {}
keyLibrary.TV_ram = keyLibrary.TV_ram or {}
keyLibrary.TV_ruta = keyLibrary.TV_ruta or {}
keyLibrary.TV_rutalabel = keyLibrary.TV_rutalabel or {}
keyLibrary.TV_rutalabelram = keyLibrary.TV_rutalabelram or {}
keyLibrary.TV_gauge = keyLibrary.TV_gauge or {}
keyLibrary.TV_rutalampa = keyLibrary.TV_rutalampa or {}

-- RUTA 1
keyLibrary.TV_main_cont[1] = keyLibrary.TV_main_cont[1] or Geyser.Container:new({
  name="TV_main_cont_1",
  x="0%", y="0%",
  width="100%", height="100%",
},keyLibrary.TV_FULL)

keyLibrary.TV_ram[1] = keyLibrary.TV_ram[1] or Geyser.Label:new({
  name="TV_ram_1",
  x=5, y=10,
  width=-5, height=-5,
  },keyLibrary.TV_main_cont[1])
  keyLibrary.TV_ram[1]:setStyleSheet([[background-color: rgba(0,0,0,0%);border: 1px solid grey;border-radius: 4px;]])

keyLibrary.TV_ruta[1] = keyLibrary.TV_ruta[1] or Geyser.MiniConsole:new({
  name="TV_ruta_1",
  font="Lucida Console",
  autoWrap=true,
  x=8, y=13,
  fontSize = 8,
  width=-8, height=-8,
},keyLibrary.TV_main_cont[1])
keyLibrary.TV_ruta[1]:setColor(0,0,0)

keyLibrary.TV_rutalabel[1] = keyLibrary.TV_rutalabel[1] or Geyser.Label:new({
  name="TV_rutalabel_1",
  x="50%+1", y=0,
  width=98, height=17,
  fgColor = "white",
--  font="Lucida Console",
  },keyLibrary.TV_main_cont[1])
  keyLibrary.TV_rutalabel[1]:setStyleSheet([[
  background-color: rgba(50,50,50,100%);border-radius:0px;font:bold 6pt "Lucida Console"]])  

keyLibrary.TV_rutalabelram[1] = keyLibrary.TV_rutalabelram[1] or Geyser.Label:new({
  name="TV_rutalabelram_1",
  x="50%", y=10,
  width=100, height=9,
  },keyLibrary.TV_main_cont[1])
  keyLibrary.TV_rutalabelram[1]:setStyleSheet([[background-color: rgba(0,0,0,0%);border-bottom: 1px solid grey;border-left: 1px solid grey;border-right: 1px solid grey;border-radius:0px;]])

keyLibrary.TV_gauge[1] = keyLibrary.TV_gauge[1] or Geyser.Gauge:new({
  name="TV_gauge_1",
  x="50%+1", y=17,
  width="98", height=1},
keyLibrary.TV_main_cont[1])
keyLibrary.TV_gauge[1].back:setStyleSheet([[background-color: rgba(50,50,50,100%)]])
keyLibrary.TV_gauge[1].front:setStyleSheet([[background-color: rgba(255,255,255,100%)]])

keyLibrary.TV_rutalampa[1] = keyLibrary.TV_rutalampa[1] or Geyser.Label:new({
  name="TV_rutalampa_1",
  x="50%+84", y=0,
  width=15, height=17,
  fgColor = "white",
--  font="Lucida Console",
  },keyLibrary.TV_main_cont[1])
  keyLibrary.TV_rutalampa[1]:setStyleSheet([[
  background-color: rgba(50,50,50,100%);border-radius:0px;font:bold 6pt "Lucida Console"]])  
--  TV_rutalampa[1]:setStyleSheet([[
--  background-color: rgba(50,50,50,0%);border-radius:0px;]])

-- RUTA 2
keyLibrary.TV_main_cont[2] = keyLibrary.TV_main_cont[2] or Geyser.Container:new({
  name="TV_main_cont_2",
  x="0%", y="0%",
  width="100%", height="100%",
},keyLibrary.TV_DOWN)

keyLibrary.TV_ram[2] = keyLibrary.TV_ram[2] or Geyser.Label:new({
  name="TV_ram_2",
  x=5, y=10,
  width=-5, height=-5,
  },keyLibrary.TV_main_cont[2])
  keyLibrary.TV_ram[2]:setStyleSheet([[background-color: rgba(0,0,0,0%);border: 1px solid grey;border-radius: 4px;]])

keyLibrary.TV_ruta[2] = keyLibrary.TV_ruta[2] or Geyser.MiniConsole:new({
  name="TV_ruta_2",
  font="Lucida Console",
  autoWrap=true,
  x=8, y=13,
  fontSize = 8,
  width=-8, height=-8,
},keyLibrary.TV_main_cont[2])
keyLibrary.TV_ruta[2]:setColor(0,0,0)

keyLibrary.TV_rutalabel[2] = keyLibrary.TV_rutalabel[2] or Geyser.Label:new({
  name="TV_rutalabel_2",
  x="50%+1", y=0,
  width=98, height=17,
  fgColor = "white",
--  font="Fixedsys",
  },keyLibrary.TV_main_cont[2])
  keyLibrary.TV_rutalabel[2]:setStyleSheet([[
  background-color: rgba(50,50,50,100%);border-radius:0px;font:bold 6pt "Lucida console"]])

keyLibrary.TV_rutalabelram[2] = keyLibrary.TV_rutalabelram[2] or Geyser.Label:new({
  name="TV_rutalabelram_2",
  x="50%", y=10,
  width=100, height=9,
  },keyLibrary.TV_main_cont[2])
  keyLibrary.TV_rutalabelram[2]:setStyleSheet([[background-color: rgba(0,0,0,0%);border-bottom: 1px solid grey;border-left: 1px solid grey;border-right: 1px solid grey;border-radius:0px;]])

keyLibrary.TV_gauge[2] = keyLibrary.TV_gauge[2] or Geyser.Gauge:new({
  name="TV_gauge_2",
  x="50%+1", y=17,
  width="98", height=1},
keyLibrary.TV_main_cont[2])
keyLibrary.TV_gauge[2].back:setStyleSheet([[background-color: rgba(50,50,50,100%)]])
keyLibrary.TV_gauge[2].front:setStyleSheet([[background-color: rgba(255,255,255,100%)]])

keyLibrary.TV_rutalampa[2] = keyLibrary.TV_rutalampa[2] or Geyser.Label:new({
  name="TV_rutalampa_2",
  x="50%+84", y=0,
  width=15, height=17,
  fgColor = "white",
--  font="Fixedsys",
  },keyLibrary.TV_main_cont[2])
  keyLibrary.TV_rutalampa[2]:setStyleSheet([[
  background-color: rgba(50,50,50,100%);border-radius:0px;font:bold 6pt "Lucida Console"]])  
-- RUTA 3

keyLibrary.TV_main_cont[3] = keyLibrary.TV_main_cont[3] or Geyser.Container:new({
  name="TV_main_cont_3",
  x="0%", y="0%",
  width="100%", height="100%",
},keyLibrary.TV_DL)

keyLibrary.TV_ram[3] = keyLibrary.TV_ram[3] or Geyser.Label:new({
  name="TV_ram_3",
  x=5, y=10,
  width=-5, height=-5,
  },keyLibrary.TV_main_cont[3])
  keyLibrary.TV_ram[3]:setStyleSheet([[background-color: rgba(0,0,0,0%);border: 1px solid grey;border-radius: 4px;]])

keyLibrary.TV_ruta[3] = keyLibrary.TV_ruta[3] or Geyser.MiniConsole:new({
  name="TV_ruta_3",
  font="Lucida Console",
  autoWrap=true,
  x=8, y=13,
  fontSize = 8,
  width=-8, height=-8,
},keyLibrary.TV_main_cont[3])
keyLibrary.TV_ruta[3]:setColor(0,0,0)

keyLibrary.TV_rutalabel[3] = keyLibrary.TV_rutalabel[3] or Geyser.Label:new({
  name="TV_rutalabel_3",
  x="50%+1", y=0,
  width=98, height=17,
  fgColor = "white",
--  font="Fixedsys",
  },keyLibrary.TV_main_cont[3])
  keyLibrary.TV_rutalabel[3]:setStyleSheet([[
  background-color: rgba(50,50,50,100%);border-radius:0px;font:bold 6pt "Lucida Console"]])

keyLibrary.TV_rutalabelram[3] = keyLibrary.TV_rutalabelram[3] or Geyser.Label:new({
  name="TV_rutalabelram_3",
  x="50%", y=10,
  width=100, height=9,
  },keyLibrary.TV_main_cont[3])
  keyLibrary.TV_rutalabelram[3]:setStyleSheet([[background-color: rgba(0,0,0,0%);border-bottom: 1px solid grey;border-left: 1px solid grey;border-right: 1px solid grey;border-radius:0px;]])

keyLibrary.TV_gauge[3] = keyLibrary.TV_gauge[3] or Geyser.Gauge:new({
  name="TV_gauge_3",
  x="50%+1", y=17,
  width="98", height=1},
keyLibrary.TV_main_cont[3])
keyLibrary.TV_gauge[3].back:setStyleSheet([[background-color: rgba(50,50,50,100%)]])
keyLibrary.TV_gauge[3].front:setStyleSheet([[background-color: rgba(255,255,255,100%)]])

keyLibrary.TV_rutalampa[3] = keyLibrary.TV_rutalampa[3] or Geyser.Label:new({
  name="TV_rutalampa_3",
  x="50%+84", y=0,
  width=15, height=17,
  fgColor = "white",
--  font="Fixedsys",
  },keyLibrary.TV_main_cont[3])
  keyLibrary.TV_rutalampa[3]:setStyleSheet([[
  background-color: rgba(50,50,50,100%);border-radius:0px;font:bold 6pt "Lucida Console"]])  

-- RUTA 4

keyLibrary.TV_main_cont[4] = keyLibrary.TV_main_cont[4] or Geyser.Container:new({
  name="TV_main_cont_4",
  x="0%", y="0%",
  width="100%", height="100%",
},keyLibrary.TV_DR)

keyLibrary.TV_ram[4] = keyLibrary.TV_ram[4] or Geyser.Label:new({
  name="TV_ram_4",
  x=5, y=10,
  width=-5, height=-5,
  },keyLibrary.TV_main_cont[4])
  keyLibrary.TV_ram[4]:setStyleSheet([[background-color: rgba(0,0,0,0%);border: 1px solid grey;border-radius: 4px;]])

keyLibrary.TV_ruta[4] = keyLibrary.TV_ruta[4] or Geyser.MiniConsole:new({
  name="TV_ruta_4",
  font="Lucida Console",
  autoWrap=true,
  x=8, y=13,
  fontSize = 8,
  width=-8, height=-8,
},keyLibrary.TV_main_cont[4])
keyLibrary.TV_ruta[4]:setColor(0,0,0)

keyLibrary.TV_rutalabel[4] = keyLibrary.TV_rutalabel[4] or Geyser.Label:new({
  name="TV_rutalabel_4",
  x="50%+1", y=0,
  width=98, height=17,
  fgColor = "white",
--  font="Fixedsys",
  },keyLibrary.TV_main_cont[4])
  keyLibrary.TV_rutalabel[4]:setStyleSheet([[
  background-color: rgba(50,50,50,100%);border-radius:0px;font:bold 6pt "Lucida Console"]])

keyLibrary.TV_rutalabelram[4] = keyLibrary.TV_rutalabelram[4] or Geyser.Label:new({
  name="TV_rutalabelram_4",
  x="50%", y=10,
  width=100, height=9,
  },keyLibrary.TV_main_cont[4])
  keyLibrary.TV_rutalabelram[4]:setStyleSheet([[background-color: rgba(0,0,0,0%);border-bottom: 1px solid grey;border-left: 1px solid grey;border-right: 1px solid grey;border-radius:0px;]])

keyLibrary.TV_gauge[4] = keyLibrary.TV_gauge[4] or Geyser.Gauge:new({
  name="TV_gauge_4",
  x="50%+1", y=17,
  width="98", height=1},
keyLibrary.TV_main_cont[4])
keyLibrary.TV_gauge[4].back:setStyleSheet([[background-color: rgba(50,50,50,100%)]])
keyLibrary.TV_gauge[4].front:setStyleSheet([[background-color: rgba(255,255,255,100%)]])

keyLibrary.TV_rutalampa[4] = keyLibrary.TV_rutalampa[4] or Geyser.Label:new({
  name="TV_rutalampa_4",
  x="50%+84", y=0,
  width=15, height=17,
  fgColor = "white",
--  font="Fixedsys",
  },keyLibrary.TV_main_cont[4])
  keyLibrary.TV_rutalampa[4]:setStyleSheet([[
  background-color: rgba(50,50,50,100%);border-radius:0px;font:bold 6pt "Lucida Console"]])  
  
 keyLibrary.TV_mcont:hide()
```

#### Script: TV
```lua
keyLibrary.TVVisible = keyLibrary.TVVisible or 0
keyLibrary.quedWatchCast = keyLibrary.quedWatchCast or {}
keyLibrary.quedScryCast = keyLibrary.quedScryCast or {}
keyLibrary.incomingScryLines = {}
keyLibrary.lastNumberTVKeys = 0
--lastActiveKeyNum = 0
keyLibrary.TVRutaBorderColor = {}
keyLibrary.incomingKeyToSent = {}
keyLibrary.watchBarLeft = {}
keyLibrary.ActiveTVKeys = keyLibrary.ActiveTVKeys or {}

function keyLibrary.showTV(key,toggle) 
if keyLibrary.TVVisible == 0 and toggle == "toggle" then
  keyLibrary.TV_mcont:show()
  keyLibrary.TVVisible = 1
elseif keyLibrary.TVVisible == 1 and toggle == "toggle" then
  keyLibrary.TV_mcont:hide()
  keyLibrary.TVVisible = 0
  return
end

if not keyLibrary.keys then decho("<154,168,183>## Can't start TV-system without any keys in key-library!") end
keyLibrary.flushOldWatches()

local keyName = ""
local keyContent
local keyTVTime
local keyAlreadyActive 
local keyUpTime
local newAKey
local keysWithActiveWatch = 0

-- flusha keys som droppat watch
for i=1,#keyLibrary.keys do
  if keyLibrary.keys[i][6] == 0 and keyLibrary.keys[i][9] == 0 then
    for k=#keyLibrary.ActiveTVKeys,1,-1 do
      if keyLibrary.keys[i][3] == keyLibrary.ActiveTVKeys[k][1] then
        table.remove(keyLibrary.ActiveTVKeys, k)
      end
    end
  else
  keysWithActiveWatch = keysWithActiveWatch + 1
  end
end

-- Om funktionen körs utan keyparameter ska den kolla om alla fönster är aktiva
-- Om lediga fönster finns ska den kolla om det finns keys som watchas men ej är ActiveTVKeys
-- Om så är fallet ta första matchen och lägg till som ActiveTVKey
-- Upprepa tills alla keys gått igenom eller eller ActiveTVKeys == 4

if key == nil and keysWithActiveWatch > #keyLibrary.ActiveTVKeys then
  local freeTVSlots = 4 - #keyLibrary.ActiveTVKeys
  local skapaNyActiveKeyTemp
  if #keyLibrary.ActiveTVKeys < 4 then
    for i=1,#keyLibrary.keys,1 do
      skapaNyActiveKeyTemp = 1
      for p=1,#keyLibrary.ActiveTVKeys,1 do
        if keyLibrary.keys[i][3] == keyLibrary.ActiveTVKeys[p][1] or (keyLibrary.keys[i][6] == 0 and keyLibrary.keys[i][9] == 0) or freeTVSlots < 1 then
        skapaNyActiveKeyTemp = 0
        end
      end   
      if skapaNyActiveKeyTemp == 1 then    
--      cecho("added key to free slot")
      newAKey = #keyLibrary.ActiveTVKeys + 1
      keyLibrary.ActiveTVKeys[newAKey] = keyLibrary.ActiveTVKeys[newAKey] or {}
      keyLibrary.ActiveTVKeys[newAKey][1] = keyLibrary.keys[i][3]
      keyLibrary.ActiveTVKeys[newAKey][2] = keyLibrary.keys[i][7]
      keyLibrary.ActiveTVKeys[newAKey][3] = keyLibrary.keys[i][1]
      keyLibrary.ActiveTVKeys[newAKey][4] = keyLibrary.keys[i][8]
      keyLibrary.ActiveTVKeys[newAKey][5] = keyLibrary.keys[i][6]
      keyLibrary.ActiveTVKeys[newAKey][6] = keyLibrary.keys[i][9] --- <- tid för scry      
      freeTVSlots = freeTVSlots - 1
      end
    end
  end
end


-- flusha ActiveTVKeys som inte finns längre
for i=#keyLibrary.ActiveTVKeys,1,-1 do
  local flushDeletedActiveKeyFanns = 0
  for k=1,#keyLibrary.keys,1 do
    if keyLibrary.keys[k][3] == keyLibrary.ActiveTVKeys[i][1] then
    flushDeletedActiveKeyFanns = 1
    end
  end
  if flushDeletedActiveKeyFanns == 0 then
    table.remove(keyLibrary.ActiveTVKeys, i)
  end
end


if key then
local foundKey = 0
for i=1,#keyLibrary.keys,1 do
  if keyLibrary.keys[i][3] == key then
  keyName = keyLibrary.keys[i][1]
  keyTVTime = keyLibrary.keys[i][7]
  keyContent = keyLibrary.keys[i][8]
  keyUpTime = keyLibrary.keys[i][6]
  keyScryTime = keyLibrary.keys[i][9]
  foundKey = 1
  end
end

if foundKey == 1 then
  keyAlreadyActive = 0
  for i=1,#keyLibrary.ActiveTVKeys,1 do
    if keyLibrary.ActiveTVKeys[i][1] == key then
      keyLibrary.ActiveTVKeys[i][2] = keyTVTime
      keyLibrary.ActiveTVKeys[i][3] = keyName
      keyLibrary.ActiveTVKeys[i][4] = keyContent
      keyLibrary.ActiveTVKeys[i][5] = keyUpTime
      keyLibrary.ActiveTVKeys[i][6] = keyScryTime
      keyAlreadyActive = 1
    end
  end

  if keyAlreadyActive == 0 then
    if #keyLibrary.ActiveTVKeys==4 then
--    cecho("tar bor en")
    table.remove(keyLibrary.ActiveTVKeys, 1)
    end

--cecho("Tut")
  newAKey = #keyLibrary.ActiveTVKeys + 1
  keyLibrary.ActiveTVKeys[newAKey] = keyLibrary.ActiveTVKeys[newAKey] or {}
  keyLibrary.ActiveTVKeys[newAKey][1] = key
  keyLibrary.ActiveTVKeys[newAKey][2] = keyTVTime
  keyLibrary.ActiveTVKeys[newAKey][3] = keyName
  keyLibrary.ActiveTVKeys[newAKey][4] = keyContent
  keyLibrary.ActiveTVKeys[newAKey][5] = keyUpTime
  keyLibrary.ActiveTVKeys[newAKey][6] = keyScryTime
  end
end

end
--    os.time() - ActiveTVKeys[i][2] < 5 and #ActiveTVKeys > 1 then




local fannsShort = 0
if keyLibrary.TVTimerShort then killTimer(keyLibrary.TVTimerShort) end
keyLibrary.watchBarLeft = {}
local tidsDiffen
local tidKvarBarTemp = 0
--display(ActiveTVKeys)
for a=1,#keyLibrary.ActiveTVKeys,1 do
  if keyLibrary.ActiveTVKeys[a][6] ~= 0 and keyLibrary.ActiveTVKeys[a][5] == 0 then
  tidsDiffen = os.time() - keyLibrary.ActiveTVKeys[a][6]
  tidKvarBarTemp = math.ceil(100-((os.time()-keyLibrary.ActiveTVKeys[a][6])*100/30))
  end
  if keyLibrary.ActiveTVKeys[a][5] ~= 0 then
  tidsDiffen = os.time() - keyLibrary.ActiveTVKeys[a][2][#keyLibrary.ActiveTVKeys[a][2]]
  tidKvarBarTemp = math.ceil(100-((os.time()-keyLibrary.ActiveTVKeys[a][5])*100/keyLibrary.watchSpellTimeAverage))
  end
  if tidKvarBarTemp < 1 then tidKvarBarTemp = 0 end
  keyLibrary.watchBarLeft[#keyLibrary.ActiveTVKeys+1-a] = tidKvarBarTemp
  
  --

  if tidsDiffen < 10 then
  fannsShort = 1
  keyLibrary.TVRutaBorderColor[#keyLibrary.ActiveTVKeys+1-a] = "white"
  else
  keyLibrary.TVRutaBorderColor[#keyLibrary.ActiveTVKeys+1-a] = "grey"
  end
  
  

end
if #keyLibrary.ActiveTVKeys > 0 then
keyLibrary.TVTimerShort=tempTimer(1,function() keyLibrary.showTV() end)
end


-- 1 TV-RUTA
if #keyLibrary.ActiveTVKeys == 1 and keyLibrary.lastNumberTVKeys ~= 1 then
--if 1 == 1 then
  keyLibrary.TV_main_cont[1]:changeContainer(keyLibrary.TV_FULL)
  keyLibrary.TV_main_cont[1]:show()
  if keyLibrary.TV_main_cont[2] then keyLibrary.TV_main_cont[2]:hide() end
  if keyLibrary.TV_main_cont[3] then keyLibrary.TV_main_cont[3]:hide() end
  if keyLibrary.TV_main_cont[4] then keyLibrary.TV_main_cont[4]:hide() end
--return
-- 2 TV-RUTA
elseif #keyLibrary.ActiveTVKeys == 2 and keyLibrary.lastNumberTVKeys ~= 2 then
--elseif 1==1 then
  keyLibrary.TV_main_cont[1]:changeContainer(keyLibrary.TV_UPP)
  keyLibrary.TV_main_cont[1]:show()
  keyLibrary.TV_main_cont[2]:changeContainer(keyLibrary.TV_DOWN)
  keyLibrary.TV_main_cont[2]:show()
  if keyLibrary.TV_main_cont[3] then keyLibrary.TV_main_cont[3]:hide() end
  if keyLibrary.TV_main_cont[4] then keyLibrary.TV_main_cont[4]:hide() end
--    TV_gauge[2]:setValue(50,100)
--return
-- 3 TV-RUTA
elseif #keyLibrary.ActiveTVKeys == 3 and keyLibrary.lastNumberTVKeys ~= 3 then
  keyLibrary.TV_main_cont[1]:changeContainer(keyLibrary.TV_UPP)
  keyLibrary.TV_main_cont[1]:show()
  keyLibrary.TV_main_cont[2]:changeContainer(keyLibrary.TV_DL)
  keyLibrary.TV_main_cont[2]:show()
  keyLibrary.TV_main_cont[3]:changeContainer(keyLibrary.TV_DR)
  keyLibrary.TV_main_cont[3]:show()
  if keyLibrary.TV_main_cont[4] then keyLibrary.TV_main_cont[4]:hide() end

-- 4 TV-RUTA
elseif #keyLibrary.ActiveTVKeys == 4 and keyLibrary.lastNumberTVKeys ~= 4 then
  keyLibrary.TV_main_cont[1]:changeContainer(keyLibrary.TV_UL)
  keyLibrary.TV_main_cont[1]:show()
  keyLibrary.TV_main_cont[2]:changeContainer(keyLibrary.TV_UR)
  keyLibrary.TV_main_cont[2]:show()
  keyLibrary.TV_main_cont[3]:changeContainer(keyLibrary.TV_DL)
  keyLibrary.TV_main_cont[3]:show()
  keyLibrary.TV_main_cont[4]:changeContainer(keyLibrary.TV_DR)
  keyLibrary.TV_main_cont[4]:show()

elseif #keyLibrary.ActiveTVKeys == 0 then

  if keyLibrary.TV_main_cont[1] then keyLibrary.TV_main_cont[1]:hide() end
  if keyLibrary.TV_main_cont[2] then keyLibrary.TV_main_cont[2]:hide() end
  if keyLibrary.TV_main_cont[3] then keyLibrary.TV_main_cont[3]:hide() end
  if keyLibrary.TV_main_cont[4] then keyLibrary.TV_main_cont[4]:hide() end

  -- Göm TV automatiskt när alla rutor försvunnit:
  if toggle ~= "toggle" then
    keyLibrary.TV_mcont:hide()
    keyLibrary.TVVisible = 0
    keyLibrary.lastNumberTVKeys = 0
    return
  end
  
end

keyLibrary.lastNumberTVKeys = #keyLibrary.ActiveTVKeys

for i=1,#keyLibrary.ActiveTVKeys,1 do
      keyLibrary.TV_ruta[#keyLibrary.ActiveTVKeys+1-i]:clear()
  for p=1,#keyLibrary.ActiveTVKeys[i][4],1 do
    if os.time() - keyLibrary.ActiveTVKeys[i][2][p] < 10 then
      local gStrangen
      gStrangen = string.gsub(keyLibrary.ActiveTVKeys[i][4][p], "<192,192,192:0,0,0>", "<255,255,255:0,0,0>")
      gStrangen = string.gsub(gStrangen, "<128,0,0:0,0,0>", "<255,0,0:0,0,0>")
      gStrangen = string.gsub(gStrangen, "<0,143,143:0,0,0>", "<0,255,255:0,0,0>")
      gStrangen = string.gsub(gStrangen, "<0,128,0:0,0,0>", "<0,255,0:0,0,0>")
      keyLibrary.TV_ruta[#keyLibrary.ActiveTVKeys+1-i]:decho(gStrangen.."\n") -- <- reg grey
    else
      keyLibrary.TV_ruta[#keyLibrary.ActiveTVKeys+1-i]:decho(string.gsub(keyLibrary.ActiveTVKeys[i][4][p], "<192,192,192:0,0,0>", "<112,128,144:0,0,0>").."\n")
    end
  keyLibrary.TV_rutalabel[#keyLibrary.ActiveTVKeys+1-i]:clear()
  keyLibrary.TV_rutalabel[#keyLibrary.ActiveTVKeys+1-i]:decho(string.upper("<center><180,180,180>"..keyLibrary.ActiveTVKeys[i][3]..""))
  end
  keyLibrary.TV_gauge[i]:setValue(keyLibrary.watchBarLeft[i],100)
  keyLibrary.TV_rutalabelram[i]:setStyleSheet([[background-color: rgba(0,0,0,0%);border-bottom: 1px solid ]]..keyLibrary.TVRutaBorderColor[i]..[[;border-left: 1px solid ]]..keyLibrary.TVRutaBorderColor[i]..[[;border-right: 1px solid ]]..keyLibrary.TVRutaBorderColor[i]..[[;border-radius:0px;]])
  keyLibrary.TV_ram[i]:setStyleSheet([[background-color: rgba(0,0,0,0%);border: 1px solid ]]..keyLibrary.TVRutaBorderColor[i]..[[;border-radius: 4px;]])

  keyLibrary.TV_rutalampa[i]:clear()
  if keyLibrary.ActiveTVKeys[#keyLibrary.ActiveTVKeys+1-i][5] ~= 0 then
    if (os.time() % 2 == 0) then
    keyLibrary.TV_rutalampa[i]:decho("<center><255,0,0>●")
    else
    keyLibrary.TV_rutalampa[i]:clear()
    end
  elseif keyLibrary.ActiveTVKeys[#keyLibrary.ActiveTVKeys+1-i][6] ~= 0 then
    if (os.time() % 2 == 0) then
    keyLibrary.TV_rutalampa[i]:decho("<center><255,0,0>ꞁꞁ")
    else
    keyLibrary.TV_rutalampa[i]:clear()
    end
  end
  

end


-- EOF
end


```

#### Script: flushOldWatches&Scrys
```lua
function keyLibrary.flushOldWatches()
local retur
for i=1,#keyLibrary.keys,1 do
  if keyLibrary.keys[i][6] ~= 0 then
	 if os.time() - keyLibrary.keys[i][6] > 300 then
      keyLibrary.keys[i][6] = 0
      retur = true
	 end
  end
  if keyLibrary.keys[i][9] ~= 0 then
	 if os.time() - keyLibrary.keys[i][9] > 60 then
      keyLibrary.keys[i][9] = 0
      retur = true
	 end
  end
end
if retur == true then
keyLibrary.showTV()
keyLibrary.showKeys()
end
end
```

#### Script: scriptresetScryTimer
```lua
function keyLibrary.resetScryTimer(keyNumber)
if keyLibrary.keys[keyNumber] then
  keyLibrary.keys[keyNumber][9] = 0
  keyLibrary.showTV()
end
end
```

#### Script: Get and check keys
```lua
-- Returns key for keyname. If no match returns false. if watched returns "watchad"
function keyLibrary.getWatchKey(keyName)
for i=1,#keyLibrary.keys,1 do
  if keyLibrary.keys[i][1] == keyName and keyLibrary.keys[i][6] == 0 then
    return keyLibrary.keys[i][3]
  end
  if keyLibrary.keys[i][1] == keyName and keyLibrary.keys[i][6] ~= 0 then
  return("watchad")
  end
end
return false
end

function keyLibrary.getScryKey(keyName)
for i=1,#keyLibrary.keys,1 do
  if keyLibrary.keys[i][1] == keyName then
    return keyLibrary.keys[i][3]
  end
end
return false
end


-- returns true if key exits and is watched. otherwise false.
function keyLibrary.checkIfWatched(keyName)
if keyLibrary.getWatchKey(keyName) then
for i=1,#keyLibrary.keys,1 do
  if keyLibrary.keys[i][1] == keyName and keyLibrary.keys[i][6] ~= 0 then
    return true
  end
end
end
return false
end
```

#### Script: send Scry to TV
```lua
function keyLibrary.sendScryToTV()

local sentScryToTV = 0
for i=1,#keyLibrary.keys,1 do
  if keyLibrary.keys[i][1] == keyLibrary.spellQue[1] then
  sentScryToTV = 1
--cecho("\nSAPPA\n")
    for k=1,#keyLibrary.incomingScryLines,1 do
      keyLibrary.keys[i][7][#keyLibrary.keys[i][7]+1] = os.time()
      keyLibrary.keys[i][8][#keyLibrary.keys[i][8]+1] = keyLibrary.incomingScryLines[k]
      if #keyLibrary.keys[i][8] > 250 then
        table.remove(keyLibrary.keys[i][7], 1)
        table.remove(keyLibrary.keys[i][8], 1)
      end
    end  
  keyLibrary.keys[i][9]=os.time()
  tempTimer(31,function() keyLibrary.resetScryTimer(i) end)
  keyLibrary.TVVisible = 0
  keyLibrary.showTV(keyLibrary.keys[i][3],"toggle")


  decho("<154,168,183>## Scried room: <204,218,233>"..keyLibrary.spellQue[1].." <154,168,183>and sent to TV-system.\n")
  end
end

if sentScryToTV == 1 then
keyLibrary.removeFromSpellQue()
end

end

--display(incomingScryLines)
```

#### Script: activateWatchTV
```lua

function keyLibrary.activateWatchTV()
local activatedWatch = 0
for i=1,#keyLibrary.keys,1 do
  if keyLibrary.keys[i][1] == keyLibrary.spellQue[1] then
  moveCursor(0,getLineCount())
  deleteLine()
  decho("<154,168,183>## Activated TV surveillance on: <204,218,233>"..keyLibrary.spellQue[1].."<154,168,183> with key:<204,218,233> "..keyLibrary.keys[i][3])
--  removeFromSpellQue()
  activatedWatch = 1
    keyLibrary.keys[i][6] = os.time()
    keyLibrary.keys[i][7][#keyLibrary.keys[i][7]+1] = os.time()
    keyLibrary.keys[i][8][#keyLibrary.keys[i][8]+1] = "#TV online"
    keyLibrary.TVVisible = 0
    keyLibrary.showTV(keyLibrary.keys[i][3],"toggle")
    keyLibrary.showKeys()
  end
end

if activatedWatch == 1 then
  keyLibrary.removeFromSpellQue()
  end
end
```

#### Script: sendWatchLineToTv
```lua
function keyLibrary.sendWatchLineToTv(key,content)

for i=1,#keyLibrary.keys,1 do
--cecho("sending one")
  if keyLibrary.keys[i][1] == key and keyLibrary.keys[i][6] ~= 0 then
    keyLibrary.keys[i][7][#keyLibrary.keys[i][7]+1] = os.time()
    keyLibrary.keys[i][8][#keyLibrary.keys[i][8]+1] = copy2decho(content)
--    keyLibrary.incomingKeyToSent[#keyLibrary.incomingKeyToSent+1] = key
    
    -- limit datarows to increase performance?
    if #keyLibrary.keys[i][8] > 250 then
      table.remove(keyLibrary.keys[i][7], 1)
      table.remove(keyLibrary.keys[i][8], 1)
    end
    moveCursor(0,getLineCount())
    deleteLine()

  end
end
end
```

#### Script: dropWatches
```lua
function keyLibrary.dropWatch(key)

for i=1,#keyLibrary.keys,1 do
  if keyLibrary.keys[i][1] == key then
    keyLibrary.keys[i][6] = 0
    moveCursor(0,getLineCount())
    deleteLine()
    decho("<154,168,183>## Dropped surveillance on key name: <204,218,233>"..keyLibrary.keys[i][1].."\n")
    keyLibrary.showKeys()
--    showTV()
  end
end

end
```

#### Script: Spell Que system
```lua
keyLibrary.spellQue = keyLibrary.spellQue or {}
keyLibrary.spellQuedCastOngoing = 0
keyLibrary.timedSpellQueFlush = keyLibrary.timedSpellQueFlush or 0
function keyLibrary.addToSpellQue(target)
if target then
--cecho("# added "..target.." to spellque\n") 
keyLibrary.spellQuedCastOngoing = 1
keyLibrary.spellQue[#keyLibrary.spellQue+1] = target
--display(spellQue)

end
if keyLibrary.timedSpellQueFlush then killTimer(keyLibrary.timedSpellQueFlush) end
keyLibrary.timedSpellQueFlush = tempTimer(10,function () keyLibrary.resetSpellQue() end)
end

function keyLibrary.removeFromSpellQue()
if #keyLibrary.spellQue > 0 then
--cecho("# Removed "..spellQue[1].." from spellque\n") 
  table.remove(keyLibrary.spellQue, 1)
end
if #keyLibrary.spellQue == 0 then
keyLibrary.spellQuedCastOngoing = false
end
end

function keyLibrary.resetSpellQue()
keyLibrary.spellQue = {}
end

registerAnonymousEventHandler("sysDataSendRequest", "keyLibrary.spellQueCancelNLEvent")
function keyLibrary.spellQueCancelNLEvent(_, command) 
  if keyLibrary.spellQuedCastOngoing then
    if command == "" then
    keyLibrary.removeFromSpellQue()
    end
  end  
end
```

#### Script: Store and load Active TV:s
```lua
registerAnonymousEventHandler("sysExitEvent", "keyLibrary.saveTVOnExit") 
function keyLibrary.saveTVOnExit()
table.save(getMudletHomeDir().."/ActiveTVKeys.lua", keyLibrary.ActiveTVKeys)
end

registerAnonymousEventHandler("sysLoadEvent", "keyLibrary.loadTVOnConnect") 
function keyLibrary.loadTVOnConnect()
table.load(getMudletHomeDir().."/ActiveTVKeys.lua", keyLibrary.ActiveTVKeys)
end

registerAnonymousEventHandler("sysConnectionEvent", "keyLibrary.flushWatchesOnConnect") 
function keyLibrary.flushWatchesOnConnect()
keyLibrary.flushOldWatches()
end
```

#### Script: echoWatch&Scry Data
```lua
function keyLibrary.echoWatchData(keyName,rows)
if not rows then rows = 30 end

if #keyLibrary.keys<1 then
    decho("<154,168,183>## There are no keys in the library!\n")
    return false
end

local foundkey = 0

for i=1,#keyLibrary.keys,1 do
  if keyLibrary.keys[i][1] == keyName then
  foundkey = 1
    if #keyLibrary.keys[i][8] > 0 then
      if rows > #keyLibrary.keys[i][8] then
      rows = #keyLibrary.keys[i][8]
      end
        decho("<60,60,60>┌"..string.rep("─",#keyName+6).."┐\n")
        for p=#keyLibrary.keys[i][8]-rows+1,#keyLibrary.keys[i][8],1 do
        decho("<60,60,60>│<130,130,130>"..keyName.." <100,100,100>"..os.date("%H:%M", keyLibrary.keys[i][7][p]))   
        decho("<60,60,60>│ "..keyLibrary.keys[i][8][p].."\n")   
        end
        decho("<60,60,60>└"..string.rep("─",#keyName+6).."┘\n")
    else
    decho("<154,168,183>## There is no data for key: <204,218,233>"..keyName.."\n")
    return
    end
  end
end

if foundkey == 0 then
    decho("<154,168,183>## The key doesn't exist: <204,218,233>"..keyName.."\n")
    return
end

end
```

### ScriptGroup: keyManager

#### Script: pickKey
```lua
keyLibrary.showPickKeyWidth = keyLibrary.showPickKeyWidth or "68c"
keyLibrary.showPickKeyX = keyLibrary.showPickKeyX or "45%"
keyLibrary.showPickKeyY = keyLibrary.showPickKeyY or "18%"
keyLibrary.pickKeyrader = keyLibrary.pickKeyrader or 0

keyLibrary.pickKeyAContainer = keyLibrary.pickKeyAContainer or Adjustable.Container:new({
      name = "pickKeyAContainer",
      adjLabelstyle = "background-color:rgba(50,50,50,100%); border: 0px;border-radius:5px;",
      buttonstyle=[[
      QLabel{ border-radius: 1px; background-color: rgba(70,70,70,0%);}
      QLabel::hover{ background-color: rgba(70,70,70,100%);}
      ]],
      buttonsize=25,
      x="20%", y="25%",
--      fontSize = 10,
      width="68c", height="4c",
    padding = 0,
      })


keyLibrary.pickKeyRegContainer = keyLibrary.pickKeyRegContainer or Geyser.Container:new({
  name="pickKeyRegContainer",
  x="0%", y="0%",
  width="100%", height="100%";
},keyLibrary.pickKeyAContainer)


keyLibrary.pBorderLabel = keyLibrary.pBorderLabel or Geyser.Label:new({
  name="pBorderLabel",
  x=1, y=1,
  width=-1, height=-1 ,
  },keyLibrary.pickKeyRegContainer)
  keyLibrary.pBorderLabel:setStyleSheet([[
  background-color: rgba(50,50,50,0%);border: 1px solid grey;border-radius:5px;]])
  keyLibrary.pBorderLabel:enableClickthrough ()	
  
keyLibrary.pRutana = keyLibrary.pRutana or Geyser.MiniConsole:new({
  name="pRutana",
--  font="Lucida Console",
  autoWrap=true,
  x=3, y="2c",
--  fontSize = 16,
  width=-3, height=-3,
},keyLibrary.pickKeyRegContainer)
--pRutana:setFontSize(24)
	
keyLibrary.pRubrika = keyLibrary.pRubrika or Geyser.Label:new({
  name="pRubrika",
  x=3, y=2,
  width=-3, height="1c",
  fgColor = "white",
  },keyLibrary.pickKeyRegContainer)
   keyLibrary.pRubrika:setStyleSheet([[
  background-color: rgba(50,50,50,100%)]])
  keyLibrary.pRubrika:enableClickthrough ()	
--pRubrika:raise()

keyLibrary.pHelper = keyLibrary.pHelper or Geyser.Label:new({
  name="pHelper",
  x=3, y="-1c",
  width=-3, height="1c",
  },keyLibrary.pickKeyRegContainer)
   keyLibrary.pHelper:setStyleSheet([[
  background-color: rgba(50,50,50,0%)]])
--   pHelper:setStyleSheet([[
--  background-color: rgba(50,50,50,0%);font:normal 7pt "Lucida Console"]])
  keyLibrary.pHelper:decho("<center><i>alt+arrowkeys: select • alt+enter: ok • alt+q: exit")

  keyLibrary.pHelper:enableClickthrough ()	


keyLibrary.pRubrika:setColor(50,50,50)
keyLibrary.pRutana:setColor(50,50,50)

--pickKeyContainer:flash()
keyLibrary.pickKeyAContainer:hide()

function keyLibrary.pickKey(numberLocates)
if numberLocates then
keyLibrary.pickKeyrader = numberLocates+7
end
local raderString = keyLibrary.pickKeyrader
local raderString = ""..keyLibrary.pickKeyrader.."c"

keyLibrary.pickKeyRegContainer:resize ("100%",raderString)	
keyLibrary.pickKeyAContainer:show()


keyLibrary.pRutana:clear()
keyLibrary.pRubrika:clear()

keyLibrary.pRubrika:decho([[<center><189,189,189>PICK KEY FOR: <218,218,218>]]..string.upper(keyLibrary.locateTempArray[1][1])..[[</center>]])
local a=0
keyLibrary.pRutana:decho("  MOB"..string.rep(" ",25).."ROOM-TYPE"..string.rep(" ",5).."DISTANCE"..string.rep(" ",2).."KEY".."\n")
keyLibrary.pRutana:decho(" ")
keyLibrary.pRutana:decho(string.rep("─",65).."\n")

local pickString
for i=1,#keyLibrary.locateTempArray do
a=i
if keyLibrary.locateTempArray[i][7]==0 then
pickString = "<104,118,133> "
  
elseif keyLibrary.locateTempArray[i][7]==1 then
pickString = "<218,218,218>●"
end

dechoLink("pRutana",pickString.." "..keyLibrary.locateTempArray[i][2]..string.rep(" ",25-utf8.len(keyLibrary.locateTempArray[i][2])).." - "..keyLibrary.locateTempArray[i][3]..string.rep(" ",14-utf8.len(keyLibrary.locateTempArray[i][3]))..""..keyLibrary.locateTempArray[i][4]..string.rep(" ",9-utf8.len(keyLibrary.locateTempArray[i][4])).." "..keyLibrary.locateTempArray[i][5].."\n", function() keyLibrary.bajs(i) end, "", true)
end
keyLibrary.pRutana:decho("\n")
dechoLink("pRutana",string.rep(" ",29).."<218,218,218>◄ OK ►",function () keyLibrary.acceptPick() end, "", true)

end

function keyLibrary.acceptPick()
for i=1,#keyLibrary.locateTempArray,1 do
  if keyLibrary.locateTempArray[i][7] == 1 then

    keyLibrary.newKey(keyLibrary.locateTempArray[i][1],keyLibrary.locateTempArray[i][3],keyLibrary.locateTempArray[i][5])
    keyLibrary.pickKeyAContainer:hide()
  end
end
--    flushLocateArray()
end

function keyLibrary.bajs(i)
if keyLibrary.locateTempArray[i][7] == 1 then
keyLibrary.locateTempArray[i][7] = 0
else
  for p=1,#keyLibrary.locateTempArray, 1 do
  keyLibrary.locateTempArray[p][7] = 0
  end
  keyLibrary.locateTempArray[i][7] = 1
end
keyLibrary.pickKey()
end


function keyLibrary.downKeys()
local arKeySelected = 0
for i=#keyLibrary.locateTempArray,1,-1 do
  if keyLibrary.locateTempArray[i][7]==1 then
  arKeySelected = 1
    if i ~= #keyLibrary.locateTempArray then
      keyLibrary.locateTempArray[i][7]=0
      keyLibrary.locateTempArray[i+1][7]=1
    end
  end
end

if arKeySelected == 0 then
keyLibrary.locateTempArray[1][7] = 1
end
keyLibrary.pickKey()
end

function keyLibrary.upKeys()
local arKeySelected = 0
for i=1,#keyLibrary.locateTempArray,1 do
  if keyLibrary.locateTempArray[i][7]==1 then
  arKeySelected = 1
    if i ~= 1 then
      keyLibrary.locateTempArray[i][7]=0
      keyLibrary.locateTempArray[i-1][7]=1
    end
  end
end
if arKeySelected == 0 then
keyLibrary.locateTempArray[1][7] = 1
end
  keyLibrary.pickKey()
end

```

#### Script: keyManager
```lua
keyLibrary.locateID=""
keyLibrary.locateTempArray={}
keyLibrary.locateMatches=0
keyLibrary.keyExpireTime=43200
keyLibrary.keyExpireTimer=tempTimer(300,function() keyLibrary.delOldKeys() keyLibrary.showTV() end)
keyLibrary.keys = keys or {}
keyLibrary.watchSpellTimeArray = {}
keyLibrary.watchSpellTimeAverage = keyLibrary.watchSpellTimeAverage or 200
--keys[1] = keys[1] or 0

function keyLibrary.newKey(ID, roomType, keyName, range)
--if not keys or not keys[1] then genKeyArray() end
keyLibrary.addKeyArray(ID,roomType,keyName, range)
keyLibrary.showKeys()
end

function keyLibrary.delOldKeys()
--local numK = #keys
local toDel = {}
local numDeleted = 0
local returen = nil

for i=1,#keyLibrary.keys,1 do
  if os.time()-keyLibrary.keys[i][4] > keyLibrary.keyExpireTime then
    if keyLibrary.keys[i][5] == 1 and #keyLibrary.keys >1 then
      if i == 1 then
        keyLibrary.keys[2][5] = 1
      else
      keyLibrary.keys[1][5] =1
      end
    end
  toDel[i]=1
--  table.remove(keys, i)
  else
  toDel[i]=0
  end
end

for p=#toDel,1,-1 do
  if toDel[p] == 1 then
  numDeleted = numDeleted + 1
  table.remove(keyLibrary.keys, p)
  returen = true
  end
end
if returen then
keyLibrary.showKeys()
end
end

function keyLibrary.genKeyArray()
keyLibrary.keys = {}          -- create the matrix
for i=1,1 do
  keyLibrary.keys[i] = {}     -- create a new row
  for j=1,5 do
    keyLibrary.keys[i][j] = 0
  end
end
end


function keyLibrary.addKeyArray(ID, roomType, keyName, range)
if not keyLibrary.keys then keyLibrary.keys = {} end
local wroteKey = 0
local safeKeyExists = 0
for p=1,#keyLibrary.keys,1 do
  if keyLibrary.keys[p][5] == 1 then
  safeKeyExists = 1
  end
end

for i=1,#keyLibrary.keys do
  if keyLibrary.keys[i][1] == ID or #keyLibrary.keys == 0 then  -- ##OSÄKER?  var innan keys[1] == 0
    keyLibrary.keys[i][1]=ID
    keyLibrary.keys[i][2]=roomType
    keyLibrary.keys[i][3]=keyName
    keyLibrary.keys[i][4]=os.time()
      if safeKeyExists == 1 and keyLibrary.keys[i][5] == 1 then
      keyLibrary.keys[i][5] = 1
      elseif safeKeyExists == 1 and keyLibrary.keys[i][5] == 0 then
      keyLibrary.keys[i][5] = 0
      elseif safeKeyExists == 0 then
      keyLibrary.keys[i][5] = 1
      end
    keyLibrary.keys[i][6]=0
    keyLibrary.keys[i][7] = keyLibrary.keys[i][7] or {}
    keyLibrary.keys[i][8] = keyLibrary.keys[i][8] or {}
    keyLibrary.keys[i][9]=0    
    wroteKey = 1

  end
end

local sistaKey
if wroteKey == 0 then
      sistaKey = #keyLibrary.keys+1
      keyLibrary.keys[sistaKey]={}
      keyLibrary.keys[sistaKey][1]=ID
      keyLibrary.keys[sistaKey][2]=roomType
      keyLibrary.keys[sistaKey][3]=keyName
      keyLibrary.keys[sistaKey][4]=os.time()
        if safeKeyExists == 1 then
        keyLibrary.keys[sistaKey][5] = 0
        else
        keyLibrary.keys[sistaKey][5] = 1
        end
      keyLibrary.keys[sistaKey][6]=0
      keyLibrary.keys[sistaKey][7] = keyLibrary.keys[sistaKey][7] or {}
      keyLibrary.keys[sistaKey][8] = keyLibrary.keys[sistaKey][8] or {}
      keyLibrary.keys[sistaKey][9]=0    

end

local rangeText = ""
if range then 
rangeText = "<154,168,183> distance was: <204,218,233>"..string.upper(range) 
end
decho("<154,168,183>## Key stored: <204,218,233>$"..ID.." ("..keyName..")"..rangeText.."\n")
end

function keyLibrary.deleteKey(key)
local foundDeleteKey = 0
local foundSafeKey = 0
--for i=1,#keys,1 do
for i=#keyLibrary.keys,1,-1 do
  if keyLibrary.keys[i][1] == key then
  foundDeleteKey = 1
    if keyLibrary.keys[i][5] == 1 and #keyLibrary.keys >1 then
      if i == 1 then
       keyLibrary.keys[2][5] = 1
      else
      keyLibrary.keys[1][5] =1
      end
    end
  table.remove(keyLibrary.keys, i)
  decho("<154,168,183>## Deleted key: <204,218,233>"..key..".\n")

  keyLibrary.showKeys()
  end  
end
if foundDeleteKey == 0 then
  decho("<154,168,183>## Couldn't find key: <204,218,233>"..key..".\n")
end
end

function keyLibrary.flushLocateArray()

for k=1,#keyLibrary.locateTempArray,1 do
  for p=1,#keyLibrary.locateTempArray[k] do
    keyLibrary.locateTempArray[k][p]=nil
  end
  keyLibrary.locateTempArray[k]=nil
end
end



registerAnonymousEventHandler("sysExitEvent", "keyLibrary.saveKeysOnExit") 
function keyLibrary.saveKeysOnExit()
table.save(getMudletHomeDir().."/keys.lua", keyLibrary.keys)
end

registerAnonymousEventHandler("sysLoadEvent", "keyLibrary.loadKeysOnConnect") 
function keyLibrary.loadKeysOnConnect()
table.load(getMudletHomeDir().."/keys.lua", keyLibrary.keys)
end



registerAnonymousEventHandler("sysConnectionEvent", "keyLibrary.flushKeysOnConnect") 
function keyLibrary.flushKeysOnConnect()
keyLibrary.flushOldWatches()
end
```

#### Script: showKeys
```lua
keyLibrary.showKeysWindow = 0

keyLibrary.showKeysCont = keyLibrary.showKeysCont or Adjustable.Container:new({
      name = "showKeysCont",
      adjLabelstyle = "background-color:rgba(50,50,50,0%);border: 0px solid grey;",
      buttonstyle=[[
      QLabel{ border-radius: 3px; background-color: rgba(0,0,0,0%);}
      QLabel::hover{ background-color: rgba(70,70,70,100%);}
      ]],
      buttonsize=25,
--      x="50%", y="70%",
      x="50%", y="70%",
      fontSize = 10,
      titleText = "",
      width="62c", height="4c",
    padding = 0,
      })
      keyLibrary.showKeysCont:setAbsolute (false, false)
      keyLibrary.showKeysCont:hide()

keyLibrary.showTopContainer = keyLibrary.showTopContainer or Geyser.Container:new({
  name="showTopContainer",
  x="0%", y="0%",
--  fontSize = 16,
  width="100%", height=50;
},keyLibrary.showKeysCont)



keyLibrary.showKeysBorderLabelTop = keyLibrary.showKeysBorderLabelTop or Geyser.Label:new({
  name="showKeysBorderLabelTop",
  x=1, y=1,
  width=-1, height=-1 ,
  },keyLibrary.showTopContainer)
  keyLibrary.showKeysBorderLabelTop:setStyleSheet([[
  background-color: rgba(50,50,50,100%);border-left: 1px solid grey;border-right: 1px solid grey;border-top: 1px solid grey;border-top-left-radius: 5px;border-top-right-radius: 5px;border-bottom-left-radius: 0px;border-bottom-right-radius: 0px]])
  keyLibrary.showKeysBorderLabelTop:enableClickthrough ()	


keyLibrary.showKeysRegContainer = keyLibrary.showKeysRegContainer or Geyser.Container:new({
  name="showKeysRegContainer",
  x="0%", y=32,
  fontSize = 10,
  width="100%", height="100%";
},keyLibrary.showKeysCont)

keyLibrary.showKeysBorderLabel = keyLibrary.showKeysBorderLabel or Geyser.Label:new({
  name="showKeysBorderLabel",
  x=1, y=1,
  width=-1, height=-1 ,
  },keyLibrary.showKeysRegContainer)
  keyLibrary.showKeysBorderLabel:setStyleSheet([[
  background-color: rgba(50,50,50,100%);border-left: 1px solid grey;border-right: 1px solid grey;border-bottom: 1px solid grey;border-top-left-radius: 0px;border-top-right-radius: 0px;border-bottom-left-radius: 5px;border-bottom-right-radius: 5px]])
  keyLibrary.showKeysBorderLabel:enableClickthrough ()	

keyLibrary.showKeysConsole = keyLibrary.showKeysConsole or Geyser.MiniConsole:new({
  name="showKeysConsole",
--  font="Lucide Console",
  autoWrap=true,
  x=7, y=0,
--  fontSize = 16,
  width=-7, height=-2,
},keyLibrary.showKeysRegContainer)
keyLibrary.showKeysConsole:setColor(50,50,50)
--showKeysConsole:setFontSize(16)


keyLibrary.showKeysRubrik = keyLibrary.showKeysRubrik or Geyser.Label:new({
  name="showKeysRubrik",
  x=40, y=1,
  width=200, height=18,
  fgColor = "ansiLightBlack",
  font="Lucide Console",
  fontSize=5,
  message = [[LOCATE⁯∙KEY⁯∙LIBRARY]]
  },keyLibrary.showTopContainer)
   keyLibrary.showKeysRubrik:setStyleSheet([[background-color: rgba(50,50,50,0%)]])
--font:normal 5pt "Lucida Console"  
  
--showKeysRubrik:decho([[<center><255,255,255>hahaha</center>]])
--<218,218,218>
keyLibrary.showKeysRubrik:enableClickthrough ()	

keyLibrary.showKeysHelpLabel = keyLibrary.showKeysHelpLabel or Geyser.Label:new({
  name="showKeysHelpLabel",
  x=-150, y=7,
  width="5c", height="1c",
  fgColor = "white",
  font="Lucide Console",
  },keyLibrary.showTopContainer)
   keyLibrary.showKeysHelpLabel:setStyleSheet([[
  background-color: rgba(70,70,70,100%);font:normal 5pt "Lucida Console";border-radius:5px]])
keyLibrary.showKeysHelpLabel:decho([[<center><218,218,218>Help</center>]])
--<218,218,218>
keyLibrary.showKeysHelpLabel:raise()
keyLibrary.showKeysHelpLabel:setClickCallback("keyLibrary.echoKeysHelp")	
keyLibrary.showKeysHelpLabel:setOnEnter ("keyLibrary.helpBGHL", ...)	
keyLibrary.showKeysHelpLabel:setOnLeave ("keyLibrary.helpBGBACK", ...)	



function keyLibrary.showKeys(toggle)
keyLibrary.flushOldWatches()
keyLibrary.delOldKeys()
--keyExpireTimer= keyExpireTimer or tempTimer(300,function() delOldKeys() end)

local showKeysRader
if keyLibrary.keys then
showKeysRader = #keyLibrary.keys+3
else 
--cecho("B")
showKeysRader = 5 
end
showKeysRader = ""..showKeysRader.."c"


keyLibrary.showKeysRegContainer:resize ("100%",showKeysRader)	

if keyLibrary.showKeysWindow == 0 and toggle == "toggle" then
  keyLibrary.showKeysCont:show()
  keyLibrary.showKeysWindow = 1
--  showKeysOpen = 1
elseif keyLibrary.showKeysWindow == 1 and toggle == "toggle" then
  keyLibrary.showKeysWindow = 0
--  showKeysOpen = 0
  keyLibrary.showKeysCont:hide()
  return nil
end


keyLibrary.showKeysConsole:clear()
keyLibrary.showKeysConsole:decho("<189,189,189>   ID"..string.rep(" ",11-2).."ROOM-TYPE"..string.rep(" ",19-9).."KEY"..string.rep(" ",13-3).."EXPIRE".."\n")
keyLibrary.showKeysConsole:decho(string.rep("─",60).."\n")
for i=1,#keyLibrary.keys,1 do

  if keyLibrary.keys[i][5] == 1 then
  hemSymbol = "<0,255,0>☻"
  elseif keyLibrary.keys[i][5] == 0 then
  hemSymbol = " "
  end
  
  if keyLibrary.keys[i][6] then
  if keyLibrary.keys[i][6] ~= 0 then
  watchSymbol = "<255,0,0>● "
  elseif keyLibrary.keys[i][6] == 0 then
  watchSymbol = "  "
  end
  end

  local diff = keyLibrary.keyTimeLeft(keyLibrary.keys[i][4])
  
  local addedColorEffect

  if keyLibrary.keyShowTimer then killTimer(keyLibrary.keyShowTimer) end
  if os.time() - keyLibrary.keys[i][4] < 4 then

  addedColorEffect = "<255,255,255>"
  keyLibrary.keyShowTimer = tempTimer(1,function() keyLibrary.showKeys() end)  
  else
  addedColorEffect = "<104,118,133>"
  end
  
  dechoLink("showKeysConsole",""..hemSymbol..watchSymbol.."<218,218,218>$"..keyLibrary.keys[i][1]..addedColorEffect..string.rep(" ",10-utf8.len(keyLibrary.keys[i][1]))..keyLibrary.keys[i][2]..string.rep(" ",19-utf8.len(keyLibrary.keys[i][2]))..keyLibrary.keys[i][3]..string.rep(" ",13-utf8.len(keyLibrary.keys[i][3]))..diff..string.rep(" ",6-#diff),function () keyLibrary.safePicker(i) end, "", true)
  dechoLink("showKeysConsole","<255,0,0><delete>".."\n",function () keyLibrary.slaeng(i) end, "", true)
end



end


function keyLibrary.safePicker(i)
  if keyLibrary.keys[i][5] == 1 then
  else
    for p=1,#keyLibrary.keys,1 do
    keyLibrary.keys[p][5] = 0
    end
    keyLibrary.keys[i][5] = 1
    decho("<154,168,183>## Safe-key set to: <204,218,233>$"..keyLibrary.keys[i][1]..".\n")
  end
keyLibrary.showKeys()
end


function keyLibrary.slaeng(i)
keyLibrary.deleteKey(keyLibrary.keys[i][1])
--table.remove(keys, i)
--showKeys()
end

function keyLibrary.filterEmpty(item)
  if item == nil then
    return false
  else
    return true
  end
end


function keyLibrary.keyTimeLeft(time)
local diff = os.time() - time
diff= math.floor(diff / 3600)
diff = keyLibrary.keyExpireTime/3600 - diff
diff = diff.." h"
return diff
end


function keyLibrary.echoKeysHelp()
decho("\n##    <220,220,220>KEY LIBRARY AND TV MONITORING SYSTEM\n")
decho("##\n")
decho("#\n")
decho("#     <220,220,220>DESCRIPTION:\n")
decho("#\n")
decho("#     <154,168,183>This application will aid you with capturing, storing and utilizing\n")
decho("#     <154,168,183>your port keys. It comes with an integrated TV monitoring system.\n")
decho("#\n")
decho("#     <220,220,220>COMMANDS:\n")
decho("#\n")
decho("#     <204,218,233>keys                    <154,168,183>Toggles the key library window\n")
decho("#     <204,218,233>rkey <key> <keyname>    <154,168,183>Renames existing <key> to <keyname>\n")
decho("#     <204,218,233>dkey <keyname>          <154,168,183>Deletes key named <keyname>\n")
decho("#     <204,218,233>skey <keyname>          <154,168,183>Sets key named <keyname> to safe key\n")
decho("#     <204,218,233>kpick                   <154,168,183>Lets you repick the key from last locate\n")
decho("#     <204,218,233>kecho <keyname> <rows>  <154,168,183>Shows the most recent watch or scry data in\n")
decho("#     <204,218,233>                        <154,168,183>the main window. Entering <rows> is optional\n")
decho("#     <204,218,233>nkey <keyname> <key>    <154,168,183>Manually adds <keyname> with <key> to the list\n")
decho("#     <204,218,233>locatel <keyname>       <154,168,183>Casts locate life and stores current room\n")
decho("#                             <154,168,183>as <keyname>\n")
decho("#     <204,218,233>locatel <mob> <keyname> <154,168,183>Casts locate life on <mob> and stores key\n")
decho("#                             <154,168,183>as <keyname>\n")
decho("#     <204,218,233>teleport <keyname>      <154,168,183>Casts teleport towards <keyname>\n")
decho("#     <204,218,233>portal <keyname>        <154,168,183>Casts portal towards <keyname>\n")
decho("#     <204,218,233>psafe                   <154,168,183>Casts portal towards dedicated safe key\n")
decho("#     <204,218,233>tv                      <154,168,183>Toggles the TV surveillance window\n")
decho("#     <204,218,233>watchr <keyname>        <154,168,183>Casts watch room on <keyname>\n")
decho("#     <204,218,233>scry <keyname>          <154,168,183>Casts scry on <keyname>\n")
decho("#\n")
decho("#     <220,220,220>KEY BINDINGS:\n")
decho("#\n")
decho("#     <204,218,233>Ctrl+S                  <154,168,183>Casts normal teleport towards safe key\n")
decho("#     <204,218,233>Alt+S                   <154,168,183>Casts quick teleport towards safe key\n")
decho("##\n")
decho("##                                          <220,220,220>VERSION 1.1.1\n")




end

function keyLibrary.helpBGHL ()
keyLibrary.showKeysHelpLabel:setStyleSheet([[
  background-color: rgba(100,100,100,100%);font:normal 5pt "Lucida Console";border-radius:5px]])
end
function keyLibrary.helpBGBACK ()
   keyLibrary.showKeysHelpLabel:setStyleSheet([[
  background-color: rgba(70,70,70,100%);font:normal 5pt "Lucida Console";border-radius:5px]])
end
--registerAnonymousEventHandler("sysLoadEvent", "showKeysOnStartup") 
registerAnonymousEventHandler("sysInstallPackage", "keyLibrary.showKeysOnStartup") 

function keyLibrary.showKeysOnStartup()
keyLibrary.showKeys("toggle")
end



```

## KeyGroup: keyLibrary 1.1.1

### Key: Ctrl S teleport
```lua
local foundSafeKey = 0
if #keyLibrary.keys > 0 then
for i=1,#keyLibrary.keys,1 do
  if keyLibrary.keys[i][5] == 1 then
  foundSafeKey = 1

   decho("<154,168,183>## Teleporting to safe key: <204,218,233>$"..keyLibrary.keys[i][1].." ("..keyLibrary.keys[i][3]..")\n")
   send("cast n 'teleport' "..keyLibrary.keys[i][3],false)
  end
end

if foundSafeKey == 0 then
  decho("<154,168,183>## PANIC! NO SAFE KEY, TOOK: <204,218,233>$"..keyLibrary.keys[i][1].." ("..keyLibrary.keys[i][3]..")\n")
  send("cast n 'teleport'"..keyLibrary.keys[1][3],false)
end
else
decho("<154,168,183>## PANIC! No keys available\n")
end
```

### Key: Alt S teleport
```lua
local foundSafeKey = 0
if #keyLibrary.keys > 0 then
for i=1,#keyLibrary.keys,1 do
  if keyLibrary.keys[i][5] == 1 then
  foundSafeKey = 1
  decho("<154,168,183>## Teleporting QUICKLY to safe key: <204,218,233>$"..keyLibrary.keys[i][1].." ("..keyLibrary.keys[i][3]..")\n")
  send("cast q 'teleport' "..keyLibrary.keys[i][3],false)
  end
end

if foundSafeKey == 0 then
  decho("<154,168,183>## PANIC! No safe key. Teleporting quickly to: <204,218,233>$"..keyLibrary.keys[i][1].." ("..keyLibrary.keys[i][3]..")\n")
  send("cast q 'teleport'"..keyLibrary.keys[1][3],false)
end
else
  decho("<154,168,183>## PANIC! No keys available\n")
end
```

### Key: alt down
```lua
keyLibrary.downKeys()
```

### Key: alt right
```lua
keyLibrary.downKeys()
```

### Key: alt up
```lua
keyLibrary.upKeys()
```

### Key: alt left
```lua
keyLibrary.upKeys()
```

### Key: acceptPick
```lua
keyLibrary.acceptPick()
```

### Key: ClosePickWindow
```lua
keyLibrary.pickKeyAContainer:hide()
```