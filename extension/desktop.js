// Windows app add-on. The same screens run inside the Chrome extension and inside the desktop app;
// this file only does something in the desktop app, where Tauri provides window.__TAURI__.
(() => {
  const T = window.__TAURI__;
  if (!T) return;
  const SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  // Version in the footer, as the extension shows it.
  T.app.getVersion().then(v => { const el = document.getElementById("ver"); if (el) el.textContent = "v" + v; }).catch(() => {});

  async function notify(title, body) {
    try {
      const n = T.notification;
      let ok = await n.isPermissionGranted();
      if (!ok) ok = (await n.requestPermission()) === "granted";
      if (ok) n.sendNotification({ title, body });
    } catch {}
  }

  // Every two minutes: tray tooltip shows your team's live score (or how many games are live),
  // and a notification fires when one of your teams tips off or finishes.
  async function poll() {
    try {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() - 6 * 3600000)).replace(/-/g, "");
      const data = await (await fetch(`${SCOREBOARD}?dates=${day}`)).json();
      const favs = read("favTeams", []);
      const seen = read("gameStates", {});
      const events = data.events || [];
      const live = events.filter(ev => ev.status?.type?.state === "in");
      const line = ev => {
        const cs = ev.competitions[0].competitors;
        const away = cs.find(c => c.homeAway === "away"), home = cs.find(c => c.homeAway === "home");
        return `${away.team.shortDisplayName} ${away.score} – ${home.score} ${home.team.shortDisplayName}`;
      };
      for (const ev of events) {
        const cs = ev.competitions[0].competitors;
        if (!cs.some(c => favs.includes(c.team.id))) continue;
        const state = ev.status.type.state, before = seen[ev.id];
        if (before === "pre" && state === "in") notify("Tip-off", `${cs.map(c => c.team.shortDisplayName).join(" vs ")} has started.`);
        if (before === "in" && state === "post") notify("Final", line(ev));
        seen[ev.id] = state;
      }
      write("gameStates", seen);
      const mine = live.find(ev => ev.competitions[0].competitors.some(c => favs.includes(c.team.id)));
      const tip = mine ? `${line(mine)} · ${mine.status.type.shortDetail}`
        : live.length ? `Courtside · ${live.length} game${live.length > 1 ? "s" : ""} live` : "Courtside NBA Stats";
      const tray = await T.tray.TrayIcon.getById("main");
      await tray?.setTooltip(tip);
    } catch {}
  }
  poll();
  setInterval(poll, 2 * 60 * 1000);

  // Updates come from the GitHub releases page. Ask once per launch; install and restart on yes.
  setTimeout(async () => {
    try {
      const update = await T.updater.check();
      if (!update) return;
      const yes = await T.dialog.ask(`Courtside ${update.version} is available. You have ${update.currentVersion}.\n\nUpdate now? Courtside will restart.`, { title: "Update available", kind: "info", okLabel: "Update", cancelLabel: "Later" });
      if (!yes) return;
      await update.downloadAndInstall();
      await T.process.relaunch();
    } catch {}
  }, 5000);
})();
