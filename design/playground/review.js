const ids = ['web-screen','web-theme','editor-theme','state','web-width','sidebar-width','text-size'];
const controls = Object.fromEntries(ids.map(id => [id,document.getElementById(id)]));
const params = new URLSearchParams(location.search);
for (const id of ids) if ([...controls[id].options].some(option => option.value === params.get(id))) controls[id].value = params.get(id);
function update() {
  const web = document.getElementById('web'), sidebar = document.getElementById('sidebar');
  const theme = controls['editor-theme'].value;
  const webUrl = `/web?screen=${controls['web-screen'].value}&theme=${controls['web-screen','web-theme'].value}&text=${controls['text-size'].value}`;
  const sideUrl = `/sidebar?theme=${theme === 'fallback' ? 'light' : theme}&state=${controls.state.value}&text=${controls['text-size'].value}${theme === 'fallback' ? '&host=none' : ''}`;
  web.style.width = `${controls['web-width'].value}px`;
  sidebar.style.width = `${controls['sidebar-width'].value}px`;
  web.src = webUrl; sidebar.src = sideUrl;
  document.getElementById('web-open').href = webUrl;
  document.getElementById('sidebar-open').href = sideUrl;
  const query = new URLSearchParams();
  for (const id of ids) query.set(id,controls[id].value);
  history.replaceState(null,'',`/?${query}`);
}
for (const control of Object.values(controls)) control.addEventListener('change',update);
document.getElementById('reset').addEventListener('click',() => {for (const control of Object.values(controls)) control.selectedIndex=0; update();});
document.querySelector('.controls').addEventListener('submit',event=>event.preventDefault());
window.addEventListener('message',event=>{
  const sources = [document.getElementById('web').contentWindow,document.getElementById('sidebar').contentWindow];
  if (event.source === sources[0] && event.data?.type === 'zero-theme' && ['light','dark'].includes(event.data.theme)) { controls['web-theme'].value = event.data.theme; update(); }
  if (event.source === sources[0] && event.data?.type === 'zero-screen' && ['home','learn','downloads'].includes(event.data.screen)) { controls['web-screen'].value = event.data.screen; update(); }
  if (sources.includes(event.source) && event.data?.type === 'zero-fixture') document.getElementById('review-feedback').textContent = `Fixture: ${event.data.text}. No external action occurred.`;
});
update();
