-- @name     panebar
-- @summary  A bar of buttons that turn the panes on and off
-- @api      1
-- @alias    bar  Show or hide the pane bar (also: bar list)
-- @help     One button per pane: the built-in panes (CHAR, TIME, GRP,
-- @help     COMM, UI, MAP) and the panes of the scripts that run, in the
-- @help     order of Options -> Panes. Click a button to hide its pane,
-- @help     click again to show it. A bright button is on, a dark one is
-- @help     off. Point at a button to see the pane's full name.
-- @help
-- @help     The bar starts at the bottom of the right dock, under the
-- @help     other panes. Drag it by the dots at its left end (or press a
-- @help     button and move) to another dock or over the game to float it.
-- @help     Wherever it is, the buttons run left to right and wrap onto
-- @help     the next row when the bar is too narrow.
-- @help
-- @help       bar        show or hide the bar
-- @help       bar list   the panes and whether they are on, as text

--[[
How it works

getPanes() lists every pane in Options -> Panes order with its short
name, title and on/off; the bar leaves out its own pane. Each button is
the short name centred in a box one cell wider than the longest name on
each side, all boxes equally wide, one empty cell apart. On is the
Character pane's lit toggle box, the pane background shade on the glow
shade (<@bg:@glow>); off is the mid shade on the track shade
(<@mid:@track>), faded but readable. Both follow the pane tint and the
light (paper) backgrounds. Under the pointer a button turns a step
lighter, text and fill (pane:setHover("lighten")). A click calls
setPaneOn.

Row 1 starts with a grip, a dotted cell (pane:setGrip) that drags the
bar. The buttons start after it and wrap back to that column, only when
a button does not fit; the last one on a row may end in the last column
(a pane without a frame has no close cross over its cells).

The bar redraws when the list changes (sysPanesChanged), when it is
resized and when it moves to another dock. Docked, it asks for as many
rows as the buttons need with pane:wantSize. A height the player drags
stays until the bar needs another one.
]]

local ON = "<@bg:@glow>"
local OFF = "<@mid:@track>"
local GRIP = "<@mid>\u{2237}<reset>"
-- The first button column: the grip, then one blank cell.
local FIRST = 3

local pane = createPane{
  id = "bar", title = "Pane bar", short = "BAR",
  dock = "right", rows = 1, cols = 30, border = false,
}
-- A hovered button lightens (text and fill) instead of the glow band.
pane:setHover("lighten")
local width = 30
-- The panes the bar has buttons for: every pane but its own.
local function others()
  local out = {}
  for _, e in ipairs(getPanes()) do
    if not e.own then out[#out + 1] = e end
  end
  return out
end

local function hint(e)
  if not e.on then return e.title .. ": off (click to show)" end
  if not e.shown then return e.title .. ": on, no room now" end
  return e.title .. ": on (click to hide)"
end

-- `text` centred in `w` cells.
local function centre(text, w)
  local left = math.floor((w - utf8.len(text)) / 2)
  return string.rep(" ", left) .. text .. string.rep(" ", w - utf8.len(text) - left)
end

-- The button width: the longest short name plus one cell on each side.
local function buttonWidth(list)
  local w = 0
  for _, e in ipairs(list) do w = math.max(w, utf8.len(e.short)) end
  return w + 2
end

-- Rows of buttons { col, entry } for the bar's width: left to right from
-- FIRST, one empty cell apart, wrapping back to FIRST only when a button
-- does not fit (its last cell past the last column).
local function layout(list, bw)
  local rows = { {} }
  local r, col = 1, FIRST
  for _, e in ipairs(list) do
    if col > FIRST and col + bw - 1 > width then
      r = r + 1
      rows[r] = {}
      col = FIRST
    end
    local row = rows[r]
    row[#row + 1] = { col = col, e = e }
    col = col + bw + 1
  end
  return rows
end

local function draw()
  local list = others()
  local dock = pane:dock()
  if not dock then return end
  local bw = buttonWidth(list)
  local rows = layout(list, bw)
  pane:clear()
  for r, buttons in ipairs(rows) do
    local parts, at = {}, 1
    if r == 1 then parts[1], at = GRIP, 2 end
    for _, b in ipairs(buttons) do
      parts[#parts + 1] = string.rep(" ", b.col - at) .. (b.e.on and ON or OFF) .. centre(b.e.short, bw) .. "<reset>"
      at = b.col + bw
    end
    pane:setLine(r, table.concat(parts))
    for _, b in ipairs(buttons) do
      local id, on = b.e.id, b.e.on
      pane:setLink(r, b.col, bw, function() setPaneOn(id, not on) end, hint(b.e))
    end
  end
  pane:setGrip(1, 1, FIRST - 1)
  -- The rows the buttons need (the surface ignores a repeated request, so
  -- a height the player dragged stays).
  if dock ~= "float" then pane:wantSize(#rows) end
end

pane:onResize(function(rows, cols)
  if cols < 1 then return end
  width = cols
  draw()
end)

registerAnonymousEventHandler("sysPanesChanged", draw)
registerAnonymousEventHandler("sysLoadEvent", draw)

local function say(text)
  cecho("<ansi_light_yellow>BAR<reset> " .. text)
end

tempAlias("^bar(?: +(\\S+))?$", function()
  local sub = matches[2]
  if sub == "" then
    if pane:visible() then pane:hide() else pane:show() end
  elseif sub == "list" then
    for _, e in ipairs(others()) do
      local state = e.on and "on " or "off"
      local owner = e.script and (" (" .. e.script .. ")") or ""
      say(string.format("%-8s %s  %s%s", e.short, state, e.title, owner))
    end
  else
    say("bar, bar list")
  end
end)
