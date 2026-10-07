// ==========================================
// CROQUI PRO - VERSÃO DEFINITIVA (APP.JS)
// Pontos de Grade Preservados e UI Blindada
// ==========================================

const canvas = new fabric.Canvas('c', { selection: false, preserveObjectStacking: true });
let isConnectingMode = false;
let modoCaboAtivo = null;
let startNode = null;
let activeTarget = null; 
let clickCoords = { x: 0, y: 0 }; 
let listaMateriaisManuais = []; 
let zoomLevel = 1;
let tempCTOX = 0;
let tempCTOY = 0;

// Salvamento automático (ver final do arquivo)
const CHAVE_RASCUNHO = 'croqui_rascunho_v2';
const CHAVE_PERFIL = 'croqui_perfil_tecnico';
const CAMPOS_OS = ['inputOC', 'inputCausa', 'inputMotivo', 'inputLocCT', 'inputCabo', 'inputPrimaria'];
const CAMPOS_PERFIL = ['inputEncarregado', 'inputRE', 'inputPlaca'];
let timerAutoSalvar = null;
let restaurando = false;

let ignoreNextTouch = false;
function travarToqueFalso() {
    ignoreNextTouch = true;
    setTimeout(() => { ignoreNextTouch = false; }, 400);
}

const customProps = [
    'id_tipo', 'sub_tipo', 'valor_metragem', 'perPixelTargetFind', 'hasControls', 
    'selectable', 'lockScalingX', 'lockScalingY', 'lockRotation', 'snapAngle', 
    'snapThreshold', 'is_cto', 'cto_num', 'cto_contagem', 'materiais_gastos', 
    'p1x', 'p1y', 'p2x', 'p2y', 'auto_retirada', 'cto_tipo', 'ceo_nova', 'ponto_mapa'
];

let historicoCanvas = [];
let indiceHistorico = -1;
let navegandoHistorico = false;

function salvarEstado() {
    if (navegandoHistorico) return;
    if (indiceHistorico < historicoCanvas.length - 1) { historicoCanvas.length = indiceHistorico + 1; }
    let json = canvas.toJSON(customProps);
    historicoCanvas.push(json);
    indiceHistorico++;
    atualizarBotoesHistorico();
    if (typeof agendarAutoSalvar === 'function') agendarAutoSalvar();
}

function atualizarBotoesHistorico() {
    let btnUndo = document.getElementById('btnUndo'), btnRedo = document.getElementById('btnRedo');
    if (btnUndo) { btnUndo.disabled = indiceHistorico <= 0; btnUndo.style.opacity = indiceHistorico <= 0 ? '0.4' : '1'; }
    if (btnRedo) { btnRedo.disabled = indiceHistorico >= historicoCanvas.length - 1; btnRedo.style.opacity = indiceHistorico >= historicoCanvas.length - 1 ? '0.4' : '1'; }
}

function desfazer() {
    if (indiceHistorico > 0) {
        navegandoHistorico = true; indiceHistorico--;
        let vptAtual = canvas.viewportTransform.slice(); 
        canvas.loadFromJSON(historicoCanvas[indiceHistorico], function() {
            canvas.setViewportTransform(vptAtual); marcadorInicio = null; startNode = null; canvas.renderAll(); navegandoHistorico = false; agendarAutoSalvar(); atualizarBotoesHistorico(); fecharPieMenu();
        });
    }
}

function refazer() {
    if (indiceHistorico < historicoCanvas.length - 1) {
        navegandoHistorico = true; indiceHistorico++;
        let vptAtual = canvas.viewportTransform.slice();
        canvas.loadFromJSON(historicoCanvas[indiceHistorico], function() {
            canvas.setViewportTransform(vptAtual); marcadorInicio = null; startNode = null; canvas.renderAll(); navegandoHistorico = false; agendarAutoSalvar(); atualizarBotoesHistorico(); fecharPieMenu();
        });
    }
}

canvas.on('object:modified', function() { salvarEstado(); });

// --- ÁREA DE DESENHO E TOQUE MOBILE ---
// Regras do toque:
//  - Arrastar 1 dedo (em qualquer lugar, inclusive no modo cabo) move a tela.
//  - Pinça com 2 dedos dá zoom e NUNCA conta como toque.
//  - Toque rápido no vazio "encaixa" no ponto da grade mais próximo.
let toqueInicio = { x: 0, y: 0 };
let ultimoPonto = { x: 0, y: 0 };
let arrastandoTela = false;
let podeArrastar = false;
let gestoComPinca = false;
const LIMITE_ARRASTO = 10; // px que o dedo precisa andar para virar arrasto

// Ajusta só o tamanho do canvas. Roda de novo ao girar a tela ou abrir o teclado.
function ajustarTamanhoCanvas() {
    let container = document.getElementById('canvas-container');
    canvas.setWidth(container ? container.clientWidth : window.innerWidth);
    canvas.setHeight(container ? container.clientHeight : window.innerHeight - 110);
    canvas.requestRenderAll();
}

function pegarXY(evt) {
    let t = (evt.touches && evt.touches[0]) || (evt.changedTouches && evt.changedTouches[0]) || evt;
    return { x: t.clientX, y: t.clientY };
}

function pieMenuAberto() {
    let pie = document.getElementById('pie-menu');
    return pie && !pie.classList.contains('hidden');
}

function initCanvasArea() {
    ajustarTamanhoCanvas();

    canvas.on('mouse:down', function(opt) {
        if (gestoComPinca) return;
        toqueInicio = pegarXY(opt.e);
        ultimoPonto = toqueInicio;
        arrastandoTela = false;
        // Nome de rua pode ser arrastado; em qualquer outro lugar o dedo move a tela.
        podeArrastar = !(opt.target && opt.target.id_tipo === 'rua_livre');
    });

    canvas.on('mouse:move', function(opt) {
        if (!podeArrastar || gestoComPinca) return;
        let p = pegarXY(opt.e);
        if (!arrastandoTela && Math.hypot(p.x - toqueInicio.x, p.y - toqueInicio.y) > LIMITE_ARRASTO) { arrastandoTela = true; }
        if (arrastandoTela) {
            let vpt = this.viewportTransform;
            vpt[4] += p.x - ultimoPonto.x; vpt[5] += p.y - ultimoPonto.y;
            this.requestRenderAll();
        }
        ultimoPonto = p;
    });

    canvas.on('mouse:up', function(opt) {
        let foiArrasto = arrastandoTela;
        arrastandoTela = false; podeArrastar = false;
        if (foiArrasto) { this.setViewportTransform(this.viewportTransform); return; }
        if (gestoComPinca || ignoreNextTouch) return;

        const obj = opt.target;
        let pointer = canvas.getPointer(opt.e);
        let ehEquipamento = obj && obj.id_tipo && obj.id_tipo.startsWith('equipamento');

        if (isConnectingMode) {
            handleConnectionClick(ehEquipamento ? obj : pontoDaGradeComoNo(pointer));
            return;
        }

        if (obj && obj.id_tipo === 'cabo') {
            activeTarget = obj; clickCoords = { x: pointer.x, y: pointer.y }; abrirPieMenu(opt.e, 'cabo'); return;
        }
        if (ehEquipamento) {
            activeTarget = obj; clickCoords = { x: obj.left, y: obj.top }; abrirPieMenu(opt.e, obj.id_tipo); return;
        }
        if (obj && ['rua_livre', 'simbologia_poste', 'conector_retirada'].includes(obj.id_tipo)) { fecharPieMenu(); return; }

        // Toque no vazio: se o menu estava aberto, só fecha. Senão abre no ponto mais próximo.
        if (pieMenuAberto()) { fecharPieMenu(); return; }
        activeTarget = pontoDaGradeComoNo(pointer);
        clickCoords = { x: activeTarget.left, y: activeTarget.top };
        abrirPieMenu(opt.e, 'grid_dot');
    });

    // Pinça (2 dedos). Escuta na fase de captura para saber ANTES do canvas que é pinça.
    let touchContainer = document.getElementById('canvas-container'); let lastPinchDist = 0;
    touchContainer.addEventListener('touchstart', function(e) {
        if (e.touches.length === 1) { gestoComPinca = false; }
        if (e.touches.length === 2) {
            gestoComPinca = true; arrastandoTela = false;
            lastPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        }
    }, { passive: false, capture: true });

    touchContainer.addEventListener('touchmove', function(e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            let currentDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            if (!lastPinchDist) { lastPinchDist = currentDist; return; }
            let zoom = canvas.getZoom() * (currentDist / lastPinchDist);
            if (zoom > 4) zoom = 4; if (zoom < 0.4) zoom = 0.4;
            let rect = canvas.upperCanvasEl.getBoundingClientRect();
            let point = new fabric.Point((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left, (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top);
            canvas.zoomToPoint(point, zoom); lastPinchDist = currentDist; zoomLevel = zoom;
        }
    }, { passive: false });

    touchContainer.addEventListener('touchend', function(e) {
        if (e.touches.length < 2) { lastPinchDist = 0; }
    }, { capture: true });
}
initCanvasArea(); window.addEventListener('resize', ajustarTamanhoCanvas);

// --- GRADE (DESENHADA NO FUNDO, NÃO SÃO MAIS OBJETOS) ---
// Antes eram 3.600 bolinhas, cada uma um objeto: deixava o celular lento e o
// "desfazer" guardava todas elas a cada passo. Agora a grade é só um desenho de
// fundo, infinita, e o toque encaixa no ponto mais próximo.
const GRADE_ESPACO = 60;
const GRADE_ORIGEM = 40;
let mostrarGrade = true;

function pontoDaGrade(x, y) {
    return {
        x: Math.round((x - GRADE_ORIGEM) / GRADE_ESPACO) * GRADE_ESPACO + GRADE_ORIGEM,
        y: Math.round((y - GRADE_ORIGEM) / GRADE_ESPACO) * GRADE_ESPACO + GRADE_ORIGEM
    };
}

// Um "nó" da grade é só uma posição. Tem o mesmo formato que o resto do código espera.
function pontoDaGradeComoNo(pointer) {
    let p = pontoDaGrade(pointer.x, pointer.y);
    return { id_tipo: 'grid_dot', left: p.x, top: p.y };
}

function desenharGrade(opt) {
    if (!mostrarGrade) return;
    let ctx = opt.ctx; let v = canvas.viewportTransform; let zoom = v[0];
    ctx.save();
    ctx.fillStyle = '#e0e0e0'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    let x0 = -v[4] / zoom, y0 = -v[5] / zoom;
    let x1 = x0 + canvas.width / zoom, y1 = y0 + canvas.height / zoom;
    let inicio = pontoDaGrade(x0, y0);
    let raio = Math.max(2.5, 4 * zoom);
    ctx.fillStyle = '#a4adb3';
    ctx.beginPath();
    for (let gx = inicio.x - GRADE_ESPACO; gx <= x1 + GRADE_ESPACO; gx += GRADE_ESPACO) {
        for (let gy = inicio.y - GRADE_ESPACO; gy <= y1 + GRADE_ESPACO; gy += GRADE_ESPACO) {
            let sx = gx * zoom + v[4], sy = gy * zoom + v[5];
            ctx.moveTo(sx + raio, sy); ctx.arc(sx, sy, raio, 0, Math.PI * 2);
        }
    }
    ctx.fill();
    ctx.restore();
}
canvas.on('before:render', desenharGrade);
salvarEstado();

function novoCroqui() {
    travarToqueFalso();
    if (confirm("⚠️ ATENÇÃO!\n\nTem certeza que deseja apagar TODO o desenho atual?")) {
        canvas.clear(); historicoCanvas = []; indiceHistorico = -1;
        isConnectingMode = false; modoCaboAtivo = null; startNode = null; marcadorInicio = null; activeTarget = null; listaMateriaisManuais = [];
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]); zoomLevel = 1;
        limparDadosDaOS(); salvarEstado(); updateStatus("Tela limpa. Novo projeto iniciado.");
    }
}

// --- MODOS E INTERAÇÃO COM ELEMENTOS ---
function updateStatus(text) { document.getElementById('status-bar').innerText = text; }

function toggleSubMenuCabos() {
    travarToqueFalso();
    let submenu = document.getElementById('submenu-cabos'); let btnConectar = document.getElementById('btnConectar');
    if (isConnectingMode) {
        isConnectingMode = false; modoCaboAtivo = null; resetStartNode(); btnConectar.classList.remove('active'); updateStatus("Modo: Navegação Livre");
        if (submenu) submenu.classList.add('hidden');
    } else { if (submenu) submenu.classList.toggle('hidden'); }
}

window.addEventListener('click', function(e) {
    let btnConectar = document.getElementById('btnConectar'); let submenu = document.getElementById('submenu-cabos');
    if (btnConectar && submenu && !btnConectar.contains(e.target) && !submenu.contains(e.target)) { submenu.classList.add('hidden'); }
});

function toggleModoConexao(tipo) {
    travarToqueFalso();
    let submenu = document.getElementById('submenu-cabos'); let btnConectar = document.getElementById('btnConectar');
    if (isConnectingMode && modoCaboAtivo === tipo) {
        isConnectingMode = false; modoCaboAtivo = null; resetStartNode(); btnConectar.classList.remove('active'); updateStatus("Modo: Navegação Livre");
        if (submenu) submenu.classList.add('hidden');
    } else {
        isConnectingMode = true; modoCaboAtivo = tipo; startNode = null; btnConectar.classList.add('active');
        if (submenu) submenu.classList.add('hidden'); 
        let nomeAcao = tipo === 'existente' ? 'EXISTENTE (Preto)' : 'NOVO (Vermelho)'; updateStatus(`Selecione 2 pontos para: Cabo ${nomeAcao}`);
    }
    fecharPieMenu();
}

// --- DESENHO DE CABOS ---
// Marcador amarelo que mostra de onde o próximo cabo vai sair.
// Não entra no histórico nem no PDF (excludeFromExport).
let marcadorInicio = null;

function definirInicio(no) {
    startNode = no;
    if (marcadorInicio) canvas.remove(marcadorInicio);
    marcadorInicio = new fabric.Circle({ left: no.left, top: no.top, radius: 16, fill: 'rgba(241,196,15,0.35)', stroke: '#f1c40f', strokeWidth: 3, originX: 'center', originY: 'center', selectable: false, evented: false, excludeFromExport: true, id_tipo: 'marcador' });
    canvas.add(marcadorInicio); canvas.requestRenderAll();
}

function mesmoPonto(a, b) { return a && b && a.left === b.left && a.top === b.top; }

function handleConnectionClick(node) {
    if (!startNode) { definirInicio(node); return; }
    if (startNode === node || mesmoPonto(startNode, node)) return;
    let inicio = startNode;
    // Metragem obrigatória: não existe mais "40m automático". Cancelou = trecho não é lançado.
    pedirMetragem({ titulo: 'Metragem do trecho', sub: modoCaboAtivo === 'existente' ? 'Cabo EXISTENTE (preto)' : 'Cabo NOVO instalado (vermelho)' }, function(valor) {
        desenharCabo(inicio, node, String(valor), modoCaboAtivo);
        definirInicio(node);
        activeTarget = node; clickCoords = { x: node.left, y: node.top }; abrirPieMenu(null, node.id_tipo);
    });
}

// --- PAINEL DE METRAGEM ---
const METRAGENS_RAPIDAS = [20, 30, 35, 40, 45, 50, 60, 80];
let callbackMetragem = null;

function pedirMetragem(opcoes, aoConfirmar) {
    callbackMetragem = aoConfirmar;
    document.getElementById('metragemTitulo').innerText = opcoes.titulo || 'Metragem do trecho';
    document.getElementById('metragemSub').innerText = opcoes.sub || 'Toque na metragem deste vão';
    document.getElementById('metragemErro').innerText = '';
    let campo = document.getElementById('metragemOutra'); campo.value = '';
    let chips = document.getElementById('metragemChips'); chips.innerHTML = '';
    METRAGENS_RAPIDAS.forEach(m => {
        let b = document.createElement('button');
        b.type = 'button'; b.innerText = m + 'm';
        if (opcoes.atual !== undefined && Number(opcoes.atual) === m) b.classList.add('atual');
        b.addEventListener('click', () => fecharMetragem(m));
        chips.appendChild(b);
    });
    if (opcoes.atual !== undefined && !METRAGENS_RAPIDAS.includes(Number(opcoes.atual))) campo.value = opcoes.atual;
    document.getElementById('painelMetragem').classList.add('aberto');
}

function confirmarMetragemDigitada() {
    let v = parseFloat(String(document.getElementById('metragemOutra').value).replace(',', '.'));
    if (isNaN(v) || v <= 0) { document.getElementById('metragemErro').innerText = 'Digite uma metragem maior que zero.'; return; }
    if (v > 2000) { document.getElementById('metragemErro').innerText = 'Metragem muito alta. Confira o valor.'; return; }
    fecharMetragem(Math.round(v * 10) / 10);
}

function cancelarMetragem() { fecharMetragem(null); }

function fecharMetragem(valor) {
    document.getElementById('painelMetragem').classList.remove('aberto');
    travarToqueFalso();
    let cb = callbackMetragem; callbackMetragem = null;
    if (valor !== null && cb) cb(valor);
    else updateStatus('Trecho não lançado.');
}

function resetStartNode() {
    if (marcadorInicio) canvas.remove(marcadorInicio);
    marcadorInicio = null; startNode = null; canvas.requestRenderAll();
}

function desenharCabo(p1, p2, metragem, tipo) {
    let corCabo = tipo === 'existente' ? '#111111' : '#e74c3c';
    let line = new fabric.Line([p1.left, p1.top, p2.left, p2.top], { stroke: corCabo, strokeWidth: 5, selectable: true, hasControls: false, perPixelTargetFind: true });
    let midX = (p1.left + p2.left) / 2, midY = (p1.top + p2.top) / 2;
    let text = new fabric.Text(metragem + "m", { left: midX, top: midY, fontSize: 22, fill: corCabo, backgroundColor: 'rgba(255,255,255,1)', originX: 'center', originY: 'center', fontWeight: 'bold', padding: 6, paintFirst: 'stroke' });

    let group = new fabric.Group([line, text], { selectable: true, lockMovementX: true, lockMovementY: true, hasControls: false, id_tipo: 'cabo', sub_tipo: tipo, valor_metragem: parseFloat(metragem), perPixelTargetFind: true, p1x: p1.left, p1y: p1.top, p2x: p2.left, p2y: p2.top });
    canvas.add(group); 
    canvas.getObjects().forEach(obj => { if (obj.id_tipo && (obj.id_tipo.startsWith('equipamento') || obj.id_tipo === 'rua_livre' || obj.id_tipo === 'simbologia_poste')) { canvas.bringToFront(obj); } });
    canvas.discardActiveObject(); salvarEstado();
}

function editarMetragemCabo() {
    travarToqueFalso();
    let cabo = activeTarget;
    fecharPieMenu();
    if (!cabo || cabo.id_tipo !== 'cabo') return;
    pedirMetragem({ titulo: 'Corrigir metragem', sub: 'Valor atual: ' + cabo.valor_metragem + 'm', atual: cabo.valor_metragem }, function(valor) {
        cabo.valor_metragem = valor;
        cabo.getObjects()[1].set({ text: valor + "m" });
        cabo.addWithUpdate(); canvas.renderAll(); salvarEstado(); updateStatus("Metragem atualizada para " + valor + "m");
    });
}

// --- MÁGICA GEOMÉTRICA E RETIRADA AUTOMÁTICA ---
function intersectLines(p1, p2, p3, p4) {
    let denom = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (Math.abs(denom) < 0.1) return null; 
    let t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / denom;
    return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

// Remove a retirada que o app desenhou num PDF anterior, para não acumular.
function removerRetiradaAutomatica() {
    canvas.getObjects().filter(o => o.auto_retirada || o.id_tipo === 'conector_retirada' || (o.id_tipo === 'cabo' && o.sub_tipo === 'retirado'))
        .forEach(o => canvas.remove(o));
}

function gerarRetiradaAutomatica(cabosVermelhos) {
    removerRetiradaAutomatica();
    let dist = 40; let greenSegments = []; let nodeMap = {};

    cabosVermelhos.forEach(c => {
        if(c.p1x === undefined) return; 
        let isHoriz = Math.abs(c.p2x - c.p1x) >= Math.abs(c.p2y - c.p1y);
        let offX = isHoriz ? 0 : dist; let offY = isHoriz ? dist : 0;
        let seg = { orig: c, p1: { x: c.p1x, y: c.p1y }, p2: { x: c.p2x, y: c.p2y }, g1: { x: c.p1x + offX, y: c.p1y + offY }, g2: { x: c.p2x + offX, y: c.p2y + offY } };
        greenSegments.push(seg);
        let k1 = seg.p1.x + "_" + seg.p1.y; let k2 = seg.p2.x + "_" + seg.p2.y;
        if (!nodeMap[k1]) nodeMap[k1] = []; if (!nodeMap[k2]) nodeMap[k2] = [];
        nodeMap[k1].push({ seg: seg, pointKey: 'g1' }); nodeMap[k2].push({ seg: seg, pointKey: 'g2' });
    });

    Object.values(nodeMap).forEach(connections => {
        if (connections.length === 2) {
            let cA = connections[0]; let cB = connections[1];
            let inter = intersectLines(cA.seg.g1, cA.seg.g2, cB.seg.g1, cB.seg.g2);
            if (inter) { cA.seg[cA.pointKey] = inter; cB.seg[cB.pointKey] = inter; } 
            else {
                let avgX = (cA.seg[cA.pointKey].x + cB.seg[cB.pointKey].x) / 2; let avgY = (cA.seg[cA.pointKey].y + cB.seg[cB.pointKey].y) / 2;
                cA.seg[cA.pointKey] = { x: avgX, y: avgY }; cB.seg[cB.pointKey] = { x: avgX, y: avgY };
            }
        }
    });

    greenSegments.forEach(seg => {
        let line = new fabric.Line([seg.g1.x, seg.g1.y, seg.g2.x, seg.g2.y], { stroke: '#27ae60', strokeWidth: 5, selectable: true, hasControls: false });
        let midX = (seg.g1.x + seg.g2.x)/2; let midY = (seg.g1.y + seg.g2.y)/2;
        let text = new fabric.Text(seg.orig.valor_metragem + "m", { left: midX, top: midY, fontSize: 22, fill: '#27ae60', backgroundColor: 'rgba(255,255,255,1)', originX: 'center', originY: 'center', fontWeight: 'bold', padding: 6, paintFirst: 'stroke' });
        let group = new fabric.Group([line, text], { selectable: true, lockMovementX: true, lockMovementY: true, hasControls: false, id_tipo: 'cabo', sub_tipo: 'retirado', valor_metragem: seg.orig.valor_metragem, perPixelTargetFind: true, auto_retirada: true });
        canvas.add(group);
    });

    Object.keys(nodeMap).forEach(key => {
        let connections = nodeMap[key];
        if (connections.length === 1) {
            let c = connections[0]; let rx = parseFloat(key.split('_')[0]); let ry = parseFloat(key.split('_')[1]); let gx = c.seg[c.pointKey].x; let gy = c.seg[c.pointKey].y;
            let connLine = new fabric.Line([rx, ry, gx, gy], { stroke: '#27ae60', strokeWidth: 5, selectable: false, id_tipo: 'conector_retirada' });
            let connText = new fabric.Text("0m", { left: (rx+gx)/2, top: (ry+gy)/2, fontSize: 16, fill: '#f39c12', backgroundColor: 'rgba(255,255,255,0.9)', originX: 'center', originY: 'center', fontWeight: 'bold', padding: 3 });
            let connGroup = new fabric.Group([connLine, connText], { selectable: false, lockMovementX: true, lockMovementY: true, id_tipo: 'conector_retirada', auto_retirada: true });
            canvas.add(connGroup);
        }
    });

    let ruas = canvas.getObjects().filter(o => o.id_tipo === 'rua_livre'); let cabos = canvas.getObjects().filter(o => o.id_tipo === 'cabo' || o.id_tipo === 'conector_retirada');
    ruas.forEach(rua => {
        let safe = false; let attempts = 0;
        while (!safe && attempts < 8) {
            rua.setCoords(); safe = true;
            for (let c of cabos) { if (rua.intersectsWithObject(c)) { safe = false; rua.set({ top: rua.top + 35 }); break; } }
            attempts++;
        }
    });
    
    canvas.getObjects().forEach(obj => { if (obj.id_tipo && (obj.id_tipo.startsWith('equipamento') || obj.id_tipo === 'rua_livre' || obj.id_tipo === 'simbologia_poste')) { canvas.bringToFront(obj); } });
    canvas.renderAll();
}

// --- PIE MENU COM TRAVA DE BORDA ---
function abrirPieMenu(event, targetType) {
    travarToqueFalso();
    const pie = document.getElementById('pie-menu');
    if (!pie) return;

    let zoom = canvas.getZoom(); let panX = canvas.viewportTransform[4]; let panY = canvas.viewportTransform[5];
    let canvasX = (targetType === 'cabo') ? clickCoords.x : activeTarget.left;
    let canvasY = (targetType === 'cabo') ? clickCoords.y : activeTarget.top;

    let screenX = (canvasX * zoom) + panX; let screenY = (canvasY * zoom) + panY + 20; 

    let safeMargin = 100; let barBottom = 60; let barTop = 50;      
    if (screenX < safeMargin) screenX = safeMargin;
    if (screenX > window.innerWidth - safeMargin) screenX = window.innerWidth - safeMargin;
    if (screenY < safeMargin + barTop) screenY = safeMargin + barTop;
    if (screenY > window.innerHeight - safeMargin - barBottom) screenY = window.innerHeight - safeMargin - barBottom;

    document.querySelectorAll('.pie-item').forEach(btn => btn.style.display = 'none');
    
    if (targetType === 'cabo') {
        document.querySelectorAll('.pie-item[data-menu="cabo"]').forEach(btn => btn.style.display = 'flex');
        document.querySelector('.pie-del').style.display = 'flex'; document.querySelector('.pie-close').style.display = 'flex';
    } 
    else if (targetType === 'equipamento_cabo' || (activeTarget && activeTarget.is_cto)) {
        document.querySelector('.pie-mat').style.display = 'flex'; document.querySelector('.pie-del').style.display = 'flex'; document.querySelector('.pie-close').style.display = 'flex';
    } else {
        document.querySelectorAll('.pie-item[data-menu="main"]').forEach(btn => btn.style.display = 'flex');
        if (targetType === 'grid_dot') { document.querySelector('.pie-del').style.display = 'none'; }
    }
    pie.style.left = screenX + 'px'; pie.style.top = screenY + 'px'; pie.classList.remove('hidden');
}

function fecharPieMenu() { let pie = document.getElementById('pie-menu'); if(pie) pie.classList.add('hidden'); activeTarget = null; }

function abrirSubMenuPoste(x, y) {
    travarToqueFalso();
    const pie = document.getElementById('pie-menu');
    let zoom = canvas.getZoom(); let panX = canvas.viewportTransform[4]; let panY = canvas.viewportTransform[5];
    let screenX = (x * zoom) + panX; let screenY = (y * zoom) + panY + 50; 
    document.querySelectorAll('.pie-item').forEach(btn => btn.style.display = 'none');
    document.querySelectorAll('.pie-item[data-menu="sub"]').forEach(btn => btn.style.display = 'flex');
    pie.style.left = screenX + 'px'; pie.style.top = screenY + 'px'; pie.classList.remove('hidden');
}

// --- APAGAR E REMOVER BLINDADO (NÃO APAGA A GRADE) ---
function apagarSelecionados() {
    travarToqueFalso();
    let objetosAtivos = canvas.getActiveObjects();
    if (objetosAtivos.length === 0) { if (activeTarget) apagarItem(); else alert("Toque em um item para selecioná-lo antes de apagar."); return; }
    objetosAtivos.forEach(function(obj) { 
        if (obj.id_tipo === 'grid_dot') return; // Nunca apaga a grade
        canvas.remove(obj); 
    });
    canvas.discardActiveObject(); fecharPieMenu(); salvarEstado(); 
}

function apagarItem() {
    travarToqueFalso();
    if (activeTarget) {
        if (activeTarget.id_tipo === 'grid_dot') { fecharPieMenu(); return; } // Nunca apaga a grade
        
        // BÔNUS: Se apagar um poste, limpa a simbologia (Ex: texto ST) atrelada a ele
        if (activeTarget.id_tipo === 'equipamento_poste') {
            let simbs = canvas.getObjects().filter(o => o.id_tipo === 'simbologia_poste' && o.left === activeTarget.left && o.top === activeTarget.top - 28);
            simbs.forEach(s => canvas.remove(s));
        }
        
        canvas.remove(activeTarget); fecharPieMenu(); salvarEstado();
    }
}

// --- EQUIPAMENTOS (AGORA ELES NÃO APAGAM OS PONTOS CINZAS) ---
function inserirEquipamento(tipo) {
    travarToqueFalso();
    if (!activeTarget) return;
    let posX = (activeTarget.id_tipo === 'cabo') ? clickCoords.x : activeTarget.left;
    let posY = (activeTarget.id_tipo === 'cabo') ? clickCoords.y : activeTarget.top;

    if (tipo === 'CTO') inserirCTOP(posX, posY); else if (tipo === 'CEO') inserirCEO(posX, posY);
    else if (tipo === 'CS') inserirCS(posX, posY); else if (tipo === 'Subida') inserirSubida(posX, posY);
    else inserirPosteMapeado(posX, posY, tipo);
}

function inserirCTOP(x, y) { tempCTOX = x; tempCTOY = y; document.getElementById('modalCTO').style.display = 'flex'; }

// --- MONTAGEM DOS EQUIPAMENTOS ---
// As funções "montar..." só criam o desenho, sem perguntar nada ao técnico.
// São usadas tanto pelo menu redondo quanto pelo croqui gerado do mapa.
const TRAVADO = { originX: 'center', originY: 'center', lockMovementX: true, lockMovementY: true, hasControls: false };

function montarCTO(x, y, numCaixa, contagem, corHex, tipoCto) {
    corHex = corHex || 'black';
    let corFonte = (corHex === '#ffffff' || corHex === '#f1c40f') ? 'black' : 'white';
    let rect = new fabric.Rect({ width: 44, height: 44, fill: corHex, rx: 6, ry: 6, originX: 'center', originY: 'center', stroke: '#333', strokeWidth: 1 });
    let lblNum = new fabric.Text(String(numCaixa || 'S/N'), { fontSize: 12, fill: corFonte, fontWeight: 'bold', originX: 'center', top: -10 });
    let lblContagem = new fabric.Text(String(contagem || ''), { fontSize: 11, fill: 'black', top: 22, backgroundColor: 'rgba(255,255,255,0.95)', originX: 'center', originY: 'center', padding: 3 });
    return new fabric.Group([rect, lblNum, lblContagem], Object.assign({ left: x, top: y, id_tipo: 'equipamento_cabo', is_cto: true, cto_num: numCaixa, cto_contagem: contagem, cto_tipo: tipoCto || '' }, TRAVADO));
}

function montarCEO(x, y, isNova) {
    let circle = new fabric.Circle({ radius: 24, fill: isNova ? 'black' : 'white', stroke: 'black', strokeWidth: isNova ? 0 : 3, originX: 'center', originY: 'center' });
    let lbl = new fabric.Text("CEO", { fontSize: 13, fill: isNova ? 'white' : 'black', fontWeight: 'bold', originX: 'center', originY: 'center' });
    return new fabric.Group([circle, lbl], Object.assign({ left: x, top: y, id_tipo: 'equipamento_cabo', ceo_nova: !!isNova }, TRAVADO));
}

function montarCS(x, y, numCaixa) {
    let labelText = (!numCaixa || numCaixa.trim() === "" || numCaixa === "00") ? "CS S/N" : "CS " + numCaixa;
    let rect = new fabric.Rect({ width: 80, height: 50, fill: '#bdc3c7', stroke: '#34495e', strokeWidth: 2, rx: 4, ry: 4, originX: 'center', originY: 'center' });
    let lbl = new fabric.Text(labelText, { fontSize: 18, fill: '#2c3e50', fontWeight: 'bold', fontFamily: 'Roboto', originX: 'center', originY: 'center' });
    return new fabric.Group([rect, lbl], Object.assign({ left: x, top: y, id_tipo: 'equipamento_poste' }, TRAVADO));
}

function montarSubida(x, y) {
    let p = new fabric.Polyline([ {x: -30, y: 0}, {x: -15, y: 0}, {x: -5, y: -25}, {x: 5, y: 25}, {x: 15, y: 0}, {x: 30, y: 0} ], { fill: 'transparent', stroke: 'red', strokeWidth: 4, originX: 'center', originY: 'center' });
    // Fundo branco para o símbolo não se misturar com a grade
    let bgCircle = new fabric.Circle({ radius: 20, fill: '#ffffff', originX: 'center', originY: 'center' });
    return new fabric.Group([bgCircle, p], Object.assign({ left: x, top: y, id_tipo: 'equipamento_poste' }, TRAVADO));
}

function montarPoste(x, y, tipo) {
    let circle = new fabric.Circle({ radius: 18, fill: '#3498db', originX: 'center', originY: 'center' });
    let lbl = new fabric.Text(String(tipo || 'Poste XC').replace('Poste ', ''), { fontSize: 13, fill: 'white', fontWeight: 'bold', originX: 'center', originY: 'center' });
    return new fabric.Group([circle, lbl], Object.assign({ left: x, top: y, id_tipo: 'equipamento_poste' }, TRAVADO));
}

function montarRua(x, y, nome, angulo) {
    return new fabric.Text(String(nome).toUpperCase(), { left: x, top: y, angle: angulo || 0, fontSize: 24, fill: '#2980b9', fontWeight: 'bold', fontFamily: 'Roboto', backgroundColor: 'rgba(255,255,255,0.85)', originX: 'center', originY: 'center', selectable: true, hasControls: true, lockScalingX: true, lockScalingY: true, lockRotation: false, lockMovementX: false, lockMovementY: false, id_tipo: 'rua_livre', snapAngle: 45, snapThreshold: 45 });
}

// Coloca um equipamento recém-montado no desenho (usado pelo menu redondo).
function colocarEquipamento(group) {
    canvas.add(group); canvas.bringToFront(group);
    activeTarget = group; if (isConnectingMode) definirInicio(group);
    return group;
}

function confirmarCTO() {
    let numCaixa = document.getElementById('ctoNum').value; let contagem = document.getElementById('ctoContagem').value; let corHex = document.getElementById('ctoCor').value;
    if (!numCaixa || !contagem) { alert("Preencha o Número e a Contagem da CTO."); return; }
    colocarEquipamento(montarCTO(tempCTOX, tempCTOY, numCaixa, contagem, corHex));
    document.getElementById('modalCTO').style.display = 'none'; fecharPieMenu(); salvarEstado();
}

function inserirCEO(x, y) {
    let isNova = confirm("Esta CEO é NOVA ou EXISTENTE?\n\n[OK] = Instalação Nova\n[Cancelar] = Existente");
    colocarEquipamento(montarCEO(x, y, isNova)); fecharPieMenu(); salvarEstado();
}

function inserirCS(x, y) {
    let numCaixa = prompt("Número da CS:", ""); if (numCaixa === null) { fecharPieMenu(); return; }
    colocarEquipamento(montarCS(x, y, numCaixa)); fecharPieMenu(); salvarEstado();
}

function inserirSubida(x, y) {
    colocarEquipamento(montarSubida(x, y)); fecharPieMenu(); salvarEstado();
}

function inserirPosteMapeado(x, y, tipo) {
    colocarEquipamento(montarPoste(x, y, tipo)); abrirSubMenuPoste(x, y); salvarEstado();
}

function addSimbologia(tipo) {
    travarToqueFalso();
    if (!activeTarget) return; let x = activeTarget.left, y = activeTarget.top - 28, obj;
    if (tipo === 'ST') obj = new fabric.Text('ST', { left: x, top: y, fontSize: 18, fill: '#f39c12', fontWeight: 'bold', stroke: 'white', strokeWidth: 3, paintFirst: 'stroke', originX: 'center', originY: 'center', padding: 10 });
    else if (tipo === 'PONTO') obj = new fabric.Circle({ left: x, top: y, radius: 7, fill: 'black', stroke: 'white', strokeWidth: 2, originX: 'center', originY: 'center', padding: 10 });
    else if (tipo === 'TRI') obj = new fabric.Text('▲▲', { left: x, top: y, fontSize: 14, fill: 'black', stroke: 'white', strokeWidth: 2, paintFirst: 'stroke', originX: 'center', originY: 'center', padding: 10 });
    if (obj) { obj.set({ hasControls: true, selectable: true, lockScalingX: true, lockScalingY: true, lockRotation: true, lockMovementX: true, lockMovementY: true, id_tipo: 'simbologia_poste' }); canvas.add(obj); canvas.bringToFront(obj); salvarEstado(); }
    fecharPieMenu();
}

function adicionarRuaLivre() {
    travarToqueFalso();
    let nomeRua = prompt("Digite o nome da Rua/Avenida:", "Rua "); if (!nomeRua) return;
    let vpt = canvas.viewportTransform; let centerX = (-vpt[4] + (canvas.width / 2)) / canvas.getZoom(); let centerY = (-vpt[5] + (canvas.height / 2)) / canvas.getZoom();
    let offsetX = (Math.random() * 100) + 50; let offsetY = (Math.random() * 100) + 50;
    let finalX = centerX + (Math.random() > 0.5 ? offsetX : -offsetX); let finalY = centerY + (Math.random() > 0.5 ? offsetY : -offsetY);
    let textRua = montarRua(finalX, finalY, nomeRua);
    canvas.add(textRua); canvas.setActiveObject(textRua); salvarEstado();
}

function registrarMaterialCaixa() {
    travarToqueFalso();
    if (!activeTarget) return;
    let novoMaterial = prompt("📦 Informe o material gasto nesta caixa:", activeTarget.materiais_gastos || "");
    if (novoMaterial !== null) { activeTarget.materiais_gastos = novoMaterial; salvarEstado(); }
    fecharPieMenu();
}

// --- MODAIS E CFO MANUAIS ---
function ativarZoomDetalhes() {
    zoomLevel = zoomLevel === 1 ? 1.5 : 1; canvas.setZoom(zoomLevel); let btnZoom = document.getElementById('btnZoom');
    if (zoomLevel > 1) { if(btnZoom) btnZoom.classList.add('active'); updateStatus("Zoom Ativo"); } 
    else { if(btnZoom) btnZoom.classList.remove('active'); canvas.absolutePan({ x: 0, y: 0 }); updateStatus("Modo: Navegação Livre"); }
}
function abrirModalSalvar() { if(zoomLevel > 1) ativarZoomDetalhes(); document.getElementById('modalSalvar').style.display = 'flex'; renderListaMateriais(); }
function fecharModais() { document.getElementById('modalSalvar').style.display = 'none'; document.getElementById('modalCTO').style.display = 'none'; }
function verificarMaterialOutro() { let select = document.getElementById('selectMaterialBase'); let inputManual = document.getElementById('manualItem'); if (select.value === 'Outro') { inputManual.style.display = 'block'; inputManual.focus(); } else { inputManual.style.display = 'none'; inputManual.value = ''; } }
function addMaterialManual() { 
    let select = document.getElementById('selectMaterialBase'), inputManual = document.getElementById('manualItem'), q = document.getElementById('manualQtd').value, nomeServico = select.value === 'Outro' ? inputManual.value : select.value;
    if (!nomeServico || !q) { alert("Selecione e Preencha a Quantidade."); return; } 
    listaMateriaisManuais.push({ item: nomeServico, qtd: q }); select.value = ""; inputManual.value = ""; inputManual.style.display = 'none'; document.getElementById('manualQtd').value = ""; renderListaMateriais(); agendarAutoSalvar();
}
function renderListaMateriais() { 
    let ul = document.getElementById('listaMateriaisVisivel'); ul.innerHTML = ""; 
    if (listaMateriaisManuais.length === 0) { ul.innerHTML = "<li style='color:#999; text-align:center;'>Nenhum serviço/material extra.</li>"; return; } 
    listaMateriaisManuais.forEach((m, i) => { let li = document.createElement("li"); li.innerHTML = `<span><b>${m.qtd}</b> x ${m.item}</span> <button onclick="removerMaterialManual(${i})" style="background:#c0392b; color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer;">X</button>`; ul.appendChild(li); }); 
}
function removerMaterialManual(i) { listaMateriaisManuais.splice(i, 1); renderListaMateriais(); agendarAutoSalvar(); }

// --- TUTORIAL INTERATIVO ---
let slideAtual = 0; const totalSlides = 4;
function abrirTutorial() { slideAtual = 0; atualizarVisorTutorial(); document.getElementById('modalTutorial').style.display = 'flex'; }
function fecharTutorial() { document.getElementById('modalTutorial').style.display = 'none'; localStorage.setItem('croqui_tutorial_visto', 'true'); }
function mudarSlide(direcao) { slideAtual += direcao; if (slideAtual < 0) slideAtual = 0; if (slideAtual >= totalSlides) slideAtual = totalSlides - 1; atualizarVisorTutorial(); }
function atualizarVisorTutorial() {
    for (let i = 0; i < totalSlides; i++) { document.getElementById(`slide-${i}`).classList.add('hidden'); document.getElementById(`slide-${i}`).classList.remove('active'); document.querySelectorAll('.dot')[i].classList.remove('active'); }
    document.getElementById(`slide-${slideAtual}`).classList.remove('hidden'); document.getElementById(`slide-${slideAtual}`).classList.add('active'); document.querySelectorAll('.dot')[slideAtual].classList.add('active');
    let btnPrev = document.getElementById('btnTutPrev'), btnNext = document.getElementById('btnTutNext'), btnFim = document.getElementById('btnTutFim');
    btnPrev.style.visibility = slideAtual === 0 ? 'hidden' : 'visible';
    if (slideAtual === totalSlides - 1) { btnNext.classList.add('hidden'); btnFim.classList.remove('hidden'); } else { btnNext.classList.remove('hidden'); btnFim.classList.add('hidden'); }
}
window.addEventListener('load', function() { if (!localStorage.getItem('croqui_tutorial_visto')) { setTimeout(abrirTutorial, 800); } });

// --- MÁGICA DE FORMATAÇÃO (CABO E PRIMÁRIA) ---
function formatarDuasCasas(val, max) {
    let n = parseInt(val.replace(/[^0-9]/g, ''));
    if(isNaN(n)) return "S/I";
    if(n > max) n = max; if(n < 1) n = 1;
    return String(n).padStart(2, '0');
}

// --- EXPORTAÇÃO (PDF COM LIMITES DE REGRAS DE NEGÓCIO E CORREÇÃO MOBILE) ---
function confirmarSalvar() {
    let oc = document.getElementById('inputOC').value.replace(/[^0-9]/g, '') || "S/I"; 
    let causa = document.getElementById('inputCausa').value || "S/I"; 
    let motivo = document.getElementById('inputMotivo').value || "S/I"; 
    let encarregado = document.getElementById('inputEncarregado').value || "S/I"; 
    let re = document.getElementById('inputRE').value || "S/I"; 
    let placa = document.getElementById('inputPlaca').value || "S/I"; 
    
    // AT só aceita 2 Letras em Maiúsculo
    let atBruta = document.getElementById('inputLocCT').value || "S/I"; 
    let locCT = atBruta !== "S/I" ? atBruta.toUpperCase().replace(/[^A-Z]/g, '').substring(0,2) : "S/I";
    
    // Cabo (Max 20) e Primária (Max 144) com 2 casas
    let caboRaw = document.getElementById('inputCabo').value;
    let cabo = caboRaw ? formatarDuasCasas(caboRaw, 20) : "S/I"; 
    let primariaRaw = document.getElementById('inputPrimaria').value;
    let primaria = primariaRaw ? formatarDuasCasas(primariaRaw, 144) : "S/I"; 
    
    if (encarregado === "S/I" || re === "S/I" || oc === "S/I") { alert("Preencha ao menos OC/OR, Encarregado e RE."); return; }
    
    let idProj = `OC_${oc}_CABO_${cabo}`.replace(/[\\/:*?"<>|]/g, ''); let hoje = new Date().toLocaleDateString('pt-BR'); fecharModais();

    let cabosInstalados = canvas.getObjects().filter(o => o.id_tipo === 'cabo' && o.sub_tipo === 'instalado');
    // Sempre parte do zero: se o PDF for gerado de novo, a retirada antiga sai e só volta se confirmar de novo.
    removerRetiradaAutomatica();
    if (cabosInstalados.length > 0) { if (confirm("📦 Houve RETIRADA DE CABO nesta OS?\n\nClique em [OK] para que o sistema crie a linha Verde de retirada automaticamente.")) { gerarRetiradaAutomatica(cabosInstalados); } }

    // MÁGICA: Executar tudo num bloco síncrono ultra-rápido para o celular não cortar a tela
    setTimeout(() => {
        let totais = { redeInstalada: 0, redeRetirada: 0, itensExtras: [] }; listaMateriaisManuais.forEach(m => { totais.itensExtras.push({ qtd: m.qtd, item: m.item }); });
        let ctosExtraidas = []; let ruasExtraidas = [];

        canvas.getObjects().forEach(o => { 
            if (o.id_tipo === 'cabo' && o.valor_metragem) { if (o.sub_tipo === 'instalado') totais.redeInstalada += o.valor_metragem; if (o.sub_tipo === 'retirado') totais.redeRetirada += o.valor_metragem; }
            if (o.id_tipo === 'rua_livre' && o.text && !ruasExtraidas.includes(o.text)) ruasExtraidas.push(o.text);
            if (o.id_tipo === 'equipamento_cabo' && o.is_cto) { let chaveCto = o.cto_num + "|" + o.cto_contagem; if (!ctosExtraidas.some(c => c.chave === chaveCto)) ctosExtraidas.push({ chave: chaveCto, num: o.cto_num, cont: o.cto_contagem }); }
            if (o.id_tipo === 'equipamento_cabo' && o.materiais_gastos) { let nomeCaixa = o.is_cto ? `CTO ${o.cto_num}` : "CEO"; totais.itensExtras.push({ item: `Material Local (${nomeCaixa})`, qtd: o.materiais_gastos }); }
        });

        let strEndereco = ruasExtraidas.length > 0 ? ruasExtraidas.join(" / ") : "S/I"; let strCaixas = ctosExtraidas.length > 0 ? ctosExtraidas.map(c => c.num).join(", ") : "S/I"; let strDist = ctosExtraidas.length > 0 ? ctosExtraidas.map(c => c.cont).join(", ") : "S/I";

        // 1. Salva estado atual
        let vptOriginal = canvas.viewportTransform.slice(); 
        var originalWidth = canvas.width; var originalHeight = canvas.height; 
        var exportWidth = 1280; var exportHeight = 720;

        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]); // Reseta câmera
        resetStartNode(); mostrarGrade = false; 

        // 2. Transforma em Grupo REAL (Remove os soltos e impede duplicatas e cortes na foto)
        var drawnObjects = canvas.getObjects().filter(o => o.id_tipo !== 'marcador'); 
        var g = null; var origGroupState = {};
        if(drawnObjects.length > 0) {
            var sel = new fabric.ActiveSelection(drawnObjects, { canvas: canvas });
            canvas.setActiveObject(sel);
            g = sel.toGroup(); // Suga tudo para dentro do grupo Oficialmente
            origGroupState = { left: g.left, top: g.top, scaleX: g.scaleX, scaleY: g.scaleY };
            var scale = Math.min((exportWidth - 100) / g.width, (exportHeight - 120) / g.height); if(scale > 2.0) scale = 2.0; 
            g.scale(scale); g.set({ left: exportWidth / 2, top: 400, originX: 'center', originY: 'center' }); 
            g.setCoords();
        }

        // 3. Quebra as travas CSS do celular invisivelmente e cresce a tela
        let wrap = canvas.wrapperEl;
        let origWrapStyle = wrap ? wrap.getAttribute('style') : '';
        if (wrap) { wrap.setAttribute('style', `width: ${exportWidth}px !important; height: ${exportHeight}px !important; max-width: none !important;`); }
        canvas.setWidth(exportWidth); canvas.setHeight(exportHeight); 
        canvas.setBackgroundColor('white', null);

        var headerBg = new fabric.Rect({ left: 0, top: 0, width: exportWidth, height: 85, fill: '#ffffff', selectable: false }); var headerLine = new fabric.Line([0, 85, exportWidth, 85], { stroke: '#bdc3c7', strokeWidth: 2, selectable: false });
        let linha1 = `OC/OR: ${oc}   |   CAIXA: ${strCaixas}   |   DATA: ${hoje}   |   NOME (TEC 01): ${encarregado.toUpperCase()}   |   RE: ${re}   |   PLACA: ${placa.toUpperCase()}`;
        let linha2 = `ENDEREÇO: ${strEndereco}   |   CAUSA: ${causa}   |   MOTIVO: ${motivo}`;
        let linha3 = `REDE   ->   AT: ${locCT}   |   CABO: ${cabo}   |   PRIMÁRIA: ${primaria}   |   DISTRIBUIÇÃO: ${strDist}`;
        
        var txtTopo1 = new fabric.Text(linha1, { fontSize: 15, fill: '#660099', fontWeight: 'bold', left: 20, top: 12, selectable: false });
        var txtTopo2 = new fabric.Text(linha2, { fontSize: 14, fill: '#333', fontWeight: 'bold', left: 20, top: 36, selectable: false });
        var txtTopo3 = new fabric.Text(linha3, { fontSize: 14, fill: '#333', left: 20, top: 60, selectable: false });
        var txtResumoCabos = new fabric.Text(`Lançamento: ${totais.redeInstalada}m   |   Retirada: ${totais.redeRetirada}m`, { fontSize: 15, fill: '#27ae60', fontWeight: 'bold', left: exportWidth - 20, top: 36, originX: 'right', selectable: false });

        canvas.add(headerBg, headerLine, txtTopo1, txtTopo2, txtTopo3, txtResumoCabos);
        canvas.renderAll();

        // 4. Bate a foto gigante e constrói o PDF
        try {
            var imgData = canvas.toDataURL({ format: 'png', quality: 1.0 }); 
            const { jsPDF } = window.jspdf; const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            doc.addImage(imgData, 'PNG', 0, 21.5, 297, 167); doc.addPage('a4', 'portrait');
            doc.setFontSize(16); doc.setTextColor(102, 0, 153); doc.text("Relatório de Quantitativos e Serviços", 14, 20);
            
            let tableData = [ 
                ["NÚMERO OC/OR", oc], ["CAIXA", strCaixas], ["ENDEREÇO", strEndereco], 
                ["CAUSA", causa], ["MOTIVO", motivo], ["AT", locCT], 
                ["CABO", cabo], ["PRIMÁRIA", primaria], ["DISTRIBUIÇÃO", strDist], 
                ["NOME (TEC 01)", encarregado], ["RE (80)", re], ["PLACA DO VEÍCULO", placa], 
                ["---", "---"], ["CABO INSTALADO AUTO", totais.redeInstalada + " m"], ["CABO RETIRADO AUTO", totais.redeRetirada + " m"] 
            ];
            
            if (totais.itensExtras.length > 0) { tableData.push(["---", "---"]); tableData.push(["CÓDIGOS / SERVIÇOS EXTRAS", "QUANTIDADE"]); totais.itensExtras.forEach(e => { tableData.push([e.item, e.qtd]); }); }
            doc.autoTable({ startY: 28, head: [['Informação / Serviço', 'Valor / Quantidade']], body: tableData, theme: 'striped', headStyles: { fillColor: [102, 0, 153] }, styles: { fontSize: 11, cellPadding: 4 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 } } });
            doc.save(`${idProj}.pdf`); alert("PDF gerado com sucesso! 🎉");
        } catch (erro) { console.error(erro); alert("Erro ao gerar PDF."); }
        
        // 5. Limpa a bagunça, explode o grupo e devolve o layout de celular ao normal
        canvas.remove(headerBg, headerLine, txtTopo1, txtTopo2, txtTopo3, txtResumoCabos); 
        if(g) { g.set(origGroupState); g.setCoords(); g.toActiveSelection(); canvas.discardActiveObject(); }
        
        if (wrap) { wrap.setAttribute('style', origWrapStyle); } // Devolve travas CSS
        canvas.setWidth(originalWidth); canvas.setHeight(originalHeight); canvas.setViewportTransform(vptOriginal); 
        
        mostrarGrade = true;
        canvas.setBackgroundColor('', canvas.renderAll.bind(canvas));
    }, 100);
}

// --- INJEÇÃO DINÂMICA DE MELHORIAS NO HTML E LISTAS DE SERVIÇOS ---
window.addEventListener('DOMContentLoaded', () => {
    // 1. Transforma Causa e Motivo em Selects Inteligentes e Interligados (Códigos limpos na tela, completos no PDF)
    let inputCausa = document.getElementById('inputCausa');
    if (inputCausa && inputCausa.tagName === 'INPUT') {
        let selectCausa = document.createElement('select'); selectCausa.id = 'inputCausa'; selectCausa.className = inputCausa.className;
        selectCausa.innerHTML = `
            <option value="">Selecione a Causa...</option>
            <option value="ATENUAÇÃO">ATENUAÇÃO</option>
            <option value="FIBRA QUEBRADA">FIBRA QUEBRADA</option>
            <option value="CABO">CABO</option>
            <option value="SEM DEFEITO REDE">SEM DEFEITO REDE</option>
        `;
        inputCausa.parentNode.replaceChild(selectCausa, inputCausa);

        let inputMotivo = document.getElementById('inputMotivo');
        let selectMotivo = document.createElement('select'); selectMotivo.id = 'inputMotivo'; selectMotivo.className = inputMotivo.className;
        selectMotivo.innerHTML = '<option value="">Selecione a Causa primeiro...</option>';
        inputMotivo.parentNode.replaceChild(selectMotivo, inputMotivo);

        selectCausa.addEventListener('change', function() {
            const map = {
                "ATENUAÇÃO": ["CONECTOR/BORNE", "INFILTRAÇÃO", "CABO CROCADO", "ALÇA QUEBRADA", "ACOMODAÇÃO", "IMPUREZA/LIMPEZA", "FUSÃO", "DROP COM DEFEITO", "CORDÃO DGOI/CDOE", "CORDÃO TX"],
                "FIBRA QUEBRADA": ["TERCEIROS", "INFILTRAÇÃO AÉREO", "FIBRA CURTA", "INFILTRAÇÃO SUBTERRÂNEO", "ANIMAIS", "TÉCNICO ANTERIOR", "DROP ROMPIDO"],
                "CABO": ["CARGA ALTA", "TROCA DE POSTE", "PODA DE ÁRVORE", "QUEDA DE ÁRVORE", "FURTO METÁLICO", "OBRAS TERCEIROS", "LINHA DE PIPA", "VANDALISMO", "DESCARGA"],
                "SEM DEFEITO REDE": ["FALTA DE ENERGIA", "TRANSMISSÃO N1", "ENCONTRADO OK"]
            };
            selectMotivo.innerHTML = '<option value="">Selecione o Motivo...</option>';
            if(map[this.value]) { map[this.value].forEach(m => { let opt = document.createElement('option'); opt.value = m; opt.innerText = m; selectMotivo.appendChild(opt); }); }
        });
    }

    // 2. Injeta a Tabela Oficial de Serviços e Códigos (Faturamento)
    let selectMaterial = document.getElementById('selectMaterialBase');
    if (selectMaterial) {
        selectMaterial.innerHTML = `
            <option value="">Selecione um Serviço/Material...</option>
            <option value="291293 - LOC. C/ABERTURA SUB">LOC. C/ABERTURA SUB</option>
            <option value="291390 - LOC. S/ABERTURA">LOC. S/ABERTURA</option>
            <option value="291382 - LOC. C/ABERTURA AEREO">LOC. C/ABERTURA AEREO</option>
            <option value="291404 - Encerramento de TA em rede FTTx">Encerramento de TA em rede FTTx</option>
            <option value="294004 - PONTEAMENTO">PONTEAMENTO</option>
            <option value="292290 - REAB AEREO">REAB AEREO</option>
            <option value="292303 - REAB SUB">REAB SUB</option>
            <option value="290832 - Emenda de FO em caixa de emenda existente">Emenda de FO em caixa de emenda existente</option>
            <option value="290689 - Emenda de FO">Emenda de FO</option>
            <option value="294071 - MONTAGEM CONECTOR">MONTAGEM CONECTOR</option>
            <option value="293075 - SUBSTITUIR CTOP PRÉ CONEC.">SUBSTITUIR CTOP PRÉ CONEC.</option>
            <option value="292281 - INST. CX SEM FUSÃO">INST. CX SEM FUSÃO</option>
            <option value="292257 - INST. CX COM FUSÃO">INST. CX COM FUSÃO</option>
            <option value="292273 - INST. CX COM FUSÃO SUBTERRANEA">INST. CX COM FUSÃO SUBTERRANEA</option>
            <option value="291220 - Preparar tubo em cabo de F.O, sem sangria">Preparar tubo em cabo de F.O, sem sangria</option>
            <option value="291238 - Preparar tubo em cabo de F.O. com">Preparar tubo em cabo de F.O. com</option>
            <option value="293407 - Instalar DROP de 100mts">Instalar DROP de 100mts</option>
            <option value="293415 - Instalar DROP de 150mts">Instalar DROP de 150mts</option>
            <option value="293423 - Instalar DROP de 200mts">Instalar DROP de 200mts</option>
            <option value="293431 - Instalar DROP de 250mts">Instalar DROP de 250mts</option>
            <option value="293440 - Instalar DROP de 300mts">Instalar DROP de 300mts</option>
            <option value="293458 - Instalar DROP de 400mts">Instalar DROP de 400mts</option>
            <option value="293466 - Instalar DROP de 500mts">Instalar DROP de 500mts</option>
            <option value="293474 - Instalar DROP de 600mts">Instalar DROP de 600mts</option>
            <option value="292249 - Instalação de cabo óptico/drop em roldana">Instalação de cabo óptico/drop em roldana</option>
            <option value="293091 - Retirada de cabo óptico ASU em roldana (m)">Retirada de cabo óptico ASU em roldana (m)</option>
            <option value="292222 - Instalar cabo de FO autossustentado">Instalar cabo de FO autossustentado</option>
            <option value="290777 - Retirar cabo de FO autossustentado">Retirar cabo de FO autossustentado</option>
            <option value="292214 - Instalar cabo de FO em duto ou subduto">Instalar cabo de FO em duto ou subduto</option>
            <option value="290050 - Retirar cabo de FO em duto ou subduto">Retirar cabo de FO em duto ou subduto</option>
            <option value="290115 - Instalar cabo de FO em mensageiro">Instalar cabo de FO em mensageiro</option>
            <option value="290131 - Retirar cabo de FO de mensageiro">Retirar cabo de FO de mensageiro</option>
            <option value="291246 - ADICIONAL DE CABO FO">ADICIONAL DE CABO FO</option>
            <option value="294098 - SPIRAL TUBE">SPIRAL TUBE</option>
            <option value="223859 - REMANEJ. DE CAIXAS DO POSTE PRA CORDOALHA">REMANEJ. DE CAIXAS DO POSTE PRA CORDOALHA</option>
            <option value="290262 - REPUXE DE CABO FO">REPUXE DE CABO FO</option>
            <option value="292265 - CAIXA DE ETREMO">CAIXA DE ETREMO</option>
            <option value="291213 - HUB DE PONTA">HUB DE PONTA</option>
            <option value="291205 - HUB DE PASSAGEM">HUB DE PASSAGEM</option>
            <option value="Outro">Outro (Digitar manualmente)</option>
        `;
    }

    // 3. Renomeia os Labels sem você precisar mexer no HTML
    document.querySelectorAll('#modalSalvar label').forEach(lbl => {
        let t = lbl.innerText.toUpperCase();
        if (t.includes('OC')) lbl.innerText = 'Nº OC / OR (Somente Números):';
        if (t.includes('ENCARREGADO')) lbl.innerText = 'Nome:';
        if (t.includes('LOC')) lbl.innerText = 'AT (Duas Letras Mín/Máx):';
        if (t.includes('CABO')) lbl.innerText = 'Cabo (01 a 20):';
        if (t.includes('PRIMÁRIA')) lbl.innerText = 'Primária (01 a 144):';
    });

    // 4. Aplica regras e máscaras de preenchimento rigorosas
    let inpOC = document.getElementById('inputOC'); if(inpOC) inpOC.type = 'number';
    let inpLoc = document.getElementById('inputLocCT'); 
    if(inpLoc) { inpLoc.maxLength = 2; inpLoc.addEventListener('input', function() { this.value = this.value.toUpperCase().replace(/[^A-Z]/g, ''); }); }
    
    let inpCabo = document.getElementById('inputCabo');
    if(inpCabo) { inpCabo.type = 'number'; inpCabo.addEventListener('blur', function() { if(this.value) this.value = formatarDuasCasas(this.value, 20); }); }

    let inpPri = document.getElementById('inputPrimaria');
    if(inpPri) { inpPri.type = 'number'; inpPri.addEventListener('blur', function() { if(this.value) this.value = formatarDuasCasas(this.value, 144); }); }

    // 5. Ajuste Responsivo (Mobile) MÁGICO para alinhar os campos e diminuir a Qtd 
    let style = document.createElement('style');
    style.innerHTML = `
        /* Estilização universal limpa */
        #modalSalvar input, #modalSalvar select {
            border: 1px solid #ccd0d5;
            border-radius: 4px;
            padding: 8px 10px;
            font-size: 14px;
            box-sizing: border-box;
            background-color: #fff;
            -webkit-appearance: none;
            -moz-appearance: none;
            appearance: none;
            max-width: 100%;
        }

        #inputOC, #inputCausa { width: 48%; display: inline-block; }
        #inputMotivo { width: 100%; display: block; margin-top: 10px; }

        /* MAGIA DO FLEXBOX NA LINHA DE MATERIAIS */
        .linha-materiais-flex {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            gap: 5px !important;
            width: 100% !important;
            margin-top: 10px !important;
            box-sizing: border-box !important;
            overflow: hidden !important; /* Trava qualquer vazamento */
        }

        #selectMaterialBase {
            flex: 1 1 auto !important; 
            width: 10px !important; /* Permite que o select encolha */
            min-width: 0 !important; 
            height: 40px !important; 
            text-overflow: ellipsis !important; 
            white-space: nowrap !important;
            margin-bottom: 0 !important; 
        }
        
        /* Remove as setinhas nativas chatas que roubam espaço da Qtd */
        #manualQtd::-webkit-inner-spin-button,
        #manualQtd::-webkit-outer-spin-button {
            -webkit-appearance: none !important;
            margin: 0 !important;
        }

        #manualQtd {
            -moz-appearance: textfield !important; /* Para o Firefox */
            flex: 0 0 40px !important; /* Tamanho exato e inegociável em pixels */
            width: 40px !important;
            height: 40px !important;
            text-align: center !important;
            padding: 0 5px !important;
            background-color: #fff;
            border: 1px solid #ccd0d5;
            border-radius: 4px;
            box-sizing: border-box;
        }

        .btn-roxo-travado {
            flex: 0 0 40px !important; /* Quadrado perfeito 40x40 */
            width: 40px !important;
            height: 40px !important;
            background-color: #660099 !important; 
            color: #ffffff !important;
            border: none !important;
            border-radius: 4px !important;
            font-size: 20px !important;
            font-weight: bold !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            padding: 0 !important;
            flex-shrink: 0;
        }
        
        #manualItem { width: 100%; margin-top: 8px; }
    `;
    document.head.appendChild(style);

    // Caça a linha onde estão o Select, a Quantidade e o Botão, e blinda eles!
    if (selectMaterial && selectMaterial.parentNode) {
        let containerLinha = selectMaterial.parentNode;
        containerLinha.className = 'linha-materiais-flex';
        
        // Pega o botão dentro desse container e força a nova classe nele
        let btnAdd = containerLinha.querySelector('button');
        if (btnAdd) {
            btnAdd.className = 'btn-roxo-travado';
            btnAdd.innerText = '+';
        }
    }
});

// ==========================================
// SALVAMENTO AUTOMÁTICO E PERFIL DO TÉCNICO
// ==========================================
// O croqui fica guardado no próprio celular a cada alteração. Se o app
// fechar, a bateria acabar ou o técnico atender uma ligação, ao abrir de
// novo está tudo lá. Só some quando o técnico aperta "Novo".
// (as variáveis do salvamento automático ficam no topo do arquivo)

function agendarAutoSalvar() {
    if (restaurando) return;
    clearTimeout(timerAutoSalvar);
    timerAutoSalvar = setTimeout(autoSalvarAgora, 400);
}

function lerCampos(ids) {
    let dados = {};
    ids.forEach(id => { let el = document.getElementById(id); if (el) dados[id] = el.value; });
    return dados;
}

function autoSalvarAgora() {
    if (restaurando) return;
    clearTimeout(timerAutoSalvar);
    try {
        let rascunho = {
            versao: 2,
            salvoEm: new Date().toISOString(),
            desenho: canvas.toJSON(customProps),
            camera: canvas.viewportTransform.slice(),
            materiais: listaMateriaisManuais,
            formulario: lerCampos(CAMPOS_OS)
        };
        localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(rascunho));
        localStorage.setItem(CHAVE_PERFIL, JSON.stringify(lerCampos(CAMPOS_PERFIL)));
    } catch (e) { console.warn('Não foi possível salvar o rascunho', e); }
}

function preencherCampos(dados) {
    if (!dados) return;
    // Causa precisa vir antes do Motivo, porque a lista de motivos depende dela.
    if (dados.inputCausa !== undefined) {
        let causa = document.getElementById('inputCausa');
        if (causa) { causa.value = dados.inputCausa; causa.dispatchEvent(new Event('change')); }
    }
    Object.keys(dados).forEach(id => {
        if (id === 'inputCausa') return;
        let el = document.getElementById(id); if (el) el.value = dados[id];
    });
}

function limparDadosDaOS() {
    CAMPOS_OS.forEach(id => { let el = document.getElementById(id); if (el) el.value = ''; });
    let motivo = document.getElementById('inputMotivo');
    if (motivo && motivo.tagName === 'SELECT') motivo.innerHTML = '<option value="">Selecione a Causa primeiro...</option>';
    try { localStorage.removeItem(CHAVE_RASCUNHO); } catch (e) {}
    // O perfil (nome, RE, placa) continua guardado de propósito.
}

function restaurarRascunho() {
    let perfil = null, rascunho = null;
    try { perfil = JSON.parse(localStorage.getItem(CHAVE_PERFIL) || 'null'); } catch (e) {}
    try { rascunho = JSON.parse(localStorage.getItem(CHAVE_RASCUNHO) || 'null'); } catch (e) {}
    preencherCampos(perfil);
    if (!rascunho || !rascunho.desenho) return;

    restaurando = true;
    preencherCampos(rascunho.formulario);
    listaMateriaisManuais = Array.isArray(rascunho.materiais) ? rascunho.materiais : [];
    canvas.loadFromJSON(rascunho.desenho, function() {
        if (Array.isArray(rascunho.camera)) canvas.setViewportTransform(rascunho.camera);
        zoomLevel = canvas.getZoom();
        canvas.renderAll();
        historicoCanvas = []; indiceHistorico = -1;
        restaurando = false;
        salvarEstado();
        let qtd = canvas.getObjects().length;
        if (qtd > 0) {
            let hora = new Date(rascunho.salvoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            updateStatus('Croqui recuperado (salvo às ' + hora + ')');
        }
    });
}

window.addEventListener('DOMContentLoaded', () => {
    restaurarRascunho();
    // Qualquer coisa digitada no formulário também é salva na hora.
    let modal = document.getElementById('modalSalvar');
    if (modal) { modal.addEventListener('input', agendarAutoSalvar); modal.addEventListener('change', agendarAutoSalvar); }
});

// Garante o salvamento quando o app vai para o fundo (ligação, troca de app, tela apagando).
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autoSalvarAgora(); });
window.addEventListener('pagehide', autoSalvarAgora);

// --- FUNCIONAR SEM INTERNET ---
// Registra o service worker (sw.js), que guarda o app no celular.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker não registrado', e));
    });
}
