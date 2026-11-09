const SITE ="https://site.api.espn.com/apis";
const WEB = "https://site.web.api.espn.com/apis/common/v3";
const main = document.getElementById("main");
const cache = new Map();

async function getJSON(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN returned ${res.status} for this request.`);
  const data = await res.json();
  cache.set(url, data);
  return data;
}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const loading = msg => { main.innerHTML = `<p class="status">${esc(msg)}</p>`; };
const failed = e => `<p class="status err">Couldn't load data: ${esc(e.message)} Check your internet connection and try again.</p>`;
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, "");

const STANDINGS = `${SITE}/v2/sports/basketball/nba/standings`;
const ALL_PLAYERS = `${WEB}/sports/basketball/nba/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=false&limit=1000&sort=offensive.avgPoints:desc`;
const stat = (e, n) => e.stats.find(s => s.name === n || s.type === n.toLowerCase());
const bySeed = conf => [...conf.standings.entries].sort((a, b) => stat(a, "playoffSeed").value - stat(b, "playoffSeed").value);
const ordinal = n => n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");

/* ---------- Navigation ---------- */
// The four tabs are top-level views. Team and player pages open from lists on top of them,
// so a trail of where the viewer came from powers the Back button.
const TABS = ["scores", "standings", "myteam", "leaders"];
const views = { scores: showScores, standings: showStandings, myteam: showMyTeam, leaders: showLeaders, team: showTeam, player: showPlayer, game: showGame };
let here = ["scores"];
const trail = [];
function go(view, arg) {
  if (TABS.includes(view)) trail.length = 0; else trail.push(here);
  here = [view, arg];
  render();
}
function back() { here = trail.pop() || ["scores"]; render(); }
function render() {
  const [view, arg] = here;
  const tab = TABS.includes(view) ? view : trail[0]?.[0];
  document.querySelectorAll("nav button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab));
  clearTimeout(gameTimer);
  scrollTo(0, 0);
  views[view](arg);
}
const backBtn = () => trail.length ? `<button class="btn back" data-back>&larr; Back</button>` : "";
// Anything marked data-player / data-team / data-game opens that page: whole table rows and cards as well as buttons.
// The innermost link wins, so a player name inside a game card opens the player, not the game.
function wireLinks(root) {
  for (const kind of ["player", "team", "game"]) {
    root.querySelectorAll(`[data-${kind}]`).forEach(el => {
      el.onclick = e => { e.stopPropagation(); go(kind, el.dataset[kind]); };
      if (el.tagName !== "BUTTON") {
        el.tabIndex = 0;
        el.onkeydown = e => { if (e.key === "Enter" && e.target === el) go(kind, el.dataset[kind]); };
      }
    });
  }
  root.querySelectorAll("[data-back]").forEach(b => b.onclick = back);
}
document.querySelectorAll("nav button").forEach(b => b.addEventListener("click", () => go(b.dataset.tab)));

/* ---------- Scores ---------- */
// NBA schedules run on US Eastern dates, so "today" follows New York (rolling over at 6am, after late games end), not the viewer's clock.
const nbaToday = () => { const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(Date.now() - 6 * 3600000)).split("-"); return new Date(y, m - 1, d, 12); };
let scoreDate = nbaToday();
async function showScores() {
  const local = new Date(scoreDate.getTime() - scoreDate.getTimezoneOffset() * 60000);
  main.innerHTML = `
    <div class="toolbar">
      <h2>Scores</h2>
      <button class="btn" id="prev" aria-label="Previous day">&larr;</button>
      <input type="date" id="day" value="${local.toISOString().slice(0, 10)}">
      <button class="btn" id="next" aria-label="Next day">&rarr;</button>
      <button class="btn" id="today">Today</button>
    </div>
    <div id="games"><p class="status">Loading games…</p></div>`;
  const shift = n => { scoreDate = new Date(scoreDate.getTime() + n * 86400000); showScores(); };
  document.getElementById("prev").onclick = () => shift(-1);
  document.getElementById("next").onclick = () => shift(1);
  document.getElementById("today").onclick = () => { scoreDate = nbaToday(); showScores(); };
  document.getElementById("day").onchange = e => { const [y, m, d] = e.target.value.split("-"); scoreDate = new Date(y, m - 1, d, 12); showScores(); };

  const box = document.getElementById("games");
  try {
    const dayKey = local.toISOString().slice(0, 10).replace(/-/g, "");
    cache.delete(`${SITE}/site/v2/sports/basketball/nba/scoreboard?dates=${dayKey}`); // scores change, always refetch
    const data = await getJSON(`${SITE}/site/v2/sports/basketball/nba/scoreboard?dates=${dayKey}`);
    if (!data.events?.length) { box.innerHTML = `<p class="status">No NBA games on this day.</p>`; return; }
    box.innerHTML = `<div class="games">${data.events.map(gameCard).join("")}</div>`;
    wireLinks(box);
  } catch (e) { box.innerHTML = failed(e); }
}
function gameCard(ev) {
  const comp = ev.competitions[0];
  const st = ev.status.type;
  const teams = [...comp.competitors].sort((a, b) => (a.homeAway === "away" ? -1 : 1));
  const done = st.state === "post";
  const scores = teams.map(t => +t.score);
  const stateLabel = st.state === "in" ? `<span class="live">${esc(st.shortDetail)}</span>` : esc(st.state === "pre" ? new Date(ev.date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : st.shortDetail);
  const lines = teams.map((t, i) => {
    const lost = done && scores[i] < scores[1 - i];
    return `<div class="team-line${lost ? " lost" : ""}">
      <img src="${esc(t.team.logo)}" alt="" loading="lazy">
      <div class="team-name">${esc(t.team.shortDisplayName)}<small>${esc(t.records?.[0]?.summary || "")}</small></div>
      <div class="score">${st.state === "pre" ? "" : esc(t.score)}</div>
    </div>`;
  }).join("");
  const leaders = teams.map(t => {
    const cat = t.leaders?.find(l => l.name === "points" || l.name === "pointsPerGame");
    const l = cat?.leaders?.[0];
    if (!l) return "";
    const unit = cat.name === "points" ? "PTS" : "PPG";
    return `<div>${esc(t.team.abbreviation)}: <button class="row-link" data-player="${esc(l.athlete.id)}">${esc(l.athlete.displayName)}</button> ${esc(l.displayValue)} ${unit}</div>`;
  }).join("");
  return `<article class="game" data-game="${esc(ev.id)}" tabindex="0">
    <div class="game-state"><span>${stateLabel}${gameTag(noteOf(ev)) ? ` <span class="pill tag">${esc(gameTag(noteOf(ev)))}</span>` : ""}</span><span>${esc(comp.broadcasts?.[0]?.names?.[0] || "")}</span></div>
    ${lines}
    ${leaders ? `<div class="game-leaders">${leaders}</div>` : ""}
  </article>`;
}

/* ---------- Standings ---------- */
/* ---------- Standings: League · NBA Cup · Playoffs ---------- */
let standingsPane = "league";
// A whole month of games in one request (the scoreboard accepts YYYYMM).
const monthBoard = ym => getJSON(`${SITE}/site/v2/sports/basketball/nba/scoreboard?dates=${ym}&limit=500`).catch(() => ({ events: [] }));
const noteOf = ev => ev.competitions?.[0]?.notes?.[0]?.headline || "";
// Short label for special games, shown as a tag on score cards and schedules.
function gameTag(h) {
  if (!h) return "";
  if (h === "NBA Cup - Group Play") return "NBA Cup";
  if (/NBA Cup - Quarterfinal/.test(h)) return "Cup quarterfinal";
  if (/NBA Cup - Semifinal/.test(h)) return "Cup semifinal";
  if (/NBA Cup Championship/.test(h)) return "Cup final";
  if (/Play-In/.test(h)) return "Play-in";
  const m = h.match(/^(East|West|NBA) (1st Round|Semifinals|Finals) - Game (\d+)/);
  if (m) return `${m[1] === "NBA" ? "" : m[1] + " "}${{ "1st Round": "R1", Semifinals: "semis", Finals: "finals" }[m[2]]} · G${m[3]}`.replace(/^ /, "");
  return h.replace(/^NBA /, "");
}

async function showStandings() {
  loading("Loading standings…");
  try {
    const data = await getJSON(STANDINGS);
    main.innerHTML = `
      <div class="toolbar"><h2>Standings</h2><span class="muted">${esc(data.children[0].standings.seasonDisplayName)}</span></div>
      <div class="seg" role="tablist">${[["league", "League"], ["cup", "NBA Cup"], ["playoffs", "Playoffs"]].map(([k, n]) =>
        `<button role="tab" data-spane="${k}" aria-selected="${k === standingsPane}">${n}</button>`).join("")}</div>
      <div id="stPane"></div>`;
    const pane = document.getElementById("stPane");
    main.querySelectorAll("[data-spane]").forEach(b => b.onclick = () => {
      standingsPane = b.dataset.spane;
      main.querySelectorAll("[data-spane]").forEach(x => x.setAttribute("aria-selected", x === b));
      drawStandingsPane(pane, data);
    });
    drawStandingsPane(pane, data);
  } catch (e) { main.innerHTML = failed(e); }
}

function drawStandingsPane(pane, data) {
  if (standingsPane === "cup") return drawCup(pane, data);
  if (standingsPane === "playoffs") return drawPlayoffs(pane, data);
  pane.innerHTML = `
    <div class="conf-grid">${data.children.map(confTable).join("")}</div>
    <p class="legend">Seeds 1–6 make the playoffs. Seeds 7–10 go to the play-in tournament (below the dashed line is out). Click a team to see its players.</p>`;
  wireLinks(pane);
}

const confOf = (data, id) => data.children.find(c => c.standings.entries.some(e => e.team.id === id))?.abbreviation || "";
const logoOf = t => t?.logos?.[0]?.href || t?.logo || "";

/* NBA Cup: group tables worked out from the Cup games themselves (ESPN labels Cup games but not their group),
   then the knockout bracket. Teams that meet in group play are in the same group. */
async function drawCup(pane, data) {
  pane.innerHTML = `<p class="status">Loading the NBA Cup…</p>`;
  const year = data.children[0].standings.season - 1;
  const boards = await Promise.all(["10", "11", "12"].map(m => monthBoard(`${year}${m}`)));
  if (standingsPane !== "cup") return;
  const events = boards.flatMap(b => b.events || []);
  const groupGames = events.filter(ev => noteOf(ev) === "NBA Cup - Group Play");
  if (!groupGames.length) { pane.innerHTML = `<p class="status">The NBA Cup schedule isn't out yet.</p>`; return; }

  const parent = {}, teams = {}, rec = {};
  const find = x => parent[x] === x ? x : (parent[x] = find(parent[x]));
  for (const ev of groupGames) {
    const cs = ev.competitions[0].competitors;
    for (const c of cs) { parent[c.team.id] ??= c.team.id; teams[c.team.id] = c.team; rec[c.team.id] ??= { w: 0, l: 0, pf: 0, pa: 0 }; }
    parent[find(cs[0].team.id)] = find(cs[1].team.id);
    if (ev.status.type.state !== "post") continue;
    for (const c of cs) {
      const o = cs.find(x => x !== c), r = rec[c.team.id];
      c.winner ? r.w++ : r.l++;
      r.pf += +c.score || 0; r.pa += +o.score || 0;
    }
  }
  const rank = (a, b) => {
    const pct = x => (x.w + x.l ? x.w / (x.w + x.l) : 0);
    return pct(rec[b]) - pct(rec[a]) || (rec[b].pf - rec[b].pa) - (rec[a].pf - rec[a].pa) || rec[b].pf - rec[a].pf;
  };
  const byRoot = {};
  for (const id of Object.keys(parent)) (byRoot[find(id)] ??= []).push(id);
  const groups = Object.values(byRoot).map(ids => ({ conf: confOf(data, ids[0]), ids: ids.sort(rank) }))
    .sort((a, b) => a.conf.localeCompare(b.conf) || [...a.ids].sort().join().localeCompare([...b.ids].sort().join()));
  // Group winners go through, plus the best second-placed team in each conference.
  const wild = {};
  for (const conf of ["East", "West"]) wild[conf] = groups.filter(g => g.conf === conf).map(g => g.ids[1]).filter(Boolean).sort(rank)[0];

  // Knockouts: quarterfinals and semifinals stay within a conference, the final is East vs West.
  const played = groupGames.filter(ev => ev.status.type.state === "post").length;
  const ko = events.filter(ev => /^NBA Cup (- (Quarter|Semi)finals|Championship)/.test(noteOf(ev))).sort((a, b) => new Date(a.date) - new Date(b.date));
  const koStarted = played === groupGames.length || ko.some(ev => ev.status.type.state !== "pre");
  const real = c => c.team?.id && !/TBD/i.test(c.team.abbreviation || "");
  const gameConf = ev => { const c = ev.competitions[0].competitors.find(real); return c ? confOf(data, c.team.id) : null; };
  const split = (list, n) => {
    const out = { West: list.filter(ev => gameConf(ev) === "West"), East: list.filter(ev => gameConf(ev) === "East") };
    const unknown = list.filter(ev => !gameConf(ev));
    for (const k of ["West", "East"]) { while (out[k].length < n && unknown.length) out[k].push(unknown.shift()); while (out[k].length < n) out[k].push(null); }
    return out;
  };
  const koCard = ev => {
    if (!ev) return emptyCard("");
    const cs = ev.competitions[0].competitors, st = ev.status.type;
    const winner = st.state === "post" ? cs.find(c => c.winner) : null;
    return miniCard(cs.map(c => real(c) ? { team: c.team, value: st.state === "pre" ? "" : c.score, won: winner === c, lost: winner && winner !== c } : { label: "TBD" }),
      ev.id, st.state === "pre" ? fmtDay(new Date(ev.date)) : st.state === "in" ? st.shortDetail : "Final");
  };
  const qf = split(ko.filter(ev => /Quarterfinal/.test(noteOf(ev))), 2);
  const sf = split(ko.filter(ev => /Semifinal/.test(noteOf(ev))), 1);
  const final = ko.find(ev => /Championship/.test(noteOf(ev)));
  const side = c => [qf[c].map(koCard), sf[c].map(koCard)];
  const bracket = ko.length ? `
    <h3>Knockout rounds</h3>
    ${mirrorBracket(side("West"), side("East"), ["Quarterfinals", "Semifinals"], koCard(final || null), "Championship", "with-foot cup")}` : "";

  const groupCard = (g, n) => `
    <section class="group">
      <h4>${esc(g.conf)} · Group ${n}</h4>
      <table><tbody>${g.ids.map((id, i) => {
        const r = rec[id], pd = r.pf - r.pa;
        const tag = i === 0 ? `<span class="pill home">Leads</span>` : id === wild[g.conf] ? `<span class="pill">Wild card</span>` : "";
        return `<tr data-team="${esc(id)}"><td class="rank">${i + 1}</td>
          <td class="left"><div class="who"><img class="logo" src="${esc(logoOf(teams[id]))}" alt=""><span class="hl">${esc(teams[id].abbreviation)}</span> ${tag}</div></td>
          <td><b>${r.w}-${r.l}</b></td><td class="${pd > 0 ? "w" : pd < 0 ? "l" : ""}">${pd > 0 ? "+" : ""}${pd}</td></tr>`;
      }).join("")}</tbody></table>
    </section>`;
  const column = conf => groups.filter(g => g.conf === conf).map((g, i) => groupCard(g, i + 1)).join("");
  const groupHtml = `
    <h3>Group play</h3>
    <div class="facts sched-sum"><span>Games played <b>${played} of ${groupGames.length}</b></span>${ko.length ? `<span>Knockouts start <b>${esc(fmtDay(new Date(ko[0].date)))}</b></span>` : ""}</div>
    <div class="groups"><div class="gcol">${column("West")}</div><div class="gcol">${column("East")}</div></div>
    <p class="legend">Group winners and the best second-placed team in each conference reach the quarterfinals. Ties here are split by point differential; the official rules check head-to-head first. ESPN doesn't publish the group letters, so groups are numbered.</p>`;

  pane.innerHTML = koStarted ? bracket + groupHtml : groupHtml + bracket;
  wireLinks(pane);
}

/* ---------- Mirrored brackets (West on the left, East on the right, final in the middle) ---------- */
// Compact matchup card. sides: [{ team, seed, value, won, lost, label, link }]; foot is an optional small line under it.
function miniCard(sides, gameId, foot) {
  const row = s => s?.team?.id
    ? `<span class="mr2 ${s.won ? "win" : s.lost ? "out" : ""}"${s.link ? ` data-team="${esc(s.team.id)}"` : ""}><img src="${esc(logoOf(s.team))}" alt=""><i>${esc(s.seed || "")}</i><span>${esc(s.team.abbreviation)}</span><b>${esc(s.value ?? "")}</b></span>`
    : `<span class="mr2 tbd"><span class="dot"></span><i></i><span>${esc(s?.label || "TBD")}</span><b></b></span>`;
  const title = sides.map(s => s?.team?.displayName || s?.label || "TBD").join(" vs ") + (foot ? ` · ${foot}` : "");
  const tag = gameId ? "button" : "div";
  return `<${tag} class="mini"${gameId ? ` data-game="${esc(gameId)}"` : ""} title="${esc(title)}">${row(sides[0])}${row(sides[1])}${foot !== undefined ? `<small>${esc(foot)}</small>` : ""}</${tag}>`;
}
const emptyCard = foot => miniCard([{ label: "" }, { label: "" }], null, foot);

// rounds: arrays of card HTML, outermost round first. Pairs of cards feed the next round's card.
function bracketSide(rounds, labels, dir) {
  const cols = rounds.map((cards, i) => {
    const last = i === rounds.length - 1;
    const inner = last ? `<div class="slot">${cards[0]}</div>` : (() => {
      const pairs = [];
      for (let j = 0; j < cards.length; j += 2) pairs.push(cards.slice(j, j + 2));
      return pairs.map(p => `<div class="pair${pairs.length === 1 ? " fill" : ""}">${p.join("")}</div>`).join("");
    })();
    return `<div class="bcol ${dir}${i ? " fed" : ""}${last ? " last" : ""}"><h4>${labels[i]}</h4><div class="bgames">${inner}</div></div>`;
  });
  return (dir === "east" ? cols.reverse() : cols).join("");
}
function mirrorBracket(west, east, labels, center, centerLabel, cls = "") {
  // Fixed, card-shaped columns, centred. The outermost round holds the most (seeds, records), so it gets a little more room;
  // with fewer rounds (NBA Cup) the gaps grow instead of the cards.
  const deep = west.length >= 3;
  const [outer, inner, mid, gap] = deep ? [100, 86, 96, 12] : [104, 96, 104, 28];
  const innerCols = Array(west.length - 1).fill(`${inner}px`).join(" ");
  return `<div class="mirror-wrap ${cls}">
    <div class="mirror-head"><span>West</span><span>East</span></div>
    <div class="mirror ${cls}" style="--gap:${gap}px; grid-template-columns: ${outer}px ${innerCols} ${mid}px ${innerCols} ${outer}px">
      ${bracketSide(west, labels, "west")}
      <div class="bcol center"><h4>${centerLabel}</h4><div class="bgames"><div class="slot">${center}</div></div></div>
      ${bracketSide(east, labels, "east")}
    </div>
  </div>`;
}

// Playoff seeds 1–10 from the standings, keyed by team id.
function seedMap(data) {
  const out = {};
  for (const c of data.children) bySeed(c).forEach((e, i) => out[e.team.id] = i + 1);
  return out;
}

/* Playoffs: the real bracket once play-in or playoff games exist, otherwise "if the season ended today". */
/* Playoffs. Both the live bracket and the "if the season ended today" projection are first turned into one model:
   { West: { rounds: [[4 slots], [2], [1]], playIn: [3 slots] }, East: {…}, finals: slot, live }
   where a slot is { sides: [{ team, seed, record, value, won, lost, label, link }], gameId, status, foot } or null.
   The model is then drawn as the whole bracket, or one conference at a time with larger cards. */
let poView = (() => { try { return localStorage.getItem("poView") || "all"; } catch { return "all"; } })();
const R1_LABELS = ["First round", "Semis", "Conf. finals"];

async function drawPlayoffs(pane, data) {
  pane.innerHTML = `<p class="status">Loading the playoffs…</p>`;
  const year = data.children[0].standings.season;
  const boards = await Promise.all(["04", "05", "06"].map(m => monthBoard(`${year}${m}`)));
  if (standingsPane !== "playoffs") return;
  const events = boards.flatMap(b => b.events || []).filter(ev => /(1st Round|Semifinals|Finals|Play-In)/.test(noteOf(ev)) && !/Cup/.test(noteOf(ev)));
  renderPlayoffs(pane, events.length ? liveModel(events, data) : projectionModel(data));
}

function projectionModel(data) {
  const model = { live: false, finals: null };
  for (const c of data.children) {
    const s = bySeed(c);
    const side = i => s[i] ? { team: s[i].team, seed: i + 1, record: stat(s[i], "overall")?.displayValue, link: true } : { label: "TBD" };
    const slot = (sides, foot, status) => ({ sides, foot, status });
    model[c.abbreviation] = {
      rounds: [
        [slot([side(0), { label: "Play-in winner" }]), slot([side(3), side(4)]), slot([side(2), side(5)]), slot([side(1), { label: "Play-in winner" }])],
        [null, null], [null],
      ],
      playIn: [slot([side(6), side(7)], "7 vs 8", "Winner is the 7 seed"), slot([side(8), side(9)], "9 vs 10", "Loser is out"),
               slot([{ label: "L of 7/8" }, { label: "W of 9/10" }], "For the 8 seed", "Winner is the 8 seed")],
    };
  }
  return model;
}

function liveModel(events, data) {
  const seeds = seedMap(data);
  const records = {};
  for (const c of data.children) for (const e of c.standings.entries) records[e.team.id] = stat(e, "overall")?.displayValue;
  // One series per round and pair of teams; the latest game carries the series score.
  const series = {};
  for (const ev of [...events].sort((a, b) => new Date(a.date) - new Date(b.date))) {
    const cs = ev.competitions[0].competitors;
    const round = noteOf(ev).replace(/ - Game \d+$/, "");
    const s = series[round + ":" + cs.map(c => c.team.id).sort().join("-")] ??= { round, teams: cs.map(c => c.team), games: [] };
    s.games.push(ev);
  }
  const list = re => Object.values(series).filter(s => re.test(s.round));
  const has = (s, id) => s?.teams.some(t => t.id === id);

  const toSlot = (s, showSeeds, foot) => {
    if (!s) return foot ? { sides: [{ label: "" }, { label: "" }], foot } : null;
    const last = [...s.games].reverse().find(ev => ev.status.type.state !== "pre") || s.games[0];
    const next = s.games.find(ev => ev.status.type.state === "pre");
    const comp = last.competitions[0];
    const playIn = /Play-In/.test(s.round);
    const wins = id => playIn ? (comp.competitors.find(c => c.team.id === id)?.winner ? 1 : 0) : comp.series?.competitors?.find(c => c.id === id)?.wins ?? 0;
    const winner = s.teams.find(t => wins(t.id) === (playIn ? 1 : 4) && (!playIn || last.status.type.state === "post"));
    const value = t => playIn ? (last.status.type.state === "pre" ? "" : comp.competitors.find(c => c.team.id === t.id)?.score) : wins(t.id);
    const live = s.games.find(ev => ev.status.type.state === "in");
    const status = live ? `Live · ${live.status.type.shortDetail}`
      : winner ? (playIn ? `${winner.shortDisplayName} win` : comp.series?.summary || "")
      : next ? `${playIn ? "" : `Game ${s.games.indexOf(next) + 1} · `}${fmtDay(new Date(next.date))} ${fmtTime(new Date(next.date))}`
      : comp.series?.summary || "";
    return {
      sides: s.teams.map(t => ({ team: t, seed: showSeeds ? seeds[t.id] : "", record: records[t.id], value: value(t), won: winner?.id === t.id, lost: winner && winner.id !== t.id })),
      gameId: (live || last).id, status, foot,
    };
  };

  const model = { live: true, r1Started: events.some(ev => /1st Round/.test(noteOf(ev)) && ev.status.type.state !== "pre") };
  for (const c of ["West", "East"]) {
    const r1 = list(new RegExp(`^${c} 1st Round`)), sf = list(new RegExp(`^${c} Semifinals`)), cf = list(new RegExp(`^${c} Finals`));
    // Seed numbers are trusted only if every first-round pair adds up to 9 (1v8, 4v5, 3v6, 2v7).
    const seedOk = r1.length > 0 && r1.every(s => seeds[s.teams[0].id] + seeds[s.teams[1].id] === 9);
    let R1 = [null, null, null, null];
    if (seedOk) {
      const pos = { 1: 0, 8: 0, 4: 1, 5: 1, 3: 2, 6: 2, 2: 3, 7: 3 };
      r1.forEach(s => R1[pos[Math.min(...s.teams.map(t => seeds[t.id]))]] = s);
    } else {
      // Without trustworthy seeds, keep series that feed the same semifinal next to each other.
      const order = [];
      for (const semi of sf) for (const s of r1) if (!order.includes(s) && s.teams.some(t => has(semi, t.id))) order.push(s);
      for (const s of r1) if (!order.includes(s)) order.push(s);
      R1 = [...order, null, null, null, null].slice(0, 4);
    }
    const SF = [0, 1].map(h => sf.find(semi => [R1[h * 2], R1[h * 2 + 1]].some(s => s?.teams.some(t => has(semi, t.id)))) || null);
    sf.forEach(semi => { if (!SF.includes(semi)) { const k = SF.indexOf(null); if (k >= 0) SF[k] = semi; } });
    const playIn = [["7th Place vs 8th Place", "7 vs 8"], ["9th Place vs 10th Place", "9 vs 10"], ["8th Seed Game", "For the 8 seed"]]
      .map(([h, foot]) => toSlot(list(new RegExp(`Play-In - ${c} - ${h}`))[0] || null, false, foot));
    model[c] = { rounds: [R1.map(s => toSlot(s, seedOk)), SF.map(s => toSlot(s, seedOk)), [toSlot(cf[0] || null, seedOk)]], playIn };
  }
  model.finals = toSlot(list(/^NBA Finals/)[0] || null, false);
  return model;
}

const slotMini = sl => sl ? miniCard(sl.sides.map(s => ({ ...s, value: s.value ?? s.record })), sl.gameId, sl.foot) : emptyCard();

// Larger card for the one-conference view: full names, seeds, records and the series status.
function bigCard(sl) {
  if (!sl) sl = { sides: [{ label: "TBD" }, { label: "TBD" }] };
  const row = s => s?.team?.id
    ? `<span class="br ${s.won ? "win" : s.lost ? "out" : ""}"${s.link ? ` data-team="${esc(s.team.id)}"` : ""}>
        <img src="${esc(logoOf(s.team))}" alt="">${s.seed ? `<i>${esc(s.seed)}</i>` : ""}
        <span class="bn2">${esc(s.team.shortDisplayName || s.team.displayName)}<small>${esc(s.record || "")}</small></span>
        <b>${esc(s.value ?? "")}</b></span>`
    : `<span class="br tbd"><span class="dot"></span><span class="bn2">${esc(s?.label || "TBD")}</span><b></b></span>`;
  const tag = sl.gameId ? "button" : "div";
  return `<${tag} class="mini big"${sl.gameId ? ` data-game="${esc(sl.gameId)}"` : ""}>
    ${row(sl.sides[0])}${row(sl.sides[1])}
    <small class="bstat">${esc([sl.foot, sl.status].filter(Boolean).join(" · "))}</small>
  </${tag}>`;
}

function renderPlayoffs(pane, model) {
  const views = [["all", "All"], ["West", "West"], ["East", "East"]];
  const head = `
    <div class="po-head">
      <div class="seg sm" role="tablist">${views.map(([k, n]) => `<button role="tab" data-po="${k}" aria-selected="${k === poView}">${n}</button>`).join("")}</div>
      ${model.live ? "" : `<div class="facts"><span><b>If the season ended today</b></span><span>Playoffs start <b>mid-April</b></span></div>`}
    </div>`;
  const playInOpen = !model.live || !model.r1Started;
  let body;
  if (poView === "all") {
    body = `
      ${mirrorBracket(model.West.rounds.map(r => r.map(slotMini)), model.East.rounds.map(r => r.map(slotMini)), R1_LABELS, slotMini(model.finals), "NBA Finals")}
      ${playInBlock(model.West.playIn.map(slotMini), model.East.playIn.map(slotMini), playInOpen)}`;
  } else {
    const c = model[poView], dir = poView === "West" ? "west" : "east";
    body = `
      <div class="mirror-head"><span>${poView === "West" ? "Western Conference" : ""}</span><span>${poView === "East" ? "Eastern Conference" : ""}</span></div>
      <div class="mirror conf-view">${bracketSide(c.rounds.map(r => r.map(bigCard)), R1_LABELS, dir)}</div>
      <details class="playin-wrap"${playInOpen ? " open" : ""}>
        <summary>Play-in tournament</summary>
        <div class="playin-row">${c.playIn.map(bigCard).join("")}</div>
      </details>`;
  }
  pane.innerHTML = `${head}${body}
    <p class="legend">${model.live ? "Series wins shown for each matchup. Click a series to open its latest game." : "Based on the current standings, with each team's record. Once the play-in starts, this becomes the live bracket."} ${poView === "all" ? "Hover a card for full team names." : ""}</p>`;
  pane.querySelectorAll("[data-po]").forEach(b => b.onclick = () => {
    poView = b.dataset.po;
    try { localStorage.setItem("poView", poView); } catch {}
    renderPlayoffs(pane, model);
  });
  wireLinks(pane);
}

function playInBlock(west, east, open) {
  return `<details class="playin-wrap"${open ? " open" : ""}>
    <summary>Play-in tournament</summary>
    <div class="playin-grid"><div><h4>West</h4>${west.join("")}</div><div><h4>East</h4>${east.join("")}</div></div>
  </details>`;
}



function confTable(conf) {
  const rows = bySeed(conf);
  return `<section><h3>${esc(conf.name)}</h3><div class="table-wrap"><table>
    <thead><tr><th>#</th><th class="left">Team</th><th>W</th><th>L</th><th>PCT</th><th>GB</th><th>Home</th><th>Road</th><th>L10</th><th>Strk</th><th>Diff</th></tr></thead>
    <tbody>${rows.map((e, i) => {
      const diff = stat(e, "differential")?.value ?? 0;
      const strk = stat(e, "streak")?.displayValue || "";
      return `<tr class="${i === 5 || i === 9 ? "cutoff" : ""}" data-team="${esc(e.team.id)}">
        <td class="rank">${i + 1}</td>
        <td><div class="who"><img class="logo" src="${esc(e.team.logos?.[0]?.href)}" alt="" loading="lazy"><span class="hl">${esc(e.team.shortDisplayName)}</span></div></td>
        <td>${esc(stat(e, "wins")?.displayValue)}</td><td>${esc(stat(e, "losses")?.displayValue)}</td>
        <td>${esc(stat(e, "winPercent")?.displayValue)}</td><td>${esc(stat(e, "gamesBehind")?.displayValue)}</td>
        <td>${esc(stat(e, "Home")?.displayValue)}</td><td>${esc(stat(e, "Road")?.displayValue)}</td>
        <td>${esc(stat(e, "Last Ten Games")?.displayValue)}</td>
        <td class="${strk.startsWith("W") ? "w" : "l"}">${esc(strk)}</td>
        <td class="${diff >= 0 ? "w" : "l"}">${diff > 0 ? "+" : ""}${diff.toFixed(1)}</td>
      </tr>`;
    }).join("")}</tbody></table></div></section>`;
}

/* ---------- Leaders ---------- */
const LEADER_CATS = [
  ["offensive.avgPoints", "Points"], ["general.avgRebounds", "Rebounds"], ["offensive.avgAssists", "Assists"],
  ["defensive.avgSteals", "Steals"], ["defensive.avgBlocks", "Blocks"], ["offensive.avgThreePointFieldGoalsMade", "3-pointers made"],
  ["offensive.fieldGoalPct", "Field goal %"], ["offensive.threePointFieldGoalPct", "3-point %"], ["offensive.freeThrowPct", "Free throw %"],
];
const LEADER_COLS = [
  ["general.gamesPlayed", "GP"], ["general.avgMinutes", "MIN"], ["offensive.avgPoints", "PTS"], ["general.avgRebounds", "REB"],
  ["offensive.avgAssists", "AST"], ["defensive.avgSteals", "STL"], ["defensive.avgBlocks", "BLK"], ["offensive.avgTurnovers", "TO"],
  ["offensive.fieldGoalPct", "FG%"], ["offensive.avgThreePointFieldGoalsMade", "3PM"], ["offensive.threePointFieldGoalPct", "3P%"], ["offensive.freeThrowPct", "FT%"],
];
let leaderSort = "offensive.avgPoints";
async function showLeaders() {
  main.innerHTML = `
    <div class="toolbar">
      <h2>League leaders</h2>
      <label for="cat" class="muted">Rank by</label>
      <span class="select"><select id="cat">${LEADER_CATS.map(([k, n]) => `<option value="${k}"${k === leaderSort ? " selected" : ""}>${n}</option>`).join("")}</select></span>
    </div>
    <div id="lt"><p class="status">Loading leaders…</p></div>
    <p class="legend">Qualified players only. Click a column header to re-rank, or a name to open the player.</p>`;
  document.getElementById("cat").onchange = e => { leaderSort = e.target.value; showLeaders(); };
  const box = document.getElementById("lt");
  try {
    const data = await getJSON(`${WEB}/sports/basketball/nba/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=true&page=1&limit=50&sort=${leaderSort}:desc`);
    const idx = {};
    data.categories.forEach((c, ci) => c.names.forEach((n, ni) => idx[`${c.name}.${n}`] = [ci, ni]));
    const val = (a, key) => {
      const [ci, ni] = idx[key] || [];
      const cat = a.categories.find(c => c.name === data.categories[ci]?.name);
      return cat?.totals?.[ni] ?? "";
    };
    box.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>#</th><th class="left">Player</th><th class="left">Team</th>
        ${LEADER_COLS.map(([k, n]) => `<th class="sortable${k === leaderSort ? " sorted" : ""}" data-k="${k}">${n}</th>`).join("")}</tr></thead>
      <tbody>${data.athletes.map((a, i) => `<tr data-player="${esc(a.athlete.id)}">
        <td class="rank">${i + 1}</td>
        <td><div class="who"><img src="${esc(a.athlete.headshot?.href)}" alt="" loading="lazy"><span class="hl">${esc(a.athlete.displayName)}</span></div></td>
        <td class="left muted">${esc(a.athlete.teamShortName)}</td>
        ${LEADER_COLS.map(([k]) => `<td class="${k === leaderSort ? "col-on" : ""}">${esc(val(a, k))}</td>`).join("")}
      </tr>`).join("")}</tbody></table></div>`;
    box.querySelectorAll("th.sortable").forEach(th => th.onclick = () => { leaderSort = th.dataset.k; showLeaders(); });
    wireLinks(box);
  } catch (e) { box.innerHTML = failed(e); }
}

/* ---------- Game ---------- */
const COMPARE = [
  ["fieldGoalPct", "Field goal %", true], ["threePointFieldGoalPct", "3-point %", true], ["freeThrowPct", "Free throw %", true],
  ["totalRebounds", "Rebounds"], ["assists", "Assists"], ["steals", "Steals"], ["blocks", "Blocks"],
  ["totalTurnovers", "Turnovers", false, true], ["pointsInPaint", "Points in paint"], ["fastBreakPoints", "Fast break points"],
];
// Spots on a half court, as fractions of its width and of its depth from the baseline (matches the classic 1–5 diagram).
const SPOTS = { 1: [0.40, 0.73], 2: [0.79, 0.60], 3: [0.16, 0.19], 4: [0.82, 0.22], 5: [0.34, 0.36] };
const POS_SLOTS = { PG: [1], SG: [2], SF: [3], PF: [4], C: [5], G: [1, 2], F: [3, 4], "G-F": [2, 3], "F-G": [3, 2], "F-C": [4, 5], "C-F": [5, 4] };
let gameTimer = null;

async function showGame(id) {
  clearTimeout(gameTimer);
  if (!main.querySelector(".game-hero")) loading("Loading game…");
  const url = `${SITE}/site/v2/sports/basketball/nba/summary?event=${id}`;
  cache.delete(url); // live games change every few seconds
  try {
    const data = await getJSON(url);
    if (here[0] !== "game" || here[1] !== id) return; // viewer moved on while this loaded
    const comp = data.header.competitions[0];
    const st = comp.status.type;
    const sides = ["away", "home"].map(ha => {
      const c = comp.competitors.find(x => x.homeAway === ha);
      const box = data.boxscore?.players?.find(p => p.team.id === c.team.id)?.statistics?.[0];
      const teamStats = data.boxscore?.teams?.find(t => t.team.id === c.team.id)?.statistics || [];
      return { ha, c, t: c.team, box, keys: box?.keys || [], athletes: box?.athletes || [], teamStats };
    });

    const live = st.state === "in";
    const lineupLabel = live ? "On court now" : "Starting lineups";
    sides.forEach(s => { s.five = st.state === "pre" ? [] : onCourt(s, data.plays || [], live); });
    const hasCourt = sides.every(s => s.five.length === 5);

    const stateText = live ? `<span class="live">${esc(st.shortDetail)}</span>` : esc(st.state === "pre" ? new Date(data.header.competitions[0].date).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : st.shortDetail);
    main.innerHTML = `
      <div class="toolbar">${backBtn()}</div>
      <section class="game-hero">
        ${sides.map((s, i) => `
          <button class="gh-team ${i ? "right" : ""}" data-team="${esc(s.t.id)}">
            <img src="${esc(s.t.logos?.[0]?.href)}" alt="">
            <span class="gh-name">${esc(s.t.name || s.t.displayName)}<small>${esc(s.c.record?.[0]?.displayValue || "")} · ${s.ha === "home" ? "Home" : "Away"}</small></span>
          </button>
          ${i === 0 ? `<div class="gh-score">
            <div class="gh-nums"><span class="${st.state === "post" && !s.c.winner ? "dim" : ""}">${st.state === "pre" ? "" : esc(s.c.score)}</span><span class="gh-dash">${st.state === "pre" ? "vs" : "–"}</span><span class="${st.state === "post" && !sides[1].c.winner ? "dim" : ""}">${st.state === "pre" ? "" : esc(sides[1].c.score)}</span></div>
            <div class="gh-state">${stateText}</div>
          </div>` : ""}`).join("")}
      </section>

      ${st.state !== "pre" && sides[0].teamStats.length ? `
        <h3>Team stats</h3>
        <section class="compare">${COMPARE.map(([key, label, pct, lowerIsBetter]) => compareRow(sides, key, label, pct, lowerIsBetter)).join("")}</section>` : ""}

      ${hasCourt ? `
        <h3>${lineupLabel}</h3>
        <section class="court">
          ${courtSvg()}
          ${sides.map(s => s.five.map(({ a, slot }) => {
            const [x, y] = SPOTS[slot];
            const top = s.ha === "away" ? y * 50 : 100 - y * 50;
            return `<button class="on-court" data-player="${esc(a.athlete.id)}" style="left:${(x * 100).toFixed(1)}%;top:${top.toFixed(1)}%;--ring:#${esc(s.t.color || "777")}">
              <img src="${esc(a.athlete.headshot?.href)}" alt=""><span>${esc(a.athlete.shortName || a.athlete.displayName)}</span></button>`;
          }).join("")).join("")}
          <span class="court-tag top">${esc(sides[0].t.abbreviation)}</span><span class="court-tag bottom">${esc(sides[1].t.abbreviation)}</span>
        </section>` : st.state === "pre" ? `<p class="status">Lineups and the court view appear once the game tips off.</p>` : ""}

      ${sides[0].athletes.length ? `
        <h3>Bench</h3>
        <section class="benches">${sides.map(s => benchList(s)).join("")}</section>` : ""}
      ${live ? `<p class="legend">Updates every 30 seconds.</p>` : ""}`;
    wireLinks(main);
    if (live) gameTimer = setTimeout(() => { if (here[0] === "game" && here[1] === id) showGame(id); }, 30000);
  } catch (e) { main.innerHTML = `<div class="toolbar">${backBtn()}</div>${failed(e)}`; wireLinks(main); }
}

// During a live game ESPN flags the five on court as "active". If that flag isn't usable,
// start from the starters and replay every substitution ("X enters the game for Y").
function onCourt(side, plays, live) {
  const byId = Object.fromEntries(side.athletes.map(a => [a.athlete.id, a]));
  const active = side.athletes.filter(a => a.active);
  if (live && active.length === 5) return assignSlots(active, side.keys);
  let five = side.athletes.filter(a => a.starter).map(a => a.athlete.id);
  if (live) {
    for (const p of plays) {
      if (p.team?.id !== side.t.id || !/substitution/i.test(p.type?.text || "")) continue;
      const [inId, outId] = (p.participants || []).map(x => x.athlete?.id);
      if (!inId || five.includes(inId)) continue;
      const i = five.indexOf(outId);
      if (i >= 0) five[i] = inId; else if (five.length < 5) five.push(inId);
    }
  }
  return assignSlots(five.map(id => byId[id]).filter(Boolean), side.keys);
}

// Put each player on a 1–5 spot from his listed position; guards with more assists take the point.
function assignSlots(players, keys) {
  const ast = a => +(a.stats?.[keys.indexOf("assists")] || 0);
  const order = [...players].sort((a, b) => {
    const pa = POS_SLOTS[a.athlete.position?.abbreviation] || [], pb = POS_SLOTS[b.athlete.position?.abbreviation] || [];
    return (pa.length || 9) - (pb.length || 9) || ast(b) - ast(a);
  });
  const taken = new Set(), out = [];
  for (const a of order) {
    const want = (POS_SLOTS[a.athlete.position?.abbreviation] || []).find(s => !taken.has(s));
    if (want) { taken.add(want); out.push({ a, slot: want }); }
  }
  for (const a of order) {
    if (out.some(o => o.a === a)) continue;
    const free = [1, 2, 3, 4, 5].find(s => !taken.has(s));
    taken.add(free); out.push({ a, slot: free });
  }
  return out;
}

function compareRow(sides, key, label, pct, lowerIsBetter) {
  const vals = sides.map(s => s.teamStats.find(x => x.name === key));
  if (!vals[0] || !vals[1]) return "";
  const [a, b] = vals.map(v => parseFloat(v.displayValue) || 0);
  const total = a + b || 1;
  const better = a === b ? -1 : (a > b) !== !!lowerIsBetter ? 0 : 1;
  const shown = vals.map(v => v.displayValue + (pct ? "%" : ""));
  return `<div class="cmp">
    <span class="cv ${better === 0 ? "win" : ""}">${esc(shown[0])}</span>
    <div class="cbar left"><i style="width:${(a / total * 100).toFixed(1)}%" class="${better === 0 ? "win" : ""}"></i></div>
    <span class="cl">${esc(label)}</span>
    <div class="cbar"><i style="width:${(b / total * 100).toFixed(1)}%" class="${better === 1 ? "win" : ""}"></i></div>
    <span class="cv ${better === 1 ? "win" : ""}">${esc(shown[1])}</span>
  </div>`;
}

function benchList(s) {
  const onIds = new Set(s.five.map(o => o.a.athlete.id));
  const k = name => s.keys.indexOf(name);
  const bench = s.athletes.filter(a => !onIds.has(a.athlete.id));
  return `<div class="bench">
    <div class="bench-head"><img src="${esc(s.t.logos?.[0]?.href)}" alt="">${esc(s.t.shortDisplayName || s.t.name)}</div>
    ${bench.map(a => `<button class="bench-row" data-player="${esc(a.athlete.id)}">
      <img src="${esc(a.athlete.headshot?.href)}" alt="" loading="lazy">
      <span class="bn">${esc(a.athlete.displayName)}<small>${esc([a.athlete.jersey && "#" + a.athlete.jersey, a.athlete.position?.abbreviation].filter(Boolean).join(" · "))}</small></span>
      ${a.didNotPlay || !a.stats?.length ? `<span class="dnp">${esc(a.reason ? "DNP" : "—")}</span>` : `<span class="bs"><span><b>${esc(a.stats[k("points")])}</b> PTS · ${esc(a.stats[k("rebounds")])} REB · ${esc(a.stats[k("assists")])} AST</span><small>${esc(a.stats[k("minutes")])} MIN</small></span>`}
    </button>`).join("") || `<p class="muted">No bench players listed.</p>`}
  </div>`;
}

// Full court drawn top to bottom: away team defends the top basket, home team the bottom one.
function courtSvg() {
  const half = `
    <rect x="180" y="0" width="130" height="190" class="paint"/>
    <line x1="180" y1="0" x2="180" y2="190"/><line x1="310" y1="0" x2="310" y2="190"/><line x1="180" y1="190" x2="310" y2="190"/>
    <path d="M180 190 A65 65 0 0 0 310 190"/><path d="M180 190 A65 65 0 0 1 310 190" stroke-dasharray="8 8"/>
    <path d="M40 0 V70 A205 205 0 0 0 450 70 V0"/>
    <path d="M220 52 A25 25 0 0 0 270 52"/>
    <line x1="215" y1="36" x2="275" y2="36" class="board"/>
    <circle cx="245" cy="48" r="10" class="rim"/>`;
  return `<svg viewBox="0 0 490 736" preserveAspectRatio="none" aria-hidden="true">
    <rect x="2" y="2" width="486" height="732" class="edge"/>
    <line x1="0" y1="368" x2="490" y2="368"/>
    <circle cx="245" cy="368" r="60"/><circle cx="245" cy="368" r="20"/>
    <g>${half}</g>
    <g transform="translate(0 736) scale(1 -1)">${half}</g>
  </svg>`;
}

/* ---------- My Team ---------- */
// Favourite teams live in Chrome's synced extension storage, so they follow the viewer to other computers.
// Opened as a plain web page (no extension APIs), this browser's local storage stands in.
const favStore = {
  async get() {
    try {
      if (globalThis.chrome?.storage?.sync) return (await chrome.storage.sync.get("favTeams")).favTeams || [];
      return JSON.parse(localStorage.getItem("favTeams") || "[]");
    } catch { return []; }
  },
  async set(ids) {
    try {
      if (globalThis.chrome?.storage?.sync) await chrome.storage.sync.set({ favTeams: ids });
      else localStorage.setItem("favTeams", JSON.stringify(ids));
    } catch {}
  },
};
const teamIndex = standings => Object.fromEntries(standings.children.flatMap(c => c.standings.entries.map(e => [e.team.id, e.team])));
let myTeamId = null;

async function showMyTeam(mode) {
  loading("Loading your team…");
  try {
    const [favs, standings] = await Promise.all([favStore.get(), getJSON(STANDINGS)]);
    if (mode === "edit" || !favs.length) return showPicker(favs, standings);
    if (!favs.includes(myTeamId)) myTeamId = favs[0];
    const teams = teamIndex(standings);
    main.innerHTML = `
      <div class="toolbar">
        <h2>My Team</h2>
        ${favs.length > 1 ? `<div class="fav-switch">${favs.map(id => `
          <button class="${id === myTeamId ? "on" : ""}" data-fav="${esc(id)}"><img src="${esc(teams[id]?.logos?.[0]?.href)}" alt="">${esc(teams[id]?.abbreviation || "")}</button>`).join("")}</div>` : ""}
        <button class="btn" id="editTeams">Edit teams</button>
      </div>
      <div id="teamBody"></div>`;
    main.querySelectorAll("[data-fav]").forEach(b => b.onclick = () => { myTeamId = b.dataset.fav; showMyTeam(); });
    document.getElementById("editTeams").onclick = () => showMyTeam("edit");
    renderTeam(myTeamId, document.getElementById("teamBody"));
  } catch (e) { main.innerHTML = failed(e); }
}

function showPicker(favs, standings) {
  const picked = new Set(favs);
  main.innerHTML = `
    <div class="toolbar">
      <h2>${favs.length ? "Edit your teams" : "Pick your teams"}</h2>
      ${favs.length ? `<button class="btn" id="cancelPick">Cancel</button>` : ""}
      <button class="btn primary" id="savePick">Done</button>
    </div>
    <p class="intro">Tap the teams you follow. Their games, schedule and players show up here, and the toolbar icon tells you when they're playing. You can change this any time.</p>
    ${standings.children.map(conf => `
      <section class="conf">
        <h3>${esc(conf.name)}</h3>
        <div class="team-grid">${[...conf.standings.entries].sort((a, b) => a.team.displayName.localeCompare(b.team.displayName)).map(e => `
          <button class="team-card pick" data-pick="${esc(e.team.id)}" aria-pressed="${picked.has(e.team.id)}">
            <img src="${esc(e.team.logos?.[0]?.href)}" alt="" loading="lazy">
            <span class="tn">${esc(e.team.shortDisplayName)}<small>${esc(e.team.location)}</small></span>
            <span class="check" aria-hidden="true"></span>
          </button>`).join("")}
        </div>
      </section>`).join("")}`;
  const save = document.getElementById("savePick");
  const sync = () => { save.disabled = !picked.size; save.textContent = picked.size ? `Done · ${picked.size}` : "Done"; };
  main.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => {
    const id = b.dataset.pick;
    picked.has(id) ? picked.delete(id) : picked.add(id);
    b.setAttribute("aria-pressed", picked.has(id));
    sync();
  });
  // Keep the order teams were first chosen in, so the first pick stays the default.
  save.onclick = async () => {
    const ordered = [...favs.filter(id => picked.has(id)), ...[...picked].filter(id => !favs.includes(id))];
    await favStore.set(ordered);
    myTeamId = ordered[0];
    showMyTeam();
  };
  document.getElementById("cancelPick")?.addEventListener("click", () => showMyTeam());
  sync();
}

/* ---------- Team ---------- */
const TEAM_COLS = [
  ["general.gamesPlayed", "GP"], ["general.avgMinutes", "MIN"], ["offensive.avgPoints", "PTS"], ["general.avgRebounds", "REB"],
  ["offensive.avgAssists", "AST"], ["defensive.avgSteals", "STL"], ["defensive.avgBlocks", "BLK"], ["offensive.avgTurnovers", "TO"],
  ["offensive.fieldGoalPct", "FG%"], ["offensive.threePointFieldGoalPct", "3P%"], ["offensive.freeThrowPct", "FT%"],
];
let teamSort = "offensive.avgPoints";
let teamPane = "players";
const fmtDay = d => d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const fmtTime = d => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function showTeam(id) {
  main.innerHTML = `<div class="toolbar">${backBtn()}</div><div id="teamBody"></div>`;
  wireLinks(main);
  renderTeam(id, document.getElementById("teamBody"));
}

// One schedule game, seen from this team's side.
function teamGame(ev, id, liveById) {
  const comp = ev.competitions[0];
  const us = comp.competitors.find(c => c.id === id), them = comp.competitors.find(c => c.id !== id);
  const st = comp.status.type;
  const live = liveById[ev.id];
  const score = c => live ? live.find(x => x.id === c.id)?.score : c.score?.displayValue;
  const top = us?.leaders?.find(l => l.name === "points")?.leaders?.[0];
  return {
    id: ev.id, date: new Date(ev.date), state: st.state, detail: live?.detail || st.shortDetail,
    home: us?.homeAway === "home", opp: them?.team || {},
    ours: score(us), theirs: score(them), won: us?.winner,
    // Records on finished games are as they stood after that game.
    ourRecord: us?.record?.find(r => r.type === "total")?.displayValue,
    oppRecordThen: them?.record?.find(r => r.type === "total")?.displayValue,
    topScorer: top ? { id: top.athlete?.id, name: top.athlete?.shortName, pts: top.displayValue } : null,
    city: comp.venue?.address?.city, tv: (comp.broadcasts || []).map(b => b.media?.shortName).filter(Boolean),
    tag: gameTag(comp.notes?.[0]?.headline),
  };
}

// Each team's current form, for the opponent column of upcoming games.
function teamForm(standings) {
  const out = {};
  for (const c of standings.children) {
    bySeed(c).forEach((e, i) => out[e.team.id] = {
      record: stat(e, "overall")?.displayValue, pct: stat(e, "winPercent")?.value ?? 0,
      seed: i + 1, conf: c.abbreviation, streak: stat(e, "streak")?.displayValue, last10: stat(e, "Last Ten Games")?.displayValue,
    });
  }
  return out;
}

async function renderTeam(id, root) {
  root.innerHTML = `<p class="status">Loading team…</p>`;
  try {
    const [standings, roster, all, schedule] = await Promise.all([
      getJSON(STANDINGS),
      getJSON(`${SITE}/site/v2/sports/basketball/nba/teams/${id}/roster`),
      getJSON(ALL_PLAYERS),
      getJSON(`${SITE}/site/v2/sports/basketball/nba/teams/${id}/schedule`),
    ]);
    let entry, conf;
    for (const c of standings.children) {
      const hit = c.standings.entries.find(e => e.team.id === id);
      if (hit) { entry = hit; conf = c; }
    }
    if (!entry) throw new Error("This team wasn't found in the current standings.");
    const t = entry.team;
    const seed = bySeed(conf).indexOf(entry) + 1;
    const diff = stat(entry, "differential")?.value ?? 0;

    // The schedule feed has no live score, so take it from today's scoreboard.
    const liveById = {};
    if ((schedule.events || []).some(ev => ev.competitions[0].status.type.state === "in")) {
      const url = `${SITE}/site/v2/sports/basketball/nba/scoreboard?dates=${ymd(new Date(nbaToday().getTime() - nbaToday().getTimezoneOffset() * 60000))}`;
      cache.delete(url);
      const board = await getJSON(url).catch(() => ({ events: [] }));
      for (const ev of board.events || []) {
        if (ev.status.type.state !== "in") continue;
        liveById[ev.id] = ev.competitions[0].competitors.map(c => ({ id: c.team.id, score: c.score }));
        liveById[ev.id].detail = ev.status.type.shortDetail;
      }
    }
    const games = (schedule.events || []).map(ev => teamGame(ev, id, liveById));
    const played = games.filter(g => g.state === "post");
    const upcoming = games.filter(g => g.state !== "post");
    const strip = [...played.slice(-3), ...upcoming.slice(0, 3)];

    root.innerHTML = `
      <section class="team-hero">
        <img src="${esc(t.logos?.[0]?.href)}" alt="">
        <div>
          <h2>${esc(t.displayName)}</h2>
          <div class="muted">${esc(ordinal(seed))} in the ${esc(conf.name)}</div>
          <div class="facts">
            <span>Home <b>${esc(stat(entry, "Home")?.displayValue)}</b></span>
            <span>Road <b>${esc(stat(entry, "Road")?.displayValue)}</b></span>
            <span>Last 10 <b>${esc(stat(entry, "Last Ten Games")?.displayValue)}</b></span>
            <span>Streak <b>${esc(stat(entry, "streak")?.displayValue)}</b></span>
          </div>
        </div>
      </section>
      ${coachCard(roster.coach?.[0])}
      <div class="tiles">
        <div class="tile"><div class="v">${esc(stat(entry, "overall")?.displayValue)}</div><div class="k">Record</div></div>
        <div class="tile"><div class="v">${esc(stat(entry, "avgPointsFor")?.displayValue)}</div><div class="k">Points per game</div></div>
        <div class="tile"><div class="v">${esc(stat(entry, "avgPointsAgainst")?.displayValue)}</div><div class="k">Allowed per game</div></div>
        <div class="tile"><div class="v ${diff >= 0 ? "w" : "l"}">${diff > 0 ? "+" : ""}${diff.toFixed(1)}</div><div class="k">Point differential</div></div>
      </div>
      ${strip.length ? `<h3>Recent and next games</h3><div class="strip">${strip.map(stripCard).join("")}</div>` : ""}
      <div class="seg" role="tablist">
        <button role="tab" data-pane="players" aria-selected="${teamPane === "players"}">Players</button>
        <button role="tab" data-pane="schedule" aria-selected="${teamPane === "schedule"}">Schedule</button>
      </div>
      <div id="pane"></div>`;
    wireLinks(root);
    fillCoach(root, roster.coach?.[0], standings.children[0].standings.season);

    const pane = root.querySelector("#pane");
    const statsById = playerStats(all, id);
    const players = (roster.athletes || []).map(p => ({ p, s: statsById[p.id] }));
    const drawPane = () => {
      root.querySelectorAll("[data-pane]").forEach(b => b.setAttribute("aria-selected", b.dataset.pane === teamPane));
      if (teamPane === "schedule") drawSchedule(pane, played, upcoming, teamForm(standings));
      else drawRoster(pane, players);
    };
    root.querySelectorAll("[data-pane]").forEach(b => b.onclick = () => { teamPane = b.dataset.pane; drawPane(); });
    drawPane();
  } catch (e) { root.innerHTML = failed(e); }
}

// Head coach. ESPN's team roster names him; his age, hometown and college come from a second, slower lookup,
// so the card shows straight away and fills in. ESPN has no assistant coaches.
const ordinalSeason = n => `${ordinal(n)} season as an NBA head coach`;
function coachCard(c) {
  if (!c) return "";
  const name = `${c.firstName || ""} ${c.lastName || ""}`.trim();
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2);
  return `<section class="coach">
    <span class="coach-badge" aria-hidden="true">${esc(initials)}</span>
    <div>
      <div class="coach-role">Head coach</div>
      <div class="coach-name">${esc(name)}</div>
    </div>
    <div class="facts coach-facts">${c.experience ? `<span><b>${esc(ordinalSeason(c.experience))}</b></span>` : ""}</div>
  </section>`;
}
async function fillCoach(root, c, season) {
  if (!c?.id) return;
  try {
    const https = u => u?.replace(/^http:/, "https:");
    const d = await getJSON(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/${season}/coaches/${c.id}?lang=en&region=us`);
    const college = d.college?.$ref ? await getJSON(https(d.college.$ref)).catch(() => null) : null;
    const age = d.dateOfBirth ? Math.floor((Date.now() - new Date(d.dateOfBirth)) / (365.25 * 864e5)) : null;
    const from = [d.birthPlace?.city, d.birthPlace?.state || d.birthPlace?.country].filter(Boolean).join(", ");
    const box = root.querySelector(".coach-facts");
    if (!box) return;
    box.insertAdjacentHTML("beforeend", [
      age && `<span>Age <b>${age}</b></span>`,
      college?.name && `<span>College <b>${esc(college.name)}</b></span>`,
      from && `<span>From <b>${esc(from)}</b></span>`,
    ].filter(Boolean).join(""));
  } catch {}
}

// Season averages for one team's players, keyed by player id.
function playerStats(all, teamId) {
  const idx = {};
  all.categories.forEach((c, ci) => c.names.forEach((n, ni) => idx[`${c.name}.${n}`] = [ci, ni]));
  const out = {};
  for (const a of all.athletes) {
    if (a.athlete.teamId !== teamId) continue;
    out[a.athlete.id] = Object.fromEntries(TEAM_COLS.map(([k]) => {
      const [ci, ni] = idx[k] || [];
      return [k, a.categories.find(c => c.name === all.categories[ci]?.name)?.totals?.[ni] ?? ""];
    }));
  }
  return out;
}

function stripCard(g) {
  const where = g.home ? "vs" : "@";
  const body = g.state === "post"
    ? `<span class="res ${g.won ? "w" : "l"}">${g.won ? "W" : "L"}</span> ${esc(g.ours)}–${esc(g.theirs)}`
    : g.state === "in"
      ? `<span class="live">${esc(g.ours ?? "")}–${esc(g.theirs ?? "")}</span>`
      : esc(fmtTime(g.date));
  return `<button class="strip-card ${g.state}" data-game="${esc(g.id)}">
    <span class="sc-date">${g.state === "in" ? esc(g.detail) : esc(fmtDay(g.date))}</span>
    <span class="sc-opp"><img src="${esc(g.opp.logos?.[0]?.href)}" alt="">${where} ${esc(g.opp.abbreviation || "")}</span>
    <span class="sc-res">${body}</span>
  </button>`;
}

// Schedule, one month at a time. Months follow the viewer's own calendar, like the dates shown on each row.
let schedMonth = null;
const monthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthName = key => new Date(+key.slice(0, 4), +key.slice(5) - 1, 1).toLocaleDateString([], { month: "short" });

function drawSchedule(pane, played, upcoming, form) {
  const games = [...played, ...upcoming];
  if (!games.length) { pane.innerHTML = `<p class="status">No games scheduled.</p>`; return; }
  // A game the day after another one is a back-to-back, which matters for rest and lineups.
  const b2b = new Set(games.filter((g, i) => i && g.date - games[i - 1].date < 36 * 3600000).map(g => g.id));
  const months = [...new Set(games.map(g => monthKey(g.date)))];
  if (!months.includes(schedMonth)) {
    const now = monthKey(new Date());
    schedMonth = months.includes(now) ? now : now < months[0] ? months[0] : months[months.length - 1];
  }
  const wl = list => `${list.filter(g => g.won).length}-${list.filter(g => g.won === false).length}`;
  const inMonth = games.filter(g => monthKey(g.date) === schedMonth);
  const done = inMonth.filter(g => g.state === "post"), ahead = inMonth.filter(g => g.state === "pre");

  const row = g => {
    const f = form[g.opp.id] || {};
    const oppSub = g.state === "post"
      ? (g.oppRecordThen ? `${esc(g.oppRecordThen)} after this game` : "")
      : esc([f.record, f.seed && `${ordinal(f.seed)} ${f.conf}`, f.streak].filter(Boolean).join(" · "));
    const margin = (+g.ours || 0) - (+g.theirs || 0);
    const result = g.state === "post"
      ? `<span class="res ${g.won ? "w" : "l"}">${g.won ? "W" : "L"}</span> <b class="big">${esc(g.ours)}–${esc(g.theirs)}</b><span class="sub">${margin > 0 ? "+" : ""}${margin} · ${esc(g.ourRecord || "")}</span>`
      : g.state === "in"
        ? `<b class="big live">${esc(g.ours ?? "")}–${esc(g.theirs ?? "")}</b><span class="sub">${esc(g.detail)}</span>`
        : `<span class="tv">${esc(g.tv[0] || "")}</span><span class="sub">${g.tv.length > 1 ? `+${g.tv.length - 1} more` : ""}</span>`;
    const extra = g.state === "post" && g.topScorer
      ? `<span class="hl" data-player="${esc(g.topScorer.id)}">${esc(g.topScorer.name)}</span><span class="sub">${esc(g.topScorer.pts)} PTS · top scorer</span>`
      : `<span class="pill ${g.home ? "home" : ""}">${g.home ? "Home" : "Away"}</span><span class="sub">${esc(g.city || "")}</span>`;
    return `<tr data-game="${esc(g.id)}" class="${g.state}">
      <td class="left"><b class="d">${esc(fmtDay(g.date))}</b>${b2b.has(g.id) ? ` <span class="pill">B2B</span>` : ""}${g.tag ? ` <span class="pill tag">${esc(g.tag)}</span>` : ""}
        <span class="sub">${g.state === "post" ? "Final" : g.state === "in" ? `<span class="live">Live</span>` : esc(fmtTime(g.date))}</span></td>
      <td class="left"><div class="who"><img class="logo" src="${esc(g.opp.logos?.[0]?.href)}" alt="" loading="lazy">
        <span><span class="hl">${g.home ? "vs" : "@"} ${esc(g.opp.shortDisplayName || g.opp.displayName || "")}</span><span class="sub">${oppSub}</span></span></div></td>
      <td>${result}</td>
      <td>${extra}</td>
    </tr>`;
  };
  // "Today" divider between what has been played and what's next.
  const firstAhead = inMonth.findIndex(g => g.state !== "post");
  const rows = inMonth.map((g, i) => (i === firstAhead && i > 0 ? `<tr class="today-line"><td colspan="4"><span>Today</span></td></tr>` : "") + row(g)).join("");

  const oppPct = ahead.length ? ahead.reduce((s, g) => s + (form[g.opp.id]?.pct || 0), 0) / ahead.length : null;
  const chips = [
    done.length && ["Record", wl(done)],
    ["Games", `${inMonth.filter(g => g.home).length} home · ${inMonth.filter(g => !g.home).length} away`],
    ["Back-to-backs", String(inMonth.filter(g => b2b.has(g.id)).length)],
    oppPct !== null && ["Opponents' win %", oppPct.toFixed(3).replace(/^0/, "")],
  ].filter(Boolean);

  pane.innerHTML = `
    <div class="months" role="tablist">${months.map(m => {
      // Months with results show the record; months still to come show how many games they hold.
      const mg = games.filter(g => monthKey(g.date) === m), mp = mg.filter(g => g.state === "post");
      return `<button role="tab" data-month="${m}" aria-selected="${m === schedMonth}">${monthName(m)}<small>${mp.length ? wl(mp) : `${mg.length} games`}</small></button>`;
    }).join("")}</div>
    <div class="facts sched-sum">${chips.map(([k, v]) => `<span>${k} <b>${esc(v)}</b></span>`).join("")}</div>
    <div class="table-wrap sched"><table><tbody>${rows}</tbody></table></div>`;
  pane.querySelectorAll("[data-month]").forEach(b => b.onclick = () => { schedMonth = b.dataset.month; drawSchedule(pane, played, upcoming, form); });
  wireLinks(pane);
}

function drawRoster(pane, players) {
  const num = v => (v === "" || v == null ? -1 : parseFloat(v));
  const rows = [...players].sort((a, b) => num(b.s?.[teamSort]) - num(a.s?.[teamSort]));
  pane.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th class="left">Player</th>
      ${TEAM_COLS.map(([k, n]) => `<th class="sortable${k === teamSort ? " sorted" : ""}" data-k="${k}">${n}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(({ p, s }) => {
      const injury = p.injuries?.[0]?.status;
      return `<tr data-player="${esc(p.id)}">
        <td><div class="who"><img src="${esc(p.headshot?.href)}" alt="" loading="lazy">
          <span><span class="hl">${esc(p.displayName)}</span>${injury ? ` <span class="badge-out">${esc(injury)}</span>` : ""}
          <span class="sub">${esc([p.jersey && "#" + p.jersey, p.position?.abbreviation].filter(Boolean).join(" · "))}</span></span></div></td>
        ${TEAM_COLS.map(([k]) => `<td class="${k === teamSort ? "col-on" : ""}">${s ? esc(s[k]) : "–"}</td>`).join("")}
      </tr>`;
    }).join("")}</tbody></table></div>
    <p class="legend">Click a column to sort, or a row to open the player.</p>`;
  pane.querySelectorAll("th.sortable").forEach(th => th.onclick = () => { teamSort = th.dataset.k; drawRoster(pane, players); });
  wireLinks(pane);
}

/* ---------- Player ---------- */
async function showPlayer(id) {
  loading("Loading player…");
  try {
    const [bio, stats] = await Promise.all([
      getJSON(`${WEB}/sports/basketball/nba/athletes/${id}`),
      getJSON(`${WEB}/sports/basketball/nba/athletes/${id}/stats`).catch(() => null),
    ]);
    const a = bio.athlete;
    const avg = stats?.categories?.find(c => c.name === "averages");
    const seasons = avg ? [...avg.statistics].reverse() : [];
    const latest = seasons[0];
    const pick = (row, label) => row?.stats?.[avg.labels.indexOf(label)] ?? "–";
    const fact = (k, v) => v ? `<span>${k} <b>${esc(v)}</b></span>` : "";
    const team = a.team?.id ? `<button class="row-link" data-team="${esc(a.team.id)}">${esc(a.team.displayName)}</button>` : "";
    main.innerHTML = `
      <div class="toolbar">${backBtn()}</div>
      <section class="profile">
        <img src="${esc(a.headshot?.href)}" alt="${esc(a.displayName)}">
        <div>
          <h2>${a.jersey ? `<span class="jersey">#${esc(a.jersey)}</span>` : ""}${esc(a.displayName)}</h2>
          <div class="muted">${[esc(a.position?.displayName), team].filter(Boolean).join(" · ")}</div>
          <div class="facts">${fact("Age", a.age)}${fact("Height", a.displayHeight)}${fact("Weight", a.displayWeight)}${fact("Draft", a.displayDraft)}${fact("College", a.college?.name)}${fact("Experience", a.displayExperience)}</div>
        </div>
      </section>
      ${latest ? `
        <h3>${esc(latest.season.displayName)} per game</h3>
        <div class="tiles">${["PTS", "REB", "AST", "STL", "BLK", "FG%", "3P%", "MIN"].map(l => `<div class="tile"><div class="v">${esc(pick(latest, l))}</div><div class="k">${l}</div></div>`).join("")}</div>
        <h3>Season by season</h3>
        <div class="table-wrap"><table>
          <thead><tr><th class="left">Season</th><th class="left">Team</th>${avg.labels.map(l => `<th>${esc(l)}</th>`).join("")}</tr></thead>
          <tbody>
            ${seasons.map(s => `<tr><td class="hl">${esc(s.season.displayName)}</td><td class="left muted">${esc(stats.teams?.[s.teamSlug]?.abbreviation || "")}</td>${s.stats.map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}
            ${avg.totals ? `<tr class="career"><td>Career</td><td></td>${avg.totals.map(v => `<td>${esc(v)}</td>`).join("")}</tr>` : ""}
          </tbody></table></div>` : `<p class="status">No NBA regular-season stats yet for this player.</p>`}`;
    wireLinks(main);
  } catch (e) { main.innerHTML = `<div class="toolbar">${backBtn()}</div>${failed(e)}`; wireLinks(main); }
}

go("scores");

// Opening the popup counts as seeing the games that are live right now, so the toolbar badge clears.
if (globalThis.chrome?.action) {
  chrome.storage.local.get(["liveNow", "seenLive"]).then(({ liveNow = [], seenLive = [] }) => {
    chrome.storage.local.set({ seenLive: [...new Set([...seenLive, ...liveNow])].slice(-60) });
    chrome.action.setBadgeText({ text: "" });
  }).catch(() => {});
}

// Show the installed version in the footer, so friends can tell whether they have the latest one.
try { document.getElementById("ver").textContent = "v" + chrome.runtime.getManifest().version; } catch {}
