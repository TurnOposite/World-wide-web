/**
 * The press on Echo: the Jornal NH columns and series that are also on the Atlas card of the town that
 * printed them (site/data/places.json). Until 2026-11-03 they were listed on Archives (E-04); since that
 * evening each clipping is an article of its own, listed under its series' name in Articles and opened in
 * the Articles window (echo/presse/<id>), and the Une shows each series once, as a group.
 *
 * Pure: no DOM, tested in node (tests/site-world.test.js).
 */

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** 2024-06-06 → « 6 juin 2024 », without the browser's locale tables (the tests run it in Node). */
export const dateFr = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${d === 1 ? '1er' : d} ${MONTHS[m - 1]} ${y}`;
};

/** Tags in French order, each with its articles newest first (echo.json is already newest first). */
export function byTag(articles) {
  const m = new Map();
  for (const a of articles) for (const t of a.tags || []) (m.get(t) || m.set(t, []).get(t)).push(a);
  return [...m.keys()].sort((x, y) => x.localeCompare(y, 'fr')).map((tag) => ({ tag, articles: m.get(tag) }));
}

/** A clipping's own address: its first page's file name, which no other clipping shares (two may share a date). */
export const clipId = (item) => String(item.pages?.[0] || '').split('/').pop().replace(/\.pdf$/i, '');

const sortByDate = (items = []) => [...items].sort((x, y) => x.date.localeCompare(y.date));

/** Every place whose card carries press, with its columns and series in date order. */
export function pressOf(places) {
  return places.filter((p) => p.press && (p.press.column?.items?.length || p.press.series?.items?.length)).map((p) => {
    const column = p.press.column ? { ...p.press.column, items: sortByDate(p.press.column.items) } : null;
    const series = p.press.series ? { ...p.press.series, items: sortByDate(p.press.series.items) } : null;
    const all = [...(column?.items || []), ...(series?.items || [])].map((i) => i.date).sort();
    return { slug: p.slug, city: p.city, outlet: p.press.outlet, lang: p.press.lang || null, column, series, from: all[0], to: all.at(-1) };
  });
}

/**
 * The press as Echo shows it: one group per series, the series of a place before its column (Ortis: the
 * metro walk first, then the Olympics), each clipping with its id. A group is named by `name` in
 * places.json, or by its title.
 */
export function pressGroups(places) {
  const out = [];
  for (const p of pressOf(places)) {
    for (const [kind, g] of [['series', p.series], ['column', p.column]]) {
      if (!g?.items?.length) continue;
      const key = g.key || `${p.slug}-${kind}`;
      out.push({
        key, kind, name: g.name || g.title, title: g.title, outlet: p.outlet, city: p.city, place: p.slug, lang: p.lang,
        from: g.items[0].date, to: g.items.at(-1).date,
        items: g.items.map((i) => ({ ...i, id: clipId(i), group: key })),
      });
    }
  }
  return out;
}

/** One clipping by its id, with its group, or null. */
export function clipping(groups, id) {
  for (const g of groups) {
    const i = g.items.findIndex((x) => x.id === id);
    if (i >= 0) return { item: g.items[i], group: g, prev: g.items[i - 1] || null, next: g.items[i + 1] || null };
  }
  return null;
}
