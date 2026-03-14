const CONFIG_K = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbymtVDiTmF3kNpy-NcjRLhm0Lv2DkflrBMqTK6VOhYMS9fjd1Dr7bYkPXoA13_eAr8V/exec",
  
  CLUSTERING_VARS: [
    "Kategori_Komedi", "Kategori_Edukasi", "Kategori_Makanan", "Kategori_Kecantikan", 
    "Kategori_Musik", "Kategori_Gaming", "Kategori_Berita", "Kategori_Travel",
    "Sifat_Fakta", "Sifat_Hiburan", "Sifat_Inspirasi", "Sifat_Estetik",
    "durasi_video", "format_video"
  ]
};

const MAPPING = {
  durasi: { "1": "< 15s", "2": "15-30s", "3": "30-60s", "4": "> 60s" },
  format: { "1": "Vertical", "2": "Kolase", "3": "Live" }
};

let rawData = [], clusteringData = [], currentAssignments = [], currentCentroids = [];
let elbowChartInstance = null, scatterChartInstance = null;

// Fungsi Normalisasi Min-Max
function normalize(data) {
  if (data.length === 0) return [];
  const numCols = data[0].length;
  const mins = Array(numCols).fill(0).map((_, i) => Math.min(...data.map(d => d[i])));
  const maxs = Array(numCols).fill(0).map((_, i) => Math.max(...data.map(d => d[i])));
  
  return data.map(row => 
    row.map((val, i) => {
      const range = maxs[i] - mins[i];
      return range === 0 ? 0 : (val - mins[i]) / range;
    })
  );
}

// Jarak Euclidean antara dua titik
function euclidean(a, b) { 
  return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0)); 
}

// Algoritma K-Means dari Nol
function kmeans(data, k, maxIter = 50) {
  if (data.length === 0 || k <= 0) return { centroids: [], assignments: [] };
  
  // Inisialisasi Centroid: Pilih k titik secara acak dari data
  let centroids = data.slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(k, data.length))
    .map(p => [...p]);

  let assignments = new Array(data.length).fill(0);
  
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    
    // Tahap Assignment: Cari cluster terdekat untuk tiap titik
    for (let i = 0; i < data.length; i++) {
      let minDist = Infinity, clusterIdx = -1;
      for (let j = 0; j < centroids.length; j++) {
        let dist = euclidean(data[i], centroids[j]);
        if (dist < minDist) { minDist = dist; clusterIdx = j; }
      }
      if (assignments[i] !== clusterIdx) { changed = true; assignments[i] = clusterIdx; }
    }
    
    if (!changed) break; // Berhenti jika tidak ada perubahan
    
    // Tahap Update: Hitung ulang posisi centroid (rata-rata)
    let newCentroids = Array.from({ length: centroids.length }, () => Array(data[0].length).fill(0));
    let counts = Array(centroids.length).fill(0);
    
    data.forEach((p, i) => { 
      counts[assignments[i]]++; 
      p.forEach((v, dim) => newCentroids[assignments[i]][dim] += v); 
    });
    
    centroids = newCentroids.map((c, j) => 
      counts[j] > 0 ? c.map(v => v / counts[j]) : centroids[j]
    );
  }
  return { centroids, assignments };
}

// Tombol Ambil Data dari Spreadsheet
document.getElementById("load-data")?.addEventListener("click", async () => {
  const pw = document.getElementById("admin-password").value;
  const status = document.getElementById("status-message");
  status.textContent = "⏳ Mengambil data dari Google Sheets...";
  
  try {
    const res = await fetch(`${CONFIG_K.APPS_SCRIPT_URL}?action=get_all&pw=${pw}`);
    const json = await res.json();
    if (json.status !== "ok") throw new Error(json.message);
    
    rawData = json.data;
    renderRawTable(rawData);

    // Konversi Data Mentah ke Numerik
    const numericData = rawData.map(d => 
      CONFIG_K.CLUSTERING_VARS.map(v => {
        const val = parseFloat(d[v]);
        return isNaN(val) ? 0 : val;
      })
    );
    
    // Normalisasi agar variabel Durasi (1-4) tidak mendominasi Biner (0-1)
    clusteringData = normalize(numericData); 

    document.getElementById("login-section").classList.add("hidden");
    document.getElementById("main-app").classList.remove("hidden");
    
    // Isi Dropdown Scatter Plot
    const opt = CONFIG_K.CLUSTERING_VARS.map(v => `<option value="${v}">${v}</option>`).join("");
    document.getElementById("select-x").innerHTML = opt; 
    document.getElementById("select-y").innerHTML = opt;
    status.textContent = "";
  } catch (e) { 
    status.textContent = "❌ Error: " + e.message; 
    console.error(e);
  }
});

// Tombol Mencari K Optimal (Metode Elbow)
document.getElementById("elbow-btn")?.addEventListener("click", () => {
  if (clusteringData.length === 0) return alert("Data belum dimuat!");
  const sse = [];
  
  // Hitung SSE untuk k = 1 sampai 8
  for (let k=1; k<=8; k++) {
    const res = kmeans(clusteringData, k);
    let error = 0;
    clusteringData.forEach((p, i) => {
      error += Math.pow(euclidean(p, res.centroids[res.assignments[i]]), 2);
    });
    sse.push(error);
  }
  
  renderElbowChart(sse);
  document.getElementById("elbow-container").classList.remove("hidden");
  document.getElementById("k-optimal").innerHTML = sse.map((_,i) => `<option value="${i+1}">K=${i+1}</option>`).join("");
  document.getElementById("execution-step").classList.remove("hidden");
});

// Tombol Analisis Final (Clustering)
document.getElementById("analyze-btn")?.addEventListener("click", () => {
  const k = parseInt(document.getElementById("k-optimal").value);
  const res = kmeans(clusteringData, k);
  currentAssignments = res.assignments; 
  currentCentroids = res.centroids;
  
  document.getElementById("results-section").classList.remove("hidden");
  renderScatter(); 
  renderSummary();
});

// ==========================================
// 3. VISUALIZATION FUNCTIONS (Chart.js)
// ==========================================

function renderElbowChart(sse) {
  const ctx = document.getElementById("elbowChart");
  if (elbowChartInstance) elbowChartInstance.destroy();
  
  elbowChartInstance = new Chart(ctx, {
    type: 'line',
    data: { 
      labels: [1,2,3,4,5,6,7,8], 
      datasets: [{ 
        label: 'Sum of Squared Errors (SSE)', 
        data: sse, 
        borderColor: '#3B82F6', 
        backgroundColor: 'rgba(59, 130, 246, 0.1)', 
        fill: true, 
        tension: 0.3,
        pointRadius: 5
      }] 
    },
    options: { 
        responsive: true, 
        maintainAspectRatio: false,
        scales: { 
            y: { title: { display: true, text: 'SSE' }, beginAtZero: false },
            x: { title: { display: true, text: 'Jumlah Klaster (K)' } }
        }
    } 
  });
}

function renderRawTable(data) {
  const headerRow = document.getElementById("table-headers");
  const body = document.getElementById("table-body");
  if (!data || data.length === 0) return;

  const customHeaders = ["No", "Durasi", "Format", "Kategori Raw", "Sifat Raw"];
  headerRow.innerHTML = customHeaders.map(h => `<th class="p-3 border-b font-bold uppercase text-xs">${h}</th>`).join("");
  
  body.innerHTML = data.map((row, index) => `
      <tr class="hover:bg-gray-50 text-xs">
        <td class="p-3 border-b text-center font-medium">${index + 1}</td>
        <td class="p-3 border-b">${MAPPING.durasi[row.durasi_video] || row.durasi_video}</td>
        <td class="p-3 border-b">${MAPPING.format[row.format_video] || row.format_video}</td>
        <td class="p-3 border-b italic text-blue-700">${row.kategori_raw || "-"}</td>
        <td class="p-3 border-b italic text-green-700">${row.sifat_raw || "-"}</td>
      </tr>`).join("");
}

function renderScatter() {
  const ctx = document.getElementById("scatterChart");
  if (scatterChartInstance) scatterChartInstance.destroy();
  
  const vX = document.getElementById("select-x").value;
  const vY = document.getElementById("select-y").value;
  const iX = CONFIG_K.CLUSTERING_VARS.indexOf(vX);
  const iY = CONFIG_K.CLUSTERING_VARS.indexOf(vY);
  const k = currentCentroids.length;
  
  const datasets = Array.from({length: k}, (_, i) => ({
    label: `Klaster ${i+1}`,
    data: clusteringData.filter((_, idx) => currentAssignments[idx] === i).map(p => ({x: p[iX], y: p[iY]})),
    backgroundColor: `hsl(${i * 360/k}, 70%, 50%)`,
    pointRadius: 6
  }));
  
  // Tambahkan Titik Pusat (Centroid)
  datasets.push({ 
    label: 'PUSAT (CENTROID)', 
    data: currentCentroids.map(c => ({x: c[iX], y: c[iY]})), 
    backgroundColor: '#000', 
    pointStyle: 'crossRot', 
    pointRadius: 10, 
    borderWidth: 2 
  });

  scatterChartInstance = new Chart(ctx, {
    type: 'scatter',
    data: { datasets },
    options: { 
      responsive: true, maintainAspectRatio: false,
      scales: { 
        x: { title: { display: true, text: vX }, min: -0.1, max: 1.1 }, 
        y: { title: { display: true, text: vY }, min: -0.1, max: 1.1 } 
      }
    }
  });
}

function renderSummary() {
  const container = document.getElementById("result-text");
  container.innerHTML = "";
  
  for (let i = 0; i < currentCentroids.length; i++) {
    const pts = rawData.filter((_, idx) => currentAssignments[idx] === i);
    const total = pts.length;
    if (total === 0) continue;
    
    let html = `<div class="p-4 border-2 rounded-lg bg-white shadow-sm border-blue-100 mb-4">
      <h4 class="font-bold text-blue-900 border-b pb-1 mb-2">Klaster ${i+1} (n=${total} responden)</h4>
      <div class="text-[11px] space-y-2">`;
    
    CONFIG_K.CLUSTERING_VARS.forEach(v => {
      if (v.startsWith('Kategori_') || v.startsWith('Sifat_')) {
        const count = pts.reduce((s, c) => s + parseFloat(c[v]||0), 0);
        const pct = (count / total * 100).toFixed(0);
        if (pct > 40) { // Hanya tampilkan yang dominan (>40%)
            let label = v.replace('Kategori_','').replace('Sifat_','');
            html += `<div class="flex justify-between"><span>${label}:</span><span class="font-bold text-blue-600">${pct}%</span></div>`;
        }
      } else {
        const counts = {};
        pts.forEach(p => { counts[p[v]] = (counts[p[v]] || 0) + 1; });
        const mapKey = v.includes('durasi') ? 'durasi' : 'format';
        const labels = MAPPING[mapKey];
        
        let detail = `<div class="bg-gray-50 p-1 rounded mt-1">`;
        Object.keys(labels).forEach(key => {
          const pct = ((counts[key] || 0) / total * 100).toFixed(0);
          if (pct > 0) detail += `<div class="flex justify-between"><span>• ${labels[key]}</span><span>${pct}%</span></div>`;
        });
        detail += `</div>`;
        html += `<div class="mt-2"><span class="font-bold text-gray-400 uppercase text-[9px]">${v.replace('_',' ')}:</span>${detail}</div>`;
      }
    });
    container.innerHTML += html + `</div></div>`;
  }
}
