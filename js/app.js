// --- CONFIGURAÇÃO INICIAL E VARIÁVEIS GLOBAIS ---
var canvas = new fabric.Canvas('c', { selection: true, preserveObjectStacking: true });
var line, arrowHead;
var isDrawingLine = false;
var modoLinha = null;
var listaMateriaisManuais = []; 
var paginas = [{ objects: [] }]; 
var paginaAtual = 0; 
var propsParaSalvar = ['id_tipo', 'sub_tipo', 'valor_metragem', 'lockMovementX', 'lockMovementY', 'selectable', 'evented', 'strokeDashArray', 'stroke', 'strokeWidth', 'fill', 'backgroundColor'];

// --- AJUSTE DE TELA (INTERFACE DO USUÁRIO) ---
function resizeCanvas() {
    canvas.setWidth(window.innerWidth);
    canvas.setHeight(window.innerHeight);
    canvas.renderAll();
    // desenharMargensSeguranca(); // Removido visualmente
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); 

// --- INTERFACE E AUXILIARES ---
function toggleUI() {
    var ui = document.getElementById('ui-container');
    var btn = document.getElementById('btnToggleUI');
    ui.classList.toggle('hidden');
    if(ui.classList.contains('hidden')) { btn.innerText = '⚙️'; btn.style.opacity = '0.5'; } else { btn.innerText = '👁️'; btn.style.opacity = '1'; }
}

function getCenter() {
    var zoom = canvas.getZoom();
    return { x: (canvas.width / 2) / zoom, y: (canvas.height / 2) / zoom };
}

// --- PAGINAÇÃO ---
function salvarEstadoPaginaAtual() {
    // Garante fundo transparente ao salvar o estado JSON para edição
    canvas.setBackgroundColor(null, canvas.renderAll.bind(canvas));
    var json = canvas.toJSON(propsParaSalvar);
    // Removemos o filtro de margem_seguranca pois elas não existem mais
    paginas[paginaAtual] = json;
}
function carregarPagina(index) {
    canvas.clear(); 
    var dados = paginas[index];
    canvas.loadFromJSON(dados, function() {
        // desenharMargensSeguranca(); // Removido
        canvas.renderAll();
        var ind = document.getElementById('page-indicator');
        if(ind) ind.innerText = "Pág " + (index + 1);
    });
}
function mudarPagina(direcao) {
    salvarEstadoPaginaAtual();
    var nova = paginaAtual + direcao;
    if (nova < 0 || nova >= paginas.length) return;
    paginaAtual = nova; carregarPagina(paginaAtual);
}
function adicionarPagina() {
    salvarEstadoPaginaAtual();
    paginas.push({ objects: [] }); paginaAtual = paginas.length - 1; carregarPagina(paginaAtual);
}

// --- MARGENS (VISUALIZAÇÃO NA TELA) ---
// As funções de margem foram esvaziadas ou removidas para limpar a visão mobile.
function desenharMargensSeguranca() {
    // Função mantida vazia para compatibilidade, mas não desenha nada.
}

// --- FERRAMENTAS ---
function resetFerramentas() {
    modoLinha = null; isDrawingLine = false; 
    document.querySelectorAll('.btn-tool, .btn-mini').forEach(b => b.classList.remove('ativo')); 
    canvas.selection = true; canvas.defaultCursor = 'default';
    canvas.forEachObject(o => o.selectable = true);
}
function ativarModoLinha(modo) {
    resetFerramentas(); modoLinha = modo;
    var m = {'instalar': 'btnInstall', 'retirar': 'btnRet', 'cordoalha': 'btnCord'};
    if(m[modo]) document.getElementById(m[modo]).classList.add('ativo');
    if (modo) { canvas.selection = false; canvas.defaultCursor = 'crosshair'; canvas.forEachObject(o => o.selectable = false); } 
}
function getMagnetPoint(pointer) {
    var t = 25, s = { x: pointer.x, y: pointer.y };
    canvas.getObjects().forEach(o => {
        if (['poste','ceo_existente','ceo_nova','caixa_subterranea'].includes(o.id_tipo)) {
            if (Math.hypot(pointer.x - o.left, pointer.y - o.top) < t) { s.x = o.left; s.y = o.top; }
        }
    }); return s;
}

// --- EVENTOS MOUSE ---
canvas.on('mouse:down', function(o){
    var p = canvas.getPointer(o.e);
    // Bloqueio de área removido para liberdade total no desenho
    
    if (!modoLinha && o.e.ctrlKey && o.target) {
        var obj = o.target; 
        obj.clone(function(c) {
            c.set({ left: obj.left + 20, top: obj.top + 20, evented: true });
            propsParaSalvar.forEach(k => { if (obj[k]) c.set(k, obj[k]); });
            canvas.add(c); canvas.setActiveObject(c); 
        }); return; 
    }
    if (!modoLinha) return;
    isDrawingLine = true;
    var sx, sy;
    if (modoLinha !== 'seta') { var s = getMagnetPoint(p); sx = s.x; sy = s.y; } else { sx = p.x; sy = p.y; }
    var c, w=4, d;
    if (modoLinha === 'instalar') c = '#e74c3c'; 
    else if (modoLinha === 'retirar') c = '#2ecc71'; 
    else if (modoLinha === 'cordoalha') { c = '#3498db'; w=2; d=[10, 5]; }
    else if (modoLinha === 'seta') { c = '#c0392b'; w=3; }
    line = new fabric.Line([sx, sy, sx, sy], { strokeWidth: w, stroke: c, strokeDashArray: d, originX: 'center', originY: 'center', selectable: false, evented: false });
    canvas.add(line);
    if (modoLinha === 'seta') { arrowHead = new fabric.Triangle({ width: 15, height: 15, fill: c, left: sx, top: sy, originX: 'center', originY: 'center', selectable: false, evented: false, angle: 90 }); canvas.add(arrowHead); }
});

canvas.on('mouse:move', function(o){
    if (!isDrawingLine) return;
    var p = canvas.getPointer(o.e); var tx = p.x, ty = p.y;
    if (modoLinha !== 'seta') {
        var s = getMagnetPoint(p); tx = s.x; ty = s.y;
        if (tx === p.x && ty === p.y) { if (Math.abs(tx - line.x1) < 20) tx = line.x1; else if (Math.abs(ty - line.y1) < 20) ty = line.y1; }
    }
    line.set({ x2: tx, y2: ty });
    if (modoLinha === 'seta' && arrowHead) { arrowHead.set({ left: tx, top: ty }); arrowHead.set({ angle: Math.atan2(ty - line.y1, tx - line.x1) * 180 / Math.PI + 90 }); }
    canvas.renderAll();
});

canvas.on('mouse:up', function(o){ 
    isDrawingLine = false; 
    if(line) {
        // Validação de área final removida
        line.setCoords();
        if (modoLinha === 'seta' && arrowHead) { var g = new fabric.Group([line, arrowHead]); g.set('id_tipo', 'seta_desenho'); canvas.remove(line, arrowHead); canvas.add(g); }
        line = null; arrowHead = null; resetFerramentas(); 
    }
});

// --- FUNÇÕES ETIQUETA ---
function atualizarBitolas() {
    var tipo = document.getElementById("tipoCabo").value;
    var select = document.getElementById("bitolaCabo");
    select.innerHTML = "";
    var opcoes = (tipo === "DROP") ? ["01", "04"] : ["06", "12", "24", "36", "48", "72", "144"];
    opcoes.forEach(v => { var opt = document.createElement("option"); opt.value = v; opt.innerHTML = v + " FO"; select.appendChild(opt); });
}
function addEtiquetaCabo() {
    resetFerramentas(); var c = getCenter();
    // Bloqueio removido
    var tipo = document.getElementById('tipoCabo').value;
    var bitola = document.getElementById('bitolaCabo').value;
    var t = new fabric.Text(tipo + " " + bitola + " FO", { fontSize: 14, backgroundColor: '#fff3cd', left: c.x, top: c.y, padding: 6, stroke: '#333', strokeWidth: 0.2, originX: 'center', originY: 'center' });
    canvas.add(t);
}

// --- FUNÇÕES OBJETOS ---
function addPoste(tipo) { var c = getCenter(); var ci = new fabric.Circle({ radius: 8, fill: '#047ffaff', left: 0, top: 0, originX: 'center', originY: 'center' }); var te = new fabric.Text(tipo, { fontSize: 20, fontWeight: 'bold', left: -15, top: -50, fontFamily: 'Roboto' }); var g = new fabric.Group([ ci, te ], { left: c.x, top: c.y, originX: 'center', originY: 'center' }); g.set('id_tipo', 'poste'); g.set('sub_tipo', tipo); canvas.add(g); }
function addCEO(existente) { var c = getCenter(); var ci = new fabric.Circle({ radius: 15, fill: existente ? '#2c3e50' : 'white', stroke: '#2c3e50', strokeWidth: existente ? 0 : 3, originX: 'center', originY: 'center' }); var g = new fabric.Group([ci], { left: c.x, top: c.y, originX: 'center', originY: 'center' }); g.set('id_tipo', existente ? 'ceo_existente' : 'ceo_nova'); canvas.add(g); }
function addCS() { var c = getCenter(); let n = prompt("Número CS:", ""); if (n !== null) { let l = (n === "" || n === "00") ? "CS S/N" : "CS " + n; var r = new fabric.Rect({ width: 60, height: 35, fill: '#bdc3c7', stroke: '#34495e', strokeWidth: 2, rx: 2, ry: 2, originX: 'center', originY: 'center' }); var t = new fabric.Text(l, { fontSize: 14, fill: '#2c3e50', fontWeight: 'bold', fontFamily: 'Roboto', originX: 'center', originY: 'center' }); var g = new fabric.Group([r, t], { left: c.x, top: c.y, originX: 'center', originY: 'center' }); g.set('id_tipo', 'caixa_subterranea'); canvas.add(g); } }
function addSubidaLateral() { var c = getCenter(); var p = new fabric.Polyline([ {x: 0, y: 0}, {x: 20, y: 0}, {x: 30, y: -30}, {x: 40, y: 30}, {x: 50, y: 0}, {x: 70, y: 0} ], { fill: 'transparent', stroke: 'red', strokeWidth: 3, left: c.x, top: c.y, originX: 'center', originY: 'center' }); canvas.add(p); }
function addCTOP(cor, range) { var c = getCenter(); var r = new fabric.Rect({ width: 35, height: 35, fill: cor, stroke: '#333', strokeWidth: 1, originX: 'center', originY: 'center' }); var t = new fabric.Text(range, { fontSize: 12, backgroundColor: 'rgba(255,255,255,0.9)', top: 20, fontFamily: 'Roboto', originX: 'center' }); var g = new fabric.Group([r, t], { left: c.x, top: c.y, originX: 'center', originY: 'center' }); g.set('id_tipo', 'ctop'); g.set('sub_tipo', range); canvas.add(g); }
function addObservacao() { resetFerramentas(); var c = getCenter(); 
    // Bloqueio removido
    var t = new fabric.Textbox("Clique 2x para editar...", { width: 300, fontSize: 16, fontFamily: 'Roboto', fill: '#856404', backgroundColor: '#fff3cd', borderColor: '#e0a800', borderWidth: 1, textAlign: 'left', originX: 'center', originY: 'center', splitByGrapheme: false, editable: true, left: c.x, top: c.y, padding: 15 }); t.set('id_tipo', 'observacao_texto'); canvas.add(t); canvas.setActiveObject(t); 
}
function addNomeRua() { resetFerramentas(); var c = getCenter(); let n = prompt("Nome da Rua:", "Rua Exemplo"); if (n) { var t = new fabric.Text(n, { fontSize: 24, fontFamily: 'Roboto', fill: '#2980b9', fontWeight: 'bold', left: c.x, top: c.y, originX: 'center' }); canvas.add(t); } }
function addMedida(tipo) { resetFerramentas(); var c = getCenter(); let l = "", cor = ""; if (tipo === 'instalado') { l = "Rede Nova"; cor = "#FFD700"; } if (tipo === 'retirado') { l = "Rede Ret."; cor = "#a9dfbf"; } if (tipo === 'cordoalha') { l = "Cordoalha"; cor = "#aed6f1"; } let m = prompt("Metragem (m):", "40"); if (m) { var t = new fabric.Text(l + ": " + m + "m", { fontSize: 16, fontWeight: 'bold', backgroundColor: cor, left: c.x, top: c.y, padding: 5, originX: 'center', originY: 'center' }); t.set('id_tipo', 'medida'); t.set('sub_tipo', tipo); t.set('valor_metragem', parseFloat(m)); canvas.add(t); } }
function deleteSelected() { var a = canvas.getActiveObjects(); if (a.length) { canvas.discardActiveObject(); a.forEach(o => canvas.remove(o)); } }
function novoCroqui() { if(confirm("Apagar tudo?")) { canvas.clear(); paginas = [{ objects: [] }]; paginaAtual = 0; listaMateriaisManuais = []; carregarPagina(0); } }
document.addEventListener('keydown', function(e) { if(e.key === "Delete") deleteSelected(); if(e.key === "Escape") resetFerramentas(); });

// --- SALVAMENTO E EXPORTAÇÃO (PAISAGEM + FUNDO BRANCO) ---
function abrirModalSalvar() { document.getElementById('modalSalvar').style.display = 'flex'; renderListaMateriais(); }
function fecharModais() { document.getElementById('modalSalvar').style.display = 'none'; }
function addMaterialManual() { let n = document.getElementById('manualItem').value; let q = document.getElementById('manualQtd').value; if (!n || !q) { alert("Preencha Nome e Qtd"); return; } listaMateriaisManuais.push({ item: n, qtd: q }); document.getElementById('manualItem').value = ""; document.getElementById('manualQtd').value = ""; document.getElementById('manualItem').focus(); renderListaMateriais(); }
function renderListaMateriais() { let ul = document.getElementById('listaMateriaisVisivel'); ul.innerHTML = ""; if (listaMateriaisManuais.length === 0) { ul.innerHTML = "<li style='color:#999; text-align:center;'>Nenhum item extra.</li>"; return; } listaMateriaisManuais.forEach((m, i) => { let li = document.createElement("li"); li.innerHTML = `<span><b>${m.qtd}</b> x ${m.item}</span> <button onclick="removerMaterialManual(${i})" style="background:#c0392b; color:white; border:none; border-radius:4px; cursor:pointer;">X</button>`; ul.appendChild(li); }); }
function removerMaterialManual(i) { listaMateriaisManuais.splice(i, 1); renderListaMateriais(); }

function confirmarSalvar() {
    let nome = document.getElementById('inputNome').value; let sobrenome = document.getElementById('inputSobrenome').value; let re = document.getElementById('inputRE').value; let at = document.getElementById('inputAT').value.toUpperCase(); let cabo = document.getElementById('inputCabo').value; let primaria = document.getElementById('inputPrimaria').value; let ocorrencia = document.getElementById('inputOcorrencia').value; let txtOc = (ocorrencia && ocorrencia.trim() !== "") ? "OC: " + ocorrencia : "LEVANTAMENTO DE OBRA";
    if (!nome || !sobrenome || !re || !at || !cabo || !primaria) { alert("Preencha campos obrigatórios."); return; }
    let caboPad = cabo.toString().padStart(2, '0'); let primPad = primaria.toString().padStart(2, '0'); let idProj = `${at}${caboPad}-F#${primPad}`; let hoje = new Date().toLocaleDateString('pt-BR');

    salvarEstadoPaginaAtual(); fecharModais(); resetFerramentas();
    let totais = { redeInstalada: 0, redeRetirada: 0, cordoalha: 0, itensExtras: [] };
    listaMateriaisManuais.forEach(m => { totais.itensExtras.push({ qtd: m.qtd, item: m.item }); });
    let pOriginal = paginaAtual; let idx = 0;

    // --- CONFIGURAÇÃO DE EXPORTAÇÃO ---
    var originalWidth = canvas.width; var originalHeight = canvas.height;
    var exportWidth = 1280; var exportHeight = 720; // Resolução HD Paisagem

    function processar() {
        if (idx < paginas.length) {
            
            canvas.loadFromJSON(paginas[idx], function() {
                // Configura tamanho e FORÇA FUNDO BRANCO para a "folha de sulfite"
                canvas.setWidth(exportWidth); canvas.setHeight(exportHeight);
                canvas.setBackgroundColor('white', canvas.renderAll.bind(canvas));
                canvas.getObjects().forEach(o => { if (o.id_tipo === 'medida') { if (o.sub_tipo === 'instalado') totais.redeInstalada += o.valor_metragem; if (o.sub_tipo === 'retirado') totais.redeRetirada += o.valor_metragem; if (o.sub_tipo === 'cordoalha') totais.cordoalha += o.valor_metragem; } });
                // Não precisamos remover margens visuais pois elas já não são mais desenhadas

                // AUTO-FIT CENTRALIZADO NA FOLHA 1280x720
                var all = canvas.getObjects();
                if(all.length > 0) {
                    var g = new fabric.Group(all);
                    var topLimit = 60; var bottomLimit = exportHeight - 200;
                    var availableHeight = bottomLimit - topLimit;
                    
                    var scale = Math.min((exportWidth - 60) / g.width, (availableHeight - 40) / g.height);
                    if(scale > 1.5) scale = 1.5; if(scale < 0.5) scale = 0.5;
                    g.scale(scale);
                    
                    g.set({ left: exportWidth / 2, top: (topLimit + bottomLimit) / 2, originX: 'center', originY: 'center' });
                    g.setCoords(); canvas.add(g); g.toActiveSelection(); canvas.discardActiveObject();
                }

                var bw = 340, bh = 180, sx = exportWidth - bw - 20, sy = exportHeight - bh - 20;
                var topo = new fabric.Rect({ width: exportWidth, height: 60, fill: '#3a0057', left: 0, top: 0, selectable: false });
                var txtTopo = new fabric.Text(`PROJETO: ${idProj} | PÁG ${idx+1}/${paginas.length} | ${txtOc} | TÉC: ${nome.toUpperCase()} | DATA: ${hoje}`, { fontSize: 16, fill: 'white', fontWeight: 'bold', fontFamily: 'Roboto', left: 20, top: 20, selectable: false });
                var res = new fabric.Rect({ width: bw, height: bh, fill: 'white', stroke: '#660099', strokeWidth: 2, rx: 5, ry: 5, left: sx, top: sy, selectable: false });
                var txtRes = new fabric.Text(`RESUMO (ACUMULADO)\nInstalado: ${totais.redeInstalada}m\nRetirado:  ${totais.redeRetirada}m`, { fontSize: 14, fill: '#333', fontFamily: 'Courier New', left: sx + 10, top: sy + 10, selectable: false });
                canvas.add(topo, txtTopo, res, txtRes);

                // Gera imagem com fundo branco
                var url = canvas.toDataURL({ format: 'png', quality: 1, multiplier: 1 });
                var a = document.createElement('a'); a.download = `${idProj}_Pg${idx+1}.png`; a.href = url; document.body.appendChild(a); a.click(); document.body.removeChild(a);
                idx++; setTimeout(processar, 1000);
            });
        } else {
            gerarExcel(totais, { nome, sobrenome, re, at, cabo: caboPad, primaria: primPad, idProjeto: idProj, hoje, tipoObra: txtOc });
            
            // Restaura tamanho e fundo transparente para edição
            canvas.setWidth(originalWidth); canvas.setHeight(originalHeight);
            canvas.setBackgroundColor(null, canvas.renderAll.bind(canvas));
            paginaAtual = pOriginal; carregarPagina(pOriginal);
        }
    }
    alert("Gerando Imagens (Folha Branca)..."); processar();
}

function gerarExcel(d, i) {
    let l = [{ Item: "PROJETO", Qtd: i.idProjeto }, { Item: "TÉCNICO", Qtd: i.nome }, { Item: "INSTALAÇÃO", Qtd: d.redeInstalada }, { Item: "RETIRADA", Qtd: d.redeRetirada }, { Item: "CORDOALHA", Qtd: d.cordoalha }];
    if (d.itensExtras.length > 0) d.itensExtras.forEach(e => { l.push({ Item: e.item, Qtd: e.qtd }); });
    var ws = XLSX.utils.json_to_sheet(l); var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Materiais"); XLSX.writeFile(wb, i.idProjeto + ".xlsx"); alert("Sucesso!");
}

// Inicializa
atualizarBitolas();
carregarPagina(0);