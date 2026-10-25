/* Your repository owns this source. No framework, build step, credentials or CDN. */
'use strict';
const byId = id => document.getElementById(id);
const put = (id, value) => { byId(id).textContent = value; };
const appearance = byId('appearance');
try { const saved = localStorage.getItem('jam-theme'); if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved; } catch { /* OS preference remains available. */ }
appearance.hidden = false;
appearance.addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark'; document.documentElement.dataset.theme = next;
  try { localStorage.setItem('jam-theme', next); } catch { /* This visit still updates. */ }
});
async function showJam() {
  try {
    const response = await fetch('zero-jam.json', {cache:'no-store'});
    if (!response.ok) throw new Error('manifest');
    const jam = await response.json();
    if (jam.schema !== 1 || !['game','app'].includes(jam.type) || !jam.schedule || typeof jam.title !== 'string') throw new Error('manifest');
    document.title = jam.title;
    put('kind', jam.type === 'game' ? 'Game Jam' : 'App Jam');
    for (const key of ['title','summary','theme','rules','eligibility']) put(key, typeof jam[key] === 'string' ? jam[key] : 'Not provided.');
    const formatter = new Intl.DateTimeFormat(undefined, {dateStyle:'medium',timeStyle:'short',timeZone:jam.timezone});
    put('timezone', `All times: ${jam.timezone}`);
    const labels = {registrationOpensAt:'Registration opens',registrationClosesAt:'Registration closes',startsAt:'Jam starts',submissionsOpenAt:'Submissions open',submissionsCloseAt:'Submissions close'};
    for (const [key,label] of Object.entries(labels)) {
      const term = document.createElement('dt'), value = document.createElement('dd'), time = document.createElement('time');
      term.textContent = label; time.dateTime = jam.schedule[key]; time.textContent = formatter.format(new Date(jam.schedule[key])); value.append(time); byId('schedule').append(term,value);
    }
    put('load-status', '');
    const id = document.querySelector('meta[name="zero-jam-id"]').content;
    if (/^jam-[1-9][0-9]*$/.test(id)) {
      const official = `https://zero.codepet.ca/hub/jams/${encodeURIComponent(id)}`;
      byId('official-link').href = `${official}/participate`;
      put('official-link', 'Review rules and take part on Zero');
      put('connection-status', 'Check the official status below. Zero confirms approval, registration and submission availability.');
      const panel = document.createElement('iframe'); panel.src = `${official}/panel`; panel.title = 'Official ZeroJam status'; panel.loading = 'lazy'; panel.referrerPolicy = 'no-referrer';
      byId('panel-slot').append(panel); byId('official-panel').hidden = false;
    }
  } catch {
    put('load-status', 'Could not load the jam details. Check zero-jam.json and serve this folder with a local web server or GitHub Pages, then reload.');
  }
}
void showJam();
