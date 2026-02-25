// ==========================================
// CROQUI PRO - VERSÃO DEFINITIVA (APP.JS)
// Touch Blindado, Sem Ghost Clicks e Travado
// ==========================================

// 1. selection: false MATA a caixa de seleção azul travada no celular!
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

const customProps = [
    'id_tipo', 'sub_tipo', 'valor_metragem', 'perPixelTargetFind', 'hasControls', 
    'selectable', 'lockScalingX', 'lockScalingY', 'lockRotation', 'snapAngle', 
    'snapThreshold', 'is_cto', 'cto_num', 'cto_contagem', 'materiais_gastos', 
    'p1x', 'p1y', 'p2x', 'p2y'
];

// --- HISTÓRICO (DESFAZER / REFAZER) ---
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
            canvas.setViewportTransform(vptAtual); canvas.renderAll(); navegandoHistorico = false; atualizarBotoesHistorico(); fecharPieMenu();
        });
    }
}

function refazer() {
    if (indiceHistorico < historicoCanvas.length - 1) {
        navegandoHistorico = true; indiceHistorico++;
        let vptAtual = canvas.viewportTransform.slice();
        canvas.loadFromJSON(historicoCanvas[indiceHistorico], function() {
            canvas.setViewportTransform(vptAtual); canvas.renderAll(); navegandoHistorico = false; atualizarBotoesHistorico(); fecharPieMenu();
        });
    }
}

canvas.on('object:modified', function() { salvarEstado(); });

// --- ÁREA DE DESENHO, ZOOM E TOQUE MOBILE BLINDADO ---
let touchStartX = 0; let touchStartY = 0; let isActuallyDragging = false;

function initCanvasArea() {
    canvas.setWidth(window.innerWidth);
    canvas.setHeight(window.innerHeight - 50); 
    
    canvas.on('mouse:down', function(opt) {
        let evt = opt.e;
        if (evt.touches && evt.touches.length > 1) return; 
        touchStartX = evt.clientX || (evt.touches && evt.touches[0].clientX);
        touchStartY = evt.clientY || (evt.touches && evt.touches[0].clientY);
        isActuallyDragging = false;

        // Sempre permite arrastar a tela, a menos que esteja ligando cabos!
        if (!isConnectingMode) {
            this.isDragging = true; 
            this.lastPosX = touchStartX; 
            this.lastPosY = touchStartY; 
        }
    });
    
    canvas.on('mouse:move', function(opt) {
        let evt = opt.e;
        if (evt.touches && evt.touches.length > 1) return;
        let clientX = evt.clientX || (evt.touches && evt.touches[0].clientX);
        let clientY = evt.clientY || (evt.touches && evt.touches[0].clientY);

        if (Math.hypot(clientX - touchStartX, clientY - touchStartY) > 10) { isActuallyDragging = true; }

        if (this.isDragging) {
            let vpt = this.viewportTransform;
            vpt[4] += clientX - this.lastPosX; vpt[5] += clientY - this.lastPosY;
            this.requestRenderAll(); this.lastPosX = clientX; this.lastPosY = clientY;
        }
    });
    
    canvas.on('mouse:up', function(opt) {
        this.setViewportTransform(this.viewportTransform);
        this.isDragging = false; 
        
        // Se arrastou, aborta qualquer clique falso.
        if (isActuallyDragging) return; 

        const obj = opt.target; let evt = opt.e;
        
        // Clicou no vazio = Fecha Menu
        if (!obj) { fecharPieMenu(); return; }
        if (obj.id_tipo === 'rua_livre' || obj.id_tipo === 'simbologia_poste') { fecharPieMenu(); return; }

        let pointer = canvas.getPointer(evt);

        if (isConnectingMode) {
            if (['grid_dot', 'equipamento_poste', 'equipamento_cabo'].includes(obj.id_tipo)) { handleConnectionClick(obj); }
        } else {
            if (['cabo', 'grid_dot', 'equipamento_poste', 'equipamento_cabo'].includes(obj.id_tipo)) {
                activeTarget = obj; clickCoords = { x: pointer.x, y: pointer.y }; abrirPieMenu(evt, obj.id_tipo);
            }
        }
    });

    let touchContainer = document.getElementById('canvas-container'); let lastPinchDist = 0;
    touchContainer.addEventListener('touchstart', function(e) {
        if (e.touches.length === 2) { canvas.isDragging = false; lastPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
    }, { passive: false });

    touchContainer.addEventListener('touchmove', function(e) {
        if (e.touches.length === 2) {
            e.preventDefault(); 
            let currentDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            let zoom = canvas.getZoom() * (currentDist / lastPinchDist);
            if (zoom > 4) zoom = 4; if (zoom < 0.5) zoom = 0.5;
            let point = new fabric.Point((e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
            canvas.zoomToPoint(point, zoom); lastPinchDist = currentDist; zoomLevel = zoom;
        }
    }, { passive: false });
}
initCanvasArea(); window.addEventListener('resize', initCanvasArea);

// --- GRID E SETUP INICIAL ---
function initGrid() {
    const cols = 60, rows = 60, spacing = 60, offsetX = 40, offsetY = 40; 
    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            let dot = new fabric.Circle({ left: offsetX + (spacing * (i + 1)), top: offsetY + (spacing * (j + 1)), radius: 4, fill: '#bdc3c7', stroke: 'rgba(0,0,0,0)', strokeWidth: 32, hasControls: false, hasBorders: false, selectable: false, originX: 'center', originY: 'center', id_tipo: 'grid_dot' });
            canvas.add(dot);
        }
    }
    setTimeout(() => { salvarEstado(); }, 500); 
}
initGrid();

function novoCroqui() {
    if (confirm("⚠️ ATENÇÃO!\n\nTem certeza que deseja apagar TODO o desenho atual?")) {
        canvas.clear(); historicoCanvas = []; indiceHistorico = -1; atualizarBotoesHistorico();
        isConnectingMode = false; modoCaboAtivo = null; startNode = null; activeTarget = null; listaMateriaisManuais = [];
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]); zoomLevel = 1; initGrid(); updateStatus("Tela limpa. Novo projeto iniciado.");
    }
}

// --- MODOS E INTERAÇÃO COM ELEMENTOS ---
function updateStatus(text) { document.getElementById('status-bar').innerText = text; }

function toggleSubMenuCabos() {
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
function handleConnectionClick(node) {
    if (!startNode) {
        startNode = node; 
        if (startNode.id_tipo === 'grid_dot') startNode.set('fill', '#f1c40f'); 
        canvas.renderAll();
    } else {
        if (startNode === node) return; 
        
        desenharCabo(startNode, node, "40", modoCaboAtivo);
        activeTarget = node; clickCoords = { x: node.left, y: node.top }; abrirPieMenu(null, node.id_tipo);
        
        if (startNode && startNode.id_tipo === 'grid_dot') startNode.set('fill', '#bdc3c7'); 
        startNode = node;
        if (startNode.id_tipo === 'grid_dot') startNode.set('fill', '#f1c40f'); 
        
        canvas.renderAll();
    }
}

function resetStartNode() {
    if (startNode && startNode.id_tipo === 'grid_dot') startNode.set('fill', '#bdc3c7');
    startNode = null; canvas.renderAll();
}

function desenharCabo(p1, p2, metragem, tipo) {
    let corCabo = tipo === 'existente' ? '#111111' : '#e74c3c';
    let line = new fabric.Line([p1.left, p1.top, p2.left, p2.top], { stroke: corCabo, strokeWidth: 5, selectable: true, hasControls: false, perPixelTargetFind: true });
    let midX = (p1.left + p2.left) / 2, midY = (p1.top + p2.top) / 2;
    let text = new fabric.Text(metragem + "m", { left: midX, top: midY, fontSize: 22, fill: corCabo, backgroundColor: 'rgba(255,255,255,1)', originX: 'center', originY: 'center', fontWeight: 'bold', padding: 6, paintFirst: 'stroke' });

    // BLINDAGEM: Cabos não podem ser arrastados
    let group = new fabric.Group([line, text], { selectable: true, lockMovementX: true, lockMovementY: true, hasControls: false, id_tipo: 'cabo', sub_tipo: tipo, valor_metragem: parseFloat(metragem), perPixelTargetFind: true, p1x: p1.left, p1y: p1.top, p2x: p2.left, p2y: p2.top });
    
    canvas.add(group); 
    canvas.getObjects().forEach(obj => { if (obj.id_tipo && (obj.id_tipo.startsWith('equipamento') || obj.id_tipo === 'rua_livre' || obj.id_tipo === 'simbologia_poste')) { canvas.bringToFront(obj); } });
    canvas.discardActiveObject(); salvarEstado();
}

function editarMetragemCabo() {
    if (activeTarget && activeTarget.id_tipo === 'cabo') {
        let novaMetragem = prompt("Editar Metragem (m):", activeTarget.valor_metragem);
        if (novaMetragem !== null && novaMetragem.trim() !== "") {
            activeTarget.valor_metragem = parseFloat(novaMetragem);
            let textoCabo = activeTarget.getObjects()[1]; textoCabo.set({ text: novaMetragem + "m" });
            activeTarget.addWithUpdate(); canvas.renderAll(); salvarEstado(); updateStatus("Metragem atualizada para " + novaMetragem + "m");
        }
    }
    fecharPieMenu();
}

// --- MÁGICA GEOMÉTRICA E RETIRADA AUTOMÁTICA ---
function intersectLines(p1, p2, p3, p4) {
    let denom = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (Math.abs(denom) < 0.1) return null; 
    let t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / denom;
    return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

function gerarRetiradaAutomatica(cabosVermelhos) {
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
        let group = new fabric.Group([line, text], { selectable: true, lockMovementX: true, lockMovementY: true, hasControls: false, id_tipo: 'cabo', sub_tipo: 'retirado', valor_metragem: seg.orig.valor_metragem, perPixelTargetFind: true });
        canvas.add(group);
    });

    Object.keys(nodeMap).forEach(key => {
        let connections = nodeMap[key];
        if (connections.length === 1) {
            let c = connections[0]; let rx = parseFloat(key.split('_')[0]); let ry = parseFloat(key.split('_')[1]); let gx = c.seg[c.pointKey].x; let gy = c.seg[c.pointKey].y;
            let connLine = new fabric.Line([rx, ry, gx, gy], { stroke: '#27ae60', strokeWidth: 5, selectable: false, id_tipo: 'conector_retirada' });
            let connText = new fabric.Text("0m", { left: (rx+gx)/2, top: (ry+gy)/2, fontSize: 16, fill: '#f39c12', backgroundColor: 'rgba(255,255,255,0.9)', originX: 'center', originY: 'center', fontWeight: 'bold', padding: 3 });
            let connGroup = new fabric.Group([connLine, connText], { selectable: false, lockMovementX: true, lockMovementY: true, id_tipo: 'conector_retirada' });
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
    const pie = document.getElementById('pie-menu');
    if (!pie) return;

    let zoom = canvas.getZoom(); let panX = canvas.viewportTransform[4]; let panY = canvas.viewportTransform[5];
    let canvasX = (targetType === 'cabo') ? clickCoords.x : activeTarget.left;
    let canvasY = (targetType === 'cabo') ? clickCoords.y : activeTarget.top;

    let screenX = (canvasX * zoom) + panX; let screenY = (canvasY * zoom) + panY + 20; 

    // TRAVA DE BORDA MAGNÉTICA
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
    const pie = document.getElementById('pie-menu');
    let zoom = canvas.getZoom(); let panX = canvas.viewportTransform[4]; let panY = canvas.viewportTransform[5];
    let screenX = (x * zoom) + panX; let screenY = (y * zoom) + panY + 50; 
    document.querySelectorAll('.pie-item').forEach(btn => btn.style.display = 'none');
    document.querySelectorAll('.pie-item[data-menu="sub"]').forEach(btn => btn.style.display = 'flex');
    pie.style.left = screenX + 'px'; pie.style.top = screenY + 'px'; pie.classList.remove('hidden');
}

// --- APAGAR E REMOVER ---
function apagarSelecionados() {
    let objetosAtivos = canvas.getActiveObjects();
    if (objetosAtivos.length === 0) { if (activeTarget) apagarItem(); else alert("Toque em um item para selecioná-lo antes de apagar."); return; }
    objetosAtivos.forEach(function(obj) { if (obj.id_tipo === 'grid_dot') return; if (obj.id_tipo === 'equipamento_poste') recriarPontoGrid(obj.left, obj.top); canvas.remove(obj); });
    canvas.discardActiveObject(); fecharPieMenu(); salvarEstado(); 
}

function apagarItem() {
    if (activeTarget) {
        if (activeTarget.id_tipo === 'grid_dot') { fecharPieMenu(); return; }
        if (activeTarget.id_tipo === 'equipamento_poste') recriarPontoGrid(activeTarget.left, activeTarget.top);
        canvas.remove(activeTarget); fecharPieMenu(); salvarEstado();
    }
}

function recriarPontoGrid(x, y) {
    let dot = new fabric.Circle({ left: x, top: y, radius: 4, fill: '#bdc3c7', stroke: 'rgba(0,0,0,0)', strokeWidth: 32, hasControls: false, hasBorders: false, selectable: false, originX: 'center', originY: 'center', id_tipo: 'grid_dot' });
    canvas.add(dot); canvas.sendToBack(dot);
}

// --- EQUIPAMENTOS E MATERIAIS BLINDADOS ---
function inserirEquipamento(tipo) {
    if (!activeTarget) return;
    let posX = (activeTarget.id_tipo === 'cabo') ? clickCoords.x : activeTarget.left;
    let posY = (activeTarget.id_tipo === 'cabo') ? clickCoords.y : activeTarget.top;

    if (tipo === 'CTO') inserirCTOP(posX, posY); else if (tipo === 'CEO') inserirCEO(posX, posY);
    else if (tipo === 'CS') inserirCS(posX, posY); else if (tipo === 'Subida') inserirSubida(posX, posY);
    else inserirPosteMapeado(posX, posY, tipo);
}

function inserirCTOP(x, y) { tempCTOX = x; tempCTOY = y; document.getElementById('modalCTO').style.display = 'flex'; }

function confirmarCTO() {
    let numCaixa = document.getElementById('ctoNum').value; let contagem = document.getElementById('ctoContagem').value; let corHex = document.getElementById('ctoCor').value;
    if (!numCaixa || !contagem) { alert("Preencha o Número e a Contagem da CTO."); return; }
    let corFonte = (corHex === '#ffffff' || corHex === '#f1c40f') ? 'black' : 'white';

    let rect = new fabric.Rect({ width: 44, height: 44, fill: corHex, rx: 6, ry: 6, originX: 'center', originY: 'center', stroke: '#333', strokeWidth: 1 });
    let lblNum = new fabric.Text(numCaixa, { fontSize: 12, fill: corFonte, fontWeight: 'bold', originX: 'center', top: -10 });
    let lblContagem = new fabric.Text(contagem, { fontSize: 11, fill: 'black', top: 22, backgroundColor: 'rgba(255,255,255,0.95)', originX: 'center', originY: 'center', padding: 3 });

    let group = new fabric.Group([rect, lblNum, lblContagem], { left: tempCTOX, top: tempCTOY, originX: 'center', originY: 'center', lockMovementX: true, lockMovementY: true, hasControls: false, id_tipo: 'equipamento_cabo', is_cto: true, cto_num: numCaixa, cto_contagem: contagem });
    if (activeTarget && activeTarget.id_tipo === 'grid_dot') canvas.remove(activeTarget);
    canvas.add(group); canvas.bringToFront(group);
    
    activeTarget = group; if (isConnectingMode) startNode = group;
    document.getElementById('modalCTO').style.display = 'none'; fecharPieMenu(); salvarEstado();
}

function inserirCEO(x, y) {
    let isNova = confirm("Esta CEO é NOVA ou EXISTENTE?\n\n[OK] = Instalação Nova\n[Cancelar] = Existente");
    let circle = new fabric.Circle({ radius: 24, fill: isNova ? 'black' : 'white', stroke: 'black', strokeWidth: isNova ? 0 : 3, originX: 'center', originY: 'center' });
    let lbl = new fabric.Text("CEO", { fontSize: 13, fill: isNova ? 'white' : 'black', fontWeight: 'bold', originX: 'center', originY: 'center' });
    let group = new fabric.Group([circle, lbl], { left: x, top: y, originX: 'center', originY: 'center', lockMovementX: true, lockMovementY: true, hasControls: false, id_tipo: 'equipamento_cabo' });
    if (activeTarget && activeTarget.id_tipo === 'grid_dot') canvas.remove(activeTarget);
    canvas.add(group); activeTarget = group; if (isConnectingMode) startNode = group; fecharPieMenu(); salvarEstado();
}

function inserirCS(x, y) {
    let numCaixa = prompt("Número da CS:", ""); if (numCaixa === null) { fecharPieMenu(); return; } 
    let labelText = (numCaixa.trim() === "" || numCaixa === "00") ? "CS S/N" : "CS " + numCaixa;
    let rect = new fabric.Rect({ width: 80, height: 50, fill: '#bdc3c7', stroke: '#34495e', strokeWidth: 2, rx: 4, ry: 4, originX: 'center', originY: 'center' });
    let lbl = new fabric.Text(labelText, { fontSize: 18, fill: '#2c3e50', fontWeight: 'bold', fontFamily: 'Roboto', originX: 'center', originY: 'center' });
    let group = new fabric.Group([rect, lbl], { left: x, top: y, originX: 'center', originY: 'center', lockMovementX: true, lockMovementY: true, hasControls: false, id_tipo: 'equipamento_poste' });
    if (activeTarget && activeTarget.id_tipo === 'grid_dot') canvas.remove(activeTarget);
    canvas.add(group); activeTarget = group; if (isConnectingMode) startNode = group; fecharPieMenu(); salvarEstado();
}

function inserirSubida(x, y) {
    let p = new fabric.Polyline([ {x: -30, y: 0}, {x: -15, y: 0}, {x: -5, y: -25}, {x: 5, y: 25}, {x: 15, y: 0}, {x: 30, y: 0} ], { fill: 'transparent', stroke: 'red', strokeWidth: 4, originX: 'center', originY: 'center' });
    let bgCircle = new fabric.Circle({ radius: 20, fill: 'rgba(255,255,255,0.7)', originX: 'center', originY: 'center' });
    let group = new fabric.Group([bgCircle, p], { left: x, top: y, originX: 'center', originY: 'center', lockMovementX: true, lockMovementY: true, hasControls: false, id_tipo: 'equipamento_poste' });
    if (activeTarget && activeTarget.id_tipo === 'grid_dot') canvas.remove(activeTarget);
    canvas.add(group); activeTarget = group; if (isConnectingMode) startNode = group; fecharPieMenu(); salvarEstado();
}

function inserirPosteMapeado(x, y, tipo) {
    let circle = new fabric.Circle({ radius: 18, fill: '#3498db', originX: 'center', originY: 'center' });
    let lbl = new fabric.Text(tipo.replace('Poste ', ''), { fontSize: 13, fill: 'white', fontWeight: 'bold', originX: 'center', originY: 'center' });
    let group = new fabric.Group([circle, lbl], { left: x, top: y, originX: 'center', originY: 'center', lockMovementX: true, lockMovementY: true, hasControls: false, id_tipo: 'equipamento_poste' });
    if (activeTarget && activeTarget.id_tipo === 'grid_dot') canvas.remove(activeTarget);
    canvas.add(group); activeTarget = group; if (isConnectingMode) startNode = group; abrirSubMenuPoste(x, y); salvarEstado();
}

function addSimbologia(tipo) {
    if (!activeTarget) return; let x = activeTarget.left, y = activeTarget.top - 28, obj;
    if (tipo === 'ST') obj = new fabric.Text('ST', { left: x, top: y, fontSize: 18, fill: '#f39c12', fontWeight: 'bold', stroke: 'white', strokeWidth: 3, paintFirst: 'stroke', originX: 'center', originY: 'center', padding: 10 });
    else if (tipo === 'PONTO') obj = new fabric.Circle({ left: x, top: y, radius: 7, fill: 'black', stroke: 'white', strokeWidth: 2, originX: 'center', originY: 'center', padding: 10 });
    else if (tipo === 'TRI') obj = new fabric.Text('▲▲', { left: x, top: y, fontSize: 14, fill: 'black', stroke: 'white', strokeWidth: 2, paintFirst: 'stroke', originX: 'center', originY: 'center', padding: 10 });
    if (obj) { obj.set({ hasControls: true, selectable: true, lockScalingX: true, lockScalingY: true, lockRotation: true, lockMovementX: true, lockMovementY: true, id_tipo: 'simbologia_poste' }); canvas.add(obj); canvas.bringToFront(obj); salvarEstado(); }
    fecharPieMenu();
}

function adicionarRuaLivre() {
    let nomeRua = prompt("Digite o nome da Rua/Avenida:", "Rua "); if (!nomeRua) return;
    let vpt = canvas.viewportTransform; let centerX = (-vpt[4] + (canvas.width / 2)) / canvas.getZoom(); let centerY = (-vpt[5] + (canvas.height / 2)) / canvas.getZoom();
    let offsetX = (Math.random() * 100) + 50; let offsetY = (Math.random() * 100) + 50;
    let finalX = centerX + (Math.random() > 0.5 ? offsetX : -offsetX); let finalY = centerY + (Math.random() > 0.5 ? offsetY : -offsetY);
    let textRua = new fabric.Text(nomeRua.toUpperCase(), { left: finalX, top: finalY, fontSize: 24, fill: '#2980b9', fontWeight: 'bold', fontFamily: 'Roboto', backgroundColor: 'rgba(255,255,255,0.85)', originX: 'center', originY: 'center', selectable: true, hasControls: true, lockScalingX: true, lockScalingY: true, id_tipo: 'rua_livre', snapAngle: 45, snapThreshold: 45 });
    canvas.add(textRua); canvas.setActiveObject(textRua); salvarEstado();
}

function registrarMaterialCaixa() {
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
    listaMateriaisManuais.push({ item: nomeServico, qtd: q }); select.value = ""; inputManual.value = ""; inputManual.style.display = 'none'; document.getElementById('manualQtd').value = ""; renderListaMateriais(); 
}
function renderListaMateriais() { 
    let ul = document.getElementById('listaMateriaisVisivel'); ul.innerHTML = ""; 
    if (listaMateriaisManuais.length === 0) { ul.innerHTML = "<li style='color:#999; text-align:center;'>Nenhum serviço/material extra.</li>"; return; } 
    listaMateriaisManuais.forEach((m, i) => { let li = document.createElement("li"); li.innerHTML = `<span><b>${m.qtd}</b> x ${m.item}</span> <button onclick="removerMaterialManual(${i})" style="background:#c0392b; color:white; border:none; border-radius:4px; padding:4px 8px; cursor:pointer;">X</button>`; ul.appendChild(li); }); 
}
function removerMaterialManual(i) { listaMateriaisManuais.splice(i, 1); renderListaMateriais(); }

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

// --- EXPORTAÇÃO (PDF OTIMIZADO) ---
function confirmarSalvar() {
    let oc = document.getElementById('inputOC').value || "S/I"; let causa = document.getElementById('inputCausa').value || "S/I"; let motivo = document.getElementById('inputMotivo').value || "S/I"; 
    let encarregado = document.getElementById('inputEncarregado').value || "S/I"; let re = document.getElementById('inputRE').value || "S/I"; let locCT = document.getElementById('inputLocCT').value || "S/I"; 
    let cabo = document.getElementById('inputCabo').value || "S/I"; let primaria = document.getElementById('inputPrimaria').value || "S/I"; let placa = document.getElementById('inputPlaca').value || "S/I"; 
    if (encarregado === "S/I" || re === "S/I" || oc === "S/I") { alert("Preencha ao menos OC/OR, Encarregado e RE."); return; }
    
    let idProj = `OC_${oc}_CABO_${cabo}`; let hoje = new Date().toLocaleDateString('pt-BR'); fecharModais();

    let cabosInstalados = canvas.getObjects().filter(o => o.id_tipo === 'cabo' && o.sub_tipo === 'instalado');
    if (cabosInstalados.length > 0) { if (confirm("📦 Houve RETIRADA DE CABO nesta OS?\n\nClique em [OK] para que o sistema crie a linha Verde de retirada automaticamente.")) { gerarRetiradaAutomatica(cabosInstalados); } }
    
    let totais = { redeInstalada: 0, redeRetirada: 0, itensExtras: [] }; listaMateriaisManuais.forEach(m => { totais.itensExtras.push({ qtd: m.qtd, item: m.item }); });
    let ctosExtraidas = []; let ruasExtraidas = [];

    canvas.getObjects().forEach(o => { 
        if (o.id_tipo === 'cabo' && o.valor_metragem) { if (o.sub_tipo === 'instalado') totais.redeInstalada += o.valor_metragem; if (o.sub_tipo === 'retirado') totais.redeRetirada += o.valor_metragem; }
        if (o.id_tipo === 'rua_livre' && o.text && !ruasExtraidas.includes(o.text)) ruasExtraidas.push(o.text);
        if (o.id_tipo === 'equipamento_cabo' && o.is_cto) { let chaveCto = o.cto_num + "|" + o.cto_contagem; if (!ctosExtraidas.some(c => c.chave === chaveCto)) ctosExtraidas.push({ chave: chaveCto, num: o.cto_num, cont: o.cto_contagem }); }
        if (o.id_tipo === 'equipamento_cabo' && o.materiais_gastos) { let nomeCaixa = o.is_cto ? `CTO ${o.cto_num}` : "CEO"; totais.itensExtras.push({ item: `Material Local (${nomeCaixa})`, qtd: o.materiais_gastos }); }
    });

    let strEndereco = ruasExtraidas.length > 0 ? ruasExtraidas.join(" / ") : "S/I"; let strCaixas = ctosExtraidas.length > 0 ? ctosExtraidas.map(c => c.num).join(", ") : "S/I"; let strDist = ctosExtraidas.length > 0 ? ctosExtraidas.map(c => c.cont).join(", ") : "S/I";

    var originalWidth = canvas.width; var originalHeight = canvas.height; var exportWidth = 1280; var exportHeight = 720;
    canvas.getObjects().forEach(o => { if (o.id_tipo === 'grid_dot') o.set('visible', false); }); canvas.setWidth(exportWidth); canvas.setHeight(exportHeight); canvas.setBackgroundColor('white', canvas.renderAll.bind(canvas));

    var drawnObjects = canvas.getObjects().filter(o => o.id_tipo !== 'grid_dot');
    if(drawnObjects.length > 0) {
        var g = new fabric.Group(drawnObjects);
        var scale = Math.min((exportWidth - 100) / g.width, (exportHeight - 120) / g.height); if(scale > 2.0) scale = 2.0; 
        g.scale(scale); g.set({ left: exportWidth / 2, top: 400, originX: 'center', originY: 'center' }); g.setCoords(); canvas.add(g); g.toActiveSelection(); canvas.discardActiveObject();
    }

    var headerBg = new fabric.Rect({ left: 0, top: 0, width: exportWidth, height: 85, fill: '#ffffff', selectable: false }); var headerLine = new fabric.Line([0, 85, exportWidth, 85], { stroke: '#bdc3c7', strokeWidth: 2, selectable: false });
    let linha1 = `OC/OR: ${oc}   |   CAIXA: ${strCaixas}   |   DATA: ${hoje}   |   EQUIPE: ${encarregado.toUpperCase()}   |   RE: ${re}   |   PLACA: ${placa.toUpperCase()}`;
    let linha2 = `ENDEREÇO: ${strEndereco}   |   CAUSA: ${causa}   |   MOTIVO: ${motivo}`;
    let linha3 = `REDE   ->   LOC/CT: ${locCT}   |   CABO: ${cabo}   |   PRIMÁRIA: ${primaria}   |   DISTRIBUIÇÃO: ${strDist}`;
    
    var txtTopo1 = new fabric.Text(linha1, { fontSize: 15, fill: '#660099', fontWeight: 'bold', left: 20, top: 12, selectable: false });
    var txtTopo2 = new fabric.Text(linha2, { fontSize: 14, fill: '#333', fontWeight: 'bold', left: 20, top: 36, selectable: false });
    var txtTopo3 = new fabric.Text(linha3, { fontSize: 14, fill: '#333', left: 20, top: 60, selectable: false });
    var txtResumoCabos = new fabric.Text(`Lançamento: ${totais.redeInstalada}m   |   Retirada: ${totais.redeRetirada}m`, { fontSize: 15, fill: '#27ae60', fontWeight: 'bold', left: exportWidth - 20, top: 36, originX: 'right', selectable: false });

    canvas.add(headerBg, headerLine, txtTopo1, txtTopo2, txtTopo3, txtResumoCabos);

    setTimeout(() => {
        try {
            var imgData = canvas.toDataURL({ format: 'png', quality: 1.0 }); const { jsPDF } = window.jspdf; const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            doc.addImage(imgData, 'PNG', 0, 21.5, 297, 167); doc.addPage('a4', 'portrait');
            doc.setFontSize(16); doc.setTextColor(102, 0, 153); doc.text("Relatório de Quantitativos e Serviços", 14, 20);
            let tableData = [ ["NÚMERO OC/OR", oc], ["CAIXA", strCaixas], ["ENDEREÇO", strEndereco], ["CAUSA", causa], ["MOTIVO", motivo], ["LOC / CT", locCT], ["CABO", cabo], ["PRIMÁRIA", primaria], ["DISTRIBUIÇÃO", strDist], ["ENCARREGADO", encarregado], ["RE (80)", re], ["PLACA DO VEÍCULO", placa], ["---", "---"], ["CABO INSTALADO AUTO", totais.redeInstalada + " m"], ["CABO RETIRADO AUTO", totais.redeRetirada + " m"] ];
            if (totais.itensExtras.length > 0) { tableData.push(["---", "---"]); tableData.push(["CÓDIGOS / SERVIÇOS EXTRAS", "QUANTIDADE"]); totais.itensExtras.forEach(e => { tableData.push([e.item, e.qtd]); }); }
            doc.autoTable({ startY: 28, head: [['Informação / Serviço', 'Valor / Quantidade']], body: tableData, theme: 'striped', headStyles: { fillColor: [102, 0, 153] }, styles: { fontSize: 11, cellPadding: 4 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 90 } } });
            doc.save(`${idProj}.pdf`); alert("PDF gerado com sucesso! 🎉");
        } catch (erro) { console.error(erro); alert("Erro ao gerar PDF."); }
        
        canvas.remove(headerBg, headerLine, txtTopo1, txtTopo2, txtTopo3, txtResumoCabos); canvas.setWidth(originalWidth); canvas.setHeight(originalHeight);
        canvas.getObjects().forEach(o => { if (o.id_tipo === 'grid_dot') o.set('visible', true); }); canvas.setBackgroundColor('#e0e0e0', canvas.renderAll.bind(canvas));
    }, 500);
}