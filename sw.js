// ==========================================
// SERVICE WORKER - faz o Croqui abrir sem internet
// ==========================================
// Arquivos do app: tenta a internet primeiro (para sempre pegar a versão
// nova) e, sem sinal, usa a cópia guardada.
// Bibliotecas externas (fabric, jsPDF, fonte): usa a cópia guardada direto,
// porque elas nunca mudam de versão.
//
// Ao publicar uma mudança grande, aumente o número da versão abaixo.
const VERSAO = 'croqui-v2.4.0';
const CACHE_MAPA = 'croqui-tiles';   // pedaços do mapa já vistos (mantido entre versões)
const LIMITE_TILES = 600;            // ~10 MB

const ARQUIVOS_DO_APP = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './js/mapa.js',
    './manifest.json',
    './icones/icone-192.png',
    './icones/icone-512.png'
];

const BIBLIOTECAS = [
    'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap'
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(VERSAO);
        await cache.addAll(ARQUIVOS_DO_APP);
        // Bibliotecas de outro site: baixa uma a uma, sem travar a instalação se alguma falhar.
        await Promise.all(BIBLIOTECAS.map(async (url) => {
            try {
                const resp = await fetch(new Request(url, { mode: 'no-cors' }));
                await cache.put(url, resp);
            } catch (e) { /* tenta de novo quando o app abrir com internet */ }
        }));
        self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const nomes = await caches.keys();
        await Promise.all(nomes.filter(n => n.startsWith('croqui-') && n !== VERSAO && n !== CACHE_MAPA).map(n => caches.delete(n)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    const ehDoApp = url.origin === self.location.origin;

    if (ehDoApp) {
        // Internet primeiro, cópia guardada se estiver sem sinal.
        event.respondWith((async () => {
            const cache = await caches.open(VERSAO);
            try {
                const resp = await fetch(req);
                if (resp && resp.ok) cache.put(req, resp.clone());
                return resp;
            } catch (e) {
                const guardado = await cache.match(req, { ignoreSearch: true });
                if (guardado) return guardado;
                if (req.mode === 'navigate') return cache.match('./index.html');
                throw e;
            }
        })());
        return;
    }

    // Busca de endereço: sempre na internet (nunca guarda).
    if (url.hostname.includes('nominatim')) return;

    // Pedaços do mapa: guarda os que o técnico já viu, para abrir sem sinal
    // na mesma região. Os mais antigos saem quando passar do limite.
    if (url.hostname.endsWith('tile.openstreetmap.org')) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_MAPA);
            const guardado = await cache.match(req);
            if (guardado) return guardado;
            const resp = await fetch(req);
            if (resp && resp.ok) {
                await cache.put(req, resp.clone());
                const chaves = await cache.keys();
                if (chaves.length > LIMITE_TILES) await Promise.all(chaves.slice(0, chaves.length - LIMITE_TILES).map(k => cache.delete(k)));
            }
            return resp;
        })());
        return;
    }

    // Bibliotecas e fontes: cópia guardada primeiro.
    event.respondWith((async () => {
        const cache = await caches.open(VERSAO);
        const guardado = await cache.match(req);
        if (guardado) return guardado;
        const resp = await fetch(req);
        if (resp && (resp.ok || resp.type === 'opaque')) cache.put(req, resp.clone());
        return resp;
    })());
});
