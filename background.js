// Parking lot:
// potentially can add a sidebar if we really want but I don't think it's necessary
// ai organize tabs with BYO openai key
// when you collapse all tab groups, chrome opens a new tab in no group - can we prevent this?
// -> actually this isn't such a problem since the expectation is you always use the keyboard,
// -> and the collapse command doesn't trigger this behavior.
// choose whether new tabs go into a new group or the most recent? the furthest right?
// shift current tab between groups
// optional onboarding which launches sample groups and has checklist of trying out commands
// typescript and @types/chrome

const getLastTabId = async (groupId) =>
  (await chrome.storage.local.get(groupId.toString()))[groupId];

const restoreLastTab = async ({ id: groupId }) => {
  const lastTabId =
    (await getLastTabId(groupId)) ??
    (
      await chrome.tabs.query({
        groupId,
      })
    ).at(-1).id;
  return chrome.tabs.update(lastTabId, { active: true });
};

const setLastTabId = (groupId, tabId) =>
  chrome.storage.local.set({ [groupId]: tabId });

const saveLastTab = async ({ id: groupId }) =>
  setLastTabId(
    groupId,
    (
      await chrome.tabs.query({
        active: true,
        groupId,
      })
    )[0].id
  );

const getContext = async () => {
  const window = await chrome.windows.getCurrent();
  const unsortedGroups = await chrome.tabGroups.query({ windowId: window.id });
  const groups = (
    await Promise.all(
      unsortedGroups.map(async (group) => [
        (await chrome.tabs.query({ groupId: group.id }))[0].index,
        group,
      ])
    )
  )
    .toSorted(([indexA], [indexB]) => indexA - indexB)
    .map(([, group]) => group);
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

  saveLastTab(currentGroup);

  let newGroup = null;
  if (command === "right") {
    newGroup = groups[(currentGroupIndex + 1) % groups.length];
  } else if (command === "left") {
    newGroup = groups[(currentGroupIndex - 1 + groups.length) % groups.length];
  }

  groups.forEach((group) => {
    chrome.tabGroups.update(group.id, {
      collapsed: !(command === "up" || group === newGroup),
    });
  });

  if (newGroup !== null) {
    restoreLastTab(newGroup);
  }
});
