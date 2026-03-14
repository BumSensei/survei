const CONFIG_K = {
  // GANTI URL DI BAWAH INI DENGAN URL DEPLOYMENT BARU ANDA
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

function cleanValue(val) {
  if (val === undefined || val === null || val === "") return 0;
  if (typeof val === "number") return val;
  let text = val.toString().toLowerCase().trim();
  
  if (text.includes("lebih dari 60") || text === "4") return 4;
  if (text.includes("30 - 60") || text.includes("30-60") || text === "3") return 3;
  if (text.includes("15 - 30") || text.includes("15-30") || text === "2") return 2;
  if (text.includes("kurang dari") || text === "1") return 1;
  if (text.includes("vertical") || text === "1") return 1;
  if (text.includes("kolase") || text === "2") return 2;
  if (text.includes("live") || text === "3") return 3;
  
  let num = parseFloat(text);
  return isNaN(num) ? 0 : num;
}

function normalize(data) {
  if (data.length === 0) return [];
  const mins = data[0].map((_, i) => Math.min(...data.map(d => d[i])));
  const maxs = data[0].map((_, i) => Math.max(...data.map(d => d[i])));
  return data.map(row => row.map((val, i) => (maxs[i] - mins[i] === 0) ? 0 : (val - mins[i]) / (maxs[i] - mins[i])));
}

function euclidean(a, b) { 
  return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0)); 
}

function kmeans(data, k, maxIter = 50) {
  if (data.length === 0 || k <= 0) return { centroids: [], assignments: [] };
  let centroids = data.slice().sort(() => Math.random() - 0.5).slice(0, Math.min(k, data.length)).map(p => [...p]);
  let assignments = new Array(data.length).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < data.length; i++) {
      let minDist = Infinity, clusterIdx = -1;
      for (let j = 0; j < centroids.length; j++) {
        let dist = euclidean(data[i], centroids[j]);
        if (dist < minDist) { minDist = dist; clusterIdx = j; }
      }
      if (assignments[i] !== clusterIdx) { changed = true; assignments[i] = clusterIdx; }
    }
    if (!changed) break;
    let newCentroids = Array.from({ length: centroids.length }, () => Array(data[0].length).fill(0));
    let counts = Array(centroids.length).fill(0);
    data.forEach((p, i) => { counts[assignments[i]]++; p.forEach((v, dim) => newCentroids[assignments[i]][dim] += v); });
    centroids = newCentroids.map((c, j) => counts[j] > 0 ? c.map(v => v / counts[j]) : centroids[j]);
  }
  return { centroids, assignments };
}

// PERBAIKAN FETCH API UNTUK MENGHINDARI "FAILED TO FETCH"
document.getElementById("load-data")?.addEventListener("click", async () => {
  const pw = document.getElementById("admin-password").value;
  const status = document.getElementById("status-message");
  status.textContent = "⏳ Memproses dan Mengambil Data...";
  status.className = "text-sm text-blue-600 mt-2 text-center";
  
  try {
    // encodeURIComponent penting agar karakter khusus di password tidak merusak URL
    const url = `${CONFIG_K.APPS_SCRIPT_URL}?action=get_all&pw=${encodeURIComponent(pw)}`;
    
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow' // Memaksa browser mengikuti pengalihan Google
    });

    if (!res.ok) {
      throw new Error(`HTTP Error: ${res.status}`);
    }

    const textResponse = await res.text();
    let json;
    
    try {
      json = JSON.parse(textResponse);
    } catch (parseError) {
      console.error("Respon bukan JSON:", textResponse);
      throw new Error("Gagal membaca data. Pastikan akses Deployment disetel ke 'Anyone'.");
    }

    if (json.status !== "ok") {
      throw new Error(json.message);
    }
    
    let raw = json.data;
    if (!raw || raw.length === 0) {
      throw new Error("Data di Google Sheets masih kosong!");
    }

    // AUTO-DETECT STRUKTUR DATA (Mengatasi data lama vs baru)
    if (Array.isArray(raw[0])) {
        let headers = raw[0];
        rawData = raw.slice(1).map(row => {
            let obj = {};
            headers.forEach((h, i) => obj[h.toString().trim()] = row[i]);
            return obj;
        });
    } else {
        rawData = raw;
    }

    renderRawTable(rawData);

    // Filter dan Ekstrak Variabel Numerik
    const numeric = rawData.map(d => CONFIG_K.CLUSTERING_VARS.map(v => cleanValue(d[v])));
    clusteringData = normalize(numeric);

    document.getElementById("login-section").classList.add("hidden");
    document.getElementById("main-app").classList.remove("hidden");
    status.textContent = "";
    
    const opt = CONFIG_K.CLUSTERING_VARS.map(v => `<option value="${v}">${v}</option>`).join("");
    document.getElementById("select-x").innerHTML = opt; 
    document.getElementById("select-y").innerHTML = opt;

  } catch (e) { 
    status.textContent = "❌ Error: " + e.message; 
    status.className = "text-sm text-red-600 mt-2 text-center font-bold";
    console.error(e);
  }
});

// EVENT LISTENER TOMBOL K-MEANS
document.getElementById("elbow-btn")?.addEventListener("click", () => {
  if (clusteringData.length === 0) return alert("Data kosong atau belum dimuat!");
  const sse = [];
  const maxK = Math.min(8, clusteringData.length); // Jangan buat K lebih besar dari jumlah data
  
  for (let k=1; k<=maxK; k++) {
    const res = kmeans(clusteringData, k);
    let totalSSE = 0;
    clusteringData.forEach((p, i) => { 
      totalSSE += Math.pow(euclidean(p, res.centroids[res.assignments[i]]), 2); 
    });
    sse.push(totalSSE);
  }
  
  renderElbowChart(sse);
  document.getElementById("elbow-container").classList.remove("hidden");
  document.getElementById("k-optimal").innerHTML = sse.map((_,i) => `<option value="${i+1}">K=${i+1}</option>`).join("");
  document.getElementById("execution-step").classList.remove("hidden");
});

document.getElementById("analyze-btn")?.addEventListener("click", () => {
  const k = parseInt(document.getElementById("k-optimal").value);
  const res = kmeans(clusteringData, k);
  currentAssignments = res.assignments; 
  currentCentroids = res.centroids;
  document.getElementById("results-section").classList.remove("hidden");
  renderScatter(); 
  renderSummary();
});

// --- UI Rendering ---
function renderElbowChart(sse) {
  const ctx = document.getElementById("elbowChart");
  if (elbowChartInstance) elbowChartInstance.destroy();
  elbowChartInstance = new Chart(ctx, {
    type: 'line',
    data: { 
      labels: Array.from({length: sse.length}, (_, i) => i + 1), 
      datasets: [{ label: 'SSE (Sum of Squared Errors)', data: sse, borderColor: '#3B82F6', fill: false, tension: 0.2 }] 
    },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

function renderRawTable(data) {
  const body = document.getElementById("table-body");
  body.innerHTML = data.map((row, i) => `
    <tr class="text-xs border-b hover:bg-gray-50">
      <td class="p-2 text-center">${i+1}</td>
      <td class="p-2">${row.durasi_video || "-"}</td>
      <td class="p-2">${row.format_video || "-"}</td>
      <td class="p-2 text-blue-600">${row.kategori_raw || "-"}</td>
      <td class="p-2 text-green-600">${row.sifat_raw || "-"}</td>
    </tr>`).join("");
}

function renderScatter() {
  const ctx = document.getElementById("scatterChart");
  if (scatterChartInstance) scatterChartInstance.destroy();
  const vX = document.getElementById("select-x").value, vY = document.getElementById("select-y").value;
  const iX = CONFIG_K.CLUSTERING_VARS.indexOf(vX), iY = CONFIG_K.CLUSTERING_VARS.indexOf(vY);
  
  const ds = Array.from({length: currentCentroids.length}, (_, i) => ({
    label: `Klaster ${i+1}`,
    data: clusteringData.filter((_, idx) => currentAssignments[idx] === i).map(p => ({x: p[iX], y: p[iY]})),
    backgroundColor: `hsl(${i * 360/currentCentroids.length}, 70%, 50%)`,
    pointRadius: 6
  }));
  
  // Tambah Centroid
  ds.push({ 
    label: 'Centroid', 
    data: currentCentroids.map(c => ({x: c[iX], y: c[iY]})), 
    backgroundColor: '#000', 
    pointStyle: 'crossRot', 
    pointRadius: 10, 
    borderWidth: 2 
  });

  scatterChartInstance = new Chart(ctx, { 
    type: 'scatter', 
    data: { datasets: ds }, 
    options: { 
      responsive: true, 
      maintainAspectRatio: false,
      scales: {
        x: { min: -0.1, max: 1.1, title: {display: true, text: vX} },
        y: { min: -0.1, max: 1.1, title: {display: true, text: vY} }
      }
    } 
  });
}

function renderSummary() {
  const container = document.getElementById("result-text");
  container.innerHTML = currentCentroids.map((c, i) => {
    const pts = rawData.filter((_, idx) => currentAssignments[idx] === i);
    return `<div class="p-3 border-2 border-blue-100 rounded mb-2 bg-white shadow-sm">
      <p class="font-bold text-blue-800">Klaster ${i+1} (n = ${pts.length} Responden)</p>
      <p class="text-[11px] text-gray-600 mt-1">Gunakan diagram Scatter Plot di atas untuk melihat persebaran responden pada klaster ini.</p>
    </div>`;
  }).join("");
}
