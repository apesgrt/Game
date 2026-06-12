const bar = document.getElementById('bar');
const percent = document.getElementById('percent');
const statusText = document.getElementById('status');
const steps = ['Menyalakan star grid', 'Memuat config', 'Sinkron Firebase', 'Menyiapkan launcher', 'Siap masuk'];
let value = 0;
let tick = 0;
const startTime = Date.now();
const minLoadingTime = 3400;

const timer = setInterval(() => {
  tick++;
  const slowStart = tick < 7 ? 4 : 0;
  value += Math.floor(Math.random() * 7) + 4 + slowStart;
  if(value > 96 && Date.now() - startTime < minLoadingTime) value = 96;
  if(value >= 100) value = 100;
  bar.style.width = value + '%';
  percent.textContent = value + '%';
  statusText.textContent = steps[Math.min(steps.length - 1, Math.floor(value / 22))];
  if(value >= 100){
    clearInterval(timer);
    document.body.classList.add('ready');
    setTimeout(() => location.href = 'aula/home.html', 650);
  }
}, 185);

setTimeout(() => { if(value < 100) value = Math.max(value, 97); }, minLoadingTime - 250);
setTimeout(() => { if(value < 100) value = 100; }, minLoadingTime + 350);
