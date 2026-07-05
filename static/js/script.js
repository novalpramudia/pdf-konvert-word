const pdfInput = document.getElementById('pdfInput');
const dropZone = document.getElementById('dropZone');
const removeFileBtn = document.getElementById('removeFile');
const fileCard = document.getElementById('fileCard');
const fileNameEl = document.getElementById('fileName');
const fileMetaEl = document.getElementById('fileMeta');

const convertBtn = document.getElementById('convertBtn');
const progressCard = document.getElementById('progressCard');
const progressBar = document.getElementById('progressBar');
const progressPct = document.getElementById('progressPct');
const progressMessage = document.getElementById('progressMessage');
const progressStatus = document.getElementById('progressStatus');
const etaEl = document.getElementById('eta');
const loadingSpinner = document.getElementById('loadingSpinner');
const resultCard = document.getElementById('resultCard');
const downloadBtn = document.getElementById('downloadBtn');
const convertAnotherBtn = document.getElementById('convertAnother');

const toastEl = document.getElementById('toast');

const resultFileName = document.getElementById('resultFileName');
const resultPages = document.getElementById('resultPages');
const resultDate = document.getElementById('resultDate');
const resultSubtitle = document.getElementById('resultSubtitle');

let selectedFile = null;
let currentJobId = null;
let pollTimer = null;

function formatBytes(bytes){
  if(bytes === null || bytes === undefined) return '--';
  const kb = 1024;
  const mb = kb * 1024;
  if(bytes >= mb) return (bytes/mb).toFixed(2) + ' MB';
  if(bytes >= kb) return (bytes/kb).toFixed(2) + ' KB';
  return bytes + ' B';
}

function showToast(msg, isError=false){
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  toastEl.style.background = isError ? 'rgba(127,29,29,0.95)' : 'rgba(15,23,42,0.95)';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=>{
    toastEl.classList.add('hidden');
  }, 3200);
}

function setLoadingUI(on){
  loadingSpinner.classList.toggle('hidden', !on);
}

function resetUI(){
  selectedFile = null;
  currentJobId = null;
  if(pollTimer){ clearInterval(pollTimer); pollTimer = null; }

  pdfInput.value = '';
  fileCard.classList.add('hidden');
  progressCard.classList.add('hidden');
  resultCard.classList.add('hidden');
  convertBtn.disabled = true;

  fileNameEl.textContent = '';
  fileMetaEl.textContent = '';

  progressBar.style.width = '0%';
  progressPct.textContent = '0%';
  progressMessage.textContent = 'Uploading...';
  progressStatus.textContent = 'Queued';
  etaEl.textContent = '--';
}

function validatePdf(file){
  if(!file) return { ok:false, error:'No file selected.' };
  if(file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')){
    return { ok:false, error:'Only PDF files are allowed.' };
  }
  const max = 100 * 1024 * 1024;
  if(file.size > max){
    return { ok:false, error:'File too large. Max 100MB.' };
  }
  return { ok:true };
}

function updateFileCard(file, pages=null){
  fileCard.classList.remove('hidden');
  fileNameEl.textContent = file.name;

  const sizeStr = formatBytes(file.size);
  const pagesStr = pages === null || pages === undefined ? '—' : pages;
  fileMetaEl.innerHTML = `
    <div class="flex items-center gap-3">
      <span><i class="fa-solid fa-file"></i></span>
      <span>${sizeStr}</span>
      <span class="text-slate-300">•</span>
      <span><i class="fa-regular fa-file-lines"></i> ${pagesStr} pages</span>
    </div>
  `;
}

function startPolling(jobId){
  if(pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async ()=>{
    try{
      const res = await fetch(`/progress/${jobId}`);
      const json = await res.json();
      if(!json.ok){
        return;
      }

      const data = json.data;
      const pct = data.progress ?? 0;
      progressBar.style.width = pct + '%';
      progressPct.textContent = pct + '%';
      progressMessage.textContent = data.message || 'Processing...';
      progressStatus.textContent = (data.status || 'processing').replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase());

      // Simple ETA heuristic: decrease as progress rises.
      const remaining = Math.max(0, (100 - pct));
      const etaSec = Math.ceil((remaining/100) * 18); // ~ up to 18s
      etaEl.textContent = data.status === 'success' ? '0s' : `${etaSec}s`;

      if(data.status === 'success'){
        clearInterval(pollTimer);
        pollTimer = null;
        setLoadingUI(false);
      }
    }catch(e){
      // Ignore polling errors
    }
  }, 700);
}

async function handleConvert(){
  if(!selectedFile) return;

  // UI prep
  resultCard.classList.add('hidden');
  progressCard.classList.remove('hidden');
  progressBar.style.width = '0%';
  progressPct.textContent = '0%';
  progressMessage.textContent = 'Uploading...';
  progressStatus.textContent = 'Queued';
  etaEl.textContent = '--';
  setLoadingUI(true);

  convertBtn.disabled = true;

  const formData = new FormData();
  formData.append('pdf', selectedFile);

  try{
    const res = await fetch('/convert', {
      method: 'POST',
      body: formData
    });

    const json = await res.json();
    if(!json.ok){
      showToast(json.error || 'Conversion failed.', true);
      progressCard.classList.add('hidden');
      convertBtn.disabled = false;
      setLoadingUI(false);
      return;
    }

    currentJobId = json.job_id;

    // Start progress polling (even though server conversion is sync,
    // polling still helps keep UI consistent in local env).
    startPolling(currentJobId);

    // Update result
    const f = json.file;
    downloadBtn.href = json.download_url;
    resultFileName.textContent = f.original_name;
    resultPages.textContent = (f.pages === null || f.pages === undefined) ? '—' : f.pages;
    resultDate.textContent = new Date().toLocaleString();
    resultSubtitle.textContent = 'Your DOCX file is ready.';

    // Wait a moment for progress to reach success
    // (or fallback immediately if server already completed)
    setTimeout(()=>{
      resultCard.classList.remove('hidden');
    }, 500);

  }catch(e){
    showToast('Network/server error.', true);
    progressCard.classList.add('hidden');
    convertBtn.disabled = false;
    setLoadingUI(false);
  }
}

function setSelectedFile(file){
  const v = validatePdf(file);
  if(!v.ok){
    showToast(v.error, true);
    resetUI();
    return;
  }

  selectedFile = file;
  updateFileCard(file);
  convertBtn.disabled = false;
}

// File selection
pdfInput.addEventListener('change', ()=>{
  const file = pdfInput.files && pdfInput.files[0];
  setSelectedFile(file);
});

// Drag & drop
['dragenter','dragover'].forEach(evt=>{
  dropZone.addEventListener(evt, (e)=>{
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
});

['dragleave','drop'].forEach(evt=>{
  dropZone.addEventListener(evt, (e)=>{
    e.preventDefault();
    dropZone.classList.remove('dragover');
  });
});

dropZone.addEventListener('drop', (e)=>{
  const dt = e.dataTransfer;
  const file = dt && dt.files && dt.files[0];
  setSelectedFile(file);
});

// Remove
removeFileBtn.addEventListener('click', ()=>{
  resetUI();
});

// Convert
convertBtn.addEventListener('click', handleConvert);

// Convert another
convertAnotherBtn.addEventListener('click', ()=>{
  resetUI();
});

// Contact form (no API; just toast)
const contactSend = document.getElementById('contactSend');
contactSend?.addEventListener('click', ()=>{
  showToast('Message saved locally (demo).');
});

// Init
resetUI();

