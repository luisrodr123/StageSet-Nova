import {applyBackground} from './backgrounds.js';
const output = new URLSearchParams(location.search).get('output');
const send = data => opener?.postMessage({ ...data, output }, location.origin);
const size = document.querySelector('#size'), display = document.querySelector('#display');
size.oninput = () => { const value = Number(size.value); if (Number.isInteger(value) && value >= 16 && value <= 96) send({ type: 'stageset-output-setting', fontSize: value }); };
display.onchange = () => send({ type: 'stageset-output-setting', displayId: display.value });
addEventListener('message', event => {
  if (event.source !== opener || event.origin !== location.origin || event.data?.type !== 'stageset-lyrics' || event.data.output !== output) return;
  const d = event.data;
  if(d.background)applyBackground(document.querySelector('#stage'),d.background);
  document.title = 'StageSet · ' + d.name;
  document.querySelector('#name').textContent = d.name;
  if (document.activeElement !== size) size.value = d.fontSize;
  const options = JSON.stringify(d.displays || []);
  if (display.dataset.options !== options) { display.replaceChildren(new Option('Ecrã atual', ''), ...(d.displays || []).map(item => new Option(item.name, item.id))); display.dataset.options = options; }
  display.disabled = !d.desktop;
  if (document.activeElement !== display) display.value = d.displayId || '';
  document.querySelector('#stage').replaceChildren(...d.lines.map((text, index) => {
    const p = document.createElement('div'); p.className = 'line' + (index === d.currentIndex ? ' current' : '') + (text ? '' : ' blank');
    p.innerHTML = d.htmlLines[index]; p.style.color = d.baseColor; p.style.fontSize = d.fontSize + 'px';
    if (index === d.currentIndex) p.style.background = d.color + '55';
    return p;
  }));
});
send({ type: 'stageset-output-ready' });
