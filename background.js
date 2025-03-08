// Parking lot:
// potentially can add a sidebar if we really want but I don't think it's necessary
// ai organize tabs with BYO openai key

const getContext = async () => {
  const window = await new Promise((resolve) => {
    chrome.windows.getCurrent({}, resolve);
  });
  const groups = await new Promise((resolve) => {
    chrome.tabGroups.query({ windowId: window.id }, resolve);
  });
  const currentGroupIndex = groups.findLastIndex((g) => !g.collapsed);
  const currentGroup = groups[currentGroupIndex];
  return { window, groups, currentGroupIndex, currentGroup };
};

const COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "purple",
  "pink",
  "grey",
];

const COLOR_REGEX = new RegExp(`(?:^|\\s)@(${COLORS.join("|")})\\b`, "i");

chrome.omnibox.setDefaultSuggestion({
  description: "Type a new name for the current group, or @color",
});

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  // TODO: update to account for @color in the middle of the text? Or too confusing for the user?
  if (!text.startsWith("@")) {
    return;
  }
  const query = text.slice(1).toLowerCase();
  const matches = COLORS.filter((c) => c.startsWith(query)).map((c) => ({
    content: `@${c}`,
    description: `Color current tab group <url>@<match>${query}</match>${c.slice(
      query.length
    )}</url>`,
  }));
  suggest(
    matches.length > 0
      ? matches
      : COLORS.map((c) => ({
          content: `@${c}`,
          description: `Color current tab group <url>@${c}</url>`,
        }))
  );
});

chrome.omnibox.onInputEntered.addListener(async (text) => {
  // TODO: Currently invalid color is not eaten, but rather used as title - try '@black' for example.
  // Should we ignore it instead?
  const { currentGroup } = await getContext();
  const colorMatch = text.match(COLOR_REGEX);
  const updateOptions = {};

  if (colorMatch) {
    console.log(colorMatch);
    const color = colorMatch.at(-1).toLowerCase();
    if (!COLORS.includes(color)) {
      return;
    }
    updateOptions.color = color;
  }

  const title = text.replace(COLOR_REGEX, "").trim();

  if (title) {
    updateOptions.title = title;
  }

  chrome.tabGroups.update(currentGroup.id, updateOptions);
});

chrome.commands.onCommand.addListener(async (command) => {
  const { window, groups, currentGroupIndex, currentGroup } =
    await getContext();

  if (command === "new" || command === "create") {
    chrome.tabs.group({
      tabIds: (
        await chrome.tabs.create({
          windowId: window.id,
        })
      ).id,
      ...(command === "create" || currentGroupIndex === -1
        ? {}
        : { groupId: currentGroup.id }),
    });
    return;
  }

  groups.forEach((g, i) => {
    let collapsed = false;

    if (command === "up") {
      collapsed = false;
    } else if (command === "down") {
      collapsed = true;
    } else if (command === "right") {
      console.log((currentGroupIndex + 1) % groups.length);
      collapsed = i !== (currentGroupIndex + 1) % groups.length;
    } else if (command === "left") {
      console.log((currentGroupIndex - 1 + groups.length) % groups.length);
      collapsed = i !== (currentGroupIndex - 1 + groups.length) % groups.length;
    } else {
      throw new Error(`Unknown command: ${command}`);
    }
    chrome.tabGroups.update(g.id, {
      collapsed,
    });
  });
});
