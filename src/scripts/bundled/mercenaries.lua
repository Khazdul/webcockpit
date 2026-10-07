-- @name     mercenaries
-- @summary  Keeps track of your hired citizen mercenaries, in a pane
-- @api      1
-- @alias    merc  Show or hide the Mercenaries pane (also: merc autopay, merc cost, merc pay, merc list, merc label, merc forget)
-- @setting  autopay boolean false "Pay a mercenary by itself when it asks for pay"
-- @setting  cost    number  10    "Silver per payment: 10, or 20 (paid as 1 gold)"
-- @setting  group   boolean true  "Group a new mercenary"
-- @setting  minutes number  25    "Minutes one payment buys"
-- @setting  warn    number  5     "Warn this many minutes before a contract ends (0: never)"
-- @help     Hire a citizen mercenary by paying it (give 10 silver mercenary,
-- @help     or give 1 gold mercenary at a higher level). The script gives it
-- @help     a short name with "label" and groups it, and the Mercenaries pane
-- @help     shows how long its contract has left.
-- @help
-- @help     The price is 10 or 20 silver (paid as 1 gold): click Cost in the
-- @help     pane's top row to switch, or let the script learn it when a
-- @help     mercenary names its price.
-- @help
-- @help     Near the end the mercenary taps you on the shoulder: pay it
-- @help     within a minute or it leaves. Its row then says PAY DUE: click
-- @help     that bar to pay, or turn autopay on.
-- @help
-- @help     The letters in a mercenary's row are orders: l lead, r ride,
-- @help     f flee (ask <name> lead, ride or flee). Point at one to see the
-- @help     command.
-- @help
-- @help       merc               show or hide the pane
-- @help       merc autopay       turn autopay on or off (also: on, off)
-- @help       merc cost [10|20]  switch the price, or set it
-- @help       merc pay [name]    pay one mercenary, or all that ask for pay
-- @help       merc list          the mercenaries and their time, as text
-- @help       merc label <who>   label and track a mercenary by hand, for
-- @help                          example merc label 2.mercenary
-- @help       merc forget <name> stop tracking a mercenary
-- @help
-- @help     The contracts are kept over a reload or a new connection.

--[[
How it works

MUME's lines about a citizen mercenary you hired (the name in brackets is
its label):

  A citizen mercenary starts following you.             hired
  A citizen mercenary (Bubba) taps you on the shoulder.  pay due
  A citizen mercenary (Bubba) says 'Thank you. I am at your service.'
                                                         paid, renewed
  A citizen mercenary (Bubba) leaves and goes to seek another employer.
  A citizen mercenary (Bubba) is dead! R.I.P.

The price of one payment is 10 silver, or 1 gold (20 silver) at a higher
level. No log has a mercenary naming its price, so any line a citizen
mercenary says, tells or asks that names 10 silver, or 1 gold / 20 silver,
sets the cost setting.

GMCP's Group messages only list the group members in your room, so a
mercenary that is not in the room is "away", not gone. It is gone after
the leave or death line, or a while after its contract ended.

Each mercenary is a record keyed by its label, with the time its contract
ends as wall-clock seconds (getEpoch), so the records can be kept in the
store and survive a reload.
]]

-- ------------------------------------------------------------ constants

local NAMES = {
  "Bubba", "Hank", "Cletus", "Leroy", "Earl", "Jeb", "Roscoe", "Boomer",
  "Buford", "Cooter", "Dwayne", "Gomer", "Junior", "Merle", "Otis", "Rufus",
  "Travis", "Waylon", "Zeke", "Clovis", "Festus", "Hoss", "Jethro", "Lonnie",
  "Newt", "Vern", "Wade", "Darryl", "Skeeter", "Pruitt",
}
local GRACE = 60           -- seconds to pay after the tap
local GONE_AFTER = 90      -- seconds past the end before a silent mercenary is dropped
local NAME_W = 8           -- the longest name in NAMES
-- Buttons and links in light grey (the bundled scripts' colours, ADR 0054
-- round 8); green, red, yellow and the gauges keep their meaning.
local LINK_C = "#b8b8b8"

-- ------------------------------------------------------------ state

-- name (lower case) -> { name, ends, state ("active" | "due"), paid,
--   present, warned, paying }
local mercs = {}
-- The label we just asked MUME to set, for the "Replaced label" check.
local labelling = nil

-- The cost of one payment in silver (10 or 20) while a change is being
-- saved: settings.cost changes once setSetting is done.
local costWanted = nil

local pane = createPane{id = "main", title = "Mercenaries", dock = "right", rows = 9, cols = 36}
local width = 36

local function now() return getEpoch() end

local function save()
  local list = {}
  for _, m in pairs(mercs) do
    list[#list + 1] = { name = m.name, ends = m.ends, state = m.state, paid = m.paid, warned = m.warned }
  end
  store.set("mercs", list)
end

local function sorted()
  local list = {}
  for _, m in pairs(mercs) do list[#list + 1] = m end
  table.sort(list, function(a, b) return a.name < b.name end)
  return list
end

local function count()
  local n = 0
  for _ in pairs(mercs) do n = n + 1 end
  return n
end

-- "m:ss" for seconds (never below 0).
local function clock(secs)
  secs = math.max(0, math.floor(secs))
  return string.format("%d:%02d", secs // 60, secs % 60)
end

local function contractSecs()
  return math.max(1, settings.minutes) * 60
end

-- One payment in silver: 10 or 20 (anything above 15 counts as 20).
local function cost()
  local c = costWanted or tonumber(settings.cost) or 10
  return c > 15 and 20 or 10
end

-- What one payment is given as: "10 silver" or "1 gold".
local function price()
  return cost() == 20 and "1 gold" or "10 silver"
end

local function payCommand(who)
  return "give " .. price() .. " " .. who
end

-- ------------------------------------------------------------ commands to MUME

local function pay(m)
  send(payCommand(m.name))
  m.paying = now()
end

local function ask(m, what)
  send("ask " .. m.name .. " " .. what)
end

-- ------------------------------------------------------------ the pane

-- A gauge colour that runs from green through orange to red as the time
-- runs out (the Group pane's colours).
local function mix(a, b, t)
  local r = {}
  for i = 1, 3 do r[i] = math.floor(a[i] + (b[i] - a[i]) * t + 0.5) end
  return r[1] .. "," .. r[2] .. "," .. r[3]
end
local GREEN, ORANGE, RED = { 0, 90, 24 }, { 255, 112, 32 }, { 224, 32, 32 }
local function timeColor(frac)
  if frac >= 0.5 then return mix(GREEN, GREEN, 0) end
  if frac >= 0.2 then return mix(ORANGE, GREEN, (frac - 0.2) / 0.3) end
  return mix(RED, ORANGE, math.max(0, frac) / 0.2)
end

-- Writes a row from segments { text, color, fn, hint }, with links.
local function row(n, segs)
  local out, links, col = {}, {}, 1
  for _, s in ipairs(segs) do
    local w = utf8.len(s.text)
    if s.color then
      out[#out + 1] = "<" .. s.color .. ">" .. s.text .. "<reset>"
    else
      out[#out + 1] = s.text
    end
    if s.fn and w > 0 then links[#links + 1] = { col, w, s.fn, s.hint } end
    col = col + w
  end
  pane:setLine(n, table.concat(out))
  for _, l in ipairs(links) do pane:setLink(n, l[1], l[2], l[3], l[4]) end
  return col - 1
end

local function pad(s, w)
  local n = utf8.len(s)
  if n >= w then return s end
  return s .. string.rep(" ", w - n)
end

local toggleAutopay, setCost -- defined with the alias below

-- The orders, in the order they are dropped from the right on a narrow pane.
local ORDERS = {
  { "l", "lead", "Lead: " },
  { "r", "ride", "Ride: " },
  { "f", "flee", "Flee: " },
}
local function orders(m)
  local list = {}
  for _, o in ipairs(ORDERS) do
    local what = o[2]
    list[#list + 1] = { o[1], LINK_C, function() ask(m, what) end,
      o[3] .. "ask " .. m.name .. " " .. what }
  end
  return list
end

local function drawMerc(n, m, t)
  local left = {
    { text = " " .. pad(m.name, NAME_W) .. " " },
    m.present and { text = "● here", color = "ansi_light_green" } or { text = "○ away", color = "ansi_light_black" },
  }
  local leftW = 1 + NAME_W + 1 + 6
  -- As many orders as fit, each "x " (two cells), after at least one space.
  local list = orders(m)
  local fit = math.max(0, math.min(#list, (width - leftW - 1) // 2))
  local segs = left
  local gap = width - leftW - fit * 2
  if fit > 0 then
    segs[#segs + 1] = { text = string.rep(" ", gap) }
    for i = 1, fit do
      local o = list[i]
      segs[#segs + 1] = { text = o[1], color = o[2], fn = o[3], hint = o[4] }
      segs[#segs + 1] = { text = " " }
    end
  end
  row(n, segs)

  local left_ = m.ends - t
  local label, value, max, color
  if m.state == "due" then
    label = "PAY DUE " .. clock(left_)
    value, max, color = left_, GRACE, "224,32,32"
  elseif left_ > 0 then
    label = clock(left_) .. " left"
    value, max = left_, contractSecs()
    color = timeColor(left_ / max)
  else
    label = "ended"
    value, max, color = 0, 1, "224,32,32"
  end
  pane:gauge(n + 1, { value = value, max = max, color = color, label = label })
  if m.state == "due" then
    -- The whole PAY DUE bar pays.
    pane:setLink(n + 1, 1, math.max(1, width), function()
      pay(m)
      uiMessage("merc", "Paying " .. m.name .. " " .. price() .. ".")
    end, "Pay " .. m.name .. " " .. price() .. " now:\n" .. payCommand(m.name))
  end
end

local function draw()
  pane:clear()
  local t = now()
  local on = settings.autopay
  local n = count()
  local hired = n == 0 and "" or (n == 1 and "1 hired " or n .. " hired ")
  local c = cost()
  local costText = c == 20 and "[1g]" or "[10s]"
  local head = {
    { text = " Autopay " },
    { text = on and "[on]" or "[off]", color = on and "ansi_light_green" or "ansi_light_black",
      fn = function() toggleAutopay() end,
      hint = on and "Autopay is on: a mercenary that asks for pay gets " .. price() .. ".\nClick to turn it off."
        or "Autopay is off: click the PAY DUE bar when a mercenary asks.\nClick to turn it on." },
  }
  local headW = 9 + (on and 4 or 5)
  local costW = 7 + #costText
  -- The cost link only where it stays clear of the close cross (the
  -- row's last four cells while the pane is hovered).
  if width - headW >= costW + 4 then
    head[#head + 1] = { text = "  Cost " }
    head[#head + 1] = { text = costText, color = "ansi_light_yellow", fn = function() setCost(c == 20 and 10 or 20) end,
      hint = "A payment is " .. (c == 20 and "1 gold (20 silver)" or "10 silver") .. ".\nClick to switch to "
        .. (c == 20 and "10 silver." or "1 gold (20 silver).") }
    headW = headW + costW
  end
  if hired ~= "" and width - headW > #hired then
    head[#head + 1] = { text = string.rep(" ", width - headW - #hired) .. hired, color = "ansi_light_black" }
  end
  row(1, head)

  if n == 0 then
    pane:setLine(3, " No mercenaries hired.")
    pane:setLine(4, " <ansi_light_black>Hire one: give " .. price() .. " mercenary")
    return
  end
  local r = 2
  for _, m in ipairs(sorted()) do
    drawMerc(r, m, t)
    r = r + 2
  end
end

pane:onResize(function(rows, cols)
  width = cols
  draw()
end)

-- ------------------------------------------------------------ the clock

local ticker = nil

local function remove(m, why)
  mercs[m.name:lower()] = nil
  save()
  uiMessage("merc", m.name .. " " .. why .. ".")
end

local function tick()
  local t = now()
  local changed = false
  for _, m in pairs(mercs) do
    local left = m.ends - t
    local warn = settings.warn * 60
    if m.state == "active" and not m.warned and warn > 0 and left > 0 and left <= warn then
      m.warned = true
      changed = true
      uiMessage("merc", m.name .. "'s contract ends in " .. math.ceil(left / 60) .. " min.")
    end
    if left < -GONE_AFTER then
      remove(m, m.state == "due" and "was not paid and is gone" or "has ended its contract")
    end
  end
  if changed then save() end
  if count() == 0 and ticker then
    killTimer(ticker)
    ticker = nil
  end
  draw()
end

local function startTicking()
  if not ticker then ticker = tempTimer(1, tick, true) end
end

-- ------------------------------------------------------------ records

local function pickName()
  local free = {}
  for _, n in ipairs(NAMES) do
    if not mercs[n:lower()] then free[#free + 1] = n end
  end
  if #free == 0 then return nil end
  return free[math.random(#free)]
end

-- Who of ours is in the room: GMCP lists the members in your room, a
-- mercenary by its label.
local function updatePresence()
  local here = {}
  for _, g in ipairs(state.group) do
    if g.type == "npc" and type(g.label) == "string" then here[g.label:lower()] = true end
  end
  local changed = false
  for key, m in pairs(mercs) do
    local p = here[key] == true
    if m.present ~= p then
      m.present = p
      changed = true
    end
  end
  if changed then draw() end
end

local function add(name, t)
  local m = { name = name, ends = t + contractSecs(), state = "active", paid = cost(), present = false, warned = false }
  mercs[name:lower()] = m
  save()
  startTicking()
  return m
end

-- Labels a mercenary; it is grouped once MUME says the label is set.
local function label(target, name)
  labelling = { name = name, at = now() }
  send("label " .. target .. " " .. name)
end

-- ------------------------------------------------------------ triggers

-- A new hire. Anchored: a labelled mercenary following you again has its
-- label in brackets and does not match.
tempRegexTrigger("^A citizen mercenary starts following you\\.$", function()
  local name = pickName()
  if not name then
    uiMessage("merc", "No free names left; label the new mercenary by hand.")
    return
  end
  add(name, now())
  label("mercenary", name)
  uiMessage("merc", name .. " hired for " .. settings.minutes .. " min.")
  draw()
end)

-- The answer to our label command: group the mercenary (by its new label).
tempRegexTrigger("^Ok\\.$", function()
  local l = labelling
  if not l then return end
  labelling = nil
  if now() - l.at <= 10 and mercs[l.name:lower()] and settings.group then send("group " .. l.name) end
end)

-- "label mercenary X" names the first mercenary in the room. When that is
-- one of ours (a second hire in the same room), MUME replaces its label:
-- put the old label back and ask the player to label the new one.
tempRegexTrigger('^Ok\\. Replaced label "(.+)"\\.$', function()
  local l = labelling
  labelling = nil
  if not l or now() - l.at > 10 then return end
  local old = mercs[matches[2]:lower()]
  if not old or old.name == l.name then return end
  send("label " .. l.name .. " " .. old.name)
  local m = mercs[l.name:lower()]
  if m then mercs[l.name:lower()] = nil end
  save()
  uiMessage("merc", "The label went to " .. old.name .. "; it is back. Label the new one with: merc label 2.mercenary")
  draw()
end)

tempRegexTrigger("^A citizen mercenary \\((\\w+)\\) taps you on the shoulder\\.$", function()
  local m = mercs[matches[2]:lower()]
  if not m then return end
  local t = now()
  m.state = "due"
  m.ends = t + GRACE
  save()
  if settings.autopay then
    -- Once per tap: a second tap within half a minute is not paid again.
    if not m.paying or t - m.paying > 30 then
      pay(m)
      uiMessage("merc", m.name .. " asks for pay; paying " .. price() .. ".")
    end
  else
    uiMessage("merc", m.name .. " asks for pay: " .. price() .. " within a minute (click PAY DUE or merc pay).")
  end
  draw()
end)

tempRegexTrigger("^A citizen mercenary \\((\\w+)\\) says 'Thank you\\. I am at your service\\.'$", function()
  local m = mercs[matches[2]:lower()]
  if not m then return end
  m.state = "active"
  m.ends = now() + contractSecs()
  m.paid = m.paid + cost()
  m.warned = false
  m.paying = nil
  save()
  uiMessage("merc", m.name .. " is paid for " .. settings.minutes .. " more min.")
  draw()
end)

tempRegexTrigger("^A citizen mercenary \\((\\w+)\\) leaves and goes to seek another employer\\.$", function()
  local m = mercs[matches[2]:lower()]
  if m then
    remove(m, "has left you")
    draw()
  end
end)

tempRegexTrigger("^A citizen mercenary \\((\\w+)\\) (?:is dead|has drawn (?:his|her|its) last breath)! R\\.I\\.P\\.$", function()
  local m = mercs[matches[2]:lower()]
  if m then
    remove(m, "is dead")
    draw()
  end
end)

-- What a citizen mercenary says about its price (said, told, asked or
-- whispered; also "citizen-mercenary", the form waiting for a job). No log
-- has such a line yet, so this is loose: any line of a mercenary that names
-- 10 silver, or 1 gold / 20 silver, sets the cost.
local function priceIn(text)
  local t = " " .. text:lower() .. " "
  local ten = t:find("%f[%w]10 silver") or t:find("%f[%w]ten silver")
  local twenty = t:find("%f[%w]1 gold") or t:find("%f[%w]one gold")
    or t:find("%f[%w]20 silver") or t:find("%f[%w]twenty silver")
  if ten and not twenty then return 10 end
  if twenty and not ten then return 20 end
  return nil
end

tempRegexTrigger("^(?:An? |The )?[Cc]itizen[ -]mercenary(?: \\(\\w+\\))? (?:says|asks|exclaims|tells you|asks you|whispers to you)(?: to you)?,? '(.+)'$", function()
  local c = priceIn(matches[2])
  if c and c ~= cost() then
    setCost(c, true)
  end
end)

-- ------------------------------------------------------------ GMCP

-- state.group is up to date once the message is handled; look a moment later.
local presencePending = false
registerAnonymousEventHandler("gmcp.Group", function()
  if presencePending then return end
  presencePending = true
  tempTimer(0, function()
    presencePending = false
    updatePresence()
  end)
end)

registerAnonymousEventHandler("sysDisconnectionEvent", function()
  for _, m in pairs(mercs) do m.present = false end
  draw()
end)

-- ------------------------------------------------------------ alias

local function say(text)
  cecho("<ansi_light_yellow>MERC<reset> " .. text)
end

toggleAutopay = function(value)
  if value == nil then value = not settings.autopay end
  setSetting("autopay", value)
  -- settings.autopay changes once it is saved (sysSettingChanged redraws).
  say("Autopay " .. (value and "on." or "off."))
end

setCost = function(value, learnt)
  value = value == 20 and 20 or 10
  costWanted = value
  setSetting("cost", value)
  local what = value == 20 and "1 gold (20 silver)" or "10 silver"
  if learnt then
    uiMessage("merc", "A mercenary asks " .. what .. "; payments are now " .. what .. ".")
  else
    say("Payments are now " .. what .. ".")
  end
  -- settings.cost changes once it is saved: until then draw what it will be.
  draw()
end

-- A setting changed (here, #script set or the Scripts page): redraw now.
registerAnonymousEventHandler("sysSettingChanged", function(_, name)
  if name == "cost" then costWanted = nil end
  draw()
end)

local function find(name)
  return name and mercs[name:lower()] or nil
end

local function list()
  if count() == 0 then
    say("No mercenaries hired.")
    return
  end
  local t = now()
  for _, m in ipairs(sorted()) do
    local left = m.ends - t
    local what = m.state == "due" and ("PAY DUE, " .. clock(left) .. " to pay") or (clock(left) .. " left")
    say(pad(m.name, NAME_W) .. "  " .. (m.present and "here" or "away") .. "  " .. what .. "  paid " .. m.paid .. " silver")
  end
  say("A payment is " .. price() .. ".")
end

tempAlias("^mercs?(?: +(\\S+)(?: +(\\S+))?)?$", function()
  local sub, arg = matches[2], matches[3]
  if sub == "" then
    if pane:visible() then pane:hide() else pane:show() end
  elseif sub == "autopay" then
    if arg == "on" then toggleAutopay(true)
    elseif arg == "off" then toggleAutopay(false)
    else toggleAutopay() end
  elseif sub == "cost" then
    if arg == "10" or arg == "20" then setCost(tonumber(arg))
    elseif arg == "" then setCost(cost() == 20 and 10 or 20)
    else say("Usage: merc cost [10|20]") end
  elseif sub == "pay" then
    if arg ~= "" then
      local m = find(arg)
      if not m then return say("No mercenary called " .. arg .. ".") end
      pay(m)
    else
      local any = false
      for _, m in ipairs(sorted()) do
        if m.state == "due" then
          pay(m)
          any = true
        end
      end
      if not any then say("No mercenary asks for pay. merc pay <name> pays one anyway.") end
    end
  elseif sub == "list" then
    list()
  elseif sub == "label" then
    if arg == "" then return say("Usage: merc label <who>, for example merc label 2.mercenary") end
    local name = pickName()
    if not name then return say("No free names left.") end
    add(name, now())
    label(arg, name)
    say("Tracking " .. name .. " with a full contract of " .. settings.minutes .. " min.")
    draw()
  elseif sub == "forget" then
    local m = find(arg)
    if not m then return say("No mercenary called " .. arg .. ".") end
    remove(m, "is no longer tracked")
    draw()
  else
    say("merc, merc autopay [on|off], merc cost [10|20], merc pay [name], merc list, merc label <who>, merc forget <name>")
  end
end)

-- ------------------------------------------------------------ start

-- Contracts from the last session that have not ended long ago.
do
  local t = now()
  for _, r in ipairs(store.get("mercs") or {}) do
    if type(r.name) == "string" and type(r.ends) == "number" and r.ends - t > -GONE_AFTER then
      mercs[r.name:lower()] = {
        name = r.name, ends = r.ends, state = r.state == "due" and "due" or "active",
        paid = tonumber(r.paid) or 10, present = false, warned = r.warned == true,
      }
    end
  end
  save()
  if count() > 0 then startTicking() end
  updatePresence()
  draw()
end
