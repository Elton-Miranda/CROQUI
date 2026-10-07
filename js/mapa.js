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
    return { versao: 1, criadoEm: new Date().toISOString(), autor: '', pontos: [], trechos: [], ativo: null, proximoId: 1 };
}

function acharPonto(m, id) { return m.pontos.find(p => p.id === id) || null; }

// Adiciona um ponto e, se houver um ponto ativo, liga os dois com um trecho.
function adicionarPonto(m, dados) {
    const p = Object.assign({ id: m.proximoId++, tipo: 'Poste XC', caixa: null, material: '', rua: '' }, dados);
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
        if (m && Array.isArray(m.pontos)) return m;
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

function marcarMaterialPonto(idPonto) {
    const p = idPonto ? acharPonto(mapeamento, idPonto) : pontoAtivoOuAviso();
    if (!p) return;
    const txt = prompt('📦 Material gasto neste ponto (ex: 2 conectores, 1 alça):', p.material || '');
    if (txt === null) return;
    p.material = txt.trim();
    salvarMapeamento(); desenharMapeamento();
}

// --- Painel da CTOP ---
let tipoCtopEscolhido = '';
function abrirPainelCtop(p) {
    const atual = p.caixa && p.caixa.tipo === 'CTOP' ? p.caixa : {};
    tipoCtopEscolhido = atual.ctoTipo || '';
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
    document.getElementById('pontoSub').innerText = `${origem} · ${hora}` + (p.material ? ' · Material: ' + p.material : '');

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
        b.innerText = valor === 'CTOP' && atual === 'CTOP' ? `CTOP ${p.caixa.num || ''}`.trim() : rotulo;
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

// --- Menu ⋯ ---
const ACOES_MENU_MAPA = [
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
    if (p.caixa && p.caixa.tipo === 'CTOP') { classe += ' ctop'; texto = 'C' + numero; }
    else if (p.caixa && p.caixa.tipo === 'CEO') { classe += ' ceo'; texto = 'E' + numero; }
    else if (p.caixa && p.caixa.tipo === 'Subida') { classe += ' subida'; texto = 'S' + numero; }
    if (p.id === mapeamento.ativo) classe += ' ativo';
    if (p.origem === 'gps' && p.prec > PRECISAO_ACEITAVEL) classe += ' impreciso';
    return L.divIcon({ className: '', html: `<div class="${classe}">${texto}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
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
    el.innerText = n ? `${n} ${n === 1 ? 'poste' : 'postes'} · ${totalMapeado(mapeamento)}m` : 'Nenhum poste marcado';
    const ativo = acharPonto(mapeamento, mapeamento.ativo);
    const campoRua = document.getElementById('mapaRua');
    if (ativo && ativo.rua && document.activeElement !== campoRua) campoRua.value = ativo.rua;
}

// Para os testes automáticos (no navegador "module" não existe).
if (typeof module !== 'undefined') {
    module.exports = { distanciaMetros, sugerirMetragem, novoMapeamento, adicionarPonto, removerPonto, recalcularTrechosDoPonto, totalMapeado, acharPonto };
}
