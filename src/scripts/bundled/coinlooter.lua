-- @name     coinlooter
-- @summary  Picks up the coins after your kills
-- @api      1
-- @alias    cl  Turn auto-looting on or off (also: cl on, cl off, cl now)
-- @setting  auto   boolean true  "Loot automatically after kills"
-- @setting  delay  number  0     "Seconds to wait before looting"
-- @setting  others boolean false "Also loot after kills that give you no experience"
-- @setting  quiet  boolean true  "Hide 'You can't find any coins' after an auto-loot"
-- @help     When you or your group kill a monster, this script picks up its coins.
-- @help     A corpse: it sends "get coins all.corpse".
-- @help     An undead that disappears into nothing drops its coins on the
-- @help     floor: it sends "get all.coins".
-- @help
-- @help     It only loots after kills that give you experience ("You receive
-- @help     your share of experience."), so it leaves alone what other players
-- @help     kill in your room. Player corpses (*Name*) are never looted.
-- @help     It sends at most one of each command per second.
-- @help
-- @help     Commands:
-- @help       cl       turn auto-looting on or off
-- @help       cl on    turn it on;  cl off  turn it off
-- @help       cl now   pick up coins from the floor and the corpses now
-- @help     cl lasts until you reload. To change it for good:
-- @help       #script set coinlooter auto off
-- @help
-- @help     Settings:
-- @help       #script set coinlooter delay 0.5    wait half a second first
-- @help       #script set coinlooter others on    loot after any kill, like Cockpit
-- @help       #script set coinlooter quiet off    show "You can't find any coins"

--[[
How it works

MUME prints these lines when you kill something:

  You receive your share of experience.
  Yes! You're beginning to get the idea.
  You hear an orc's death cry as it collapses.
  An orc is dead! R.I.P.

The experience line comes first, so we remember it for a moment
("armed"), and when the death line follows we loot. A kill by a player
outside your group has no experience line and is left alone.

This is a good script to copy: press Duplicate on the Scripts page and
change what you like.
]]

-- ------------------------------------------------------------ state

-- Is auto-looting on? Starts from the `auto` setting; `cl` changes it.
local on = settings.auto
-- The `auto` value we last saw, so `#script set coinlooter auto ...`
-- also works while the script runs.
local lastAuto = settings.auto

-- True for a short while after an experience line.
local armed = false
local disarmTimer = nil

-- Commands sent in the last second; we do not send them again until it
-- has passed (several kills at once need only one "get").
local recent = {}

-- How many "You can't find any coins" replies we expect to hide.
local expectEmpty = 0
local expectTimer = nil

-- ------------------------------------------------------------ helpers

local function isOn()
  if settings.auto ~= lastAuto then
    lastAuto = settings.auto
    on = settings.auto
  end
  return on
end

-- Sends `cmd` unless we sent it less than a second ago.
local function lootWith(cmd)
  if recent[cmd] then return end
  recent[cmd] = true
  tempTimer(1, function() recent[cmd] = nil end)

  send(cmd)

  -- Hide the "no coins" reply to this command (the `quiet` setting).
  if settings.quiet then
    expectEmpty = expectEmpty + 1
    if expectTimer then killTimer(expectTimer) end
    expectTimer = tempTimer(3, function() expectEmpty = 0 end)
  end
end

-- Called on a death line. `cmd` is the command that gets the coins.
local function onDeath(cmd)
  if not isOn() then return end
  if not (armed or settings.others) then return end

  if settings.delay > 0 then
    tempTimer(settings.delay, function() lootWith(cmd) end)
  else
    lootWith(cmd)
  end
end

-- ------------------------------------------------------------ triggers

-- Your kill, or your group's: arm for two seconds.
tempRegexTrigger("^You receive your share of experience\\.$", function()
  armed = true
  if disarmTimer then killTimer(disarmTimer) end
  disarmTimer = tempTimer(2, function() armed = false end)
end)

-- A monster leaves a corpse. [^*] skips players, who show as *Name*.
tempRegexTrigger("^[^*].* is dead! R\\.I\\.P\\.$", function()
  onDeath("get coins all.corpse")
end)
tempRegexTrigger("^[^*].* has drawn (his|her) last breath! R\\.I\\.P\\.$", function()
  onDeath("get coins all.corpse")
end)

-- An undead leaves no corpse; its coins fall to the floor.
tempRegexTrigger("^[^*].* disappears into nothing\\.$", function()
  onDeath("get all.coins")
end)

-- The game's answer when there was nothing to get.
tempRegexTrigger("^You can't find any coins( in any corpse)?\\.$", function()
  if expectEmpty > 0 then
    expectEmpty = expectEmpty - 1
    deleteLine()
  end
end)

-- ------------------------------------------------------------ alias

tempAlias("^cl(?: (on|off|now))?$", function()
  local word = matches[2]

  if word == "now" then
    send("get all.coins")
    send("get coins all.corpse")
    return
  end

  isOn() -- pick up a changed `auto` setting first
  if word == "on" then
    on = true
  elseif word == "off" then
    on = false
  else
    on = not on
  end

  if on then
    cecho("<green>Coin looter on.<reset>")
  else
    cecho("<yellow>Coin looter off.<reset> Type cl to turn it on again.")
  end
end)
