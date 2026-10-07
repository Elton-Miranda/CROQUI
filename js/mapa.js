// ==========================================
// CROQUI PRO - MODO MAPEAR TRAJETO (MAPA.JS)
// ==========================================
// Ideia: o técnico anda pelo trajeto ANTES de lançar o cabo e, em cada
// poste, aperta "Poste aqui". O GPS grava a posição, a metragem entre os
// postes é calculada pela distância, e no fim o app gera o croqui sozinho.
// Durante o lançamento o celular pode ficar no bolso.
//
// Sem GPS (ou fora do local), o técnico arrasta o mapa até a mira vermelha
// ficar em cima do poste e aperta "Poste na mira".

// --- CONFIGURAÇÕES (fácil de ajustar) ---
const TIPOS_CTOP = ['Pré-conectorizada', 'CTOP 8 portas', 'Com fusão'];
const TIPOS_POSTE = ['Poste XC', 'Poste XM'];
// Cores da CTOP (mesmas do croqui manual). [nome, cor no desenho]
const CORES_CTOP = [['Preta', 'black'], ['Amarela', '#f1c40f'], ['Verde', '#27ae60'], ['Branca', '#ffffff'], ['Azul', '#2980b9'], ['Vermelha', '#e74c3c'], ['Violeta', '#8e44ad']];
// Itens que aparecem primeiro no painel. Os demais vêm da lista de serviços do app.
const ITENS_FREQUENTES = ['Conector óptico', '294071 - MONTAGEM CONECTOR', '290689 - Emenda de FO', '290832 - Emenda de FO em caixa de emenda existente', '294004 - PONTEAMENTO', '294098 - SPIRAL TUBE'];
const FOLGA_FLECHA = 0.05;        // +5% sobre a distância do mapa (flecha do cabo)
const PRECISAO_ACEITAVEL = 25;    // metros. Acima disso o app avisa que o GPS está ruim
const CHAVE_MAPEAMENTO = 'croqui_mapeamento_v1';
const CENTRO_PADRAO = [-23.5505, -46.6333];

// ==========================================
// CÁLCULOS (sem tela, fáceis de testar)
// ==========================================
function distanciaMetros(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

// Metragem sugerida para o cabo: distância do mapa + folga da flecha, em metros inteiros.
function sugerirMetragem(distancia) {
    return Math.max(1, Math.round(distancia * (1 + FOLGA_FLECHA)));
}

function novoMapeamento() {
    return { versao: 1, criadoEm: new Date().toISOString(), autor: '', pontos: [], trechos: [], retiradas: [], ativo: null, proximoId: 1 };
}

function acharPonto(m, id) { return m.pontos.find(p => p.id === id) || null; }

// Adiciona um ponto e, se houver um ponto ativo, liga os dois com um trecho.
function adicionarPonto(m, dados) {
    const p = Object.assign({ id: m.proximoId++, tipo: 'Poste XC', caixa: null, itens: [], rua: '' }, dados);
    m.pontos.push(p);
    const anterior = acharPonto(m, m.ativo);
    if (anterior) {
        const dist = distanciaMetros(anterior, p);
        m.trechos.push({ de: anterior.id, para: p.id, distancia: Math.round(dist), metragem: sugerirMetragem(dist), editada: false, tipo: 'instalado' });
    }
    m.ativo = p.id;
    return p;
}

// Remove um ponto. Se ele estava no meio do caminho (1 trecho chegando e 1
// saindo), os dois trechos viram um só, somando as metragens.
function removerPonto(m, id) {
    const chegando = m.trechos.filter(t => t.para === id);
    const saindo = m.trechos.filter(t => t.de === id);
    m.trechos = m.trechos.filter(t => t.de !== id && t.para !== id);
    if (chegando.length === 1 && saindo.length === 1) {
        const a = chegando[0], b = saindo[0];
        m.trechos.push({ de: a.de, para: b.para, distancia: a.distancia + b.distancia, metragem: a.metragem + b.metragem, editada: a.editada || b.editada, tipo: 'instalado' });
    }
    m.pontos = m.pontos.filter(p => p.id !== id);
    atualizarRetiradas(m);
    if (m.ativo === id) {
        m.ativo = chegando.length ? chegando[0].de : (m.pontos.length ? m.pontos[m.pontos.length - 1].id : null);
    }
}

// Recalcula a metragem dos trechos ligados a um ponto que mudou de lugar
// (só dos que o técnico não corrigiu à mão).
function recalcularTrechosDoPonto(m, id) {
    m.trechos.filter(t => t.de === id || t.para === id).forEach(t => {
        const dist = distanciaMetros(acharPonto(m, t.de), acharPonto(m, t.para));
        t.distancia = Math.round(dist);
        if (!t.editada) t.metragem = sugerirMetragem(dist);
    });
}

function totalMapeado(m) { return m.trechos.reduce((s, t) => s + (Number(t.metragem) || 0), 0); }

// --- RETIRADA: caminho entre dois postes pelos trechos mapeados ---
function acharTrecho(m, a, b) { return m.trechos.find(t => (t.de === a && t.para === b) || (t.de === b && t.para === a)) || null; }

// Caminho de postes de "a" até "b" seguindo os trechos (funciona com ramais).
function caminhoEntre(m, a, b) {
    if (a === b || !acharPonto(m, a) || !acharPonto(m, b)) return null;
    const anterior = { [a]: null }, fila = [a];
    while (fila.length) {
        const atual = fila.shift();
        if (atual === b) break;
        m.trechos.forEach(t => {
            const viz = t.de === atual ? t.para : (t.para === atual ? t.de : null);
            if (viz !== null && !(viz in anterior)) { anterior[viz] = atual; fila.push(viz); }
        });
    }
    if (!(b in anterior)) return null;
    const caminho = [];
    for (let x = b; x !== null; x = anterior[x]) caminho.unshift(Number(x));
    return caminho;
}

// Cria uma retirada do poste "a" ao "b". Cada vão começa com a mesma metragem do cabo lançado.
function criarRetirada(m, a, b, metragensAntigas) {
    const caminho = caminhoEntre(m, a, b);
    if (!caminho) return null;
    const vaos = [];
    for (let i = 0; i < caminho.length - 1; i++) {
        const de = caminho[i], para = caminho[i + 1];
        const antiga = metragensAntigas && metragensAntigas[de + '-' + para];
        const t = acharTrecho(m, de, para);
        vaos.push({ de, para, metragem: antiga !== undefined ? antiga : (t ? t.metragem : 0) });
    }
    return { de: a, ate: b, trechos: vaos };
}

function totalRetirado(m) {
    return (m.retiradas || []).reduce((s, r) => s + r.trechos.reduce((x, t) => x + (Number(t.metragem) || 0), 0), 0);
}

// Depois de apagar ou mover pontos: refaz o caminho de cada retirada,
// mantendo as metragens já informadas. Retirada sem caminho é descartada.
function atualizarRetiradas(m) {
    m.retiradas = (m.retiradas || []).map(r => {
        const antigas = {}; r.trechos.forEach(t => { antigas[t.de + '-' + t.para] = t.metragem; });
        return criarRetirada(m, r.de, r.ate, antigas);
    }).filter(Boolean);
}

// ==========================================
// ESTADO, SALVAMENTO E MAPA
// ==========================================
let mapeamento = carregarMapeamento();
let mapa = null, camadaDesenho = null, marcadorGps = null, circuloGps = null;
let pontoEmEdicao = null;
let pontoMovendo = null; // id do ponto que está sendo reposicionado pela mira
const gps = { watchId: null, leituras: [], ultima: null, seguindo: true, erro: '' };

function carregarMapeamento() {
    try {
        const m = JSON.parse(localStorage.getItem(CHAVE_MAPEAMENTO) || 'null');
        if (m && Array.isArray(m.pontos)) { migrarMapeamento(m); return m; }
    } catch (e) {}
    return novoMapeamento();
}

function salvarMapeamento() {
    try { localStorage.setItem(CHAVE_MAPEAMENTO, JSON.stringify(mapeamento)); } catch (e) { console.warn('Mapeamento não salvo', e); }
}

function limparMapeamento() {
    mapeamento = novoMapeamento();
    try { localStorage.removeItem(CHAVE_MAPEAMENTO); } catch (e) {}
    if (mapa) desenharMapeamento();
}

function abrirMapa() {
    if (typeof L === 'undefined') {
        alert('O mapa precisa de internet na primeira vez que é aberto. Conecte e tente de novo.');
        return;
    }
    if (typeof fecharPieMenu === 'function') fecharPieMenu();
    document.getElementById('tela-mapa').classList.add('aberta');
    // Segue o GPS se o mapeamento é novo ou está em andamento (último ponto há menos de 30 min).
    // Se foi feito antes (ou por outra pessoa), mostra o trajeto e não puxa o mapa para longe.
    const ultimo = mapeamento.pontos[mapeamento.pontos.length - 1];
    gps.seguindo = !ultimo || (Date.now() - new Date(ultimo.hora).getTime() < 30 * 60 * 1000);
    if (!mapa) criarMapa();
    setTimeout(() => { mapa.invalidateSize(); enquadrarMapeamento(); }, 50);
    iniciarGps();
    desenharMapeamento();
}

function fecharMapa() {
    document.getElementById('tela-mapa').classList.remove('aberta');
    pararGps();
}

function criarMapa() {
    mapa = L.map('mapa', { zoomControl: false, attributionControl: true }).setView(CENTRO_PADRAO, 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, crossOrigin: true,
        attribution: '© OpenStreetMap'
    }).addTo(mapa);
    L.control.zoom({ position: 'topright' }).addTo(mapa);
    camadaDesenho = L.layerGroup().addTo(mapa);
    // Arrastar o mapa = o técnico quer escolher o ponto pela mira.
    mapa.on('dragstart', () => { gps.seguindo = false; atualizarModo(); });
    document.getElementById('mapaRua').addEventListener('change', () => {
        const ponto = acharPonto(mapeamento, mapeamento.ativo);
        if (ponto) { ponto.rua = document.getElementById('mapaRua').value.trim(); salvarMapeamento(); }
    });
}

function enquadrarMapeamento() {
    if (!mapa) return;
    if (mapeamento.pontos.length) {
        mapa.fitBounds(L.latLngBounds(mapeamento.pontos.map(p => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 18 });
    } else if (gps.ultima) {
        mapa.setView([gps.ultima.lat, gps.ultima.lng], 18);
    }
}

// ==========================================
// GPS
// ==========================================
function iniciarGps() {
    if (gps.watchId !== null) return;
    if (!navigator.geolocation) { gps.erro = 'Aparelho sem GPS'; gps.seguindo = false; atualizarModo(); return; }
    gps.erro = '';
    gps.watchId = navigator.geolocation.watchPosition(recebeuPosicao, (err) => {
        gps.erro = err.code === 1 ? 'GPS sem permissão' : 'GPS sem sinal';
        atualizarModo();
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
    atualizarModo();
}

function pararGps() {
    if (gps.watchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(gps.watchId);
    gps.watchId = null;
}

function recebeuPosicao(pos) {
    const primeira = !gps.ultima;
    const leitura = { lat: pos.coords.latitude, lng: pos.coords.longitude, prec: Math.round(pos.coords.accuracy), t: Date.now() };
    gps.erro = '';
    gps.ultima = leitura;
    gps.leituras.push(leitura);
    gps.leituras = gps.leituras.filter(l => leitura.t - l.t < 4000);
    if (mapa) {
        const ll = [leitura.lat, leitura.lng];
        if (!marcadorGps) {
            circuloGps = L.circle(ll, { radius: leitura.prec, color: '#2980b9', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(mapa);
            marcadorGps = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="gps-ponto"></div>', iconSize: [16, 16] }), interactive: false, zIndexOffset: 1000 }).addTo(mapa);
        } else { marcadorGps.setLatLng(ll); circuloGps.setLatLng(ll).setRadius(leitura.prec); }
        if (gps.seguindo) mapa.setView(ll, primeira && !mapeamento.pontos.length ? 18 : Math.max(mapa.getZoom(), 17));
    }
    atualizarModo();
}

// A melhor leitura dos últimos 4 segundos (a de menor erro). Janela curta para
// não pegar uma posição de quando o técnico ainda estava andando.
// Parado, o celular pode ficar sem mandar leitura nova: aí vale a última (até 30s).
function melhorLeituraGps() {
    const agora = Date.now();
    const recentes = gps.leituras.filter(l => agora - l.t < 4000);
    if (recentes.length) return recentes.reduce((a, b) => (b.prec < a.prec ? b : a));
    if (gps.ultima && agora - gps.ultima.t < 30000) return gps.ultima;
    return null;
}

function usandoGps() { return gps.seguindo && !!melhorLeituraGps(); }

function seguirGps() {
    gps.seguindo = true;
    if (gps.watchId === null) iniciarGps();
    if (gps.ultima && mapa) mapa.setView([gps.ultima.lat, gps.ultima.lng], Math.max(mapa.getZoom(), 18));
    atualizarModo();
}

// Atualiza o botão principal, a mira e o aviso do GPS.
function atualizarModo() {
    const btn = document.getElementById('btnPosteAqui');
    const mira = document.getElementById('mapaMira');
    const chip = document.getElementById('mapaGpsChip');
    if (!btn) return;
    const leitura = melhorLeituraGps();
    const gpsAtivo = usandoGps() && !pontoMovendo;
    if (pontoMovendo) {
        const n = mapeamento.pontos.findIndex(p => p.id === pontoMovendo) + 1;
        btn.innerText = `✓ Colocar ponto ${n} na mira`;
    } else {
        btn.innerText = gpsAtivo ? `📍 Poste aqui (GPS ±${leitura.prec}m)` : '✛ Poste na mira';
    }
    btn.classList.toggle('mira', !gpsAtivo);
    mira.classList.toggle('visivel', !gpsAtivo);
    chip.classList.remove('bom', 'ruim');
    if (gps.erro) { chip.innerText = '📡 ' + gps.erro + ' · use a mira'; chip.classList.add('ruim'); }
    else if (!gps.ultima) { chip.innerText = '📡 Procurando GPS…'; }
    else if (!gps.seguindo) { chip.innerText = '📡 Voltar para o GPS'; }
    else { chip.innerText = `📡 GPS ±${gps.ultima.prec}m`; chip.classList.add(gps.ultima.prec <= PRECISAO_ACEITAVEL ? 'bom' : 'ruim'); }
}

// ==========================================
// AÇÕES DO TÉCNICO
// ==========================================
function vibrar(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

function marcarPoste() {
    if (pontoMovendo) { confirmarMovimento(); return; }
    let dados;
    if (usandoGps()) {
        const l = melhorLeituraGps();
        if (l.prec > PRECISAO_ACEITAVEL && !confirm(`O GPS está impreciso agora (±${l.prec}m).\n\nMarcar mesmo assim? Você pode ajustar depois arrastando o mapa e usando "Mover para a mira".`)) return;
        dados = { lat: l.lat, lng: l.lng, prec: l.prec, origem: 'gps' };
    } else {
        const c = mapa.getCenter();
        dados = { lat: c.lat, lng: c.lng, prec: null, origem: 'mira' };
    }
    dados.hora = new Date().toISOString();
    dados.rua = document.getElementById('mapaRua').value.trim();
    const anterior = acharPonto(mapeamento, mapeamento.ativo);
    if (anterior && distanciaMetros(anterior, dados) < 3) {
        alert('Este ponto está colado no anterior (menos de 3m). Ande até o próximo poste ou arraste o mapa.');
        return;
    }
    if (!mapeamento.autor) mapeamento.autor = (document.getElementById('inputEncarregado') || {}).value || '';
    const p = adicionarPonto(mapeamento, dados);
    vibrar(60);
    salvarMapeamento(); desenharMapeamento();
    if (typeof preencherRuaPeloGps === 'function') preencherRuaPeloGps(p);
}

function desfazerPonto() {
    if (pontoMovendo) { pontoMovendo = null; atualizarModo(); avisoMapa('Movimento cancelado.'); return; }
    const ultimo = mapeamento.pontos[mapeamento.pontos.length - 1];
    if (!ultimo) return;
    if (!confirm(`Apagar o ponto ${mapeamento.pontos.length}?`)) return;
    removerPonto(mapeamento, ultimo.id);
    salvarMapeamento(); desenharMapeamento();
}

function pontoAtivoOuAviso() {
    const p = acharPonto(mapeamento, mapeamento.ativo);
    if (!p) alert('Marque um poste primeiro.');
    return p;
}

function marcarCaixa(tipo, idPonto) {
    const p = idPonto ? acharPonto(mapeamento, idPonto) : pontoAtivoOuAviso();
    if (!p) return;
    pontoEmEdicao = p.id;
    if (tipo === 'CTOP') { abrirPainelCtop(p); return; }
    if (tipo === 'CEO') {
        const nova = confirm('Esta CEO é NOVA ou EXISTENTE?\n\n[OK] = Instalação nova\n[Cancelar] = Existente');
        p.caixa = { tipo: 'CEO', nova: nova };
    } else if (tipo === 'Subida') {
        p.caixa = { tipo: 'Subida' };
    } else {
        p.caixa = null;
    }
    vibrar(40); salvarMapeamento(); desenharMapeamento();
    if (document.getElementById('painelPonto').classList.contains('aberto')) abrirPainelPonto(p.id);
}

// Mapeamentos antigos tinham "material" em texto livre: vira um item.
function migrarMapeamento(m) {
    (m.pontos || []).forEach(p => {
        if (!Array.isArray(p.itens)) p.itens = [];
        if (p.material) { p.itens.push({ item: p.material, qtd: '' }); delete p.material; }
    });
    if (!Array.isArray(m.retiradas)) m.retiradas = [];
    return m;
}

function nomeItem(v) { return String(v).replace(/^\d+ - /, ''); }

// Texto curto da caixa de um ponto (usado no painel, no croqui e no PDF).
function descreverCaixa(c) {
    if (!c) return '';
    if (c.tipo === 'CTOP') return ['CTOP', c.num, c.corNome && c.corNome !== 'Preta' ? c.corNome.toLowerCase() : ''].filter(Boolean).join(' ');
    if (c.tipo === 'CEO') return c.nova ? 'CEO nova' : 'CEO existente';
    return c.tipo;
}

// --- Itens usados num poste ---
let itemPonto = null, itemEscolhido = '';

function catalogoDeItens() {
    const sel = document.getElementById('selectMaterialBase');
    const daLista = sel ? Array.from(sel.options).map(o => o.value).filter(v => v && v !== 'Outro') : [];
    return ITENS_FREQUENTES.concat(daLista.filter(v => !ITENS_FREQUENTES.includes(v)));
}

function abrirPainelItem(idPonto) {
    const p = idPonto ? acharPonto(mapeamento, idPonto) : pontoAtivoOuAviso();
    if (!p) return;
    itemPonto = p.id; itemEscolhido = '';
    document.getElementById('itemTitulo').innerText = `Item no ponto ${mapeamento.pontos.indexOf(p) + 1}`;
    const freq = document.getElementById('itemFrequentes'); freq.innerHTML = '';
    ITENS_FREQUENTES.forEach(v => {
        const b = document.createElement('button'); b.type = 'button'; b.innerText = nomeItem(v);
        b.onclick = () => escolherItem(v);
        freq.appendChild(b);
    });
    const sel = document.getElementById('itemCatalogo');
    sel.innerHTML = '<option value="">Lista completa…</option>' + catalogoDeItens().map(v => `<option value="${v.replace(/"/g, '&quot;')}">${nomeItem(v)}</option>`).join('') + '<option value="Outro">Outro (escrever)</option>';
    sel.onchange = () => escolherItem(sel.value, true);
    document.getElementById('itemOutro').style.display = 'none'; document.getElementById('itemOutro').value = '';
    document.getElementById('itemQtd').value = '1';
    document.getElementById('itemErro').innerText = '';
    abrirPainel('painelItem');
}

function escolherItem(v, daLista) {
    itemEscolhido = v;
    document.querySelectorAll('#itemFrequentes button').forEach(b => b.classList.toggle('sel', b.innerText === nomeItem(v)));
    if (!daLista) document.getElementById('itemCatalogo').value = '';
    const outro = document.getElementById('itemOutro');
    outro.style.display = v === 'Outro' ? 'block' : 'none';
    if (v === 'Outro') outro.focus();
    document.getElementById('itemErro').innerText = '';
}

function mudarQtdItem(delta) {
    const campo = document.getElementById('itemQtd');
    const atual = parseInt(campo.value, 10) || 0;
    campo.value = String(Math.max(1, atual + delta));
}

function confirmarItem() {
    const p = acharPonto(mapeamento, itemPonto);
    if (!p) { fecharPainel('painelItem'); return; }
    let item = itemEscolhido === 'Outro' ? document.getElementById('itemOutro').value.trim() : itemEscolhido;
    const qtd = parseInt(document.getElementById('itemQtd').value, 10);
    if (!item) { document.getElementById('itemErro').innerText = 'Escolha um item.'; return; }
    if (!qtd || qtd < 1) { document.getElementById('itemErro').innerText = 'Informe a quantidade.'; return; }
    const igual = p.itens.find(i => i.item === item);
    if (igual) igual.qtd = (Number(igual.qtd) || 0) + qtd; else p.itens.push({ item, qtd });
    fecharPainel('painelItem'); vibrar(40);
    salvarMapeamento(); desenharMapeamento();
    if (document.getElementById('painelPonto').classList.contains('aberto')) abrirPainelPonto(p.id);
    else avisoMapa(`${qtd}× ${nomeItem(item)} no ponto ${mapeamento.pontos.indexOf(p) + 1}`);
}

function removerItem(idPonto, indice) {
    const p = acharPonto(mapeamento, idPonto);
    if (!p) return;
    p.itens.splice(indice, 1);
    salvarMapeamento(); desenharMapeamento(); abrirPainelPonto(idPonto);
}

// --- Painel da CTOP ---
let tipoCtopEscolhido = '', corCtopEscolhida = 'Preta';
function abrirPainelCtop(p) {
    const atual = p.caixa && p.caixa.tipo === 'CTOP' ? p.caixa : {};
    tipoCtopEscolhido = atual.ctoTipo || '';
    corCtopEscolhida = atual.corNome || 'Preta';
    const cores = document.getElementById('ctopCores'); cores.innerHTML = '';
    CORES_CTOP.forEach(([nome, cor]) => {
        const b = document.createElement('button'); b.type = 'button'; b.innerText = nome;
        b.style.background = cor; b.style.color = (cor === '#ffffff' || cor === '#f1c40f') ? '#222' : '#fff';
        if (nome === corCtopEscolhida) b.classList.add('sel');
        b.onclick = () => { corCtopEscolhida = nome; cores.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)); };
        cores.appendChild(b);
    });
    const box = document.getElementById('ctopTipos'); box.innerHTML = '';
    TIPOS_CTOP.forEach(t => {
        const b = document.createElement('button'); b.type = 'button'; b.innerText = t;
        if (t === tipoCtopEscolhido) b.classList.add('sel');
        b.onclick = () => { tipoCtopEscolhido = t; box.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b)); };
        box.appendChild(b);
    });
    document.getElementById('ctopNum').value = atual.num || '';
    document.getElementById('ctopContagem').value = atual.contagem || '';
    document.getElementById('ctopErro').innerText = '';
    abrirPainel('painelCtop');
}

function confirmarCtop() {
    const p = acharPonto(mapeamento, pontoEmEdicao);
    if (!p) { fecharPainel('painelCtop'); return; }
    if (!tipoCtopEscolhido) { document.getElementById('ctopErro').innerText = 'Escolha o tipo da CTOP.'; return; }
    p.caixa = {
        tipo: 'CTOP', ctoTipo: tipoCtopEscolhido,
        corNome: corCtopEscolhida, cor: (CORES_CTOP.find(c => c[0] === corCtopEscolhida) || CORES_CTOP[0])[1],
        num: document.getElementById('ctopNum').value.trim(),
        contagem: document.getElementById('ctopContagem').value
    };
    fecharPainel('painelCtop'); vibrar(40);
    salvarMapeamento(); desenharMapeamento();
    if (document.getElementById('painelPonto').classList.contains('aberto')) abrirPainelPonto(p.id);
}

// --- Painel de um ponto (abre ao tocar no marcador) ---
function abrirPainelPonto(id) {
    const p = acharPonto(mapeamento, id);
    if (!p) return;
    pontoEmEdicao = id;
    const n = mapeamento.pontos.indexOf(p) + 1;
    document.getElementById('pontoTitulo').innerText = `Ponto ${n}` + (p.rua ? ' · ' + p.rua : '');
    const hora = p.hora ? new Date(p.hora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    const origem = p.origem === 'gps' ? `GPS ±${p.prec}m` : 'marcado pela mira';
    document.getElementById('pontoSub').innerText = `${origem} · ${hora}`;
    const lista = document.getElementById('pontoItens'); lista.innerHTML = '';
    if (!p.itens.length) lista.innerHTML = '<div class="vazio">Nenhum item ainda.</div>';
    p.itens.forEach((it, i) => {
        const linha = document.createElement('div'); linha.className = 'item-linha';
        linha.innerHTML = `<b>${it.qtd ? it.qtd + '×' : '•'}</b><span></span><button type="button" aria-label="Remover item">✕</button>`;
        linha.querySelector('span').innerText = nomeItem(it.item);
        linha.querySelector('button').onclick = () => removerItem(id, i);
        lista.appendChild(linha);
    });

    const tipos = document.getElementById('pontoTipos'); tipos.innerHTML = '';
    TIPOS_POSTE.forEach(t => {
        const b = document.createElement('button'); b.type = 'button'; b.innerText = t.replace('Poste ', 'Poste ');
        if (p.tipo === t) b.classList.add('sel');
        b.onclick = () => { p.tipo = t; salvarMapeamento(); desenharMapeamento(); abrirPainelPonto(id); };
        tipos.appendChild(b);
    });
    const caixas = document.getElementById('pontoCaixas'); caixas.innerHTML = '';
    const atual = p.caixa ? p.caixa.tipo : '';
    [['', 'Sem caixa'], ['CTOP', 'CTOP'], ['CEO', 'CEO'], ['Subida', 'Subida']].forEach(([valor, rotulo]) => {
        const b = document.createElement('button'); b.type = 'button';
        b.innerText = valor && atual === valor ? descreverCaixa(p.caixa) : rotulo;
        if (atual === valor) b.classList.add('sel');
        b.onclick = () => marcarCaixa(valor || 'nenhuma', id);
        caixas.appendChild(b);
    });
    abrirPainel('painelPonto');
}

function fecharPainelPonto() { fecharPainel('painelPonto'); }

function continuarDoPonto() {
    mapeamento.ativo = pontoEmEdicao;
    salvarMapeamento(); desenharMapeamento(); fecharPainelPonto();
    avisoMapa('O próximo poste vai sair deste ponto (ramal).');
}

// Mover um ponto: o técnico arrasta o mapa até a mira e confirma no botão grande.
// O botão ↩︎ cancela.
function moverPontoParaMira() {
    const p = acharPonto(mapeamento, pontoEmEdicao);
    if (!p) return;
    fecharPainelPonto();
    pontoMovendo = p.id;
    gps.seguindo = false;
    mapa.setView([p.lat, p.lng], Math.max(mapa.getZoom(), 18));
    atualizarModo();
    avisoMapa('Arraste o mapa até a mira ficar no poste certo e confirme no botão. ↩︎ cancela.');
}

function confirmarMovimento() {
    const p = acharPonto(mapeamento, pontoMovendo);
    pontoMovendo = null;
    if (p) {
        const c = mapa.getCenter();
        p.lat = c.lat; p.lng = c.lng; p.origem = 'mira'; p.prec = null;
        recalcularTrechosDoPonto(mapeamento, p.id);
        vibrar(40); salvarMapeamento(); desenharMapeamento();
    }
    atualizarModo();
}

// Aviso curto no topo do mapa (some sozinho).
function avisoMapa(texto) {
    let el = document.getElementById('mapaAviso');
    if (!el) {
        el = document.createElement('div'); el.id = 'mapaAviso'; el.className = 'mapa-aviso';
        document.querySelector('.mapa-area').appendChild(el);
    }
    el.innerText = texto; el.classList.add('visivel');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('visivel'), 4500);
}

function apagarPonto() {
    const p = acharPonto(mapeamento, pontoEmEdicao);
    if (!p) return;
    if (!confirm(`Apagar o ponto ${mapeamento.pontos.indexOf(p) + 1}?`)) return;
    removerPonto(mapeamento, p.id);
    fecharPainelPonto(); salvarMapeamento(); desenharMapeamento();
}

function editarTrecho(trecho) {
    const a = acharPonto(mapeamento, trecho.de), b = acharPonto(mapeamento, trecho.para);
    const na = mapeamento.pontos.indexOf(a) + 1, nb = mapeamento.pontos.indexOf(b) + 1;
    pedirMetragem({ titulo: `Trecho ${na} → ${nb}`, sub: `Medido no mapa: ${trecho.distancia}m · sugerido: ${sugerirMetragem(trecho.distancia)}m`, atual: trecho.metragem }, (valor) => {
        trecho.metragem = valor; trecho.editada = true;
        salvarMapeamento(); desenharMapeamento();
    });
}

// --- Painel da retirada ("do poste 2 ao 7") ---
let aposRetirada = null;

function numeroDoPonto(id) { return mapeamento.pontos.findIndex(p => p.id === id) + 1; }

function abrirPainelRetirada(depois) {
    if (mapeamento.pontos.length < 2) { alert('Marque os postes antes de informar a retirada.'); return; }
    aposRetirada = depois || null;
    let painel = document.getElementById('painelRetirada');
    if (!painel) {
        painel = document.createElement('div'); painel.id = 'painelRetirada'; painel.className = 'sheet-fundo';
        painel.innerHTML = `<div class="sheet">
            <div class="sheet-titulo" id="retiradaTitulo">Retirada de cabo</div>
            <div class="sheet-sub">Informe do poste ao poste onde o cabo antigo foi retirado. Pode adicionar mais de um trecho.</div>
            <div class="retirada-faixa">
                <span>Do poste</span><select id="retiradaDe" class="smart-select"></select>
                <span>até</span><select id="retiradaAte" class="smart-select"></select>
                <button type="button" onclick="adicionarRetirada()">＋</button>
            </div>
            <div class="sheet-erro" id="retiradaErro"></div>
            <div id="retiradaLista" class="retirada-lista"></div>
            <button class="btn-full" onclick="confirmarRetirada()">Confirmar retirada</button>
            <button class="sheet-cancelar" onclick="semRetirada()">Não houve retirada</button>
        </div>`;
        document.body.appendChild(painel);
    }
    document.getElementById('retiradaTitulo').innerText = mapeamento.retiradaRespondida ? 'Retirada de cabo' : 'Houve retirada de cabo?';
    const opcoes = mapeamento.pontos.map((p, i) => `<option value="${p.id}">${i + 1}</option>`).join('');
    const de = document.getElementById('retiradaDe'), ate = document.getElementById('retiradaAte');
    de.innerHTML = opcoes; ate.innerHTML = opcoes;
    de.value = String(mapeamento.pontos[0].id); ate.value = String(mapeamento.pontos[mapeamento.pontos.length - 1].id);
    document.getElementById('retiradaErro').innerText = '';
    desenharListaRetirada();
    abrirPainel('painelRetirada');
}

function adicionarRetirada() {
    const a = Number(document.getElementById('retiradaDe').value), b = Number(document.getElementById('retiradaAte').value);
    const erro = document.getElementById('retiradaErro');
    if (a === b) { erro.innerText = 'Escolha dois postes diferentes.'; return; }
    const r = criarRetirada(mapeamento, a, b);
    if (!r) { erro.innerText = 'Esses postes não estão ligados por trechos de cabo.'; return; }
    // Vão que já está numa retirada não entra de novo.
    const jaTem = new Set(); mapeamento.retiradas.forEach(x => x.trechos.forEach(t => { jaTem.add(t.de + '-' + t.para); jaTem.add(t.para + '-' + t.de); }));
    if (r.trechos.some(t => jaTem.has(t.de + '-' + t.para))) { erro.innerText = 'Parte desse trecho já está na retirada.'; return; }
    erro.innerText = '';
    mapeamento.retiradas.push(r);
    salvarMapeamento(); desenharListaRetirada(); desenharMapeamento();
}

function desenharListaRetirada() {
    const lista = document.getElementById('retiradaLista'); lista.innerHTML = '';
    if (!mapeamento.retiradas.length) { lista.innerHTML = '<div class="vazio">Nenhum trecho de retirada.</div>'; return; }
    mapeamento.retiradas.forEach((r, ri) => {
        const bloco = document.createElement('div'); bloco.className = 'retirada-bloco';
        const total = r.trechos.reduce((s, t) => s + (Number(t.metragem) || 0), 0);
        bloco.innerHTML = `<div class="retirada-cab"><b>Do poste ${numeroDoPonto(r.de)} ao ${numeroDoPonto(r.ate)}</b><span>${r.trechos.length} ${r.trechos.length === 1 ? 'vão' : 'vãos'} · ${total}m</span><button type="button" aria-label="Remover">✕</button></div>`;
        bloco.querySelector('button').onclick = () => { mapeamento.retiradas.splice(ri, 1); salvarMapeamento(); desenharListaRetirada(); desenharMapeamento(); };
        r.trechos.forEach(t => {
            const linha = document.createElement('label'); linha.className = 'retirada-vao';
            linha.innerHTML = `<span>${numeroDoPonto(t.de)} → ${numeroDoPonto(t.para)}</span><input type="text" inputmode="decimal" value="${t.metragem}"><em>m</em>`;
            linha.querySelector('input').onchange = (e) => {
                const v = parseFloat(String(e.target.value).replace(',', '.'));
                if (isNaN(v) || v <= 0) { e.target.value = t.metragem; return; }
                t.metragem = Math.round(v * 10) / 10; salvarMapeamento(); desenharListaRetirada(); atualizarResumo();
            };
            bloco.appendChild(linha);
        });
        lista.appendChild(bloco);
    });
}

function fecharRetirada() {
    mapeamento.retiradaRespondida = true;
    salvarMapeamento(); desenharMapeamento();
    fecharPainel('painelRetirada');
    const depois = aposRetirada; aposRetirada = null;
    if (depois) depois();
}
function confirmarRetirada() { fecharRetirada(); }
function semRetirada() {
    if (mapeamento.retiradas.length && !confirm('Apagar os trechos de retirada informados?')) return;
    mapeamento.retiradas = [];
    fecharRetirada();
}

// --- Menu ⋯ ---
const ACOES_MENU_MAPA = [
    { rotulo: '✂️ Retirada de cabo', acao: () => abrirPainelRetirada() },
    { rotulo: '🎯 Ver todo o trajeto', acao: () => enquadrarMapeamento() },
    { rotulo: '🗑️ Apagar todo o mapeamento', perigo: true, acao: () => { if (confirm('Apagar TODOS os pontos deste mapeamento?')) limparMapeamento(); } }
];

function abrirMenuMapa() {
    let painel = document.getElementById('painelMenuMapa');
    if (!painel) {
        painel = document.createElement('div');
        painel.id = 'painelMenuMapa'; painel.className = 'sheet-fundo';
        painel.onclick = (e) => { if (e.target === painel) fecharPainel('painelMenuMapa'); };
        painel.innerHTML = '<div class="sheet"><div class="sheet-titulo">Mapeamento</div><div class="sheet-sub" id="menuMapaSub"></div><div class="ponto-acoes" id="menuMapaAcoes" style="grid-template-columns:1fr"></div><button class="sheet-cancelar" onclick="fecharPainel(\'painelMenuMapa\')">Fechar</button></div>';
        document.body.appendChild(painel);
    }
    document.getElementById('menuMapaSub').innerText = `${mapeamento.pontos.length} pontos · ${totalMapeado(mapeamento)}m de cabo`;
    const box = document.getElementById('menuMapaAcoes'); box.innerHTML = '';
    ACOES_MENU_MAPA.forEach(item => {
        const b = document.createElement('button'); b.type = 'button'; b.innerText = item.rotulo;
        if (item.perigo) b.classList.add('perigo');
        b.onclick = () => { fecharPainel('painelMenuMapa'); item.acao(); };
        box.appendChild(b);
    });
    abrirPainel('painelMenuMapa');
}

function abrirPainel(id) { document.getElementById(id).classList.add('aberto'); }
function fecharPainel(id) { document.getElementById(id).classList.remove('aberto'); }

// ==========================================
// DESENHO NO MAPA
// ==========================================
function iconePonto(p, numero) {
    let classe = 'pm', texto = String(numero);
    let estilo = '';
    if (p.caixa && p.caixa.tipo === 'CTOP') {
        classe += ' ctop'; texto = 'C' + numero;
        if (p.caixa.cor && p.caixa.cor !== 'black') estilo = `background:${p.caixa.cor};color:${p.caixa.cor === '#ffffff' || p.caixa.cor === '#f1c40f' ? '#222' : '#fff'}`;
    }
    else if (p.caixa && p.caixa.tipo === 'CEO') { classe += ' ceo'; texto = 'E' + numero; }
    else if (p.caixa && p.caixa.tipo === 'Subida') { classe += ' subida'; texto = 'S' + numero; }
    if (p.id === mapeamento.ativo) classe += ' ativo';
    if (p.origem === 'gps' && p.prec > PRECISAO_ACEITAVEL) classe += ' impreciso';
    const selo = p.itens && p.itens.length ? `<span class="pm-itens">${p.itens.length}</span>` : '';
    return L.divIcon({ className: '', html: `<div class="${classe}" style="${estilo}">${texto}${selo}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
}

function desenharMapeamento() {
    atualizarResumo();
    if (!mapa || !camadaDesenho) return;
    camadaDesenho.clearLayers();
    mapeamento.trechos.forEach(t => {
        const a = acharPonto(mapeamento, t.de), b = acharPonto(mapeamento, t.para);
        if (!a || !b) return;
        const ll = [[a.lat, a.lng], [b.lat, b.lng]];
        L.polyline(ll, { color: '#e74c3c', weight: 6, opacity: 0.9, interactive: false })
            .bindTooltip(t.metragem + 'm' + (t.editada ? '' : '*'), { permanent: true, direction: 'center', className: 'tt-metragem' })
            .addTo(camadaDesenho);
        // Linha invisível e larga por cima: facilita tocar no trecho com o dedo.
        L.polyline(ll, { color: '#000', weight: 28, opacity: 0.01 }).on('click', () => editarTrecho(t)).addTo(camadaDesenho);
    });
    (mapeamento.retiradas || []).forEach(r => r.trechos.forEach(t => {
        const a = acharPonto(mapeamento, t.de), b = acharPonto(mapeamento, t.para);
        if (a && b) L.polyline([[a.lat, a.lng], [b.lat, b.lng]], { color: '#27ae60', weight: 4, dashArray: '8 8', opacity: 1, interactive: false }).addTo(camadaDesenho);
    }));
    mapeamento.pontos.forEach((p, i) => {
        L.marker([p.lat, p.lng], { icon: iconePonto(p, i + 1), zIndexOffset: p.id === mapeamento.ativo ? 500 : 0 })
            .on('click', () => abrirPainelPonto(p.id))
            .addTo(camadaDesenho);
    });
}

function atualizarResumo() {
    const el = document.getElementById('mapaResumo');
    if (!el) return;
    const n = mapeamento.pontos.length;
    const ret = totalRetirado(mapeamento);
    el.innerText = n ? `${n} ${n === 1 ? 'poste' : 'postes'} · ${totalMapeado(mapeamento)}m` + (ret ? ` · retirada ${ret}m` : '') : 'Nenhum poste marcado';
    const ativo = acharPonto(mapeamento, mapeamento.ativo);
    const campoRua = document.getElementById('mapaRua');
    if (ativo && ativo.rua && document.activeElement !== campoRua) campoRua.value = ativo.rua;
}

// ==========================================
// ENDEREÇO: BUSCAR E PREENCHER A RUA SOZINHO
// ==========================================
// Usa o Nominatim (busca gratuita do OpenStreetMap). Regra deles: no máximo
// 1 pedido por segundo, por isso os pedidos passam por uma fila.
const NOMINATIM = 'https://nominatim.openstreetmap.org';
let filaEndereco = Promise.resolve();
let ultimoPedidoEndereco = 0;
let ultimaRuaGps = '';        // última rua que o GPS informou
let ruaDigitadaEm = null;     // rua do GPS no momento em que o técnico digitou a rua à mão

function pedirNominatim(caminho) {
    const tarefa = filaEndereco.then(async () => {
        const espera = Math.max(0, 1100 - (Date.now() - ultimoPedidoEndereco));
        if (espera) await new Promise(r => setTimeout(r, espera));
        ultimoPedidoEndereco = Date.now();
        const resp = await fetch(NOMINATIM + caminho, { headers: { 'Accept-Language': 'pt-BR' } });
        if (!resp.ok) throw new Error('Nominatim ' + resp.status);
        return resp.json();
    });
    filaEndereco = tarefa.catch(() => {});
    return tarefa;
}

function resumirEndereco(a) {
    if (!a) return {};
    return {
        rua: a.road || a.pedestrian || a.residential || '',
        numero: a.house_number || '',
        bairro: a.suburb || a.neighbourhood || a.quarter || '',
        cidade: a.city || a.town || a.village || a.municipality || '',
        uf: (a['ISO3166-2-lvl4'] || '').replace('BR-', '') || a.state || ''
    };
}

async function buscarEndereco() {
    const campo = document.getElementById('mapaBusca');
    const texto = campo.value.trim();
    if (!texto) { avisoMapa('Digite a rua, o número e a cidade.'); campo.focus(); return; }
    if (!navigator.onLine) { avisoMapa('Sem internet para buscar o endereço. Arraste o mapa até o local.'); return; }
    campo.blur();
    avisoMapa('Buscando endereço…');
    let resultados;
    try {
        resultados = await pedirNominatim('/search?format=jsonv2&limit=5&countrycodes=br&addressdetails=1&q=' + encodeURIComponent(texto));
    } catch (e) {
        avisoMapa('Não deu para buscar agora. Confira a internet e tente de novo.'); return;
    }
    if (!resultados || !resultados.length) {
        avisoMapa('Endereço não encontrado. Tente sem o número, ou com o bairro e a cidade.'); return;
    }
    if (resultados.length === 1) { irParaEndereco(resultados[0]); return; }
    escolherEndereco(resultados);
}

// Mais de um resultado: o técnico escolhe na lista.
function escolherEndereco(resultados) {
    let painel = document.getElementById('painelEnderecos');
    if (!painel) {
        painel = document.createElement('div'); painel.id = 'painelEnderecos'; painel.className = 'sheet-fundo';
        painel.onclick = (e) => { if (e.target === painel) fecharPainel('painelEnderecos'); };
        painel.innerHTML = '<div class="sheet"><div class="sheet-titulo">Qual destes?</div><div class="sheet-sub">Toque no endereço certo</div><div class="lista-enderecos" id="listaEnderecos"></div><button class="sheet-cancelar" onclick="fecharPainel(\'painelEnderecos\')">Cancelar</button></div>';
        document.body.appendChild(painel);
    }
    const lista = document.getElementById('listaEnderecos'); lista.innerHTML = '';
    resultados.forEach(r => {
        const b = document.createElement('button'); b.type = 'button';
        b.innerText = r.display_name.replace(/, Brasil$/, '').replace(/, Região .*?(,|$)/, '$1');
        b.onclick = () => { fecharPainel('painelEnderecos'); irParaEndereco(r); };
        lista.appendChild(b);
    });
    abrirPainel('painelEnderecos');
}

function irParaEndereco(r) {
    const end = resumirEndereco(r.address);
    gps.seguindo = false;
    mapa.setView([parseFloat(r.lat), parseFloat(r.lon)], 18);
    atualizarModo();
    if (end.rua) { document.getElementById('mapaRua').value = end.rua; ruaDigitadaEm = null; }
    mapeamento.endereco = Object.assign({ buscado: document.getElementById('mapaBusca').value.trim() }, end);
    salvarMapeamento();
    avisoMapa('Arraste o mapa até a mira ficar em cima do primeiro poste e toque em "Poste na mira".');
}

// Depois de marcar um poste com internet, pergunta ao mapa o nome da rua daquele ponto.
async function preencherRuaPeloGps(ponto) {
    if (!navigator.onLine) return;
    let r;
    try { r = await pedirNominatim(`/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${ponto.lat}&lon=${ponto.lng}`); }
    catch (e) { return; }
    const end = resumirEndereco(r && r.address);
    const p = acharPonto(mapeamento, ponto.id);
    if (!p || !end.rua) return;
    // Se o técnico digitou a rua à mão nesta mesma rua do GPS, respeita o que ele digitou.
    const respeitarDigitada = ruaDigitadaEm !== null && ruaDigitadaEm === end.rua && p.rua;
    if (!respeitarDigitada) {
        ruaDigitadaEm = null;
        p.rua = end.rua;
        if (p.id === mapeamento.ativo) document.getElementById('mapaRua').value = end.rua;
    }
    p.numeroAprox = end.numero; p.bairro = end.bairro; p.cidade = end.cidade; p.uf = end.uf;
    ultimaRuaGps = end.rua;
    if (!mapeamento.endereco || !mapeamento.endereco.cidade) mapeamento.endereco = Object.assign({}, end);
    salvarMapeamento(); desenharMapeamento();
}

if (typeof window !== 'undefined') window.addEventListener('DOMContentLoaded', () => {
    const busca = document.getElementById('mapaBusca');
    if (busca) busca.addEventListener('keydown', (e) => { if (e.key === 'Enter') buscarEndereco(); });
    const rua = document.getElementById('mapaRua');
    if (rua) rua.addEventListener('input', () => { ruaDigitadaEm = ultimaRuaGps; });
});

// ==========================================
// GERAR O CROQUI A PARTIR DO MAPEAMENTO
// ==========================================
// Converte latitude/longitude em posição no desenho: norte para cima e
// escala escolhida para um vão típico ocupar uns 140px na tela.
function projetarPontos(m) {
    const pos = {};
    if (!m.pontos.length) return { pos, escala: 1 };
    const lat0 = m.pontos[0].lat, lng0 = m.pontos[0].lng;
    // Mesma proporção do mapa web (Mercator): assim o croqui encaixa certinho em cima do mapa no PDF.
    const ky = 111320, kx = ky * Math.cos(lat0 * Math.PI / 180);
    const dists = m.trechos.map(t => t.distancia || distanciaMetros(acharPonto(m, t.de), acharPonto(m, t.para))).filter(d => d > 0).sort((a, b) => a - b);
    const mediana = dists.length ? dists[Math.floor(dists.length / 2)] : 40;
    const escala = Math.min(6, Math.max(0.3, 140 / mediana)); // pixels por metro
    let minX = Infinity, minY = Infinity;
    m.pontos.forEach(p => {
        const x = (p.lng - lng0) * kx * escala, y = -(p.lat - lat0) * ky * escala;
        pos[p.id] = { x, y }; minX = Math.min(minX, x); minY = Math.min(minY, y);
    });
    // Começa perto do canto da grade, com folga para os nomes das ruas.
    const offX = 220 - minX, offY = 220 - minY;
    Object.values(pos).forEach(q => { q.x = q.x + offX; q.y = q.y + offY; });
    // Guarda a conversão para depois achar a posição real de qualquer ponto do croqui.
    return { pos, escala, projecao: { lat0, lng0, kx, ky, escala, offX, offY } };
}

// Agrupa pontos seguidos da mesma rua para escrever o nome uma vez só, ao lado do trecho.
function posicoesDasRuas(m, pos) {
    const grupos = {};
    m.pontos.forEach(p => { if (p.rua) (grupos[p.rua] = grupos[p.rua] || []).push(pos[p.id]); });
    return Object.keys(grupos).map(rua => {
        const pts = grupos[rua];
        const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length, cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;
        let ang = 0;
        if (pts.length > 1) {
            const a = pts[0], b = pts[pts.length - 1];
            ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
            if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
            ang = Math.round(ang / 15) * 15;
        }
        // Afasta o nome 55px para o lado do cabo (perpendicular ao trajeto).
        const r = ang * Math.PI / 180;
        // Do lado oposto ao da linha verde de retirada (que vai para baixo/direita).
        return { rua, x: cx + Math.sin(r) * 55, y: cy - Math.cos(r) * 55, angulo: ang };
    });
}

// ==========================================
// ARRUMAÇÃO DO CROQUI GERADO (sem nada por cima de nada)
// ==========================================
// Só geometria, sem desenhar: decide onde vai a retirada, as caixas com
// seta de cada poste e os nomes das ruas, evitando sobreposição.
const DESLOC_RETIRADA = 34;   // distância da linha verde até o cabo lançado (px do croqui)
const FONTE_NOTA = 19, FONTE_NOTA_TITULO = 20, LINHA_NOTA = 25; // texto das caixas com seta (legível no PDF)

function retangulo(cx, cy, w, h) { return { x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2 }; }
function areaSobreposta(a, b) {
    const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1), h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
    return w > 0 && h > 0 ? w * h : 0;
}
// O segmento cruza (ou encosta) no retângulo?
function segmentoCruzaRet(p, q, r, folga) {
    folga = folga || 0;
    const R = { x1: r.x1 - folga, y1: r.y1 - folga, x2: r.x2 + folga, y2: r.y2 + folga };
    let t0 = 0, t1 = 1; const dx = q.x - p.x, dy = q.y - p.y;
    const testes = [[-dx, p.x - R.x1], [dx, R.x2 - p.x], [-dy, p.y - R.y1], [dy, R.y2 - p.y]];
    for (const [pp, qq] of testes) {
        if (pp === 0) { if (qq < 0) return false; continue; }
        const t = qq / pp;
        if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
}
function distPontoSeg(pt, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / l2));
    return Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy));
}
// Largura aproximada do texto. Maiúsculas em negrito são mais largas.
function larguraTexto(txt, fonte, negritoMaiusculo) { return String(txt).length * fonte * (negritoMaiusculo ? 0.68 : 0.56); }

// Texto girado = faixa fina. Representa com quadradinhos ao longo da faixa.
function faixaDeTexto(x, y, w, h, t) {
    const q = [];
    for (let k = -w / 2 + h / 2; k <= w / 2 - h / 2 + 0.1; k += h * 0.8) q.push(retangulo(x + t.x * k, y + t.y * k, h, h));
    return q;
}

// Linha paralela a um caminho de pontos, com cantos unidos (sem quebrar na curva).
function deslocarCaminho(pts, d) {
    const normais = [];
    for (let i = 0; i < pts.length - 1; i++) {
        const dx = pts[i + 1].x - pts[i].x, dy = pts[i + 1].y - pts[i].y, l = Math.hypot(dx, dy) || 1;
        normais.push({ x: -dy / l, y: dx / l });
    }
    return pts.map((p, i) => {
        const n0 = normais[Math.max(0, i - 1)], n1 = normais[Math.min(normais.length - 1, i)];
        let nx = n0.x + n1.x, ny = n0.y + n1.y; const l = Math.hypot(nx, ny);
        if (l < 0.2) return { x: p.x + n1.x * d, y: p.y + n1.y * d };          // volta de 180°: usa a normal do trecho
        nx /= l; ny /= l;
        const cos = nx * n1.x + ny * n1.y, fator = Math.min(2.5, 1 / Math.max(cos, 0.4)); // canto em "bico", com limite
        return { x: p.x + nx * d * fator, y: p.y + ny * d * fator };
    });
}

function linhasDaNota(p) {
    const linhas = [];
    if (p.caixa && p.caixa.tipo === 'CTOP') {
        linhas.push({ t: descreverCaixa(p.caixa).toUpperCase(), titulo: true });
        if (p.caixa.contagem) linhas.push({ t: 'Contagem ' + p.caixa.contagem });
        if (p.caixa.ctoTipo) linhas.push({ t: p.caixa.ctoTipo });
    } else if (p.caixa && p.caixa.tipo === 'CEO') {
        linhas.push({ t: descreverCaixa(p.caixa).toUpperCase(), titulo: true });
    }
    (p.itens || []).forEach(i => {
        let nome = nomeItem(i.item); if (nome.length > 30) nome = nome.slice(0, 29) + '…';
        linhas.push({ t: (i.qtd ? i.qtd + '× ' : '') + nome });
    });
    if (linhas.length && !linhas[0].titulo) linhas.unshift({ t: (p.caixa && p.caixa.tipo === 'Subida' ? 'SUBIDA' : (p.tipo || 'POSTE').toUpperCase()), titulo: true });
    return linhas;
}

// m: mapeamento · pos: id -> {x, y} no croqui.
function planejarCroqui(m, pos) {
    const P = id => pos[id];
    const ocupados = [];   // retângulos já usados (equipamentos, etiquetas, notas)
    const linhas = [];     // segmentos de cabo (lançado e retirado)
    m.pontos.forEach(p => ocupados.push(retangulo(P(p.id).x, P(p.id).y, 48, 48)));
    m.trechos.forEach(t => {
        const a = P(t.de), b = P(t.para); if (!a || !b) return;
        linhas.push([a, b]);
        const txt = t.metragem + 'm';
        ocupados.push(retangulo((a.x + b.x) / 2, (a.y + b.y) / 2, larguraTexto(txt, 22) + 14, 34));
    });

    const penalidade = (r, extraSegs) => {
        let pen = 0;
        ocupados.forEach(o => { pen += areaSobreposta(r, o) * 20; }); // qualquer sobreposição pesa mais que afastar
        linhas.concat(extraSegs || []).forEach(([a, b]) => { if (segmentoCruzaRet(a, b, r, 6)) pen += 4000; });
        return pen;
    };

    // 1) Retirada: lado com mais espaço livre
    const retiradas = [];
    (m.retiradas || []).forEach(r => {
        const caminho = [r.trechos[0].de].concat(r.trechos.map(t => t.para)).map(P);
        if (caminho.some(q => !q)) return;
        const lados = [DESLOC_RETIRADA, -DESLOC_RETIRADA].map(d => {
            const desl = deslocarCaminho(caminho, d);
            let pen = 0;
            for (let i = 0; i < desl.length - 1; i++) {
                linhas.forEach(([a, b]) => {
                    const doCaminho = caminho.includes(a) && caminho.includes(b);
                    if (!doCaminho) pen += Math.max(0, 40 - Math.min(distPontoSeg(a, desl[i], desl[i + 1]), distPontoSeg(b, desl[i], desl[i + 1]))) * 50;
                });
                ocupados.forEach(o => { if (segmentoCruzaRet(desl[i], desl[i + 1], o, 0)) pen += 300; });
            }
            // empate: prefere o lado de baixo/direita, como a retirada manual
            const n = { x: desl[0].x - caminho[0].x, y: desl[0].y - caminho[0].y };
            return { d, desl, pen: pen - (n.x + n.y > 0 ? 1 : 0) };
        });
        const melhor = lados.sort((a, b) => a.pen - b.pen)[0];
        r.trechos.forEach((t, i) => {
            const a = melhor.desl[i], b = melhor.desl[i + 1];
            const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
            const n = { x: -dy / l * Math.sign(melhor.d), y: dx / l * Math.sign(melhor.d) };
            const txt = t.metragem + 'm', w = larguraTexto(txt, 20) + 12, h = 30;
            const ext = Math.abs(n.x) * w / 2 + Math.abs(n.y) * h / 2;    // etiqueta fica do lado de fora da linha verde
            // No meio do vão; se o meio já estiver ocupado (ex.: canto com vãos curtos), anda ao longo do vão.
            let melhorRot = null;
            [0.5, 0.36, 0.64, 0.24, 0.76].forEach((f, fi) => {
                const cx = a.x + dx * f + n.x * (ext + 4), cy = a.y + dy * f + n.y * (ext + 4);
                const pen = penalidade(retangulo(cx, cy, w, h)) + fi;
                if (!melhorRot || pen < melhorRot.pen) melhorRot = { pen, cx, cy };
            });
            const cx = melhorRot.cx, cy = melhorRot.cy;
            retiradas.push({ de: t.de, para: t.para, metragem: t.metragem, a, b, rotulo: { x: cx, y: cy, w, h } });
            linhas.push([a, b]);
            ocupados.push(retangulo(cx, cy, w, h));
        });
    });

    // 2) Caixa com seta em cada poste que tem caixa ou itens
    const notas = [];
    const direcoes = [-45, -135, 45, 135, -90, 0, 180, 90].map(g => ({ x: Math.cos(g * Math.PI / 180), y: Math.sin(g * Math.PI / 180) }));
    m.pontos.forEach(p => {
        const lns = linhasDaNota(p);
        if (!lns.length) return;
        const w = Math.max(...lns.map(l => larguraTexto(l.t, l.titulo ? FONTE_NOTA_TITULO : FONTE_NOTA, l.titulo))) + 26, h = lns.length * LINHA_NOTA + 16;
        const alvo = P(p.id);
        let melhor = null;
        [80, 125, 175, 230].forEach((dist, di) => direcoes.forEach((u, ui) => {
            const cx = alvo.x + u.x * (dist + w / 2 * Math.abs(u.x)), cy = alvo.y + u.y * (dist + h / 2 * Math.abs(u.y));
            const r = retangulo(cx, cy, w, h);
            const seta = [{ x: cx, y: cy }, alvo];
            let pen = penalidade(retangulo(cx, cy, w + 12, h + 12)); // 6px de folga em volta
            ocupados.forEach(o => { if (o !== null && segmentoCruzaRet(seta[0], seta[1], o, -2) && !(Math.abs((o.x1 + o.x2) / 2 - alvo.x) < 1 && Math.abs((o.y1 + o.y2) / 2 - alvo.y) < 1)) pen += 150; });
            pen += di * 40 + ui;   // prefere perto e nas diagonais
            if (!melhor || pen < melhor.pen) melhor = { pen, cx, cy, r };
        }));
        // Seta: da borda da caixa até a borda do poste
        const dx = alvo.x - melhor.cx, dy = alvo.y - melhor.cy, l = Math.hypot(dx, dy) || 1;
        const k = Math.min(Math.abs((w / 2) / (dx || 1e-9)), Math.abs((h / 2) / (dy || 1e-9)));
        const ini = { x: melhor.cx + dx * Math.min(k, 1), y: melhor.cy + dy * Math.min(k, 1) };
        const fim = { x: alvo.x - dx / l * 27, y: alvo.y - dy / l * 27 };
        notas.push({ id: p.id, cx: melhor.cx, cy: melhor.cy, w, h, linhas: lns, cor: p.caixa && p.caixa.tipo === 'CTOP' ? '#660099' : (p.caixa && p.caixa.tipo === 'CEO' ? '#111111' : '#d35400'), seta: { ini, fim } });
        ocupados.push(melhor.r);
        linhas.push([ini, fim]);
    });

    // 3) Nomes das ruas: do lado da própria rua, no espaço livre
    const ruas = [];
    const grupos = {};
    m.pontos.forEach(p => { if (p.rua) (grupos[p.rua] = grupos[p.rua] || []).push(P(p.id)); });
    Object.keys(grupos).forEach(rua => {
        const pts = grupos[rua];
        const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length, cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;
        let ang = 0;
        if (pts.length > 1) {
            ang = Math.atan2(pts[pts.length - 1].y - pts[0].y, pts[pts.length - 1].x - pts[0].x) * 180 / Math.PI;
            if (ang > 90) ang -= 180; if (ang < -90) ang += 180; ang = Math.round(ang / 15) * 15;
        }
        const rad = ang * Math.PI / 180, n = { x: -Math.sin(rad), y: Math.cos(rad) }, t = { x: Math.cos(rad), y: Math.sin(rad) };
        const w = larguraTexto(rua.toUpperCase(), 24, true) + 12, h = 32;
        let melhor = null;
        [50, 80, 115, 155, 200].forEach((d, di) => [-1, 1].forEach(lado => [0, -0.5, 0.5, -1, 1].forEach((desl, si) => {
            const x = cx + n.x * d * lado + t.x * desl * w / 2, y = cy + n.y * d * lado + t.y * desl * w / 2;
            const faixa = faixaDeTexto(x, y, w, h, t);
            const pen = faixa.reduce((sp, q) => sp + penalidade(q), 0) + di * 30 + si * 8 + (lado === -1 ? 0 : 1);
            if (!melhor || pen < melhor.pen) melhor = { pen, x, y, faixa };
        })));
        ruas.push({ rua, x: melhor.x, y: melhor.y, angulo: ang, faixa: melhor.faixa });
        melhor.faixa.forEach(q => ocupados.push(q));
    });

    return { retiradas, notas, ruas, ocupados };
}

function gerarCroquiDoMapa() {
    if (mapeamento.pontos.length < 2) { alert('Marque pelo menos 2 postes para gerar o croqui.'); return; }
    // Pergunta da retirada (uma vez por mapeamento; dá para mudar depois no menu ⋯).
    if (!mapeamento.retiradaRespondida) { abrirPainelRetirada(() => gerarCroquiDoMapa()); return; }
    const temDesenho = canvas.getObjects().some(o => o.id_tipo && o.id_tipo !== 'marcador');
    if (temDesenho && !confirm('Já existe um desenho no croqui.\n\nSubstituir pelo desenho gerado do mapa?')) return;

    const { pos, projecao } = projetarPontos(mapeamento);
    mapeamento.projecao = projecao;
    salvarMapeamento();
    if (typeof resetStartNode === 'function') resetStartNode();
    navegandoHistorico = true; // um único passo de "desfazer" para tudo
    canvas.getObjects().slice().forEach(o => canvas.remove(o));

    mapeamento.trechos.forEach(t => {
        const a = pos[t.de], b = pos[t.para];
        if (a && b) desenharCabo({ left: a.x, top: a.y }, { left: b.x, top: b.y }, String(t.metragem), t.tipo || 'instalado');
    });

    mapeamento.pontos.forEach((p, i) => {
        const q = pos[p.id];
        let g;
        if (p.caixa && p.caixa.tipo === 'CTOP') g = montarCTO(q.x, q.y, p.caixa.num || 'S/N', p.caixa.contagem || '', p.caixa.cor || 'black', p.caixa.ctoTipo);
        else if (p.caixa && p.caixa.tipo === 'CEO') g = montarCEO(q.x, q.y, p.caixa.nova);
        else if (p.caixa && p.caixa.tipo === 'Subida') g = montarSubida(q.x, q.y);
        else g = montarPoste(q.x, q.y, p.tipo);
        g.set({ ponto_mapa: p.id, ponto_numero: i + 1 });
        if (p.itens && p.itens.length) g.set('itens_ponto', p.itens.map(i => ({ item: i.item, qtd: i.qtd })));
        canvas.add(g);
    });

    // Retirada, caixas com seta e nomes de rua, arrumados para nada ficar por cima de nada.
    const plano = planejarCroqui(mapeamento, pos);
    plano.retiradas.forEach(r => canvas.add(montarRetiradaVao(r)));
    plano.notas.forEach(n => { canvas.add(montarSetaNota(n)); canvas.add(montarNota(n)); });
    plano.ruas.forEach(r => canvas.add(montarRua(r.x, r.y, r.rua, r.angulo).set('rua_mapa', true)));

    // Ordem de cima para baixo: notas e ruas > equipamentos > cabos
    canvas.getObjects().forEach(o => { if (o.id_tipo && o.id_tipo.startsWith('equipamento')) canvas.bringToFront(o); });
    canvas.getObjects().forEach(o => { if (o.id_tipo === 'seta_nota' || o.id_tipo === 'nota_ponto' || o.id_tipo === 'rua_livre') canvas.bringToFront(o); });
    enquadrarCroqui(Object.values(pos).concat(plano.notas.map(n => ({ x: n.cx, y: n.cy }))));
    navegandoHistorico = false;
    salvarEstado();
    fecharMapa();
    const ret = totalRetirado(mapeamento);
    updateStatus(`Croqui gerado do mapa: ${mapeamento.pontos.length} pontos, ${totalMapeado(mapeamento)}m` + (ret ? `, retirada ${ret}m` : ''));
}

// Um vão de cabo retirado (linha verde paralela + metragem do lado de fora).
// Mesmo formato dos outros cabos: tocar nele permite corrigir a metragem.
function montarRetiradaVao(r) {
    const linha = new fabric.Line([r.a.x, r.a.y, r.b.x, r.b.y], { stroke: '#27ae60', strokeWidth: 5, strokeLineCap: 'round' });
    const txt = new fabric.Text(r.metragem + 'm', { left: r.rotulo.x, top: r.rotulo.y, fontSize: 20, fill: '#1e8449', backgroundColor: 'rgba(255,255,255,1)', originX: 'center', originY: 'center', fontWeight: 'bold', padding: 4 });
    return new fabric.Group([linha, txt], { selectable: true, lockMovementX: true, lockMovementY: true, hasControls: false, perPixelTargetFind: true,
        id_tipo: 'cabo', sub_tipo: 'retirado', valor_metragem: Number(r.metragem), retirada_mapa: true });
}

// Caixa de texto com o que foi feito no poste (CTOP, CEO, itens).
function montarNota(n) {
    const x0 = n.cx - n.w / 2, y0 = n.cy - n.h / 2;
    const objs = [new fabric.Rect({ left: x0, top: y0, width: n.w, height: n.h, fill: '#ffffff', stroke: n.cor, strokeWidth: 2, rx: 6, ry: 6 })];
    n.linhas.forEach((l, i) => objs.push(new fabric.Text(l.t, { left: x0 + 12, top: y0 + 8 + i * LINHA_NOTA, fontSize: l.titulo ? FONTE_NOTA_TITULO : FONTE_NOTA, fontWeight: l.titulo ? 'bold' : 'normal', fill: l.titulo ? n.cor : '#2c3e50', fontFamily: 'Roboto' })));
    return new fabric.Group(objs, { selectable: true, lockMovementX: true, lockMovementY: true, hasControls: false, id_tipo: 'nota_ponto', nota_ponto: n.id });
}

// Seta da caixa até o poste.
function montarSetaNota(n) {
    const { ini, fim } = n.seta;
    const ang = Math.atan2(fim.y - ini.y, fim.x - ini.x) * 180 / Math.PI;
    const linha = new fabric.Line([ini.x, ini.y, fim.x, fim.y], { stroke: '#2c3e50', strokeWidth: 2 });
    const ponta = new fabric.Triangle({ left: fim.x, top: fim.y, width: 12, height: 14, angle: ang + 90, fill: '#2c3e50', originX: 'center', originY: 'center' });
    return new fabric.Group([linha, ponta], { selectable: false, evented: false, id_tipo: 'seta_nota' });
}

// Ajusta o zoom e a posição para o croqui inteiro aparecer na tela.
function enquadrarCroqui(pts) {
    const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
    const minX = Math.min(...xs) - 100, maxX = Math.max(...xs) + 100, minY = Math.min(...ys) - 100, maxY = Math.max(...ys) + 100;
    const z = Math.max(0.4, Math.min(1.2, canvas.width / (maxX - minX), canvas.height / (maxY - minY)));
    canvas.setViewportTransform([z, 0, 0, z, (canvas.width - (minX + maxX) * z) / 2, (canvas.height - (minY + maxY) * z) / 2]);
    zoomLevel = z;
}

// ==========================================
// COMPARTILHAR O MAPEAMENTO POR LINK (WhatsApp)
// ==========================================
// O mapeamento vai DENTRO do link (compactado, depois do #). Quem mapeou
// manda o link; quem vai executar abre e o mapeamento entra no app dele.
// Não precisa de servidor, e o conteúdo não passa por nenhum site.
function paraBase64Url(bytes) {
    let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function deBase64Url(txt) {
    const bin = atob(txt.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
}
async function transformar(bytes, stream) {
    const resp = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await resp.arrayBuffer());
}

// Só o necessário, com coordenadas em 6 casas (~10cm).
function enxugarMapeamento(m) {
    const r6 = v => Math.round(v * 1e6) / 1e6;
    return {
        v: 1, criadoEm: m.criadoEm, autor: m.autor || '', oc: m.oc || '', endereco: m.endereco || null,
        pontos: m.pontos.map(p => ({ id: p.id, lat: r6(p.lat), lng: r6(p.lng), prec: p.prec, origem: p.origem, hora: p.hora, rua: p.rua || '', tipo: p.tipo, caixa: p.caixa || null, itens: (p.itens || []).concat(p.material ? [{ item: p.material, qtd: '' }] : []), cidade: p.cidade || '' })),
        trechos: m.trechos.map(t => ({ de: t.de, para: t.para, distancia: t.distancia, metragem: t.metragem, editada: !!t.editada, tipo: t.tipo || 'instalado' })),
        retiradas: m.retiradas || [], retiradaRespondida: !!m.retiradaRespondida
    };
}

async function codificarMapeamento(m) {
    const bytes = new TextEncoder().encode(JSON.stringify(enxugarMapeamento(m)));
    if (typeof CompressionStream !== 'undefined') return 'z' + paraBase64Url(await transformar(bytes, new CompressionStream('deflate-raw')));
    return 'j' + paraBase64Url(bytes);
}

async function decodificarMapeamento(codigo) {
    let bytes = deBase64Url(codigo.slice(1));
    if (codigo[0] === 'z') bytes = await transformar(bytes, new DecompressionStream('deflate-raw'));
    const d = JSON.parse(new TextDecoder().decode(bytes));
    if (!d || !Array.isArray(d.pontos) || !Array.isArray(d.trechos)) throw new Error('Mapeamento inválido');
    const m = novoMapeamento();
    Object.assign(m, { criadoEm: d.criadoEm || m.criadoEm, autor: d.autor || '', oc: d.oc || '', endereco: d.endereco || null, pontos: d.pontos, trechos: d.trechos, retiradas: d.retiradas || [], retiradaRespondida: !!d.retiradaRespondida });
    migrarMapeamento(m);
    m.proximoId = m.pontos.reduce((mx, p) => Math.max(mx, p.id), 0) + 1;
    m.ativo = m.pontos.length ? m.pontos[m.pontos.length - 1].id : null;
    m.recebido = true;
    return m;
}

async function gerarLinkMapeamento() {
    const oc = (document.getElementById('inputOC') || {}).value || '';
    if (oc) mapeamento.oc = oc;
    if (!mapeamento.autor) mapeamento.autor = (document.getElementById('inputEncarregado') || {}).value || '';
    const base = location.href.split('#')[0];
    return base + '#mapa=' + await codificarMapeamento(mapeamento);
}

async function compartilharMapeamento() {
    if (!mapeamento.pontos.length) { alert('Ainda não há pontos para compartilhar.'); return; }
    const link = await gerarLinkMapeamento();
    const total = totalMapeado(mapeamento);
    const texto = `Mapeamento de rede${mapeamento.oc ? ' - OC ' + mapeamento.oc : ''}: ${mapeamento.pontos.length} postes, ${total}m de cabo.` +
        (mapeamento.endereco && mapeamento.endereco.rua ? ` ${mapeamento.endereco.rua}${mapeamento.endereco.cidade ? ', ' + mapeamento.endereco.cidade : ''}.` : '') +
        ' Abra no celular para importar no Croqui:';
    if (navigator.share) {
        try { await navigator.share({ title: 'Mapeamento Croqui', text: texto, url: link }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
    }
    // Sem o compartilhar do sistema: abre o WhatsApp direto e também copia o link.
    try { await navigator.clipboard.writeText(texto + ' ' + link); avisoMapa('Link copiado. Cole no WhatsApp.'); } catch (e) {}
    window.open('https://wa.me/?text=' + encodeURIComponent(texto + ' ' + link), '_blank');
}

// Ao abrir o app por um link com #mapa=..., importa o mapeamento.
async function importarMapeamentoDoLink() {
    const hash = location.hash || '';
    if (!hash.startsWith('#mapa=')) return false;
    history.replaceState(null, '', location.href.split('#')[0]); // limpa o link para não importar de novo
    let recebido;
    try { recebido = await decodificarMapeamento(hash.slice(6)); }
    catch (e) { alert('Este link de mapeamento está incompleto ou corrompido. Peça para enviarem de novo.'); return false; }
    const resumo = `${recebido.pontos.length} postes, ${totalMapeado(recebido)}m de cabo` + (recebido.autor ? `, mapeado por ${recebido.autor}` : '') + (recebido.oc ? ` (OC ${recebido.oc})` : '');
    const msg = mapeamento.pontos.length
        ? `Você recebeu um mapeamento: ${resumo}.\n\nIsso vai SUBSTITUIR o mapeamento que está no seu celular. Importar?`
        : `Você recebeu um mapeamento: ${resumo}.\n\nImportar?`;
    if (!confirm(msg)) return false;
    mapeamento = recebido;
    salvarMapeamento();
    const campoOC = document.getElementById('inputOC');
    if (campoOC && !campoOC.value && recebido.oc) { campoOC.value = recebido.oc; if (typeof agendarAutoSalvar === 'function') agendarAutoSalvar(); }
    abrirMapa();
    setTimeout(() => avisoMapa('Mapeamento importado. Confira os postes e toque em "Gerar croqui".'), 300);
    return true;
}

ACOES_MENU_MAPA.unshift({ rotulo: '📤 Compartilhar mapeamento (WhatsApp)', acao: () => compartilharMapeamento() });
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => { setTimeout(importarMapeamentoDoLink, 300); });
    window.addEventListener('hashchange', importarMapeamentoDoLink);
}

// ==========================================
// PÁGINAS DO MAPA NO PDF (FISCALIZAÇÃO)
// ==========================================
// Monta uma imagem com o mapa real (OpenStreetMap), o trajeto e os pontos
// numerados, e uma tabela com coordenadas, precisão do GPS e horário de
// cada marcação, com link para abrir o ponto no Google Maps.
const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

function lngParaPx(lng, z) { return (lng + 180) / 360 * 256 * Math.pow(2, z); }
function latParaPx(lat, z) {
    const r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 256 * Math.pow(2, z);
}

// Maior zoom em que todos os pontos cabem na imagem (com margem).
function zoomQueCabe(pontos, larg, alt) {
    for (let z = 19; z >= 3; z--) {
        const xs = pontos.map(p => lngParaPx(p.lng, z)), ys = pontos.map(p => latParaPx(p.lat, z));
        if (Math.max(...xs) - Math.min(...xs) <= larg - 160 && Math.max(...ys) - Math.min(...ys) <= alt - 160) return z;
    }
    return 3;
}

function carregarImagem(url, limiteMs) {
    return new Promise(resolve => {
        const img = new Image(); img.crossOrigin = 'anonymous';
        const t = setTimeout(() => resolve(null), limiteMs);
        img.onload = () => { clearTimeout(t); resolve(img); };
        img.onerror = () => { clearTimeout(t); resolve(null); };
        img.src = url;
    });
}

async function imagemDoMapa(m, larg, alt) {
    const z = zoomQueCabe(m.pontos, larg, alt);
    const xs = m.pontos.map(p => lngParaPx(p.lng, z)), ys = m.pontos.map(p => latParaPx(p.lat, z));
    const x0 = (Math.min(...xs) + Math.max(...xs)) / 2 - larg / 2, y0 = (Math.min(...ys) + Math.max(...ys)) / 2 - alt / 2;
    const tela = document.createElement('canvas'); tela.width = larg; tela.height = alt;
    const ctx = tela.getContext('2d');
    ctx.fillStyle = '#eceff1'; ctx.fillRect(0, 0, larg, alt);

    // Fundo: pedaços do mapa (sem internet, fica só o trajeto sobre fundo cinza).
    let tilesOk = 0;
    const tarefas = [];
    for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + larg) / 256); tx++) {
        for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + alt) / 256); ty++) {
            tarefas.push(carregarImagem(TILE_URL(z, tx, ty), 8000).then(img => {
                if (img) { ctx.drawImage(img, tx * 256 - x0, ty * 256 - y0); tilesOk++; }
            }));
        }
    }
    await Promise.all(tarefas);

    const px = p => ({ x: lngParaPx(p.lng, z) - x0, y: latParaPx(p.lat, z) - y0 });
    // Trechos
    m.trechos.forEach(t => {
        const a = acharPonto(m, t.de), b = acharPonto(m, t.para);
        if (!a || !b) return;
        const pa = px(a), pb = px(b);
        ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
        const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2, txt = t.metragem + 'm';
        ctx.font = 'bold 18px Roboto, Arial, sans-serif';
        const w = ctx.measureText(txt).width + 10;
        ctx.fillStyle = 'white'; ctx.fillRect(mx - w / 2, my - 12, w, 24);
        ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 1.5; ctx.strokeRect(mx - w / 2, my - 12, w, 24);
        ctx.fillStyle = '#c0392b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, mx, my + 1);
    });
    // Retirada: linha verde tracejada ao lado do cabo lançado
    (m.retiradas || []).forEach(r => r.trechos.forEach(t => {
        const a = acharPonto(m, t.de), b = acharPonto(m, t.para);
        if (!a || !b) return;
        const pa = px(a), pb = px(b), len = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
        const nx = -(pb.y - pa.y) / len * 9, ny = (pb.x - pa.x) / len * 9;
        ctx.strokeStyle = '#27ae60'; ctx.lineWidth = 4; ctx.setLineDash([10, 7]);
        ctx.beginPath(); ctx.moveTo(pa.x + nx, pa.y + ny); ctx.lineTo(pb.x + nx, pb.y + ny); ctx.stroke(); ctx.setLineDash([]);
    }));
    // Pontos numerados
    m.pontos.forEach((p, i) => {
        const q = px(p);
        const cor = p.caixa ? ({ CTOP: '#660099', CEO: '#111111', Subida: '#d35400' }[p.caixa.tipo] || '#3498db') : '#3498db';
        ctx.fillStyle = cor; ctx.strokeStyle = 'white'; ctx.lineWidth = 4;
        ctx.beginPath();
        if (p.caixa && p.caixa.tipo === 'CTOP') ctx.rect(q.x - 17, q.y - 17, 34, 34); else ctx.arc(q.x, q.y, 17, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'white'; ctx.font = 'bold 16px Roboto, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), q.x, q.y + 1);
    });
    // Seta do norte e escala
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(larg - 70, 14, 56, 70);
    ctx.fillStyle = '#2c3e50'; ctx.beginPath(); ctx.moveTo(larg - 42, 22); ctx.lineTo(larg - 54, 56); ctx.lineTo(larg - 30, 56); ctx.closePath(); ctx.fill();
    ctx.font = 'bold 18px Arial'; ctx.textAlign = 'center'; ctx.fillText('N', larg - 42, 72);
    const metrosPorPx = 156543.03392 * Math.cos(m.pontos[0].lat * Math.PI / 180) / Math.pow(2, z);
    const opcoes = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    const metros = opcoes.find(v => v / metrosPorPx >= 80) || 5000;
    const barra = metros / metrosPorPx;
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(14, alt - 50, barra + 90, 36);
    ctx.fillStyle = '#2c3e50'; ctx.fillRect(24, alt - 30, barra, 6);
    ctx.font = 'bold 15px Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(metros >= 1000 ? (metros / 1000) + ' km' : metros + ' m', 34 + barra, alt - 27);
    ctx.font = '13px Arial'; ctx.textAlign = 'right'; ctx.fillStyle = '#333';
    ctx.fillText('© OpenStreetMap', larg - 10, alt - 10);
    return { dataUrl: tela.toDataURL('image/jpeg', 0.85), tilesOk };
}

function formatarHora(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function adicionarPaginasDoMapa(doc) {
    const m = mapeamento;
    const { dataUrl, tilesOk } = await imagemDoMapa(m, 1400, 860);
    const end = m.endereco || {};
    const local = [end.rua, end.bairro, end.cidade, end.uf].filter(Boolean).join(', ');

    doc.addPage('a4', 'landscape');
    doc.setFontSize(15); doc.setTextColor(102, 0, 153);
    doc.text('Mapa do trajeto (GPS)', 10, 12);
    doc.setFontSize(10); doc.setTextColor(60, 60, 60);
    doc.text(`${local || 'Endereço não identificado'}  ·  ${m.pontos.length} pontos  ·  ${totalMapeado(m)}m mapeados` + (m.autor ? `  ·  Mapeado por: ${m.autor}` : ''), 10, 18);
    doc.addImage(dataUrl, 'JPEG', 10, 22, 277, 170);
    if (!tilesOk) { doc.setFontSize(9); doc.text('Mapa de fundo indisponível no momento da geração (sem internet). Pontos e trechos em escala real.', 10, 197); }

    doc.addPage('a4', 'portrait');
    doc.setFontSize(15); doc.setTextColor(102, 0, 153);
    doc.text('Pontos marcados em campo', 14, 16);
    const linhas = m.pontos.map((p, i) => [
        String(i + 1),
        [p.caixa ? (p.caixa.tipo === 'CTOP' ? `${descreverCaixa(p.caixa)} ${p.caixa.contagem || ''} ${p.caixa.ctoTipo || ''}`.replace(/\s+/g, ' ').trim() : descreverCaixa(p.caixa)) : (p.tipo || 'Poste')]
            .concat((p.itens || []).map(i => `${i.qtd ? i.qtd + '× ' : ''}${nomeItem(i.item)}`)).join('\n'),
        p.rua || '',
        p.lat.toFixed(6), p.lng.toFixed(6),
        p.origem === 'gps' ? `GPS ±${p.prec}m` : 'Mira (manual)',
        formatarHora(p.hora),
        'Abrir'
    ]);
    doc.autoTable({
        startY: 22, head: [['Nº', 'Equipamento', 'Rua', 'Latitude', 'Longitude', 'Origem', 'Marcado em', 'Mapa']], body: linhas,
        theme: 'striped', headStyles: { fillColor: [102, 0, 153] }, styles: { fontSize: 8, cellPadding: 2 },
        columnStyles: { 0: { cellWidth: 8 }, 7: { textColor: [41, 128, 185] } },
        didDrawCell: (d) => {
            if (d.section === 'body' && d.column.index === 7 && doc.link) {
                const p = m.pontos[d.row.index];
                doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url: `https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}` });
            }
        }
    });
    const trechos = m.trechos.map(t => {
        const na = m.pontos.findIndex(p => p.id === t.de) + 1, nb = m.pontos.findIndex(p => p.id === t.para) + 1;
        return [`${na} → ${nb}`, `${t.distancia}m`, `${t.metragem}m`, t.editada ? 'Corrigida pelo técnico' : 'Sugerida (mapa + 5%)'];
    });
    doc.autoTable({
        startY: (doc.lastAutoTable ? doc.lastAutoTable.finalY : 22) + 8, head: [['Trecho', 'Distância no mapa', 'Cabo lançado', 'Metragem']], body: trechos,
        theme: 'striped', headStyles: { fillColor: [231, 76, 60] }, styles: { fontSize: 9, cellPadding: 2 }
    });
    if ((m.retiradas || []).length) {
        const linhas = [];
        m.retiradas.forEach(r => r.trechos.forEach(t => linhas.push([`${numeroDoPontoEm(m, t.de)} → ${numeroDoPontoEm(m, t.para)}`, `${t.metragem}m`, `Retirada do poste ${numeroDoPontoEm(m, r.de)} ao ${numeroDoPontoEm(m, r.ate)}`])));
        linhas.push(['Total', `${totalRetirado(m)}m`, '']);
        doc.autoTable({
            startY: (doc.lastAutoTable ? doc.lastAutoTable.finalY : 22) + 8, head: [['Trecho', 'Cabo retirado', '']], body: linhas,
            theme: 'striped', headStyles: { fillColor: [39, 174, 96] }, styles: { fontSize: 9, cellPadding: 2 }
        });
    }
}

function numeroDoPontoEm(m, id) { return m.pontos.findIndex(p => p.id === id) + 1; }

// ==========================================
// CROQUI EM CIMA DO MAPA (PÁGINA 1 DO PDF)
// ==========================================
// Quando o croqui foi gerado do mapeamento, a página principal do PDF
// mostra o desenho por cima de um mapa simples da região: quarteirões em
// cinza, ruas em branco e os nomes das ruas. Sem satélite, sem excesso.
function pxPorMetroMercator(z, lat) { return Math.pow(2, z) * 256 / (40075016.686 * Math.cos(lat * Math.PI / 180)); }

function croquiTemMapa() {
    return !!(mapeamento && mapeamento.projecao && typeof canvas !== 'undefined' && canvas.getObjects().some(o => o.ponto_mapa));
}

// Limite de ampliação do croqui no PDF: o mapa de fundo não fica borrado
// e sempre aparecem as ruas em volta.
function escalaMaximaNoMapa() {
    const pr = mapeamento.projecao;
    return 1.6 * pxPorMetroMercator(19, pr.lat0) / pr.escala;
}

function croquiParaLatLng(x, y) {
    const pr = mapeamento.projecao;
    return { lat: pr.lat0 - (y - pr.offY) / (pr.ky * pr.escala), lng: pr.lng0 + (x - pr.offX) / (pr.kx * pr.escala) };
}

// Deixa o mapa em tons de cinza claros, para o desenho do cabo se destacar.
function clarearMapa(ctx, x, y, w, h) {
    const img = ctx.getImageData(x, y, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
        const cinza = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
        const v = cinza * 0.78 + 255 * 0.22;
        d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, x, y);
}

// t = { cx0, cy0, escalaExport, ex0, ey0, larg, alt, topo }: como o croqui foi posicionado na foto.
async function comporCroquiComMapa(fotoSemRuas, fotoComRuas, t) {
    const pr = mapeamento.projecao;
    const pxm = t.escalaExport * pr.escala;                     // pixels da foto por metro
    const z = Math.max(3, Math.min(19, Math.round(Math.log2(pxm / pxPorMetroMercator(0, pr.lat0)))));
    const f = pxm / pxPorMetroMercator(z, pr.lat0);              // ampliação dos pedaços do mapa
    const centro = croquiParaLatLng(t.cx0, t.cy0);
    const Wx = lngParaPx(centro.lng, z), Wy = latParaPx(centro.lat, z);
    const tela = document.createElement('canvas'); tela.width = t.larg; tela.height = t.alt;
    const ctx = tela.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, t.larg, t.alt);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';

    const xMin = Wx + (0 - t.ex0) / f, xMax = Wx + (t.larg - t.ex0) / f;
    const yMin = Wy + (t.topo - t.ey0) / f, yMax = Wy + (t.alt - t.ey0) / f;
    let tilesOk = 0; const tarefas = [];
    for (let tx = Math.floor(xMin / 256); tx <= Math.floor(xMax / 256); tx++) {
        for (let ty = Math.floor(yMin / 256); ty <= Math.floor(yMax / 256); ty++) {
            tarefas.push(carregarImagem(TILE_URL(z, tx, ty), 8000).then(img => {
                if (!img) return;
                const dx = t.ex0 + (tx * 256 - Wx) * f, dy = t.ey0 + (ty * 256 - Wy) * f;
                ctx.save(); ctx.beginPath(); ctx.rect(0, t.topo, t.larg, t.alt - t.topo); ctx.clip();
                ctx.drawImage(img, Math.floor(dx), Math.floor(dy), Math.ceil(256 * f) + 1, Math.ceil(256 * f) + 1);
                ctx.restore(); tilesOk++;
            }));
        }
    }
    await Promise.all(tarefas);

    if (tilesOk) clarearMapa(ctx, 0, t.topo, t.larg, t.alt - t.topo);
    // Desenho do croqui por cima. Sem mapa (sem internet), usa a versão com os nomes das ruas do croqui.
    const foto = await carregarImagem(tilesOk ? fotoSemRuas : fotoComRuas, 5000);
    if (foto) ctx.drawImage(foto, 0, 0);

    if (tilesOk) {
        // Legenda, norte e créditos do mapa
        const leg = [['#e74c3c', 'Cabo lançado'], ['#27ae60', 'Cabo retirado'], ['#111111', 'Cabo existente']];
        ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(14, t.alt - 88, 190, 76);
        ctx.font = 'bold 14px Roboto, Arial, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        leg.forEach(([cor, txt], i) => {
            const y = t.alt - 74 + i * 24;
            ctx.strokeStyle = cor; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(60, y); ctx.stroke();
            ctx.fillStyle = '#2c3e50'; ctx.fillText(txt, 70, y);
        });
        ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(t.larg - 62, t.topo + 12, 48, 62);
        ctx.fillStyle = '#2c3e50'; ctx.beginPath(); ctx.moveTo(t.larg - 38, t.topo + 18); ctx.lineTo(t.larg - 50, t.topo + 50); ctx.lineTo(t.larg - 26, t.topo + 50); ctx.closePath(); ctx.fill();
        ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.fillText('N', t.larg - 38, t.topo + 64);
        ctx.font = '12px Arial'; ctx.textAlign = 'right'; ctx.fillStyle = '#555'; ctx.fillText('Mapa: © OpenStreetMap', t.larg - 10, t.alt - 10);
    }
    return { dataUrl: tela.toDataURL('image/jpeg', 0.9), tilesOk };
}

// Para os testes automáticos (no navegador "module" não existe).
if (typeof module !== 'undefined') {
    module.exports = { planejarCroqui, deslocarCaminho, segmentoCruzaRet, areaSobreposta, retangulo, caminhoEntre, criarRetirada, totalRetirado, atualizarRetiradas, lngParaPx, latParaPx, pxPorMetroMercator, croquiParaLatLng, getMapeamento: () => mapeamento, setMapeamento: (m) => { mapeamento = m; }, codificarMapeamento, decodificarMapeamento, projetarPontos, posicoesDasRuas, distanciaMetros, sugerirMetragem, novoMapeamento, adicionarPonto, removerPonto, recalcularTrechosDoPonto, totalMapeado, acharPonto };
}
