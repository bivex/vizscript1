// VizScript Studio - App Core Logic

// Initial Application State
const state = {
    nodes: [],
    startNodeId: null,
    
    // Canvas Pan & Zoom
    panX: 50,
    panY: 50,
    zoom: 0.95,
    
    // Selection and Dragging State
    selectedNodeId: null,
    draggedNodeId: null,
    dragOffset: { x: 0, y: 0 },
    draggedPort: null, // { nodeId, choiceId, type, element }
    isDraggingCanvas: false,
    canvasDragStart: { x: 0, y: 0, panX: 0, panY: 0 },
    
    // Chat Simulator State
    activeSimNodeId: null,
    simVariables: {},
    activeConnections: [] // [{ sourceId, choiceId, targetId }]
};

// DOM Elements cache
const canvasContainer = document.getElementById('canvas-container');
const canvasEl = document.getElementById('editor-canvas');
const nodesContainer = document.getElementById('nodes-container');
const svgEl = document.getElementById('connections-svg');
const svgGroup = document.getElementById('connections-group');
const tempLine = document.getElementById('temp-connection-line');
const chatMessages = document.getElementById('chat-messages');
const chatOptionsContainer = document.getElementById('chat-options-container');
const chatTextInputContainer = document.getElementById('chat-text-input-container');
const simUserInput = document.getElementById('sim-user-input');
const btnSubmitInput = document.getElementById('btn-submit-input');
const variablesList = document.getElementById('variables-list');
const importFileInput = document.getElementById('import-file-input');

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    loadDemoScript();
    lucide.createIcons();
});

// Event Listeners Initialization
function initEventListeners() {
    // Toolbar Actions
    document.getElementById('add-message-node').addEventListener('click', () => createNode('message'));
    document.getElementById('add-choice-node').addEventListener('click', () => createNode('choice'));
    document.getElementById('add-input-node').addEventListener('click', () => createNode('input'));
    document.getElementById('add-end-node').addEventListener('click', () => createNode('end'));
    
    document.getElementById('btn-zoom-in').addEventListener('click', () => zoomCanvas(0.1));
    document.getElementById('btn-zoom-out').addEventListener('click', () => zoomCanvas(-0.1));
    document.getElementById('btn-zoom-reset').addEventListener('click', resetZoomAndPan);
    document.getElementById('btn-clear-canvas').addEventListener('click', clearCanvas);
    
    document.getElementById('btn-load-demo').addEventListener('click', loadDemoScript);
    document.getElementById('btn-restart-sim').addEventListener('click', resetSimulator);
    
    // Import & Export
    document.getElementById('btn-export').addEventListener('click', exportJSON);
    document.getElementById('btn-import').addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', importJSON);
    
    // Canvas Pan & Zoom Mouse Events
    canvasContainer.addEventListener('mousedown', onCanvasMouseDown);
    document.addEventListener('mousemove', onDocumentMouseMove);
    document.addEventListener('mouseup', onDocumentMouseUp);
    canvasContainer.addEventListener('wheel', onCanvasWheel, { passive: false });
    
    // Simulator input submission
    btnSubmitInput.addEventListener('click', submitUserInput);
    simUserInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitUserInput();
    });
}

// Default texts for newly spawned nodes
function getDefaultText(type) {
    switch (type) {
        case 'message': return 'Привет! Это новое сообщение от бота.';
        case 'choice': return 'Выберите один из вариантов ниже:';
        case 'input': return 'Введите ваше имя, чтобы продолжить:';
        case 'end': return 'Спасибо за общение! Сценарий успешно завершен. 👋';
        default: return '';
    }
}

// ----------------------------------------------------
// NODE CREATION & EDITING
// ----------------------------------------------------

function createNode(type, x, y) {
    const id = `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // Default position at viewport center if not provided
    if (x === undefined || y === undefined) {
        const rect = canvasContainer.getBoundingClientRect();
        x = (rect.width / 2 - state.panX) / state.zoom - 140;
        y = (rect.height / 2 - state.panY) / state.zoom - 70;
    }
    
    const node = {
        id,
        type,
        x,
        y,
        text: getDefaultText(type)
    };
    
    if (type === 'message' || type === 'input') {
        node.next = null;
    }
    
    if (type === 'choice') {
        node.choices = [
            { id: `choice_${Date.now()}_1`, text: 'Да', next: null },
            { id: `choice_${Date.now()}_2`, text: 'Нет', next: null }
        ];
    }
    
    if (type === 'input') {
        node.variable = 'userName';
    }
    
    state.nodes.push(node);
    
    // If first node, set as start
    if (state.nodes.length === 1) {
        state.startNodeId = id;
    }
    
    renderNodeDOM(node);
    drawConnections();
    
    // Auto-select new node
    selectNode(id);
    
    // If simulator has no start node, reset it now
    if (!state.activeSimNodeId) {
        resetSimulator();
    }
    
    return node;
}

function renderNodeDOM(node) {
    // Check if element already exists, remove it
    let nodeEl = document.getElementById(node.id);
    if (nodeEl) {
        nodeEl.remove();
    }
    
    nodeEl = document.createElement('div');
    nodeEl.id = node.id;
    nodeEl.className = `node node-type-${node.type}`;
    nodeEl.style.left = `${node.x}px`;
    nodeEl.style.top = `${node.y}px`;
    
    if (state.selectedNodeId === node.id) nodeEl.classList.add('selected');
    if (state.activeSimNodeId === node.id) nodeEl.classList.add('active-sim');
    
    // Build Internal HTML
    const isStart = state.startNodeId === node.id;
    let headerActionsHtml = '';
    
    if (!isStart) {
        headerActionsHtml += `
            <button class="node-header-btn btn-set-start" title="Сделать стартовым" aria-label="Сделать стартовым">
                <i data-lucide="play"></i>
            </button>
        `;
    }
    
    headerActionsHtml += `
        <button class="node-header-btn danger btn-delete-node" title="Удалить" aria-label="Удалить узел">
            <i data-lucide="trash-2"></i>
        </button>
    `;
    
    let bodyHtml = `
        <textarea class="node-textarea" placeholder="Текст сообщения..." aria-label="Текст сообщения">${node.text}</textarea>
    `;
    
    if (node.type === 'choice') {
        bodyHtml += `<div class="choices-editor-container">`;
        node.choices.forEach(choice => {
            bodyHtml += `
                <div class="choice-item">
                    <input type="text" class="choice-input" data-choice-id="${choice.id}" value="${choice.text}" aria-label="Вариант ответа">
                    <button class="btn-delete-choice" data-choice-id="${choice.id}" aria-label="Удалить вариант ответа">×</button>
                    <div class="node-port output-port choice-item-port" data-node-id="${node.id}" data-choice-id="${choice.id}"></div>
                </div>
            `;
        });
        bodyHtml += `
            <button class="btn-add-choice">
                <i data-lucide="plus"></i>
                <span>Добавить ответ</span>
            </button>
        </div>`;
    } else if (node.type === 'input') {
        bodyHtml += `
            <div class="input-variable-container">
                <span class="input-label">Записать ответ в переменную:</span>
                <input type="text" class="variable-name-input" value="${node.variable}" placeholder="userName" aria-label="Имя переменной">
            </div>
        `;
    }
    
    // Ports setup
    const inputPortHtml = `<div class="node-port input-port" data-node-id="${node.id}"></div>`;
    const outputPortHtml = (node.type === 'message' || node.type === 'input') 
        ? `<div class="node-port output-port" data-node-id="${node.id}"></div>` 
        : '';
        
    const startBadgeHtml = isStart ? `
        <div class="start-badge">
            <i data-lucide="star"></i><span>СТАРТ</span>
        </div>
    ` : '';
    
    nodeEl.innerHTML = `
        ${startBadgeHtml}
        <div class="node-header">
            <i data-lucide="${getNodeIcon(node.type)}"></i>
            <span class="node-title">${getNodeTitle(node.type)}</span>
            <div class="node-header-actions">
                ${headerActionsHtml}
            </div>
        </div>
        <div class="node-body">
            ${bodyHtml}
        </div>
        ${inputPortHtml}
        ${outputPortHtml}
    `;
    
    nodesContainer.appendChild(nodeEl);
    lucide.createIcons({ attrs: { class: 'lucide-custom' } });
    
    // Bind Node Inner Event Listeners
    bindNodeEvents(node, nodeEl);
}

function getNodeIcon(type) {
    switch (type) {
        case 'message': return 'message-square-text';
        case 'choice': return 'git-branch';
        case 'input': return 'keyboard';
        case 'end': return 'octagon';
        default: return 'help-circle';
    }
}

function getNodeTitle(type) {
    switch (type) {
        case 'message': return 'Сообщение';
        case 'choice': return 'Выбор';
        case 'input': return 'Ввод данных';
        case 'end': return 'Конец';
        default: return 'Узел';
    }
}

function bindNodeEvents(node, nodeEl) {
    // Header drag mouse down
    const header = nodeEl.querySelector('.node-header');
    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.node-header-btn')) return; // ignore buttons clicks
        
        state.draggedNodeId = node.id;
        selectNode(node.id);
        
        const canvasRect = canvasEl.getBoundingClientRect();
        const canvasMouseX = (e.clientX - canvasRect.left) / state.zoom;
        const canvasMouseY = (e.clientY - canvasRect.top) / state.zoom;
        
        state.dragOffset = {
            x: canvasMouseX - node.x,
            y: canvasMouseY - node.y
        };
        
        e.stopPropagation();
    });
    
    // Click node element directly selects it
    nodeEl.addEventListener('click', (e) => {
        selectNode(node.id);
        e.stopPropagation();
    });
    
    // Textarea editing
    const textarea = nodeEl.querySelector('.node-textarea');
    // Defer initial resize to let browser compute DOM layout first
    setTimeout(() => {
        autoResizeTextarea(textarea);
        drawConnections();
    }, 50);
    textarea.addEventListener('input', (e) => {
        node.text = e.target.value;
        autoResizeTextarea(e.target);
        drawConnections();
    });
    
    // Variable input editing (if applicable)
    const varInput = nodeEl.querySelector('.variable-name-input');
    if (varInput) {
        varInput.addEventListener('input', (e) => {
            node.variable = e.target.value.replace(/[^a-zA-Z0-9_]/g, ''); // alphanumeric only
            e.target.value = node.variable;
            updateVariablesUI();
        });
    }
    
    // Choice node edits
    if (node.type === 'choice') {
        // Add new Choice button
        const btnAdd = nodeEl.querySelector('.btn-add-choice');
        btnAdd.addEventListener('click', (e) => {
            const nextIndex = node.choices.length + 1;
            node.choices.push({
                id: `choice_${Date.now()}_${nextIndex}`,
                text: `Вариант ${nextIndex}`,
                next: null
            });
            renderNodeDOM(node);
            drawConnections();
            e.stopPropagation();
        });
        
        // Choice input editing
        const choiceInputs = nodeEl.querySelectorAll('.choice-input');
        choiceInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const choiceId = e.target.dataset.choiceId;
                const choice = node.choices.find(c => c.id === choiceId);
                if (choice) {
                    choice.text = e.target.value;
                }
            });
        });
        
        // Delete choice buttons
        const btnDeleteChoices = nodeEl.querySelectorAll('.btn-delete-choice');
        btnDeleteChoices.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const choiceId = e.target.dataset.choiceId;
                node.choices = node.choices.filter(c => c.id !== choiceId);
                renderNodeDOM(node);
                drawConnections();
                e.stopPropagation();
            });
        });
    }
    
    // Set Start Button
    const btnSetStart = nodeEl.querySelector('.btn-set-start');
    if (btnSetStart) {
        btnSetStart.addEventListener('click', (e) => {
            const prevStartId = state.startNodeId;
            state.startNodeId = node.id;
            
            // Re-render current node and previous start node
            renderNodeDOM(node);
            if (prevStartId) {
                const prevNode = state.nodes.find(n => n.id === prevStartId);
                if (prevNode) renderNodeDOM(prevNode);
            }
            
            resetSimulator();
            e.stopPropagation();
        });
    }
    
    // Delete Node Button
    const btnDelete = nodeEl.querySelector('.btn-delete-node');
    btnDelete.addEventListener('click', (e) => {
        deleteNode(node.id);
        e.stopPropagation();
    });
    
    // Output port mouse events (message and input node)
    const outPort = nodeEl.querySelector('.node-port.output-port:not(.choice-item-port)');
    if (outPort) {
        outPort.addEventListener('mousedown', (e) => {
            startPortDrag(node.id, null, 'output', outPort, e);
            e.stopPropagation();
        });
    }
    
    // Choice item port mouse events
    const choicePorts = nodeEl.querySelectorAll('.choice-item-port');
    choicePorts.forEach(port => {
        port.addEventListener('mousedown', (e) => {
            const choiceId = port.dataset.choiceId;
            startPortDrag(node.id, choiceId, 'output', port, e);
            e.stopPropagation();
        });
    });
}

function selectNode(nodeId) {
    if (state.selectedNodeId === nodeId) return;
    
    // Deselect current
    if (state.selectedNodeId) {
        const prevSelected = document.getElementById(state.selectedNodeId);
        if (prevSelected) prevSelected.classList.remove('selected');
    }
    
    state.selectedNodeId = nodeId;
    
    // Highlight new
    if (nodeId) {
        const newSelected = document.getElementById(nodeId);
        if (newSelected) newSelected.classList.add('selected');
    }
}

function deleteNode(nodeId) {
    state.nodes = state.nodes.filter(n => n.id !== nodeId);
    
    // Clean up links pointing to this node
    state.nodes.forEach(n => {
        if (n.next === nodeId) n.next = null;
        if (n.choices) {
            n.choices.forEach(choice => {
                if (choice.next === nodeId) choice.next = null;
            });
        }
    });
    
    // Start Node replacement
    if (state.startNodeId === nodeId) {
        state.startNodeId = state.nodes.length > 0 ? state.nodes[0].id : null;
        if (state.startNodeId) {
            const node = state.nodes.find(n => n.id === state.startNodeId);
            if (node) renderNodeDOM(node);
        }
    }
    
    // Delete DOM
    const el = document.getElementById(nodeId);
    if (el) el.remove();
    
    // If selected or active in simulator
    if (state.selectedNodeId === nodeId) state.selectedNodeId = null;
    if (state.activeSimNodeId === nodeId) resetSimulator();
    
    drawConnections();
}

function clearCanvas() {
    if (confirm('Вы уверены, что хотите удалить весь сценарий?')) {
        nodesContainer.innerHTML = '';
        state.nodes = [];
        state.startNodeId = null;
        state.selectedNodeId = null;
        state.activeSimNodeId = null;
        state.activeConnections = [];
        drawConnections();
        resetSimulator();
    }
}

// ----------------------------------------------------
// CANVAS CONTROL & TRANSFORMS
// ----------------------------------------------------

function updateCanvasTransform() {
    canvasEl.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
}

function zoomCanvas(delta) {
    const rect = canvasContainer.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Canvas coords of the center before zoom
    const canvasCenterX = (centerX - state.panX) / state.zoom;
    const canvasCenterY = (centerY - state.panY) / state.zoom;
    
    let nextZoom = state.zoom + delta;
    nextZoom = Math.max(0.2, Math.min(nextZoom, 2));
    
    state.panX = centerX - canvasCenterX * nextZoom;
    state.panY = centerY - canvasCenterY * nextZoom;
    state.zoom = nextZoom;
    
    updateCanvasTransform();
}

function resetZoomAndPan() {
    state.zoom = 1.0;
    
    const rect = canvasContainer.getBoundingClientRect();
    const startNode = state.nodes.find(n => n.id === state.startNodeId);
    
    if (startNode) {
        // Center on the start node
        state.panX = rect.width / 2 - startNode.x - 140;
        state.panY = rect.height / 2 - startNode.y - 70;
    } else {
        // Reset defaults
        state.panX = rect.width / 2 - 250;
        state.panY = rect.height / 2 - 250;
    }
    
    updateCanvasTransform();
}

function onCanvasMouseDown(e) {
    // If clicked on canvas container itself or background grids
    if (e.target === canvasContainer || e.target.classList.contains('canvas-grid-bg')) {
        state.isDraggingCanvas = true;
        state.canvasDragStart = {
            x: e.clientX,
            y: e.clientY,
            panX: state.panX,
            panY: state.panY
        };
        selectNode(null); // deselect all
    }
}

function onCanvasWheel(e) {
    e.preventDefault();
    
    const rect = canvasContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Canvas coordinates of mouse cursor before zooming
    const canvasMouseX = (mouseX - state.panX) / state.zoom;
    const canvasMouseY = (mouseY - state.panY) / state.zoom;
    
    const zoomIntensity = 0.001;
    let nextZoom = state.zoom - e.deltaY * zoomIntensity;
    nextZoom = Math.max(0.2, Math.min(nextZoom, 2));
    
    // Shift pan coordinates to keep mouse position anchored
    state.panX = mouseX - canvasMouseX * nextZoom;
    state.panY = mouseY - canvasMouseY * nextZoom;
    state.zoom = nextZoom;
    
    updateCanvasTransform();
}

// ----------------------------------------------------
// PORT DRAGGING & CONNECTIONS VISUALIZATION
// ----------------------------------------------------

function getPortCanvasCoords(portEl) {
    const canvasRect = canvasEl.getBoundingClientRect();
    const portRect = portEl.getBoundingClientRect();
    
    // Correctly scale by zoom factor relative to canvas top-left
    const x = (portRect.left - canvasRect.left) / state.zoom;
    const y = (portRect.top - canvasRect.top) / state.zoom;
    
    return {
        x: x + (portRect.width / 2) / state.zoom,
        y: y + (portRect.height / 2) / state.zoom
    };
}

function startPortDrag(nodeId, choiceId, type, element, e) {
    state.draggedPort = {
        nodeId,
        choiceId,
        type,
        element
    };
    
    tempLine.style.display = 'block';
    
    const startCoords = getPortCanvasCoords(element);
    const d = `M ${startCoords.x} ${startCoords.y} L ${startCoords.x} ${startCoords.y}`;
    tempLine.setAttribute('d', d);
}

function onDocumentMouseMove(e) {
    const canvasRect = canvasContainer.getBoundingClientRect();
    
    // Mouse coords relative to canvas container
    const mouseX = e.clientX - canvasRect.left;
    const mouseY = e.clientY - canvasRect.top;
    
    // Mouse coords converted to canvas space
    const canvasMouseX = (mouseX - state.panX) / state.zoom;
    const canvasMouseY = (mouseY - state.panY) / state.zoom;
    
    if (state.draggedNodeId) {
        // Dragging Node Card
        const node = state.nodes.find(n => n.id === state.draggedNodeId);
        if (node) {
            node.x = canvasMouseX - state.dragOffset.x;
            node.y = canvasMouseY - state.dragOffset.y;
            
            const nodeEl = document.getElementById(node.id);
            if (nodeEl) {
                nodeEl.style.left = `${node.x}px`;
                nodeEl.style.top = `${node.y}px`;
            }
            drawConnections();
        }
    } else if (state.draggedPort) {
        // Dragging Connection Line
        const startCoords = getPortCanvasCoords(state.draggedPort.element);
        
        const x1 = startCoords.x;
        const y1 = startCoords.y;
        const x2 = canvasMouseX;
        const y2 = canvasMouseY;
        
        // Curve pull logic
        const dx = Math.abs(x2 - x1) * 0.5;
        const pull = Math.max(dx, 60);
        
        const d = `M ${x1} ${y1} C ${x1 + pull} ${y1}, ${x2 - pull} ${y2}, ${x2} ${y2}`;
        tempLine.setAttribute('d', d);
    } else if (state.isDraggingCanvas) {
        // Panning Canvas
        const dx = e.clientX - state.canvasDragStart.x;
        const dy = e.clientY - state.canvasDragStart.y;
        state.panX = state.canvasDragStart.panX + dx;
        state.panY = state.canvasDragStart.panY + dy;
        updateCanvasTransform();
    }
}

function onDocumentMouseUp(e) {
    if (state.draggedNodeId) {
        state.draggedNodeId = null;
    } else if (state.draggedPort) {
        tempLine.style.display = 'none';
        
        // Find input-port under cursor
        const hoverEl = e.target.closest('.input-port');
        if (hoverEl) {
            const targetNodeId = hoverEl.dataset.nodeId;
            const sourceNodeId = state.draggedPort.nodeId;
            const choiceId = state.draggedPort.choiceId;
            
            // Validate connection
            const sourceNode = state.nodes.find(n => n.id === sourceNodeId);
            if (sourceNode && targetNodeId !== sourceNodeId) {
                if (choiceId) {
                    const choice = sourceNode.choices.find(c => c.id === choiceId);
                    if (choice) choice.next = targetNodeId;
                } else {
                    sourceNode.next = targetNodeId;
                }
                
                // If active simulator path is waiting for this connection, step it
                if (state.activeSimNodeId === sourceNodeId) {
                    runSimulatorStep();
                }
            }
        }
        
        state.draggedPort = null;
        drawConnections();
    } else if (state.isDraggingCanvas) {
        state.isDraggingCanvas = false;
    }
}

function deleteConnection(sourceId, choiceId) {
    const node = state.nodes.find(n => n.id === sourceId);
    if (!node) return;
    
    if (choiceId) {
        const choice = node.choices.find(c => c.id === choiceId);
        if (choice) choice.next = null;
    } else {
        node.next = null;
    }
    
    // Clear connection trace from simulator
    state.activeConnections = state.activeConnections.filter(c => {
        return !(c.sourceId === sourceId && c.choiceId === choiceId);
    });
    
    drawConnections();
}

function drawConnections() {
    svgGroup.innerHTML = '';
    
    state.nodes.forEach(sourceNode => {
        if (sourceNode.type === 'message' || sourceNode.type === 'input') {
            if (sourceNode.next) {
                const targetNode = state.nodes.find(n => n.id === sourceNode.next);
                if (targetNode) {
                    drawCurveBetween(sourceNode.id, null, sourceNode.next);
                }
            }
        } else if (sourceNode.type === 'choice') {
            sourceNode.choices.forEach(choice => {
                if (choice.next) {
                    const targetNode = state.nodes.find(n => n.id === choice.next);
                    if (targetNode) {
                        drawCurveBetween(sourceNode.id, choice.id, choice.next);
                    }
                }
            });
        }
    });
}

function drawCurveBetween(sourceId, choiceId, targetId) {
    const sourceEl = document.getElementById(sourceId);
    const targetEl = document.getElementById(targetId);
    if (!sourceEl || !targetEl) return;
    
    // Query correct output port
    let outputPort;
    if (choiceId) {
        outputPort = sourceEl.querySelector(`.choice-item-port[data-choice-id="${choiceId}"]`);
    } else {
        outputPort = sourceEl.querySelector('.node-port.output-port');
    }
    
    const inputPort = targetEl.querySelector('.node-port.input-port');
    if (!outputPort || !inputPort) return;
    
    const p1 = getPortCanvasCoords(outputPort);
    const p2 = getPortCanvasCoords(inputPort);
    
    const dx = Math.abs(p2.x - p1.x) * 0.5;
    const pull = Math.max(dx, 60);
    
    const pathD = `M ${p1.x} ${p1.y} C ${p1.x + pull} ${p1.y}, ${p2.x - pull} ${p2.y}, ${p2.x} ${p2.y}`;
    
    // Check if link is in active simulator traversal path
    const isActive = state.activeConnections.some(c => 
        c.sourceId === sourceId && c.choiceId === choiceId && c.targetId === targetId
    );
    
    // Draw background hover target path (thicker transparent path for easy clicking)
    const hoverPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hoverPath.setAttribute('d', pathD);
    hoverPath.setAttribute('style', 'fill:none; stroke:transparent; stroke-width:12px; pointer-events:stroke; cursor:pointer;');
    hoverPath.addEventListener('click', (e) => {
        deleteConnection(sourceId, choiceId);
        e.stopPropagation();
    });
    
    // Draw visual path
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', `connection-path ${isActive ? 'active' : ''}`);
    path.setAttribute('d', pathD);
    path.setAttribute('marker-end', isActive ? 'url(#arrow-active)' : 'url(#arrow)');
    
    // Add glowing animated overlay if active
    let flowPath = null;
    if (isActive) {
        flowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        flowPath.setAttribute('class', 'connection-flow');
        flowPath.setAttribute('d', pathD);
    }
    
    svgGroup.appendChild(hoverPath);
    svgGroup.appendChild(path);
    if (flowPath) {
        svgGroup.appendChild(flowPath);
    }
}

// ----------------------------------------------------
// DIALOGUE CHAT SIMULATOR
// ----------------------------------------------------

let simTimeoutId = null;

function resetSimulator() {
    clearTimeout(simTimeoutId);
    state.simVariables = {};
    state.activeConnections = [];
    
    const initialStart = state.startNodeId;
    state.activeSimNodeId = initialStart;
    
    // UI elements reset
    chatMessages.innerHTML = '';
    chatOptionsContainer.innerHTML = '';
    chatTextInputContainer.style.display = 'none';
    
    updateVariablesUI();
    drawConnections();
    
    appendSystemMessage('Диалог запущен');
    
    if (initialStart) {
        runSimulatorStep();
    } else {
        appendSystemMessage('Сценарий пуст. Создайте сообщение.');
    }
}

function appendSystemMessage(text) {
    const el = document.createElement('div');
    el.className = 'chat-system-msg';
    el.innerText = text;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendChatBubble(sender, text) {
    const el = document.createElement('div');
    el.className = `message-bubble ${sender}-bubble`;
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    el.innerHTML = `
        <div class="message-text">${text}</div>
        <div class="message-time">${time}</div>
    `;
    
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTypingIndicator() {
    if (document.getElementById('typing-indicator')) return;
    
    const el = document.createElement('div');
    el.id = 'typing-indicator';
    el.className = 'typing-bubble';
    el.innerHTML = `
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
    `;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
}

function interpolateText(text) {
    // Interpolate keys like {userName}
    return text.replace(/\{(\w+)\}/g, (match, key) => {
        return state.simVariables[key] !== undefined ? state.simVariables[key] : match;
    });
}

function runSimulatorStep() {
    // Clear options & text inputs
    chatOptionsContainer.innerHTML = '';
    chatTextInputContainer.style.display = 'none';
    
    // Highlight simulated node
    document.querySelectorAll('.node').forEach(el => el.classList.remove('active-sim'));
    
    if (!state.activeSimNodeId) {
        appendSystemMessage('Ожидание подключения...');
        return;
    }
    
    const node = state.nodes.find(n => n.id === state.activeSimNodeId);
    if (!node) {
        appendSystemMessage('Ошибка: вершина не найдена');
        return;
    }
    
    const nodeEl = document.getElementById(node.id);
    if (nodeEl) {
        nodeEl.classList.add('active-sim');
    }
    
    // Simulate typing
    showTypingIndicator();
    
    // Compute delay based on text length (realistic speed)
    const delay = Math.max(600, Math.min(node.text.length * 15, 1200));
    
    simTimeoutId = setTimeout(() => {
        removeTypingIndicator();
        
        const outputText = interpolateText(node.text);
        appendChatBubble('bot', outputText);
        
        // Execute steps based on Node type
        if (node.type === 'message') {
            if (node.next) {
                // Record connection path
                state.activeConnections.push({ sourceId: node.id, choiceId: null, targetId: node.next });
                drawConnections();
                
                state.activeSimNodeId = node.next;
                runSimulatorStep();
            } else {
                appendSystemMessage('Сценарий завершен на этой ветке');
            }
        } else if (node.type === 'choice') {
            renderChoicesInSimulator(node);
        } else if (node.type === 'input') {
            renderInputInSimulator(node);
        } else if (node.type === 'end') {
            appendSystemMessage('Диалог завершен');
        }
    }, delay);
}

function renderChoicesInSimulator(node) {
    chatOptionsContainer.innerHTML = '';
    
    if (!node.choices || node.choices.length === 0) {
        appendSystemMessage('У развилки нет вариантов выбора.');
        return;
    }
    
    node.choices.forEach(choice => {
        const btn = document.createElement('button');
        btn.className = 'chat-option-btn';
        btn.innerText = choice.text;
        btn.addEventListener('click', () => {
            appendChatBubble('user', choice.text);
            
            if (choice.next) {
                state.activeConnections.push({ sourceId: node.id, choiceId: choice.id, targetId: choice.next });
                drawConnections();
                
                state.activeSimNodeId = choice.next;
                runSimulatorStep();
            } else {
                appendSystemMessage('Выбранный вариант никуда не ведет.');
                chatOptionsContainer.innerHTML = '';
            }
        });
        chatOptionsContainer.appendChild(btn);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderInputInSimulator(node) {
    chatTextInputContainer.style.display = 'flex';
    simUserInput.value = '';
    simUserInput.focus();
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function submitUserInput() {
    const val = simUserInput.value.trim();
    if (!val) return;
    
    const node = state.nodes.find(n => n.id === state.activeSimNodeId);
    if (!node || node.type !== 'input') return;
    
    // Save variable
    const varName = node.variable || 'temp_var';
    state.simVariables[varName] = val;
    updateVariablesUI();
    
    appendChatBubble('user', val);
    
    chatTextInputContainer.style.display = 'none';
    
    if (node.next) {
        state.activeConnections.push({ sourceId: node.id, choiceId: null, targetId: node.next });
        drawConnections();
        
        state.activeSimNodeId = node.next;
        runSimulatorStep();
    } else {
        appendSystemMessage('Ввод сохранен. Нет следующего узла.');
    }
}

function updateVariablesUI() {
    variablesList.innerHTML = '';
    const keys = Object.keys(state.simVariables);
    
    if (keys.length === 0) {
        variablesList.innerHTML = `<div class="no-variables">Нет сохраненных переменных</div>`;
        return;
    }
    
    keys.forEach(key => {
        const badge = document.createElement('div');
        badge.className = 'variable-badge';
        badge.innerHTML = `<span class="variable-name">${key}</span>: <span class="variable-val">${state.simVariables[key]}</span>`;
        variablesList.appendChild(badge);
    });
}

// ----------------------------------------------------
// EXPORT & IMPORT UTILITIES
// ----------------------------------------------------

function exportJSON() {
    const dataStr = JSON.stringify({
        nodes: state.nodes,
        startNodeId: state.startNodeId
    }, null, 2);
    
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `dialogue_scenario_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importJSON(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const data = JSON.parse(evt.target.result);
            if (!data.nodes || !Array.isArray(data.nodes)) {
                throw new Error('Неверный формат JSON-сценария');
            }
            
            // Clear current canvas
            nodesContainer.innerHTML = '';
            
            // Set state
            state.nodes = data.nodes;
            state.startNodeId = data.startNodeId || (data.nodes.length > 0 ? data.nodes[0].id : null);
            state.selectedNodeId = null;
            state.activeSimNodeId = null;
            state.activeConnections = [];
            
            // Render imported nodes
            state.nodes.forEach(node => {
                renderNodeDOM(node);
            });
            
            drawConnections();
            resetZoomAndPan();
            resetSimulator();
            
        } catch (err) {
            alert(`Ошибка при импорте файла: ${err.message}`);
        }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset file input
}

// ----------------------------------------------------
// DEMO SCENARIO INITIALIZATION
// ----------------------------------------------------

function loadDemoScript() {
    // Clear and build standard onboarding dialogue
    nodesContainer.innerHTML = '';
    
    const demoNodes = [
        {
            id: 'node_demo_1',
            type: 'message',
            text: 'Привет! 🤖 Я виртуальный помощник студии WebCraft. Помогаю рассчитать стоимость проекта или ответить на вопросы. Как я могу к вам обращаться?',
            x: 80,
            y: 250,
            next: 'node_demo_2'
        },
        {
            id: 'node_demo_2',
            type: 'input',
            text: 'Напишите, пожалуйста, ваше имя:',
            x: 420,
            y: 250,
            variable: 'clientName',
            next: 'node_demo_3'
        },
        {
            id: 'node_demo_3',
            type: 'choice',
            text: 'Приятно познакомиться, {clientName}! Какой проект вас интересует?',
            x: 760,
            y: 250,
            choices: [
                { id: 'c_demo_web', text: 'Разработка сайта 🌐', next: 'node_demo_website' },
                { id: 'c_demo_seo', text: 'Продвижение / SEO 📈', next: 'node_demo_seo' },
                { id: 'c_demo_other', text: 'Другой вопрос 💬', next: 'node_demo_other' }
            ]
        },
        {
            id: 'node_demo_website',
            type: 'choice',
            text: 'Сайт — это отличный выбор для развития бизнеса. Какого типа сайт вам нужен?',
            x: 1120,
            y: 50,
            choices: [
                { id: 'c_web_landing', text: 'Лендинг (одностраничник) 📄', next: 'node_demo_landing' },
                { id: 'c_web_shop', text: 'Интернет-магазин 🛍️', next: 'node_demo_shop' },
                { id: 'c_web_back', text: 'Назад в меню ↩️', next: 'node_demo_3' }
            ]
        },
        {
            id: 'node_demo_landing',
            type: 'message',
            text: 'Разработка лендинга у нас занимает от 5 дней. Стоимость — от 25 000 руб. Включает адаптивный дизайн и базовую SEO-настройку.',
            x: 1480,
            y: -50,
            next: 'node_demo_contact_prompt'
        },
        {
            id: 'node_demo_shop',
            type: 'message',
            text: 'Интернет-магазин делаем от 15 дней. Стоимость — от 60 000 руб. Включает корзину, каталог, интеграцию платежей и CRM.',
            x: 1480,
            y: 150,
            next: 'node_demo_contact_prompt'
        },
        {
            id: 'node_demo_seo',
            type: 'message',
            text: 'SEO-оптимизация и контекстная реклама помогают быстро привлечь клиентов. Наш бюджет на маркетинг начинается от 15 000 руб/мес.',
            x: 1120,
            y: 350,
            next: 'node_demo_contact_prompt'
        },
        {
            id: 'node_demo_other',
            type: 'message',
            text: 'Хорошо. Расскажите подробнее о вашем запросе на следующем шаге, и наш менеджер свяжется с вами напрямую.',
            x: 1120,
            y: 550,
            next: 'node_demo_contact_prompt'
        },
        {
            id: 'node_demo_contact_prompt',
            type: 'choice',
            text: 'Хотите получить точную смету или проконсультироваться с живым специалистом?',
            x: 1840,
            y: 250,
            choices: [
                { id: 'c_contact_yes', text: 'Оставить заявку 📞', next: 'node_demo_get_phone' },
                { id: 'c_contact_no', text: 'Начать сначала 🔄', next: 'node_demo_1' }
            ]
        },
        {
            id: 'node_demo_get_phone',
            type: 'input',
            text: 'Пожалуйста, введите ваш номер телефона или Telegram для связи:',
            x: 2180,
            y: 180,
            variable: 'clientContact',
            next: 'node_demo_final'
        },
        {
            id: 'node_demo_final',
            type: 'end',
            text: 'Отлично, {clientName}! Ваша заявка успешно принята. Менеджер свяжется с вами по контакту: {clientContact}. Хорошего дня! ✨',
            x: 2520,
            y: 250
        }
    ];
    
    state.nodes = demoNodes;
    state.startNodeId = 'node_demo_1';
    state.selectedNodeId = null;
    state.activeSimNodeId = null;
    state.activeConnections = [];
    
    // Render
    state.nodes.forEach(node => {
        renderNodeDOM(node);
    });
    
    resetZoomAndPan();
    resetSimulator();
}

function autoResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    const borderHeight = textarea.offsetHeight - textarea.clientHeight;
    textarea.style.height = `${textarea.scrollHeight + borderHeight}px`;
}
