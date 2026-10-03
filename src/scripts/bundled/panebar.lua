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
-- @help     The bar starts as one row at the bottom of the screen. Drag it
-- @help     by a button (press and move) to another side: at the left or
-- @help     right the buttons stack one per row; floating, they wrap to
-- @help     the bar's size.
-- @help
-- @help       bar        show or hide the bar
-- @help       bar list   the panes and whether they are on, as text

--[[
How it works

getPanes() lists every pane in Options -> Panes order with its short
name, title and on/off; the bar leaves out its own pane. Each button is
the short name on a shade of the pane's colour (<@text:@dim> on,
<@mid:@track> off), so it follows the pane tint and the light (paper)
backgrounds. A click calls setPaneOn.

The bar redraws when the list changes (sysPanesChanged), when it is
resized and when it moves to another dock. It asks for its height with
pane:wantSize: one row per button at the side, one row per line of
buttons at the top or bottom. A height the player drags stays until the
bar needs another one.
]]

local ON = "<@text:@dim>"
local OFF = "<@mid:@track>"

local pane = createPane{
  id = "bar", title = "Pane bar", short = "BAR",
  dock = "bottom", lane = "own", rows = 1, cols = 80, border = false,
}
local width = 80

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

-- Rows of buttons { col, entry } for the bar's dock and width.
local function layout(list, dock)
  local rows = {}
  if dock == "left" or dock == "right" then
    for i, e in ipairs(list) do rows[i] = { { col = 2, e = e } } end
    return rows
  end
  -- Flow with one empty cell between buttons. The first row keeps its
  -- last four cells free for the close cross.
  local first, last = 1, width
  if dock == "float" then first, last = 2, width - 1 end
  local r, col = 1, first
  rows[1] = {}
  for _, e in ipairs(list) do
    local w = utf8.len(e.short)
    local stop = last
    if r == 1 and width >= 12 then stop = math.min(last, width - 4) end
    if col > first and col + w - 1 > stop then
      r = r + 1
      rows[r] = {}
      col = first
    end
    local row = rows[r]
    row[#row + 1] = { col = col, e = e }
    col = col + w + 1
  end
  return rows
end

local function draw()
  local list = others()
  local dock = pane:dock()
  if not dock then return end
  local rows = layout(list, dock)
  pane:clear()
  for r, buttons in ipairs(rows) do
    local parts, at = {}, 1
    for _, b in ipairs(buttons) do
      parts[#parts + 1] = string.rep(" ", b.col - at) .. (b.e.on and ON or OFF) .. b.e.short .. "<reset>"
      at = b.col + utf8.len(b.e.short)
    end
    pane:setLine(r, table.concat(parts))
    for _, b in ipairs(buttons) do
      local id, on = b.e.id, b.e.on
      pane:setLink(r, b.col, utf8.len(b.e.short), function() setPaneOn(id, not on) end, hint(b.e))
    end
  end
  -- The height the buttons need (the surface ignores a repeated request,
  -- so a height the player dragged stays).
  if dock ~= "float" then pane:wantSize(math.max(1, #rows)) end
end

pane:onResize(function(rows, cols)
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
