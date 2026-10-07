// ==========================================
// CROQUI PRO - TUTORIAL DA NOVA VERSÃO (TUTORIAL.JS)
// ==========================================
// Mostra, na primeira vez que a pessoa abre esta versão, como usar o fluxo
// do mapa: marcar os postes, dizer o que foi feito, gerar o croqui e o PDF.
// Também abre pelo botão "❓ Ajuda". Dá para passar deslizando o dedo.
//
// Para mostrar o tutorial de novo para todo mundo (ex.: numa versão nova),
// troque o nome da chave abaixo (ex.: 'croqui_tutorial_v3_visto').
const CHAVE_TUTORIAL_NOVO = 'croqui_tutorial_v2_visto';

// Ilustrações simples (desenhadas aqui mesmo, sem baixar nada).
const SVG_MAPA_FUNDO = `
  <rect width="240" height="150" rx="12" fill="#eef1f3"/>
  <path d="M-10 52 L250 92" stroke="#fff" stroke-width="16"/>
  <path d="M150 -10 L118 160" stroke="#fff" stroke-width="16"/>
  <rect x="14" y="8" width="70" height="30" rx="4" fill="#dde2e6"/><rect x="170" y="10" width="60" height="40" rx="4" fill="#dde2e6"/>
  <rect x="20" y="96" width="78" height="44" rx="4" fill="#dde2e6"/><rect x="160" y="104" width="70" height="38" rx="4" fill="#dde2e6"/>`;
const svgPoste = (x, y, n, cor) => `<circle cx="${x}" cy="${y}" r="11" fill="${cor || '#3498db'}" stroke="#fff" stroke-width="3"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="bold" fill="#fff" font-family="Arial">${n}</text>`;
const svgToque = (x, y) => `<circle cx="${x}" cy="${y}" r="17" fill="none" stroke="#f39c12" stroke-width="3"><animate attributeName="r" values="13;21;13" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0.2;1" dur="1.6s" repeatCount="indefinite"/></circle>`;

const SLIDES_TUTORIAL = [
    {
        titulo: 'Nova versão do Croqui',
        texto: 'Agora você <b>não precisa mais desenhar</b>. Você marca os postes no mapa e o app desenha o croqui e monta o PDF sozinho.',
        svg: `${SVG_MAPA_FUNDO}
            <path d="M40 46 L95 58 L140 66" stroke="#e74c3c" stroke-width="5" fill="none"/>
            <path d="M140 66 L132 110" stroke="#e74c3c" stroke-width="5" fill="none"/>
            ${svgPoste(40, 46, 1)}${svgPoste(95, 58, 2)}${svgPoste(140, 66, 3)}
            <rect x="121" y="99" width="22" height="22" rx="4" fill="#f1c40f" stroke="#fff" stroke-width="3"/>
            <circle cx="205" cy="120" r="20" fill="#27ae60"/><path d="M195 120 L202 127 L215 113" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>`
    },
    {
        titulo: '1. Marque cada poste',
        texto: 'Antes de lançar o cabo, ande pelo trajeto. Em cada poste, toque em <b>📍 Poste aqui</b>. O GPS marca o ponto e o celular vibra.<br><span class="tut2-dica">Fora do local? Busque a rua no topo do mapa e use a mira vermelha.</span>',
        svg: `${SVG_MAPA_FUNDO}
            <path d="M40 46 L95 58" stroke="#e74c3c" stroke-width="5"/>
            ${svgPoste(40, 46, 1)}${svgPoste(95, 58, 2)}
            <circle cx="145" cy="67" r="7" fill="#2980b9" stroke="#fff" stroke-width="3"/><circle cx="145" cy="67" r="16" fill="#2980b9" opacity="0.15"/>
            <rect x="40" y="116" width="160" height="28" rx="8" fill="#660099"/>
            <text x="120" y="135" text-anchor="middle" font-size="13" font-weight="bold" fill="#fff" font-family="Arial">📍 Poste aqui</text>
            ${svgToque(178, 130)}`
    },
    {
        titulo: '2. Diga o que foi feito',
        texto: 'Toque no <b>número do poste</b> para escolher a caixa (<b>CTOP</b> com cor, número e contagem, ou <b>CEO</b>) e os <b>itens</b> usados, como conectores, com a quantidade.',
        svg: `${SVG_MAPA_FUNDO}
            <path d="M40 46 L95 58 L140 66" stroke="#e74c3c" stroke-width="5" fill="none"/>
            ${svgPoste(40, 46, 1)}${svgPoste(95, 58, 2)}${svgPoste(140, 66, 3)}${svgToque(140, 66)}
            <rect x="0" y="88" width="240" height="62" rx="10" fill="#fff"/>
            <rect x="10" y="98" width="66" height="22" rx="6" fill="#f1c40f"/><text x="43" y="113" text-anchor="middle" font-size="11" font-weight="bold" fill="#222" font-family="Arial">CTOP</text>
            <rect x="86" y="98" width="66" height="22" rx="6" fill="#f4f4f4"/><text x="119" y="113" text-anchor="middle" font-size="11" font-weight="bold" fill="#333" font-family="Arial">CEO</text>
            <rect x="162" y="98" width="68" height="22" rx="6" fill="#f4ecf8"/><text x="196" y="113" text-anchor="middle" font-size="11" font-weight="bold" fill="#660099" font-family="Arial">＋ Item</text>
            <text x="12" y="140" font-size="11" fill="#555" font-family="Arial"><tspan font-weight="bold" fill="#660099">2×</tspan> Conector óptico</text>`
    },
    {
        titulo: '3. Confira a metragem',
        texto: 'A metragem de cada trecho é calculada pelo mapa (o <b>*</b> indica que é a sugerida). Se o cabo real foi diferente, <b>toque no trecho</b> e escolha o valor.',
        svg: `${SVG_MAPA_FUNDO}
            <path d="M30 44 L200 74" stroke="#e74c3c" stroke-width="5"/>
            ${svgPoste(30, 44, 1)}${svgPoste(200, 74, 2)}
            <rect x="92" y="46" width="48" height="20" rx="4" fill="#fff" stroke="#e74c3c"/><text x="116" y="61" text-anchor="middle" font-size="12" font-weight="bold" fill="#c0392b" font-family="Arial">42m*</text>
            ${svgToque(116, 56)}
            <rect x="0" y="96" width="240" height="54" rx="10" fill="#fff"/>
            ${[30, 35, 40, 45].map((v, i) => `<rect x="${12 + i * 56}" y="108" width="48" height="30" rx="8" fill="${v === 40 ? '#660099' : '#f4ecf8'}"/><text x="${36 + i * 56}" y="128" text-anchor="middle" font-size="13" font-weight="bold" fill="${v === 40 ? '#fff' : '#660099'}" font-family="Arial">${v}m</text>`).join('')}`
    },
    {
        titulo: '4. Gere o croqui',
        texto: 'Toque em <b>✅ Gerar croqui</b>. O app pergunta se houve <b>retirada</b>: escolha do poste ao poste (ex.: do 2 ao 7) e confirme. A retirada sai em verde, ao lado do cabo novo.',
        svg: `<rect width="240" height="150" rx="12" fill="#f5f5f5"/>
            <path d="M30 40 L210 40" stroke="#e74c3c" stroke-width="5"/>
            <path d="M75 58 L170 58" stroke="#27ae60" stroke-width="5"/>
            ${svgPoste(30, 40, 1)}${svgPoste(75, 40, 2)}${svgPoste(120, 40, 3)}${svgPoste(165, 40, 4)}${svgPoste(210, 40, 5)}
            <rect x="152" y="68" width="76" height="34" rx="5" fill="#fff" stroke="#660099" stroke-width="2"/>
            <text x="160" y="82" font-size="9" font-weight="bold" fill="#660099" font-family="Arial">CTOP 05</text>
            <text x="160" y="95" font-size="9" fill="#333" font-family="Arial">2× Conector</text>
            <path d="M190 68 L210 52" stroke="#2c3e50" stroke-width="1.5"/>
            <rect x="30" y="112" width="180" height="28" rx="8" fill="#27ae60"/>
            <text x="120" y="131" text-anchor="middle" font-size="13" font-weight="bold" fill="#fff" font-family="Arial">✅ Gerar croqui</text>`
    },
    {
        titulo: '5. Gere o PDF',
        texto: 'Toque no <b>💾</b> no topo, preencha os dados da OS e gere o PDF. Ele sai com o croqui sobre o mapa da rua, os totais de cabo lançado e retirado, os itens e as coordenadas de cada poste.',
        svg: `<rect width="240" height="150" rx="12" fill="#f5f5f5"/>
            <rect x="62" y="12" width="116" height="128" rx="6" fill="#fff" stroke="#ccc"/>
            <rect x="70" y="20" width="100" height="8" rx="2" fill="#660099"/>
            <rect x="70" y="34" width="100" height="52" rx="3" fill="#eef1f3"/>
            <path d="M78 74 L112 52 L160 60" stroke="#e74c3c" stroke-width="3" fill="none"/>
            <path d="M120 -6 L104 96" stroke="#fff" stroke-width="5" opacity="0.8"/>
            ${[0, 1, 2, 3].map(i => `<rect x="70" y="${94 + i * 10}" width="${i % 2 ? 70 : 100}" height="5" rx="2" fill="#ddd"/>`).join('')}
            <circle cx="196" cy="118" r="20" fill="#27ae60"/><text x="196" y="125" text-anchor="middle" font-size="18" font-family="Arial">💾</text>`
    }
];

let tut2Atual = 0;

function montarTutorialNovo() {
    if (document.getElementById('tutorialNovo')) return;
    const el = document.createElement('div');
    el.id = 'tutorialNovo'; el.className = 'tut2-fundo';
    el.innerHTML = `<div class="tut2-caixa" role="dialog" aria-label="Como usar a nova versão">
        <button class="tut2-pular" onclick="fecharTutorialNovo()">Pular</button>
        <div class="tut2-trilho" id="tut2Trilho">${SLIDES_TUTORIAL.map(s => `
            <div class="tut2-slide">
                <svg viewBox="0 0 240 150" class="tut2-svg" aria-hidden="true">${s.svg}</svg>
                <h2>${s.titulo}</h2>
                <p>${s.texto}</p>
            </div>`).join('')}
        </div>
        <div class="tut2-pontos" id="tut2Pontos">${SLIDES_TUTORIAL.map((_, i) => `<span data-i="${i}"></span>`).join('')}</div>
        <div class="tut2-botoes">
            <button class="tut2-voltar" id="tut2Voltar" onclick="irTutorialNovo(tut2Atual - 1)">Voltar</button>
            <button class="tut2-proximo" id="tut2Proximo" onclick="avancarTutorialNovo()">Próximo</button>
        </div>
    </div>`;
    document.body.appendChild(el);
    // Deslizar o dedo para os lados troca de tela
    let x0 = null;
    const trilho = el.querySelector('.tut2-caixa');
    trilho.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
    trilho.addEventListener('touchend', e => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0; x0 = null;
        if (Math.abs(dx) > 50) irTutorialNovo(tut2Atual + (dx < 0 ? 1 : -1));
    });
    el.querySelectorAll('.tut2-pontos span').forEach(s => s.addEventListener('click', () => irTutorialNovo(Number(s.dataset.i))));
}

function abrirTutorialNovo() {
    montarTutorialNovo();
    document.getElementById('tutorialNovo').classList.add('aberto');
    irTutorialNovo(0);
}

function irTutorialNovo(i) {
    tut2Atual = Math.max(0, Math.min(SLIDES_TUTORIAL.length - 1, i));
    document.getElementById('tut2Trilho').style.transform = `translateX(-${tut2Atual * 100}%)`;
    document.querySelectorAll('#tut2Pontos span').forEach((s, k) => s.classList.toggle('ativo', k === tut2Atual));
    document.getElementById('tut2Voltar').style.visibility = tut2Atual === 0 ? 'hidden' : 'visible';
    document.getElementById('tut2Proximo').innerText = tut2Atual === SLIDES_TUTORIAL.length - 1 ? 'Começar' : 'Próximo';
}

function avancarTutorialNovo() {
    if (tut2Atual === SLIDES_TUTORIAL.length - 1) fecharTutorialNovo();
    else irTutorialNovo(tut2Atual + 1);
}

function fecharTutorialNovo() {
    document.getElementById('tutorialNovo').classList.remove('aberto');
    try {
        localStorage.setItem(CHAVE_TUTORIAL_NOVO, 'true');
        localStorage.setItem('croqui_tutorial_visto', 'true'); // não mostra também o tutorial antigo
    } catch (e) {}
}

function tutorialNovoJaVisto() {
    try { return !!localStorage.getItem(CHAVE_TUTORIAL_NOVO); } catch (e) { return true; }
}
