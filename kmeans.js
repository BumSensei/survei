/* ========================================================================
   FILE: kmeans.js (FINAL SYNCHRONIZED VERSION - HANYA DATA TIKTOK)
   ======================================================================== */

/* ==== 1. KONFIGURASI ==== */
const CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyw2AHLZs3KVqr_v99_oSH-Oy5zHUtEH3_y-tfBt_305weCdCXf5AxqDkGN1spqsvwO/exec",
  // VARIABEL CLUSTERING BARU (SUDAH OHE OLEH code.gs):
  // Total 20 variabel: 11 Kategori Konten OHE + 7 Sifat Video OHE + 2 Pilihan Ganda
  CLUSTERING_VARS: [
    "Kategori_Komedi", "Kategori_Edukasi", "Kategori_Makanan", "Kategori_Mode", "Kategori_Gaming", 
    "Kategori_Berita", "Kategori_Olahraga", "Kategori_DIY", "Kategori_Musik", "Kategori_Mental", "Kategori_Travel",
    "Sifat_Fakta", "Sifat_Hiburan", "Sifat_Relaksasi", "Sifat_Inspirasi", "Sifat_Narasi", "Sifat_Skill", "Sifat_Estetik",
    "durasi_video", "format_video"
  ]
};

const MAPPING = {
  durasi: { "1": "< 15 detik", "2": "15-30 detik", "3": "30-60 detik", "4": "> 60 detik" },
  format: { "1": "Narasi/Cerita", "2": "Tutorial/How-to", "3": "Review", "4": "Reaksi/Komentar" }
};

let fullDataset = [], clusteringData = [], elbowChartInstance = null, scatterChartInstance = null;

/* ==== 2. ALGORITMA INTI ==== */
function euclidean(a, b) { return Math.sqrt(a.reduce((sum, val, i) => sum + (val - b[i]) ** 2, 0)); }

function kmeans(data, k, maxIter = 100) {
  let centroids = data.slice().sort(() => Math.random() - 0.5).slice(0, k).map(p => [...p]);
  let assignments = new Array(data.length).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < data.length; i++) {
      let minDist = Infinity, clusterIdx = -1;
      for (let j = 0; j < k; j++) {
        const dist = euclidean(data[i], centroids[j]);
        if (dist < minDist) { minDist = dist; clusterIdx = j; }
      }
      if (assignments[i] !== clusterIdx) changed = true;
      assignments[i] = clusterIdx;
    }
    if (!changed) break;
    const newCentroids = Array.from({ length: k }, () => Array(data[0].length).fill(0));
    const counts = Array(k).fill(0);
    data.forEach((p, i) => { counts[assignments[i]]++; p.forEach((v, dim) => newCentroids[assignments[i]][dim] += v); });
    centroids = newCentroids.map((c, j) => counts[j] > 0 ? c.map(v => v / counts[j]) : centroids[j]);
  }
  return { centroids, assignments };
}

function calculateSSE(data, centroids, assignments) {
  return data.reduce((sum, p, i) => sum + euclidean(p, centroids[assignments[i]]) ** 2, 0);
}

/* ==== 3. AUTO-LABELING (FUNGSI LABELING DEFAULT) ==== */
function getAutoLabel(c) {
  // c[18] = durasi, c[19] = format
  let name = "Cluster Custom";
  if (c[18] > 0.6 && c[19] > 0.6) name = "Konten Panjang & Naratif";
  else if (c[0] > 0.5 || c[1] > 0.5) name = "Fokus Komedi/Edukasi";
  
  return { name: name, desc: "Analisis profil cluster ini secara mendalam di luar sistem." };
}

/* ==== 4. EVENT HANDLERS ==== */
document.addEventListener("DOMContentLoaded", () => {
  // LOAD DATA
  document.getElementById("load-data").addEventListener("click", async () => {
    const pw = document.getElementById("admin-password").value.trim();
    const status = document.getElementById("status-message");
    if (!pw) return alert("Masukkan Password!");
    status.textContent = "⏳ Menghubungi server..."; status.className = "text-center text-sm mt-4 text-blue-600 font-medium";
    try {
      const res = await fetch(`${CONFIG.APPS_SCRIPT_URL}?action=get_all&pw=${pw}`);
      const json = await res.json();
      if (json.status !== "ok") throw new Error(json.message);
      
      // Filter data. Memastikan semua variabel OHE ada dan valid
      fullDataset = json.data.filter(d => CONFIG.CLUSTERING_VARS.every(v => d[v] !== undefined && d[v] !== null && !isNaN(parseFloat(d[v])))); 
      if (fullDataset.length === 0) throw new Error("Data kosong. Pastikan data survei sudah masuk dan OHE di Sheets sudah siap.");
      
      // Data mentah hanya mengambil variabel OHE baru
      const raw = fullDataset.map(d => CONFIG.CLUSTERING_VARS.map(v => parseFloat(d[v] || 0)));
      const mins = Array(CONFIG.CLUSTERING_VARS.length).fill(Infinity), maxs = Array(CONFIG.CLUSTERING_VARS.length).fill(-Infinity);
      raw.forEach(p => p.forEach((v, i) => { mins[i] = Math.min(mins[i], v); maxs[i] = Math.max(maxs[i], v); }));
      clusteringData = raw.map(p => p.map((v, i) => (v - mins[i]) / ((maxs[i] - mins[i]) || 1)));

      document.getElementById("login-section").classList.add("hidden");
      document.getElementById("main-app").classList.remove("hidden");
      document.getElementById("data-count").textContent = `${fullDataset.length} Data`;
      renderRawTable(fullDataset.slice(0, 50));
    } catch (e) { status.textContent = `❌ ${e.message}`; status.className = "text-center text-sm mt-4 text-red-600 font-bold"; }
  });

  // ELBOW BUTTON
  document.getElementById("elbow-btn").addEventListener("click", () => {
    const sse = [];
    for(let k=1; k<=10; k++) {
      const {centroids, assignments} = kmeans(clusteringData, k);
      sse.push(calculateSSE(clusteringData, centroids, assignments));
    }
    renderElbowChart(sse);
    document.getElementById("elbow-container").classList.remove("hidden");
    document.getElementById("k-optimal").innerHTML = sse.map((_,i) => `<option value="${i+1}">${i+1}</option>`).join("");
    if(sse.length >= 3) document.getElementById("k-optimal").value = "3";
    document.getElementById("execution-step").classList.remove("hidden");
  });

  // ANALYZE BUTTON
  document.getElementById("analyze-btn").addEventListener("click", () => {
    const k = parseInt(document.getElementById("k-optimal").value);
    const { centroids, assignments } = kmeans(clusteringData, k);
    document.getElementById("results-section").classList.remove("hidden");
    document.getElementById("results-section").scrollIntoView({ behavior: 'smooth' });
    renderScatterChart(clusteringData, assignments, k);
    displaySimpleProfiling(k, assignments, centroids);
  });
});

/* ==== 5. RENDERING FUNCTIONS ==== */
function displaySimpleProfiling(k, assignments, centroids) {
  const counts = Array(k).fill(0); assignments.forEach(a => counts[a]++);
  
  // Profiling DOMINASI: Hitung Durasi dan Format yang Dominan
  const stats = Array.from({length: k}, () => ({ durasi:{}, format:{} })); 
  fullDataset.forEach((d, i) => {
    stats[assignments[i]].durasi[d.durasi_video] = (stats[assignments[i]].durasi[d.durasi_video] || 0) + 1;
    stats[assignments[i]].format[d.format_video] = (stats[assignments[i]].format[d.format_video] || 0) + 1;
  });

  let html = "";
  for(let i=0; i<k; i++) {
    const label = getAutoLabel(centroids[i]); 
    const pct = Math.round((counts[i] / fullDataset.length) * 100);
    const topDurasi = Object.entries(stats[i].durasi).sort((a,b) => b[1]-a[1])[0];
    const topFormat = Object.entries(stats[i].format).sort((a,b) => b[1]-a[1])[0];

    // Ambil Rata-rata 4 variabel kunci OHE (Komedi, Edukasi, Hiburan, Fakta)
    // Indeks: Komedi(0), Edukasi(1), Fakta(11), Hiburan(12)
    let avgStatsHtml = `
        <li>Kategori Komedi: <b>${centroids[i][0].toFixed(2)}</b></li>
        <li>Kategori Edukasi: <b>${centroids[i][1].toFixed(2)}</b></li>
        <li>Sifat Fakta: <b>${centroids[i][11].toFixed(2)}</b></li>
        <li>Sifat Hiburan: <b>${centroids[i][12].toFixed(2)}</b></li>
    `;

    html += `
      <div class="bg-gray-50 p-4 rounded-lg border-l-4 mb-4 shadow-sm" style="border-color: hsl(${i*360/k}, 70%, 50%)">
        <div class="flex justify-between items-start mb-2">
          <h4 class="font-bold text-lg text-blue-900">Cluster ${i+1}: ${label.name}</h4>
          <span class="text-xs bg-white px-2 py-1 rounded border font-semibold">${counts[i]} User (${pct}%)</span>
        </div>
        <p class="text-gray-700 text-sm mb-3 italic">${label.desc}</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div class="bg-white p-3 rounded border">
            <div class="font-bold text-gray-500 mb-1 text-xs uppercase">Rata-rata OHE Utama (0-1)</div>
            <ul class="text-gray-700 space-y-1">
              ${avgStatsHtml}
            </ul>
          </div>
          <div class="bg-white p-3 rounded border">
            <div class="font-bold text-gray-500 mb-1 text-xs uppercase">Dominasi Profil</div>
            <ul class="text-gray-700 space-y-1">
              <li>⏱️ Durasi: <b>${MAPPING.durasi[topDurasi?.[0]] || "-"}</b></li>
              <li>💬 Format: <b>${MAPPING.format[topFormat?.[0]] || "-"}</b></li>
            </ul>
          </div>
        </div>
      </div>
    `;
  }
  document.getElementById("result-text").innerHTML = html;
}

function renderElbowChart(sse) {
  const ctx = document.getElementById("elbowChart").getContext("2d");
  if(elbowChartInstance) elbowChartInstance.destroy();
  elbowChartInstance = new Chart(ctx, { type:'line', data:{labels:sse.map((_,i)=>i+1), datasets:[{label:'Error (SSE)', data:sse, borderColor:'#F59E0B', tension:0.2}]}, options:{scales:{y:{beginAtZero:true}}} });
}

function renderScatterChart(data, assignments, k) {
  const ctx = document.getElementById("scatterChart").getContext("2d");
  if(scatterChartInstance) scatterChartInstance.destroy();
  // Scatter Chart: Komedi (indeks 0) vs Edukasi (indeks 1)
  scatterChartInstance = new Chart(ctx, { 
    type:'scatter', 
    data:{
      datasets:Array.from({length:k},(_,i)=>({
        label:`Cluster ${i+1}`, 
        data:data.filter((_,idx)=>assignments[idx]===i).map(p=>({x:p[0],y:p[1]})), 
        backgroundColor:`hsl(${i*360/k},70%,50%)`
      }))
    }, 
    options:{
      plugins:{title:{display:true,text:'Peta: Kategori Komedi (X) vs Kategori Edukasi (Y) (Nilai 0-1)'}}, 
      scales:{
        x:{title:{display:true,text:'Kategori Komedi'}}, 
        y:{title:{display:true,text:'Kategori Edukasi'}}
      }
    } 
  });
}

function renderRawTable(data) {
  const t = document.getElementById("data-table");
  // Tampilkan hanya kolom yang ada di dataset baru
  let h = `<thead class="bg-gray-100 sticky top-0"><tr><th class="p-2">Durasi</th><th class="p-2">Format</th><th class="p-2">Kategori Raw</th><th class="p-2">Sifat Raw</th></tr></thead><tbody>`;
  data.forEach(r => h+=`<tr class="border-t"><td class="p-2">${MAPPING.durasi[r.durasi_video]||r.durasi_video}</td><td class="p-2">${MAPPING.format[r.format_video]||r.format_video}</td><td class="p-2 font-bold text-blue-600">${r.kategori_raw}</td><td class="p-2 font-bold text-green-600">${r.sifat_raw}</td></tr>`);
  t.innerHTML = h+"</tbody>";
}