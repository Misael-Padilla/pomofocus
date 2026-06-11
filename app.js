
// ── SERVICE WORKER REGISTRATION ────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('✅ Service Worker registrado con éxito.', reg.scope))
      .catch(err => console.warn('⚠️ Error al registrar el Service Worker', err));
  });
}

// ── STATE ──────────────────────────────────────────────
let activities = [];
let activeIdx  = null;
let taskIdx    = 0;
let remaining  = 0;
let totalSecs  = 0;
let running    = false;
let timerID    = null;

// ── AUDIO ENGINE (NIVEL EXPERTO) ───────────────────────
const AudioEngine = {
  volume: 0.8,
  soundType: 'default', // 'default', 'custom'
  customAudioData: null,
  isNativeAndroid: false, // Flag preparado para futuro puente nativo (WebView)

  init() {
    // Recuperar preferencias guardadas en el navegador
    this.volume = parseFloat(localStorage.getItem('pomo_volume')) || 0.8;
    this.soundType = localStorage.getItem('pomo_soundType') || 'default';
    this.customAudioData = localStorage.getItem('pomo_customAudio') || null;
    
    // Detección futura para entorno Android (Inyección de interfaz)
    if (window.AndroidNativeBridge) {
      this.isNativeAndroid = true;
    }
  },

  playAlert(isRest) {
    if (this.isNativeAndroid) {
      // Futuro: Llamar a la API nativa de Android
      // window.AndroidNativeBridge.triggerNativeAlarm(isRest);
      console.log("📱 [Nativo] Reproduciendo alarma desde SO Android");
      return;
    }

    // Entorno actual: Ejecución Web
    let src = '';
    if (this.soundType === 'custom' && this.customAudioData) {
      src = this.customAudioData;
    } else {
      // Sonidos por defecto
      src = isRest 
        ? 'https://actions.google.com/sounds/v1/water/water_drop.ogg' 
        : 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg'; 
    }

    const audio = new Audio(src);
    audio.volume = this.volume;
    
    audio.play().catch(err => {
      console.warn("El navegador bloqueó el audio automático. Requiere interacción previa.", err);
    });
  }
};

// Inicializar el motor
AudioEngine.init();

// ── CLOCK ──────────────────────────────────────────────
const DAYS   = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2,'0');
  const m = String(now.getMinutes()).padStart(2,'0');
  document.getElementById('clock').textContent = `${h}:${m}`;
  const day = DAYS[now.getDay()];
  const mon = MONTHS[now.getMonth()];
  document.getElementById('dateDisplay').textContent =
    `${day}, ${now.getDate()} de ${mon} de ${now.getFullYear()}`;
}
updateClock();
setInterval(updateClock, 1000);

// ── FORM TOGGLE ────────────────────────────────────────
let formOpen = true;
function toggleForm() {
  formOpen = !formOpen;
  document.getElementById('formBody').classList.toggle('hidden', !formOpen);
  document.getElementById('chevron').classList.toggle('open', formOpen);
}

// ── TASK ROWS ──────────────────────────────────────────
let rowCount = 0;
function addTaskRow(isRest = false) {
  rowCount++;
  const id  = 'row_' + rowCount;
  const div = document.createElement('div');
  div.className    = 'task-row';
  div.dataset.id   = id;
  div.dataset.rest = isRest ? '1' : '0';
  div.innerHTML = `
    ${isRest ? '<span class="rest-tag">🌿 Descanso</span>' : ''}
    <input type="text" placeholder="${isRest ? 'Descanso' : 'Nombre de la tarea'}"
      value="${isRest ? 'Descanso' : ''}"
      style="flex:1;border:none;background:transparent;color:var(--text);font-size:.88rem;padding:2px 4px;outline:none;">
    <input type="number" class="min-input" min="1" max="180" value="${isRest ? 5 : 25}" title="Minutos">
    <span style="font-size:.7rem;color:var(--muted);flex-shrink:0;">min</span>
    <button class="remove-btn" onclick="removeRow('${id}')">✕</button>
  `;
  document.getElementById('taskRows').appendChild(div);
  div.querySelector('input[type="number"]').addEventListener('input', updateTotal);
  updateTotal();
}

function removeRow(id) {
  const el = document.querySelector(`[data-id="${id}"]`);
  if (el) el.remove();
  updateTotal();
}

function updateTotal() {
  let total = 0;
  document.querySelectorAll('#taskRows .task-row').forEach(row => {
    total += parseFloat(row.querySelector('input[type="number"]').value) || 0;
  });
  document.querySelector('#totalPreview span').textContent = total + ' min';
}

// ── CREATE ─────────────────────────────────────────────
function createActivity() {
  const name = document.getElementById('actName').value.trim();
  if (!name) { alert('Escribe el nombre de la actividad.'); return; }
  const rows = document.querySelectorAll('#taskRows .task-row');
  if (!rows.length) { alert('Agrega al menos una tarea.'); return; }

  const tasks = [];
  rows.forEach(row => {
    const label = row.querySelector('input[type="text"]').value.trim() || 'Tarea';
    const mins  = parseFloat(row.querySelector('input[type="number"]').value) || 1;
    const rest  = row.dataset.rest === '1';
    tasks.push({ label, mins, rest });
  });

  const total = tasks.reduce((s, t) => s + t.mins, 0);
  activities.push({ id: Date.now(), name, tasks, total });
  renderSidebar();

  document.getElementById('actName').value = '';
  document.getElementById('taskRows').innerHTML = '';
  rowCount = 0;
  updateTotal();

  loadActivity(activities.length - 1);
}

// ── SIDEBAR ────────────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById('activityList');
  document.getElementById('sidebarEmpty').style.display = activities.length ? 'none' : 'flex';
  list.querySelectorAll('.activity-card').forEach(c => c.remove());

  activities.forEach((act, i) => {
    const card = document.createElement('div');
    card.className = 'activity-card' + (activeIdx === i ? ' active' : '');

    const tasksHTML = act.tasks.map(t => `
      <div class="task-pill${t.rest ? ' is-rest' : ''}">
        <span>${t.rest ? '🌿 ' : ''}${t.label}</span>
        <span class="pill-min">${t.mins}m</span>
      </div>`).join('');

    card.innerHTML = `
      <div class="activity-card-head">
        <span class="name" onclick="loadActivity(${i})">${act.name}</span>
        <span class="total">⏱ ${act.total} min</span>
        <div style="display:flex; gap:4px; flex-shrink:0;">
          <button class="delete-btn" onclick="openEditModal(${i})" title="Editar actividad">✏️</button>
          <button class="delete-btn" onclick="deleteActivity(${i})" title="Borrar actividad">🗑</button>
        </div>
      </div>
      <div class="activity-card-tasks" onclick="loadActivity(${i})">${tasksHTML}</div>
    `;
    list.appendChild(card);
  });
}

// ── LOAD ACTIVITY ──────────────────────────────────────
function loadActivity(idx) {
  stopTimer();
  activeIdx = idx;
  taskIdx   = 0;

  document.getElementById('timerEmpty').style.display      = 'none';
  // FIX #1: display correcto al mostrar el panel activo
  document.getElementById('timerActive').style.display     = 'flex';
  document.getElementById('completeBadge').style.display   = 'none';
  document.getElementById('btnPlay').disabled              = false;
  document.getElementById('btnNext').disabled              = false;

  renderSidebar();
  loadTask(0);
}

function loadTask(ti) {
  const act  = activities[activeIdx];
  if (!act) return;
  taskIdx   = ti;
  const task = act.tasks[ti];
  remaining  = task.mins * 60;
  totalSecs  = task.mins * 60;
  running    = false;

  document.getElementById('timerActTitle').textContent = act.name;
  document.getElementById('timerTaskName').textContent =
    `${ti + 1}/${act.tasks.length} · ${task.rest ? '🌿 ' : ''}${task.label}`;
  // FIX #4: texto del botón siempre consistente al cargar tarea
  document.getElementById('btnPlay').textContent = '▶ Iniciar';
  document.getElementById('ringLabel').textContent = task.rest ? 'descanso' : 'listo';

  document.getElementById('ringFg').style.stroke = task.rest ? 'var(--rest)' : 'var(--accent)';
  updateRing(remaining, totalSecs);
  // FIX #3: actualizar progreso al cargar cada tarea
  updateProgressSteps();
}

// ── TIMER ──────────────────────────────────────────────
function playPause() {
  if (activeIdx === null) return;
  const act = activities[activeIdx];
  if (taskIdx >= act.tasks.length) return;

  running = !running;
  document.getElementById('btnPlay').textContent =
    running ? '⏸ Pausar' : '▶ Reanudar';
  document.getElementById('ringLabel').textContent = running
    ? (act.tasks[taskIdx].rest ? 'descanso' : 'enfocado')
    : 'pausado';

  // FIX #3: reflejar estado activo en la barra de progreso al iniciar/reanudar
  updateProgressSteps();

  if (running) {
    timerID = setInterval(tick, 1000);
  } else {
    clearInterval(timerID);
  }
}

function tick() {
  remaining--;
  updateRing(remaining, totalSecs);

  if (remaining <= 0) {
    clearInterval(timerID);
    running = false;
    const act = activities[activeIdx];
    
    // NUEVO: Identificar tarea actual y reproducir sonido correspondiente
    const currentTask = act.tasks[taskIdx];
    AudioEngine.playAlert(currentTask.rest);

    if (taskIdx + 1 < act.tasks.length) {
      loadTask(taskIdx + 1);
      setTimeout(() => playPause(), 600);
    } else {
      // FIX #2: estado de completado correcto al terminar la última tarea
      document.getElementById('ringLabel').textContent = '¡listo!';
      document.getElementById('btnPlay').textContent   = '▶ Iniciar';
      document.getElementById('btnPlay').disabled      = true;
      document.getElementById('btnNext').disabled      = true;
      document.getElementById('completeBadge').style.display = 'block';
      updateProgressSteps(true);
    }
  }
}

// FIX #2: nextTask muestra completado si ya no hay más tareas
function nextTask() {
  const act = activities[activeIdx];
  if (!act) return;
  stopTimer();

  if (taskIdx + 1 < act.tasks.length) {
    loadTask(taskIdx + 1);
  } else {
    // última tarea: marcar como completado
    document.getElementById('ringLabel').textContent = '¡listo!';
    document.getElementById('btnPlay').disabled      = true;
    document.getElementById('btnNext').disabled      = true;
    document.getElementById('completeBadge').style.display = 'block';
    updateProgressSteps(true);
  }
}

function resetTimer() {
  stopTimer();
  if (activeIdx !== null) {
    document.getElementById('completeBadge').style.display = 'none';
    document.getElementById('btnPlay').disabled  = false;
    document.getElementById('btnNext').disabled  = false;
    loadTask(taskIdx);
  }
}

// FIX #4: stopTimer también restaura texto del botón
function stopTimer() {
  clearInterval(timerID);
  running = false;
  const btn = document.getElementById('btnPlay');
  if (btn && !btn.disabled) btn.textContent = '▶ Iniciar';
}

// ── RING ───────────────────────────────────────────────
const CIRCUM = 2 * Math.PI * 80; // 502.65

function updateRing(rem, tot) {
  const frac   = tot > 0 ? rem / tot : 1;
  const offset = CIRCUM * (1 - frac);
  document.getElementById('ringFg').style.strokeDashoffset = offset;
  document.getElementById('ringTime').textContent = fmt(rem);
}

function fmt(s) {
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

// ── PROGRESS STEPS ─────────────────────────────────────
function updateProgressSteps(allDone = false) {
  const act = activities[activeIdx];
  if (!act) return;
  const container = document.getElementById('progressSteps');
  container.innerHTML = '';
  act.tasks.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = 'prog-step' + (t.rest ? ' is-rest' : '');
    if      (allDone || i < taskIdx) div.classList.add('done');
    else if (i === taskIdx)          div.classList.add('active');
    div.title = `${t.label} · ${t.mins}m`;
    container.appendChild(div);
  });
}

// ── DELETE ─────────────────────────────────────────────
function deleteActivity(idx) {
  if (!confirm(`¿Borrar "${activities[idx].name}"?`)) return;
  stopTimer();
  activities.splice(idx, 1);

  if (activeIdx === idx) {
    activeIdx = null;
    document.getElementById('timerActive').style.display = 'none';
    document.getElementById('timerEmpty').style.display  = 'flex';
  } else if (activeIdx !== null && activeIdx > idx) {
    activeIdx--;
  }
  renderSidebar();
}

// ── EXPORT ─────────────────────────────────────────────
function exportActivities(format) {
  if (!activities.length) { alert('No hay actividades para exportar.'); return; }

  const now     = new Date();
  const dateStr = `${DAYS[now.getDay()]}, ${now.getDate()} de ${MONTHS[now.getMonth()]} de ${now.getFullYear()}`;
  const hh      = String(now.getHours()).padStart(2,'0');
  const mm      = String(now.getMinutes()).padStart(2,'0');
  const fecha   = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  let content = '';
  let grandTotal = 0;
  activities.forEach(a => { grandTotal += a.total; });

  if (format === 'md') {
    content += `# 📅 Registro del día — ${dateStr}\n`;
    content += `**Exportado:** ${hh}:${mm}\n\n---\n\n`;
    activities.forEach((act, i) => {
      content += `## ${i + 1}. ${act.name}  _(${act.total} min)_\n\n`;
      act.tasks.forEach(t => {
        content += `- ${t.rest ? '🌿' : '✅'} **${t.label}** — ${t.mins} min\n`;
      });
      content += `\n`;
    });
    content += `---\n\n**Total planificado:** ${grandTotal} min (${(grandTotal/60).toFixed(1)} h)\n`;
  } else {
    const sep = '─'.repeat(40);
    content += `REGISTRO DEL DÍA — ${dateStr.toUpperCase()}\n`;
    content += `Exportado: ${hh}:${mm}\n${sep}\n\n`;
    activities.forEach((act, i) => {
      content += `${i + 1}. ${act.name.toUpperCase()}  [${act.total} min]\n`;
      act.tasks.forEach(t => {
        content += `   ${t.rest ? '○' : '•'} ${t.label} — ${t.mins} min\n`;
      });
      content += `\n`;
    });
    content += `${sep}\nTOTAL: ${grandTotal} min (${(grandTotal/60).toFixed(1)} h)\n`;
  }

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `pomofocus-${fecha}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── EDIT ACTIVITY (NIVEL EXPERTO) ──────────────────────
function openEditModal(idx) {
  const act = activities[idx];
  if (!act) return;

  // Cargar datos básicos
  document.getElementById('editActIndex').value = idx;
  document.getElementById('editActName').value = act.name;
  
  // Limpiar y cargar filas de tareas
  const container = document.getElementById('editTaskRows');
  container.innerHTML = '';
  
  act.tasks.forEach(t => {
    addEditTaskRow(t.rest, t.label, t.mins);
  });
  
  updateEditTotal();
  document.getElementById('editActivityModal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('editActivityModal').classList.add('hidden');
}

function addEditTaskRow(isRest = false, labelVal = '', minsVal = '') {
  const div = document.createElement('div');
  div.className = 'task-row';
  div.dataset.rest = isRest ? '1' : '0';
  
  const defaultLabel = isRest ? 'Descanso' : '';
  const finalLabel = labelVal || defaultLabel;
  const finalMins = minsVal || (isRest ? 5 : 25);

  div.innerHTML = `
    ${isRest ? '<span class="rest-tag">🌿 Descanso</span>' : ''}
    <input type="text" placeholder="${isRest ? 'Descanso' : 'Nombre de la tarea'}"
      value="${finalLabel}"
      style="flex:1;border:none;background:transparent;color:var(--text);font-size:.88rem;padding:2px 4px;outline:none;">
    <input type="number" class="min-input edit-min-input" min="1" max="180" value="${finalMins}" title="Minutos">
    <span style="font-size:.7rem;color:var(--muted);flex-shrink:0;">min</span>
    <button class="remove-btn" onclick="this.parentElement.remove(); updateEditTotal();">✕</button>
  `;
  
  document.getElementById('editTaskRows').appendChild(div);
  
  // Escuchar cambios para recalcular el total dinámicamente
  div.querySelector('.edit-min-input').addEventListener('input', updateEditTotal);
  updateEditTotal();
}

function updateEditTotal() {
  let total = 0;
  document.querySelectorAll('#editTaskRows .task-row').forEach(row => {
    total += parseFloat(row.querySelector('.edit-min-input').value) || 0;
  });
  document.getElementById('editTotalSpan').textContent = total + ' min';
}

function saveActivityEdit() {
  const idx = parseInt(document.getElementById('editActIndex').value);
  const act = activities[idx];
  if (!act) return;

  const name = document.getElementById('editActName').value.trim();
  if (!name) { 
    alert('El nombre de la actividad no puede estar vacío.'); 
    return; 
  }

  const rows = document.querySelectorAll('#editTaskRows .task-row');
  if (!rows.length) { 
    alert('La actividad debe tener al menos una tarea.'); 
    return; 
  }

  const tasks = [];
  rows.forEach(row => {
    const label = row.querySelector('input[type="text"]').value.trim() || 'Tarea';
    const mins  = parseFloat(row.querySelector('.edit-min-input').value) || 1;
    const rest  = row.dataset.rest === '1';
    tasks.push({ label, mins, rest });
  });

  const total = tasks.reduce((s, t) => s + t.mins, 0);

  // Mutación del objeto original
  act.name = name;
  act.tasks = tasks;
  act.total = total;

  // Actualización de la interfaz
  renderSidebar();
  
  // Si la actividad editada es la que está en curso, recargarla para evitar desincronización
  if (activeIdx === idx) {
    // Validación de seguridad por si se eliminó la tarea que estaba activa
    if (taskIdx >= tasks.length) taskIdx = 0;
    
    // Detener temporizador actual y recargar datos frescos
    stopTimer();
    loadTask(taskIdx); 
  }

  closeEditModal();
}

// ── AUDIO UI CONTROLS ──────────────────────────────────
function toggleAudioSettings() {
  const modal = document.getElementById('audioSettingsModal');
  modal.classList.toggle('hidden');
  
  // Sincronizar UI con el estado del motor al abrir
  if (!modal.classList.contains('hidden')) {
    document.getElementById('volSlider').value = AudioEngine.volume;
    document.getElementById('soundTypeSel').value = AudioEngine.soundType;
    document.getElementById('customSoundField').style.display = AudioEngine.soundType === 'custom' ? 'block' : 'none';
  }
}

function updateVolume(val) {
  AudioEngine.volume = parseFloat(val);
  localStorage.setItem('pomo_volume', AudioEngine.volume);
  
  // Sonido de prueba para ajustar el volumen
  const testAudio = new Audio('https://actions.google.com/sounds/v1/water/water_drop.ogg');
  testAudio.volume = AudioEngine.volume;
  testAudio.play().catch(()=>{});
}

function changeSoundType(val) {
  AudioEngine.soundType = val;
  localStorage.setItem('pomo_soundType', val);
  document.getElementById('customSoundField').style.display = val === 'custom' ? 'block' : 'none';
}

function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Validación de tamaño (Límite de 2MB para proteger el almacenamiento del navegador)
  const maxSize = 2 * 1024 * 1024; 
  if (file.size > maxSize) {
    alert('El archivo es demasiado grande. Por favor, elige un audio menor a 2MB.');
    event.target.value = ''; // Limpiar el input
    return;
  }

  const reader = new FileReader();
  
  reader.onload = function(e) {
    const base64Audio = e.target.result;
    
    try {
      // Guardar en almacenamiento local y actualizar el estado del motor
      localStorage.setItem('pomo_customAudio', base64Audio);
      AudioEngine.customAudioData = base64Audio;
      
      alert('✅ Sonido personalizado cargado y guardado correctamente.');
      
      // Reproducir una prueba del nuevo sonido con el volumen actual
      const testAudio = new Audio(base64Audio);
      testAudio.volume = AudioEngine.volume;
      testAudio.play().catch(err => console.warn("Prueba de audio bloqueada.", err));
      
    } catch (error) {
      console.error("Error al guardar en localStorage", error);
      alert('Error de almacenamiento. La memoria asignada por el navegador podría estar llena.');
    }
  };

  reader.onerror = function() {
    alert('Ocurrió un error al procesar el archivo de audio.');
  };

  // Ejecutar la conversión a formato Base64
  reader.readAsDataURL(file);
}

// ── DEMO DATA ──────────────────────────────────────────
(function loadExamples() {
  activities = [
    {
      id: 1,
      name: 'Aseo del cuarto',
      tasks: [
        { label: 'Tender la cama',  mins: 8,  rest: false },
        { label: 'Ordenar y barrer', mins: 17, rest: false },
        { label: 'Descanso',         mins: 5,  rest: true  },
      ],
      total: 30
    },
    {
      id: 2,
      name: 'Estudiar Docker',
      tasks: [
        { label: 'Estudio',  mins: 50, rest: false },
        { label: 'Descanso', mins: 10, rest: true  },
      ],
      total: 60
    }
  ];

  addTaskRow(false);
  addTaskRow(false);
  addTaskRow(true);

  const rows = document.querySelectorAll('#taskRows .task-row');
  if (rows[0]) {
    rows[0].querySelector('input[type="text"]').value   = 'Tender la cama';
    rows[0].querySelector('input[type="number"]').value = '8';
  }
  if (rows[1]) {
    rows[1].querySelector('input[type="text"]').value   = 'Ordenar y barrer';
    rows[1].querySelector('input[type="number"]').value = '17';
  }
  document.getElementById('actName').value = 'Aseo del cuarto';
  updateTotal();
  renderSidebar();
})();