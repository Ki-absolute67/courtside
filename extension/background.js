// Toolbar badge: shows your team's abbreviation while it's playing, otherwise how many NBA games are live.
// Opening the popup dismisses it; it only comes back when a game starts that you haven't seen yet.
// The hover tooltip always keeps the live info.
const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";

async function updateBadge() {
  try {
    // NBA game days follow US Eastern time (rolling over at 6am), wherever the viewer is.
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() - 6 * 3600000)).replace(/-/g, "");
    const [res, stored, local] = await Promise.all([fetch(`${SCOREBOARD}?dates=${day}`), chrome.storage.sync.get("favTeams"), chrome.storage.local.get("seenLive")]);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const favs = stored.favTeams || [];
    const seen = local.seenLive || [];
    const live = (data.events || []).filter(ev => ev.status?.type?.state === "in");
    const mine = live.find(ev => ev.competitions[0].competitors.some(c => favs.includes(c.team.id)));
    await chrome.storage.local.set({ liveNow: live.map(ev => ev.id) });
    const unseen = live.some(ev => !seen.includes(ev.id));

    await chrome.action.setBadgeBackgroundColor({ color: "#d2561f" });
    if (mine) {
      const comps = mine.competitions[0].competitors;
      const fav = comps.find(c => favs.includes(c.team.id));
      const away = comps.find(c => c.homeAway === "away"), home = comps.find(c => c.homeAway === "home");
      await chrome.action.setBadgeText({ text: seen.includes(mine.id) ? "" : fav.team.abbreviation.slice(0, 4) });
      await chrome.action.setTitle({ title: `${away.team.shortDisplayName} ${away.score} – ${home.score} ${home.team.shortDisplayName} · ${mine.status.type.shortDetail}` });
    } else {
      await chrome.action.setBadgeText({ text: unseen ? String(live.length) : "" });
      await chrome.action.setTitle({ title: live.length ? `Courtside: ${live.length} game${live.length > 1 ? "s" : ""} live now` : "Courtside NBA Stats" });
    }
  } catch {
    await chrome.action.setBadgeText({ text: "" });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("refresh", { periodInMinutes: 2 });
  updateBadge();
});
chrome.runtime.onStartup.addListener(updateBadge);
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === "refresh") updateBadge(); });
// Picking or changing teams updates the badge right away.
chrome.storage.onChanged.addListener(changes => { if (changes.favTeams) updateBadge(); });
