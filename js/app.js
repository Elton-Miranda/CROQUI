var canvas = new fabric.Canvas('c');
var line, arrowHead;
var isDrawingLine = false;
var modoLinha = null;
var listaMateriaisManuais = []; 

// --- FUNÇÃO NOVO CROQUI ---
function novoCroqui() {
    if (confirm("Tem certeza que deseja apagar tudo e começar um NOVO croqui?")) {
        canvas.clear(); 
        resetFerramentas(); 
        listaMateriaisManuais = []; 
    }
}

// --- GESTÃO DE MODAIS ---
function abrirAjuda() { document.getElementById('modalAjuda').style.display = 'flex'; }

function abrirModalSalvar() { 
    document.getElementById('modalSalvar').style.display = 'flex';
    renderListaMateriais();
}

function fecharModais() { 
    document.getElementById('modalAjuda').style.display = 'none'; 
    document.getElementById('modalSalvar').style.display = 'none'; 
}

// --- LÓGICA DE MATERIAIS MANUAIS ---
function addMaterialManual() {
    let nome = document.getElementById('manualItem').value;
    let qtd = document.getElementById('manualQtd').value;

    if (!nome || !qtd) {
        alert("Preencha Nome e Quantidade");
        return;
    }

    listaMateriaisManuais.push({ item: nome, qtd: qtd });
    document.getElementById('manualItem').value = "";
    document.getElementById('manualQtd').value = "";
    document.getElementById('manualItem').focus();
    renderListaMateriais();
}

function renderListaMateriais() {
    let ul = document.getElementById('listaMateriaisVisivel');
    ul.innerHTML = "";
    if (listaMateriaisManuais.length === 0) {
        ul.innerHTML = "<li style='color:#999; text-align:center;'>Nenhum item extra adicionado.</li>";
        return;
    }
    listaMateriaisManuais.forEach((mat, index) => {
        let li = document.createElement("li");
        li.style.borderBottom = "1px solid #ddd";
        li.style.padding = "4px 0";
        li.style.display = "flex";
        li.style.justifyContent = "space-between";
        li.innerHTML = `<span><b>${mat.qtd}</b> x ${mat.item}</span> <button onclick="removerMaterialManual(${index})" style="width:auto; height:20px; font-size:10px; background:#c0392b; color:white; padding:0 5px;">X</button>`;
        ul.appendChild(li);
    });
}

function removerMaterialManual(index) {
    listaMateriaisManuais.splice(index, 1);
    renderListaMateriais();
}

window.onclick = function(event) {
    if (event.target == document.getElementById('modalAjuda')) fecharModais();
    if (event.target == document.getElementById('modalSalvar')) fecharModais();
}

// --- DRAG & DROP E FERRAMENTAS ---
function drag(ev, tipo) { ev.dataTransfer.setData("tipoObjeto", tipo); }
var dropZone = document.getElementById('dropZone');
dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.querySelector('.canvas-wrapper').classList.add('drag-over'); });
dropZone.addEventListener('dragleave', function(e) { dropZone.querySelector('.canvas-wrapper').classList.remove('drag-over'); });
dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    dropZone.querySelector('.canvas-wrapper').classList.remove('drag-over');
    var tipo = e.dataTransfer.getData("tipoObjeto");
    var pointer = canvas.getPointer(e);
    if(tipo === 'posteXC') addPoste('XC', pointer.x, pointer.y);
    if(tipo === 'posteXM') addPoste('XM', pointer.x, pointer.y);
    if(tipo === 'subidaLateral') addSubidaLateral(pointer.x, pointer.y);
    if(tipo === 'ceoExist') addCEO(true, pointer.x, pointer.y);
    if(tipo === 'ceoNova') addCEO(false, pointer.x, pointer.y);
    if(tipo === 'cs') addCS(pointer.x, pointer.y);
    if(tipo.startsWith('ctop')) { let parts = tipo.split('-'); addCTOP(parts[1], parts[2], pointer.x, pointer.y); }
});

function resetFerramentas() {
    modoLinha = null; isDrawingLine = false;
    document.getElementById('btnInstall').classList.remove('ativo');
    document.getElementById('btnRet').classList.remove('ativo');
    document.getElementById('btnExist').classList.remove('ativo'); 
    document.getElementById('btnCord').classList.remove('ativo');
    document.getElementById('btnArrow').classList.remove('ativo');
    document.getElementById('btnPare').classList.remove('ativo');
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
var startX, startY;
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
canvas.on('mouse:down', function(o){
    if (!modoLinha) return;
    isDrawingLine = true;
    var pointer = canvas.getPointer(o.e);
    if (modoLinha !== 'seta') {
        var snapStart = getMagnetPoint(pointer); startX = snapStart.x; startY = snapStart.y;
    } else { startX = pointer.x; startY = pointer.y; }
    var points = [ startX, startY, startX, startY ];
    
    var cor, largura, dash;
    if (modoLinha === 'instalar') { cor = '#e74c3c'; largura = 4; dash = null; } 
    else if (modoLinha === 'retirar') { cor = '#2ecc71'; largura = 4; dash = null; }
    else if (modoLinha === 'existente') { cor = '#000000'; largura = 4; dash = null; } 
    else if (modoLinha === 'cordoalha') { cor = '#3498db'; largura = 2; dash = [10, 5]; }
    else if (modoLinha === 'seta') { cor = '#c0392b'; largura = 3; dash = null; }
    
    line = new fabric.Line(points, { strokeWidth: largura, stroke: cor, strokeDashArray: dash, originX: 'center', originY: 'center', selectable: false });
    canvas.add(line);
    if (modoLinha === 'seta') {
        arrowHead = new fabric.Triangle({ width: 15, height: 15, fill: cor, left: startX, top: startY, originX: 'center', originY: 'center', selectable: false, angle: 90 });
        canvas.add(arrowHead);
    }
});
canvas.on('mouse:move', function(o){
    if (!isDrawingLine) return;
    var pointer = canvas.getPointer(o.e);
    var targetX = pointer.x; var targetY = pointer.y;
    if (modoLinha !== 'seta') {
        var magnet = getMagnetPoint(pointer); targetX = magnet.x; targetY = magnet.y;
        if (targetX === pointer.x && targetY === pointer.y) {
            if (Math.abs(targetY - startY) < 20) targetY = startY; else if (Math.abs(targetX - startX) < 20) targetX = startX;
        }
    }
    line.set({ x2: targetX, y2: targetY });
    if (modoLinha === 'seta' && arrowHead) {
        arrowHead.set({ left: targetX, top: targetY });
        var dx = targetX - startX; var dy = targetY - startY;
        var angle = Math.atan2(dy, dx) * 180 / Math.PI;
        arrowHead.set({ angle: angle + 90 });
    }
    canvas.renderAll();
});
canvas.on('mouse:up', function(o){ 
    isDrawingLine = false; 
    if(line) {
        line.setCoords();
        if (modoLinha === 'seta' && arrowHead) {
            var group = new fabric.Group([line, arrowHead]);
            group.set('id_tipo', 'seta_desenho'); 
            canvas.remove(line); canvas.remove(arrowHead); canvas.add(group); 
        }
        resetFerramentas(); 
    }
});

// --- OBJETOS ---
function addObservacao() {
    resetFerramentas();
    var textObj = new fabric.Textbox("12 Fusões\n2 Conectores", { 
        width: 250, fontSize: 14, fill: '#0a0a0aff', backgroundColor: '#e6e5e5ff', fontFamily: 'Roboto', textAlign: 'left', originX: 'center', originY: 'center', 
        splitByGrapheme: true, editable: true, left: canvas.width/2, top: canvas.height/2, padding: 10, borderColor: '#ac00e0ff', borderWidth: 1
    });
    textObj.set('id_tipo', 'observacao_texto'); canvas.add(textObj); canvas.setActiveObject(textObj);
}
function addPoste(tipo, x, y) {
    var circle = new fabric.Circle({ radius: 8, fill: '#047ffaff', left: 0, top: 0, originX: 'center', originY: 'center' });
    var text = new fabric.Text(tipo, { fontSize: 20, fontWeight: 'bold', left: -15, top: -50, fontFamily: 'Roboto' });
    var group = new fabric.Group([ circle, text ], { left: x, top: y, originX: 'center', originY: 'center' });
    group.set('id_tipo', 'poste'); group.set('sub_tipo', tipo); canvas.add(group);
}
function addCEO(existente, x, y) {
    if (existente) {
        var circle = new fabric.Circle({ radius: 15, fill: '#2c3e50', stroke: '#2c3e50', originX: 'center', originY: 'center' });
        var group = new fabric.Group([circle], { left: x, top: y, originX: 'center', originY: 'center' });
        group.set('id_tipo', 'ceo_existente'); canvas.add(group);
    } else {
        var circle = new fabric.Circle({ radius: 15, fill: 'white', stroke: '#2c3e50', strokeWidth: 3, originX: 'center', originY: 'center' });
        var group = new fabric.Group([circle], { left: x, top: y, originX: 'center', originY: 'center' });
        group.set('id_tipo', 'ceo_nova'); canvas.add(group);
    }
}
function addCS(x, y) {
    let numero = prompt("Número da CS (Digite 00 para S/N):", "");
    if (numero !== null) {
        let label = (numero === "0" || numero === "00" || numero === "000") ? "CS S/N" : "CS " + numero.substring(0, 3);
        var rect = new fabric.Rect({ width: 60, height: 35, fill: '#bdc3c7', stroke: '#34495e', strokeWidth: 2, rx: 2, ry: 2, originX: 'center', originY: 'center' });
        var text = new fabric.Text(label, { fontSize: 14, fill: '#2c3e50', fontWeight: 'bold', fontFamily: 'Roboto', originX: 'center', originY: 'center' });
        var group = new fabric.Group([rect, text], { left: x, top: y, originX: 'center', originY: 'center' });
        group.set('id_tipo', 'caixa_subterranea'); canvas.add(group);
    }
}
function addSubidaLateral(x, y) {
    var polyline = new fabric.Polyline([ {x: 0, y: 0}, {x: 20, y: 0}, {x: 30, y: -30}, {x: 40, y: 30}, {x: 50, y: 0}, {x: 70, y: 0} ], { fill: 'transparent', stroke: 'red', strokeWidth: 3, left: x, top: y, originX: 'center', originY: 'center' });
    canvas.add(polyline);
}
function addCTOP(cor, range, x, y) {
    var hexColor = cor.startsWith('#') ? cor : '#' + cor;
    var rect = new fabric.Rect({ width: 35, height: 35, fill: hexColor, stroke: '#333', strokeWidth: 1, originX: 'center', originY: 'center' });
    var text = new fabric.Text(range, { fontSize: 12, backgroundColor: 'rgba(255,255,255,0.9)', top: 20, fontFamily: 'Roboto', originX: 'center' });
    var group = new fabric.Group([rect, text], { left: x, top: y, originX: 'center', originY: 'center' });
    group.set('id_tipo', 'ctop'); group.set('sub_tipo', range); canvas.add(group);
}
function addMedida(tipo) {
    resetFerramentas();
    let label = "", corFundo = "";
    if (tipo === 'instalado') { label = "Rede Nova"; corFundo = "#FFD700"; }
    if (tipo === 'retirado') { label = "Rede Ret."; corFundo = "#a9dfbf"; }
    if (tipo === 'existente') { label = "Rede Exist."; corFundo = "#ecf0f1"; }
    if (tipo === 'cordoalha') { label = "Cordoalha"; corFundo = "#aed6f1"; }
    
    let metros = prompt("Metragem " + label + " (m):", "40");
    if (metros) {
        var text = new fabric.Text(label + ": " + metros + "m", { fontSize: 16, fontWeight: 'bold', backgroundColor: corFundo, left: canvas.width/2, top: canvas.height/2, padding: 5, originX: 'center', originY: 'center' });
        text.set('id_tipo', 'medida'); text.set('sub_tipo', tipo); text.set('valor_metragem', parseFloat(metros)); canvas.add(text);
    }
}
function addNomeRua() {
    resetFerramentas();
    let nomeRua = prompt("Nome da Rua / Nº:", "Rua Exemplo, 123");
    if (nomeRua) {
        var text = new fabric.Text(nomeRua, { fontSize: 24, fontFamily: 'Roboto', fill: '#2980b9', fontWeight: 'bold', left: canvas.width/2, top: 50, originX: 'center' });
        canvas.add(text);
    }
}
function addEtiquetaCabo() {
    resetFerramentas();
    var txt = document.getElementById('tipoCabo').value + " " + document.getElementById('bitolaCabo').value;
    var text = new fabric.Text(txt, { fontSize: 14, backgroundColor: '#fff3cd', left: canvas.width/2, top: canvas.height/2, padding: 6, stroke: '#333', strokeWidth: 0.2, originX: 'center', originY: 'center' });
    canvas.add(text);
}
function atualizarBitolas() {
    var tipo = document.getElementById("tipoCabo").value;
    var selectBitola = document.getElementById("bitolaCabo");
    selectBitola.innerHTML = "";
    var opcoes = (tipo === "DROP") ? ["01", "04"] : ["12", "24", "36", "48", "72", "144"];
    opcoes.forEach(v => { var opt = document.createElement("option"); opt.value = v; opt.innerHTML = v + " FO"; selectBitola.appendChild(opt); });
}
function deleteSelected() { var activeObjects = canvas.getActiveObjects(); if (activeObjects.length) { canvas.discardActiveObject(); activeObjects.forEach(o => canvas.remove(o)); } }
document.addEventListener('keydown', function(e) { if(e.key === "Delete") { deleteSelected(); } if(e.key === "Escape") { resetFerramentas(); } });

// --- LÓGICA DE SALVAMENTO ---
function confirmarSalvar() {
    let nome = document.getElementById('inputNome').value;
    let sobrenome = document.getElementById('inputSobrenome').value;
    let re = document.getElementById('inputRE').value;
    let at = document.getElementById('inputAT').value.toUpperCase();
    let cabo = document.getElementById('inputCabo').value;
    let primaria = document.getElementById('inputPrimaria').value;
    
    let ocorrenciaInput = document.getElementById('inputOcorrencia').value;
    let textoOcorrencia = "";
    if (ocorrenciaInput && ocorrenciaInput.trim() !== "") {
        textoOcorrencia = "OC: " + ocorrenciaInput;
    } else {
        textoOcorrencia = "LEVANTAMENTO DE OBRA";
    }

    if (parseInt(primaria) > 144) {
        alert("O número da Primária NÃO pode ser maior que 144!");
        return;
    }

    if (!nome || !sobrenome || !re || !at || !cabo || !primaria) {
        alert("Todos os campos obrigatórios (Nome, RE, AT, Cabo, Primária) devem ser preenchidos!");
        return;
    }

    let caboPad = cabo.toString().padStart(2, '0');      
    let primPad = primaria.toString().padStart(2, '0');  
    let idProjeto = `${at}${caboPad}-F#${primPad}`;      
    let hoje = new Date().toLocaleDateString('pt-BR');

    fecharModais();
    resetFerramentas();

    let dados = { redeInstalada: 0, redeRetirada: 0, redeExistente: 0, cordoalha: 0, postesXC: 0, postesXM: 0, ceoNova: 0, ceoExistente: 0, csCount: 0, ctops: {}, observacoes: [], itensExtras: [] };
    
    canvas.getObjects().forEach(function(obj) {
        if (obj.id_tipo === 'medida') {
            if (obj.sub_tipo === 'instalado') dados.redeInstalada += obj.valor_metragem;
            if (obj.sub_tipo === 'retirado') dados.redeRetirada += obj.valor_metragem;
            if (obj.sub_tipo === 'cordoalha') dados.cordoalha += obj.valor_metragem;
            if (obj.sub_tipo === 'existente') dados.redeExistente += obj.valor_metragem;
        }
        if (obj.id_tipo === 'ceo_nova') { dados.ceoNova++; } 
        if (obj.id_tipo === 'ceo_existente') dados.ceoExistente++;
        if (obj.id_tipo === 'caixa_subterranea') dados.csCount++;
        if (obj.id_tipo === 'poste') {
            if (obj.sub_tipo === 'XC') dados.postesXC++;
            if (obj.sub_tipo === 'XM') dados.postesXM++;
        }
        if (obj.id_tipo === 'ctop') {
            let r = obj.sub_tipo; if(!dados.ctops[r]) dados.ctops[r] = 0; dados.ctops[r]++;
        }
        if (obj.id_tipo === 'observacao_texto') {
            dados.observacoes.push(obj.text); 
        }
    });

    listaMateriaisManuais.forEach(mat => {
        dados.itensExtras.push({ qtd: mat.qtd, item: mat.item });
    });

    var textoTopo = `CROQUI ${idProjeto}  |  ${textoOcorrencia}  |  TÉC: ${nome.toUpperCase()} ${sobrenome.toUpperCase()}  |  DATA: ${hoje}`;
    var boxHeader = new fabric.Rect({ width: 1100, height: 50, fill: '#3a0057', left: 0, top: 0, selectable: false });
    var txtHeader = new fabric.Text(textoTopo, { fontSize: 18, fill: 'white', fontWeight: 'bold', fontFamily: 'Roboto', left: 20, top: 15, selectable: false });
    canvas.add(boxHeader); canvas.add(txtHeader);

    var textoSelo = 
        `PROJETO: ${idProjeto}\n` +
        `TÉCNICO: ${nome.toUpperCase()} ${sobrenome.toUpperCase()}\n` +
        `DATA:    ${hoje}\n` +
        `OC:      ${textoOcorrencia}\n` +
        `------------------------------\n` +
        `RESUMO DE CABOS\n` +
        `Instalado: ${dados.redeInstalada}m\n` +
        `Retirado:  ${dados.redeRetirada}m`;

    var boxResumo = new fabric.Rect({ width: 340, height: 180, fill: 'white', stroke: '#660099', strokeWidth: 2, rx: 5, ry: 5, left: canvas.width - 360, top: canvas.height - 200, selectable: false });
    var txtResumo = new fabric.Text(textoSelo, { fontSize: 14, fill: '#333', fontFamily: 'Courier New', left: canvas.width - 350, top: canvas.height - 190, selectable: false });
    
    canvas.add(boxResumo); canvas.add(txtResumo);
    canvas.renderAll();

    let userInfo = { nome, sobrenome, re, at, cabo: caboPad, primaria: primPad, idProjeto, hoje, tipoObra: textoOcorrencia };
    
    setTimeout(function() {
        var dataURL = canvas.toDataURL({ format: 'png', quality: 1, multiplier: 2 });
        var link = document.createElement('a'); 
        link.download = idProjeto + '.png'; 
        link.href = dataURL; 
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        
        gerarExcel(dados, userInfo);
    }, 500);
}

function gerarExcel(dados, info) {
    let linhas = [
        { Item: "PROJETO", Quantidade: info.idProjeto, Unidade: "" },
        { Item: "TIPO", Quantidade: info.tipoObra, Unidade: "" },
        { Item: "TÉCNICO", Quantidade: info.nome + " " + info.sobrenome, Unidade: "" },
        { Item: "REGISTRO (RE)", Quantidade: info.re, Unidade: "" },
        { Item: "DATA", Quantidade: info.hoje, Unidade: "" },
        { Item: "", Quantidade: "", Unidade: "" },
        { Item: "--- CABOS E CORDOALHA ---", Quantidade: "", Unidade: "" },
        { Item: "CABO (INSTALAÇÃO)", Quantidade: dados.redeInstalada, Unidade: "Metros" },
        { Item: "CABO (RETIRADA)", Quantidade: dados.redeRetirada, Unidade: "Metros" },
        { Item: "CORDOALHA", Quantidade: dados.cordoalha, Unidade: "Metros" }
    ];
    
    // --- ALTERAÇÃO AQUI: Removemos os loops de Postes, Caixas e CTOPs automáticos do Excel ---
    
    // Lista de Materiais Manuais (A "Última Etapa")
    if (dados.itensExtras.length > 0) {
        linhas.push({ Item: "", Quantidade: "", Unidade: "" });
        linhas.push({ Item: "--- MATERIAIS EXTRAS (MANUAL) ---", Quantidade: "", Unidade: "" });
        dados.itensExtras.forEach(extra => { linhas.push({ Item: extra.item, Quantidade: extra.qtd, Unidade: "Und" }); });
    }
    
    var ws = XLSX.utils.json_to_sheet(linhas);
    var wscols = [{wch:30}, {wch:20}, {wch:10}]; ws['!cols'] = wscols;
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Levantamento");
    XLSX.writeFile(wb, info.idProjeto + ".xlsx");
    alert("Croqui salvo com sucesso: " + info.idProjeto);
}

atualizarBitolas();