var canvas = new fabric.Canvas('c');
var line, arrowHead;
var isDrawingLine = false;
var modoLinha = null;
var listaMateriaisManuais = []; 

// --- VARIÁVEIS MULTI-PÁGINAS ---
var paginas = [{ objects: [] }]; 
var paginaAtual = 0; 

// --- PROPRIEDADES PARA EXPORTAR ---
var propsParaSalvar = ['id_tipo', 'sub_tipo', 'valor_metragem', 'lockMovementX', 'lockMovementY', 'selectable', 'evented'];

// --- FUNÇÕES DE PAGINAÇÃO ---
function salvarEstadoPaginaAtual() {
    var json = canvas.toJSON(propsParaSalvar);
    json.objects = json.objects.filter(o => o.id_tipo !== 'margem_seguranca');
    paginas[paginaAtual] = json;
}

function carregarPagina(index) {
    canvas.clear(); 
    var dados = paginas[index];
    
    canvas.loadFromJSON(dados, function() {
        desenharMargensSeguranca();
        canvas.renderAll();
        atualizarIndicadorPagina();
    });
}

function mudarPagina(direcao) {
    salvarEstadoPaginaAtual();
    var novaPagina = paginaAtual + direcao;
    if (novaPagina < 0 || novaPagina >= paginas.length) return;
    paginaAtual = novaPagina;
    carregarPagina(paginaAtual);
}

function adicionarPagina() {
    salvarEstadoPaginaAtual();
    paginas.push({ objects: [] }); 
    paginaAtual = paginas.length - 1;
    carregarPagina(paginaAtual);
}

function removerPaginaAtual() {
    if (paginas.length <= 1) { alert("O projeto deve ter pelo menos uma página."); return; }
    if (!confirm("Tem certeza que deseja EXCLUIR a Página " + (paginaAtual + 1) + "?")) return;
    paginas.splice(paginaAtual, 1);
    if (paginaAtual >= paginas.length) paginaAtual = paginas.length - 1;
    carregarPagina(paginaAtual);
}

function atualizarIndicadorPagina() {
    document.getElementById('indicadorPagina').innerText = "Página " + (paginaAtual + 1) + " de " + paginas.length;
}

// --- FUNÇÃO DE GUARDA (ÁREAS PROIBIDAS) ---
function pontoEstaEmAreaProibida(x, y) {
    if (y < 50) return true;
    var limiteX = canvas.width - 360;
    var limiteY = canvas.height - 200;
    if (x > limiteX && y > limiteY) return true;
    return false;
}

// --- DESENHO DAS MARGENS VISUAIS ---
function desenharMargensSeguranca() {
    var objetos = canvas.getObjects();
    objetos.forEach(function(o) { if(o.id_tipo === 'margem_seguranca') canvas.remove(o); });

    var linhaTopo = new fabric.Line([0, 50, 1100, 50], { strokeDashArray: [5, 5], stroke: 'red', opacity: 0.3, selectable: false, evented: false, id_tipo: 'margem_seguranca' });
    var textoTopo = new fabric.Text("ÁREA DO CABEÇALHO (PÁG " + (paginaAtual+1) + ")", { left: 10, top: 10, fontSize: 10, fill: 'red', opacity: 0.5, selectable: false, evented: false, id_tipo: 'margem_seguranca' });

    var rectFooter = new fabric.Rect({ width: 340, height: 180, left: canvas.width - 360, top: canvas.height - 200, fill: 'rgba(255, 0, 0, 0.05)', stroke: 'red', strokeDashArray: [5, 5], opacity: 0.3, selectable: false, evented: false, id_tipo: 'margem_seguranca' });
    var textoFooter = new fabric.Text("ÁREA DO CARIMBO", { left: canvas.width - 350, top: canvas.height - 190, fontSize: 10, fill: 'red', opacity: 0.5, selectable: false, evented: false, id_tipo: 'margem_seguranca' });

    canvas.add(linhaTopo); canvas.add(textoTopo); canvas.add(rectFooter); canvas.add(textoFooter);
    canvas.sendToBack(linhaTopo); canvas.sendToBack(textoTopo); canvas.sendToBack(rectFooter); canvas.sendToBack(textoFooter);
}

// --- FUNÇÃO NOVO CROQUI ---
function novoCroqui() {
    if (confirm("Tem certeza que deseja apagar TODO O PROJETO e começar do zero?")) {
        paginas = [{ objects: [] }];
        paginaAtual = 0;
        listaMateriaisManuais = [];
        carregarPagina(0); 
        resetFerramentas(); 
    }
}

// --- GESTÃO DE MODAIS ---
function abrirAjuda() { document.getElementById('modalAjuda').style.display = 'flex'; }
function abrirModalSalvar() { document.getElementById('modalSalvar').style.display = 'flex'; renderListaMateriais(); }
function fecharModais() { document.getElementById('modalAjuda').style.display = 'none'; document.getElementById('modalSalvar').style.display = 'none'; }
window.onclick = function(event) { if (event.target == document.getElementById('modalAjuda')) fecharModais(); if (event.target == document.getElementById('modalSalvar')) fecharModais(); }

// --- MATERIAIS MANUAIS ---
function addMaterialManual() {
    let nome = document.getElementById('manualItem').value; let qtd = document.getElementById('manualQtd').value;
    if (!nome || !qtd) { alert("Preencha Nome e Quantidade"); return; }
    listaMateriaisManuais.push({ item: nome, qtd: qtd });
    document.getElementById('manualItem').value = ""; document.getElementById('manualQtd').value = "";
    document.getElementById('manualItem').focus(); renderListaMateriais();
}
function renderListaMateriais() {
    let ul = document.getElementById('listaMateriaisVisivel'); ul.innerHTML = "";
    if (listaMateriaisManuais.length === 0) { ul.innerHTML = "<li style='color:#999; text-align:center;'>Nenhum item extra adicionado.</li>"; return; }
    listaMateriaisManuais.forEach((mat, index) => {
        let li = document.createElement("li");
        li.style.borderBottom = "1px solid #ddd"; li.style.padding = "4px 0"; li.style.display = "flex"; li.style.justifyContent = "space-between";
        li.innerHTML = `<span><b>${mat.qtd}</b> x ${mat.item}</span> <button onclick="removerMaterialManual(${index})" style="width:auto; height:20px; font-size:10px; background:#c0392b; color:white; padding:0 5px;">X</button>`;
        ul.appendChild(li);
    });
}
function removerMaterialManual(index) { listaMateriaisManuais.splice(index, 1); renderListaMateriais(); }

// --- DRAG & DROP ---
function drag(ev, tipo) { ev.dataTransfer.setData("tipoObjeto", tipo); }
var dropZone = document.getElementById('dropZone');
dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.querySelector('.canvas-wrapper').classList.add('drag-over'); });
dropZone.addEventListener('dragleave', function(e) { dropZone.querySelector('.canvas-wrapper').classList.remove('drag-over'); });
dropZone.addEventListener('drop', function(e) {
    e.preventDefault(); dropZone.querySelector('.canvas-wrapper').classList.remove('drag-over');
    var pointer = canvas.getPointer(e);
    
    if (pontoEstaEmAreaProibida(pointer.x, pointer.y)) { alert("🚫 Área proibida (Cabeçalho ou Carimbo)."); return; }
    
    var tipo = e.dataTransfer.getData("tipoObjeto");
    if(tipo === 'posteXC') addPoste('XC', pointer.x, pointer.y);
    if(tipo === 'posteXM') addPoste('XM', pointer.x, pointer.y);
    if(tipo === 'subidaLateral') addSubidaLateral(pointer.x, pointer.y);
    if(tipo === 'ceoExist') addCEO(true, pointer.x, pointer.y);
    if(tipo === 'ceoNova') addCEO(false, pointer.x, pointer.y);
    if(tipo === 'cs') addCS(pointer.x, pointer.y);
    if(tipo.startsWith('ctop')) { let parts = tipo.split('-'); addCTOP(parts[1], parts[2], pointer.x, pointer.y); }
});

// --- FERRAMENTAS ---
function resetFerramentas() {
    modoLinha = null; isDrawingLine = false; document.querySelectorAll('button').forEach(b => b.classList.remove('ativo')); 
    canvas.selection = true; canvas.defaultCursor = 'default';
    canvas.forEachObject(function(o) { o.selectable = true; });
}
function ativarModoLinha(modo) {
    resetFerramentas(); modoLinha = modo;
    if (modo) {
        if(modo === 'instalar') document.getElementById('btnInstall').classList.add('ativo');
        if(modo === 'retirar') document.getElementById('btnRet').classList.add('ativo');
        if(modo === 'existente') document.getElementById('btnExist').classList.add('ativo');
        if(modo === 'cordoalha') document.getElementById('btnCord').classList.add('ativo');
        if(modo === 'seta') document.getElementById('btnArrow').classList.add('ativo');
        canvas.selection = false; canvas.defaultCursor = 'crosshair';
        canvas.forEachObject(function(o) { o.selectable = false; });
    } else { document.getElementById('btnPare').classList.add('ativo'); }
}
function getMagnetPoint(pointer) {
    var threshold = 25; var snapped = { x: pointer.x, y: pointer.y };
    canvas.getObjects().forEach(function(obj) {
        if (['poste','ceo_existente','ceo_nova','caixa_subterranea'].includes(obj.id_tipo)) {
            var dist = Math.sqrt(Math.pow(pointer.x - obj.left, 2) + Math.pow(pointer.y - obj.top, 2));
            if (dist < threshold) { snapped.x = obj.left; snapped.y = obj.top; }
        }
    });
    return snapped;
}

// --- EVENTOS MOUSE ---
canvas.on('mouse:down', function(o){
    var pointer = canvas.getPointer(o.e);
    if (modoLinha && pontoEstaEmAreaProibida(pointer.x, pointer.y)) { alert("🚫 Margem proibida."); isDrawingLine = false; return; }
    
    // Cópia CTRL
    if (!modoLinha && o.e.ctrlKey && o.target) {
        var obj = o.target; obj.lockMovementX = true; obj.lockMovementY = true;
        obj.clone(function(cloned) {
            cloned.set({ left: obj.left, top: obj.top, evented: true });
            if (obj.id_tipo) cloned.set('id_tipo', obj.id_tipo);
            if (obj.sub_tipo) cloned.set('sub_tipo', obj.sub_tipo);
            if (obj.valor_metragem) cloned.set('valor_metragem', obj.valor_metragem);
            if (obj.fill) cloned.set('fill', obj.fill);
            if (obj.stroke) cloned.set('stroke', obj.stroke);
            canvas.add(cloned); obj.lockMovementX = false; obj.lockMovementY = false;
            canvas.setActiveObject(cloned); canvas.requestRenderAll();
        }, propsParaSalvar);
        return; 
    }

    if (!modoLinha) return;
    isDrawingLine = true;
    if (modoLinha !== 'seta') { var snap = getMagnetPoint(pointer); startX = snap.x; startY = snap.y; } else { startX = pointer.x; startY = pointer.y; }
    var cor, largura, dash;
    if (modoLinha === 'instalar') { cor = '#e74c3c'; largura = 4; dash = null; } 
    else if (modoLinha === 'retirar') { cor = '#2ecc71'; largura = 4; dash = null; }
    else if (modoLinha === 'existente') { cor = '#000000'; largura = 4; dash = null; } 
    else if (modoLinha === 'cordoalha') { cor = '#3498db'; largura = 2; dash = [10, 5]; }
    else if (modoLinha === 'seta') { cor = '#c0392b'; largura = 3; dash = null; }
    line = new fabric.Line([startX, startY, startX, startY], { strokeWidth: largura, stroke: cor, strokeDashArray: dash, originX: 'center', originY: 'center', selectable: false });
    canvas.add(line);
    if (modoLinha === 'seta') { arrowHead = new fabric.Triangle({ width: 15, height: 15, fill: cor, left: startX, top: startY, originX: 'center', originY: 'center', selectable: false, angle: 90 }); canvas.add(arrowHead); }
});

canvas.on('mouse:move', function(o){
    if (!isDrawingLine) return;
    var pointer = canvas.getPointer(o.e); var targetX = pointer.x; var targetY = pointer.y;
    if (modoLinha !== 'seta') {
        var magnet = getMagnetPoint(pointer); targetX = magnet.x; targetY = magnet.y;
        if (targetX === pointer.x && targetY === pointer.y) { if (Math.abs(targetY - startY) < 20) targetY = startY; else if (Math.abs(targetX - startX) < 20) targetX = startX; }
    }
    line.set({ x2: targetX, y2: targetY });
    if (modoLinha === 'seta' && arrowHead) { arrowHead.set({ left: targetX, top: targetY }); var angle = Math.atan2(targetY - startY, targetX - startX) * 180 / Math.PI; arrowHead.set({ angle: angle + 90 }); }
    canvas.renderAll();
});

canvas.on('mouse:up', function(o){ 
    isDrawingLine = false; 
    if(line) {
        if (pontoEstaEmAreaProibida(line.x2, line.y2)) { canvas.remove(line); if(arrowHead) canvas.remove(arrowHead); alert("🚫 Fim do cabo em área proibida."); line = null; arrowHead = null; resetFerramentas(); return; }
        line.setCoords();
        if (modoLinha === 'seta' && arrowHead) { var group = new fabric.Group([line, arrowHead]); group.set('id_tipo', 'seta_desenho'); canvas.remove(line); canvas.remove(arrowHead); canvas.add(group); }
        resetFerramentas(); 
    }
});

// --- OBJETOS (CORRIGIDO) ---
function addObservacao() {
    resetFerramentas();
    
    // Verifica se está tentando criar em cima do cabeçalho/carimbo
    if (pontoEstaEmAreaProibida(canvas.width/2, canvas.height/2)) {
        alert("Não é possível criar notas na área de margem."); 
        return;
    }

    var textObj = new fabric.Textbox("Clique duas vezes para editar...\n(Arraste a lateral para alargar)", { 
        width: 300,             
        fontSize: 16,           
        fontFamily: 'Roboto', 
        fill: '#856404',        
        backgroundColor: '#fff3cd', 
        borderColor: '#e0a800', 
        borderWidth: 1,
        textAlign: 'left',      
        originX: 'center', 
        originY: 'center', 
        splitByGrapheme: false, 
        editable: true, 
        left: canvas.width/2, 
        top: canvas.height/2, 
        padding: 15,            
        hasControls: true,      
        minWidth: 100           
    });

    textObj.set('id_tipo', 'observacao_texto'); 
    canvas.add(textObj); 
    canvas.setActiveObject(textObj);
}

function addPoste(tipo, x, y) { var c = new fabric.Circle({ radius: 8, fill: '#047ffaff', left: 0, top: 0, originX: 'center', originY: 'center' }); var t = new fabric.Text(tipo, { fontSize: 20, fontWeight: 'bold', left: -15, top: -50, fontFamily: 'Roboto' }); var g = new fabric.Group([ c, t ], { left: x, top: y, originX: 'center', originY: 'center' }); g.set('id_tipo', 'poste'); g.set('sub_tipo', tipo); canvas.add(g); }
function addCEO(existente, x, y) { if (existente) { var c = new fabric.Circle({ radius: 15, fill: '#2c3e50', stroke: '#2c3e50', originX: 'center', originY: 'center' }); var g = new fabric.Group([c], { left: x, top: y, originX: 'center', originY: 'center' }); g.set('id_tipo', 'ceo_existente'); canvas.add(g); } else { var c = new fabric.Circle({ radius: 15, fill: 'white', stroke: '#2c3e50', strokeWidth: 3, originX: 'center', originY: 'center' }); var g = new fabric.Group([c], { left: x, top: y, originX: 'center', originY: 'center' }); g.set('id_tipo', 'ceo_nova'); canvas.add(g); } }
function addCS(x, y) { let numero = prompt("Número da CS:", ""); if (numero !== null) { let label = (numero === "0" || numero === "00") ? "CS S/N" : "CS " + numero.substring(0, 3); var r = new fabric.Rect({ width: 60, height: 35, fill: '#bdc3c7', stroke: '#34495e', strokeWidth: 2, rx: 2, ry: 2, originX: 'center', originY: 'center' }); var t = new fabric.Text(label, { fontSize: 14, fill: '#2c3e50', fontWeight: 'bold', fontFamily: 'Roboto', originX: 'center', originY: 'center' }); var g = new fabric.Group([r, t], { left: x, top: y, originX: 'center', originY: 'center' }); g.set('id_tipo', 'caixa_subterranea'); canvas.add(g); } }
function addSubidaLateral(x, y) { var p = new fabric.Polyline([ {x: 0, y: 0}, {x: 20, y: 0}, {x: 30, y: -30}, {x: 40, y: 30}, {x: 50, y: 0}, {x: 70, y: 0} ], { fill: 'transparent', stroke: 'red', strokeWidth: 3, left: x, top: y, originX: 'center', originY: 'center' }); canvas.add(p); }
function addCTOP(cor, range, x, y) { var hex = cor.startsWith('#') ? cor : '#' + cor; var r = new fabric.Rect({ width: 35, height: 35, fill: hex, stroke: '#333', strokeWidth: 1, originX: 'center', originY: 'center' }); var t = new fabric.Text(range, { fontSize: 12, backgroundColor: 'rgba(255,255,255,0.9)', top: 20, fontFamily: 'Roboto', originX: 'center' }); var g = new fabric.Group([r, t], { left: x, top: y, originX: 'center', originY: 'center' }); g.set('id_tipo', 'ctop'); g.set('sub_tipo', range); canvas.add(g); }
function addMedida(tipo) { resetFerramentas(); if (pontoEstaEmAreaProibida(canvas.width/2, canvas.height/2)) return; let label = "", corFundo = ""; if (tipo === 'instalado') { label = "Rede Nova"; corFundo = "#FFD700"; } if (tipo === 'retirado') { label = "Rede Ret."; corFundo = "#a9dfbf"; } if (tipo === 'existente') { label = "Rede Exist."; corFundo = "#ecf0f1"; } if (tipo === 'cordoalha') { label = "Cordoalha"; corFundo = "#aed6f1"; } let metros = prompt("Metragem " + label + " (m):", "40"); if (metros) { var t = new fabric.Text(label + ": " + metros + "m", { fontSize: 16, fontWeight: 'bold', backgroundColor: corFundo, left: canvas.width/2, top: canvas.height/2, padding: 5, originX: 'center', originY: 'center' }); t.set('id_tipo', 'medida'); t.set('sub_tipo', tipo); t.set('valor_metragem', parseFloat(metros)); canvas.add(t); } }
function addNomeRua() { resetFerramentas(); let nome = prompt("Nome da Rua:", "Rua Exemplo"); if (nome) { var t = new fabric.Text(nome, { fontSize: 24, fontFamily: 'Roboto', fill: '#2980b9', fontWeight: 'bold', left: canvas.width/2, top: 80, originX: 'center' }); canvas.add(t); } }
function addEtiquetaCabo() { resetFerramentas(); if (pontoEstaEmAreaProibida(canvas.width/2, canvas.height/2)) return; var txt = document.getElementById('tipoCabo').value + " " + document.getElementById('bitolaCabo').value; var t = new fabric.Text(txt, { fontSize: 14, backgroundColor: '#fff3cd', left: canvas.width/2, top: canvas.height/2, padding: 6, stroke: '#333', strokeWidth: 0.2, originX: 'center', originY: 'center' }); canvas.add(t); }
function atualizarBitolas() { var tipo = document.getElementById("tipoCabo").value; var selectBitola = document.getElementById("bitolaCabo"); selectBitola.innerHTML = ""; var opcoes = (tipo === "DROP") ? ["01", "04"] : ["12", "24", "36", "48", "72", "144"]; opcoes.forEach(v => { var opt = document.createElement("option"); opt.value = v; opt.innerHTML = v + " FO"; selectBitola.appendChild(opt); }); }
function deleteSelected() { var activeObjects = canvas.getActiveObjects(); if (activeObjects.length) { canvas.discardActiveObject(); activeObjects.forEach(o => canvas.remove(o)); } }
document.addEventListener('keydown', function(e) { if(e.key === "Delete") { deleteSelected(); } if(e.key === "Escape") { resetFerramentas(); } });

// --- SALVAR E EXPORTAR ---
function confirmarSalvar() {
    let nome = document.getElementById('inputNome').value;
    let sobrenome = document.getElementById('inputSobrenome').value;
    let re = document.getElementById('inputRE').value;
    let at = document.getElementById('inputAT').value.toUpperCase();
    let cabo = document.getElementById('inputCabo').value;
    let primaria = document.getElementById('inputPrimaria').value;
    let ocorrenciaInput = document.getElementById('inputOcorrencia').value;
    let textoOcorrencia = (ocorrenciaInput && ocorrenciaInput.trim() !== "") ? "OC: " + ocorrenciaInput : "LEVANTAMENTO DE OBRA";

    if (parseInt(primaria) > 144) { alert("Primária > 144 inválida!"); return; }
    if (!nome || !sobrenome || !re || !at || !cabo || !primaria) { alert("Preencha todos os campos obrigatórios."); return; }

    let caboPad = cabo.toString().padStart(2, '0');      
    let primPad = primaria.toString().padStart(2, '0');  
    let idProjeto = `${at}${caboPad}-F#${primPad}`;      
    let hoje = new Date().toLocaleDateString('pt-BR');

    salvarEstadoPaginaAtual();
    fecharModais(); resetFerramentas();

    let totais = { redeInstalada: 0, redeRetirada: 0, cordoalha: 0, itensExtras: [] };
    listaMateriaisManuais.forEach(mat => { totais.itensExtras.push({ qtd: mat.qtd, item: mat.item }); });

    let paginaOriginal = paginaAtual;
    let indexProcessamento = 0;

    function processarProximaPagina() {
        if (indexProcessamento < paginas.length) {
            canvas.clear();
            canvas.loadFromJSON(paginas[indexProcessamento], function() {
                canvas.getObjects().forEach(function(obj) {
                    if (obj.id_tipo === 'medida') {
                        if (obj.sub_tipo === 'instalado') totais.redeInstalada += obj.valor_metragem;
                        if (obj.sub_tipo === 'retirado') totais.redeRetirada += obj.valor_metragem;
                        if (obj.sub_tipo === 'cordoalha') totais.cordoalha += obj.valor_metragem;
                    }
                });
                canvas.getObjects().forEach(function(o) { if(o.id_tipo === 'margem_seguranca') canvas.remove(o); });
                
                var textoTopo = `PROJETO: ${idProjeto} | PÁG ${indexProcessamento+1}/${paginas.length} | ${textoOcorrencia} | TÉC: ${nome.toUpperCase()} | DATA: ${hoje}`;
                var boxHeader = new fabric.Rect({ width: 1100, height: 50, fill: '#3a0057', left: 0, top: 0, selectable: false });
                var txtHeader = new fabric.Text(textoTopo, { fontSize: 16, fill: 'white', fontWeight: 'bold', fontFamily: 'Roboto', left: 20, top: 15, selectable: false });
                var textoSelo = `RESUMO (ACUMULADO DO PROJETO)\nInstalado: ${totais.redeInstalada}m\nRetirado:  ${totais.redeRetirada}m`;
                var boxResumo = new fabric.Rect({ width: 340, height: 180, fill: 'white', stroke: '#660099', strokeWidth: 2, rx: 5, ry: 5, left: canvas.width - 360, top: canvas.height - 200, selectable: false });
                var txtResumo = new fabric.Text(textoSelo, { fontSize: 14, fill: '#333', fontFamily: 'Courier New', left: canvas.width - 350, top: canvas.height - 190, selectable: false });

                canvas.add(boxHeader); canvas.add(txtHeader); canvas.add(boxResumo); canvas.add(txtResumo);
                
                var dataURL = canvas.toDataURL({ format: 'png', quality: 1, multiplier: 2 });
                var link = document.createElement('a');
                link.download = `${idProjeto}_Pagina${indexProcessamento+1}.png`;
                link.href = dataURL; document.body.appendChild(link); link.click(); document.body.removeChild(link);
                indexProcessamento++;
                setTimeout(processarProximaPagina, 500);
            });
        } else {
            gerarExcel(totais, { nome, sobrenome, re, at, cabo: caboPad, primaria: primPad, idProjeto, hoje, tipoObra: textoOcorrencia });
            paginaAtual = paginaOriginal;
            carregarPagina(paginaAtual);
        }
    }
    alert("Iniciando exportação de " + paginas.length + " páginas. Por favor, aguarde...");
    processarProximaPagina();
}

function gerarExcel(dados, info) {
    let linhas = [
        { Item: "PROJETO", Quantidade: info.idProjeto, Unidade: "" },
        { Item: "TIPO", Quantidade: info.tipoObra, Unidade: "" },
        { Item: "TÉCNICO", Quantidade: info.nome + " " + info.sobrenome, Unidade: "" },
        { Item: "REGISTRO (RE)", Quantidade: info.re, Unidade: "" },
        { Item: "DATA", Quantidade: info.hoje, Unidade: "" },
        { Item: "", Quantidade: "", Unidade: "" },
        { Item: "--- TOTAIS ACUMULADOS ---", Quantidade: "", Unidade: "" },
        { Item: "CABO (INSTALAÇÃO)", Quantidade: dados.redeInstalada, Unidade: "Metros" },
        { Item: "CABO (RETIRADA)", Quantidade: dados.redeRetirada, Unidade: "Metros" },
        { Item: "CORDOALHA", Quantidade: dados.cordoalha, Unidade: "Metros" }
    ];
    if (dados.itensExtras.length > 0) {
        linhas.push({ Item: "", Quantidade: "", Unidade: "" });
        linhas.push({ Item: "--- MATERIAIS EXTRAS ---", Quantidade: "", Unidade: "" });
        dados.itensExtras.forEach(extra => { linhas.push({ Item: extra.item, Quantidade: extra.qtd, Unidade: "Und" }); });
    }
    var ws = XLSX.utils.json_to_sheet(linhas); var wscols = [{wch:30}, {wch:20}, {wch:10}]; ws['!cols'] = wscols;
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Levantamento");
    XLSX.writeFile(wb, info.idProjeto + "_Completo.xlsx");
    alert("Projeto salvo com sucesso!");
}

function toggleMenu() { document.querySelector('.sidebar').classList.toggle('aberto'); }
document.querySelectorAll('.sidebar button').forEach(btn => {
    btn.addEventListener('click', function() { if (window.innerWidth <= 768) { toggleMenu(); } });
});

// --- INICIALIZAÇÃO CORRETA ---
atualizarBitolas();
// Força o carregamento da primeira página para desenhar as margens imediatamente
carregarPagina(0);