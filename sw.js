const CACHE='sayu-restoration-dc595b57c3';
const FILES=['./','index.html','css/style.css','css/pov.css','css/game.css','js/app.js','js/core.js','js/music.js','js/dig.js','js/study.js','js/cast.js','js/rebuild.js','js/story.js','js/sense.js','data/artifacts.json','data/dialogue.json','data/casting.json','study/questions.json','assets/artifacts/bangga.webp','assets/character/sayu-reference-web.png','Tae.png','icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res;}).catch(()=>caches.match('index.html'))));});
