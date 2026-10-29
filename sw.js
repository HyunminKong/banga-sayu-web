const CACHE='sayu-restoration-781d31a39b';
const FILES=['./','index.html','css/style.css','css/pov.css','css/game.css','js/app.js','js/core.js','js/music.js','js/dig.js','js/study.js','js/cast.js','js/rebuild.js','js/story.js','js/sense.js','js/lines.js','data/artifacts.json','data/dialogue.json','data/casting.json','data/voice.json','study/questions.json','assets/artifacts/bangga.webp','assets/character/sayu-reference-web.png','Tae.png','icon.svg'];
// 새 버전이 올라오면 기다리지 않고 바로 바꾼다. 그러지 않으면 예전에 열어 본 휴대폰은 브라우저를 완전히 닫기 전까지 옛 화면을 계속 쓴다.
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
// 화면 · 코드 · 데이터는 인터넷이 되면 늘 새로 받고(안 되면 저장본), 큰 그림과 녹음 묶음은 저장본을 먼저 쓴다.
// 녹음 묶음도 새 버전이 올라오면 캐시 이름이 바뀌어(index.html 안의 녹음 목록이 바뀌므로) 옛 저장본이 지워진다.
const heavy=u=>/\/(voice|assets)\/|\.(png|webp|mp3)$/.test(u);
const save=(req,res)=>{if(res&&res.ok&&res.status===200){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));}return res;};
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET'||!req.url.startsWith(self.location.origin))return;
  if(heavy(req.url)){e.respondWith(caches.match(req).then(r=>r||fetch(req).then(res=>save(req,res))));return;}
  e.respondWith(fetch(req).then(res=>save(req,res)).catch(()=>caches.match(req).then(r=>r||caches.match('index.html'))));
});
