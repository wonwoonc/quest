/** Read-only calendar projection. `mine` is a private, current-account collection.
 * Explicit ownership, when present, must agree with that account. Never infer a
 * completion from a deadline, creation time, post reference or document ID.
 */
export function activityDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(value+'T00:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === value ? value : '';
  }
  if (!(typeof value === 'number' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)))) return '';
  const time = new Date(value).getTime();
  const shifted = new Date(time + 9*3600000);
  return Number.isFinite(shifted.getTime()) ? shifted.toISOString().slice(0,10) : '';
}
export function isOwnPrivateEntry(entry, me) {
  return !!me && ['owner','author','uid'].every(key => entry[key] == null || entry[key] === me);
}
const emptyDay = () => ({journals:[], stories:[], daily:[], tasks:[], main:[], sub:[], count:0});
export function buildDayActivityIndex({mine = {}, feed = {}, projects = {}, me}) {
  const days = new Map(), unknown = {tasks:[], main:[], sub:[]};
  const add = (date, section, entry) => {
    if (!date) return;
    if (!days.has(date)) days.set(date, emptyDay());
    const day = days.get(date); day[section].push(entry); day.count++;
  };
  for (const [id, value] of Object.entries(mine)) {
    if (!isOwnPrivateEntry(value, me)) continue;
    const entry = {...value, id};
    if (entry.kind === 'diary') {
      // Stored journal date is exact and authoritative (not `at` or d-ID).
      if (activityDate(entry.date) === entry.date) add(entry.date, 'journals', entry);
    } else if (entry.kind === 'quest') {
      // The keyed completion day survives later schedule/active-state edits.
      for (const [date, done] of Object.entries(entry.done || {})) {
        if (done && activityDate(date) === date) add(date, 'daily', entry);
      }
    } else if (entry.kind === 'mission' && entry.done === true) {
      const date = activityDate(entry.doneAt);
      if (date) add(date, 'tasks', entry); else unknown.tasks.push(entry);
    }
  }
  for (const [id, entry] of Object.entries(feed)) {
    if (me && entry.author === me) add(activityDate(entry.createdAt), 'stories', {...entry, id});
  }
  for (const [id, entry] of Object.entries(projects)) {
    if (!me || entry.owner !== me || entry.status !== 'done') continue;
    const section = entry.parentId ? 'sub' : 'main', date = activityDate(entry.doneAt);
    if (date) add(date, section, {...entry, id}); else unknown[section].push({...entry, id});
  }
  return {days, unknown};
}
export function selectDayActivities(index, date) {
  return activityDate(date) === date ? index.days.get(date) || emptyDay() : emptyDay();
}
