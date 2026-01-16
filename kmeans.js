const CONFIG_K = {
  // Ganti dengan URL Web App Apps Script Anda
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxsnhOY39niKL2QWGlBSXrrtb_9weikogUk_59anxkvPpsxFr9d8M1pS5PQ06SmPQQw/exec",
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

function euclidean(a, b) { 
  return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0)); 
}

function kmeans(data, k, maxIter = 50) {
  let centroids = data.slice().sort(() => Math.random() - 0.5).slice(0, k).map(p => [...p]);
  let assignments = new Array(data.length).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < data.length; i++) {
      let minDist = Infinity, clusterIdx = -1;
      for (let j = 0; j < k; j++) {
        let dist = euclidean(data[i], centroids[j]);
        if (dist < minDist) { minDist = dist; clusterIdx = j; }
      }
      if (assignments[i] !== clusterIdx) { changed = true; assignments[i] = clusterIdx; }
    }
    if (!changed) break;
    let newCentroids = Array.from({ length: k }, () => Array(data[0].length).fill(0));
    let counts = Array(k).fill(0);
    data.forEach((p, i) => { counts[assignments[i]]++; p.forEach((v, dim) => newCentroids[assignments[i]][dim] += v); });
    centroids = newCentroids.map((c, j) => counts[j] > 0 ? c.map(v => v / counts[j]) : centroids[j]);
  }
  return { centroids, assignments };
}

document.getElementById("load-data")?.addEventListener("click", async () => {
  const pw = document.getElementById("admin-password").value;
  const status = document.getElementById("status-message");
  try {
    const res = await fetch(`${CONFIG_K.APPS_SCRIPT_URL}?action=get_all&pw=${pw}`);
    const json = await res.json();
    if (json.status !== "ok") throw new Error();
    rawData = json.data;
    const numeric = rawData.map(d => CONFIG_K.CLUSTERING_VARS.map(v => parseFloat(d[v] || 0)));
    const mins = Array(14).fill(Infinity), maxs = Array(14).fill(-Infinity);
    numeric.forEach(p => p.forEach((v, i) => { mins[i]=Math.min(mins[i],v); maxs[i]=Math.max(maxs[i],v); }));
    clusteringData = numeric.map(p => p.map((v, i) => (v - mins[i]) / ((maxs[i] - mins[i]) || 1)));
    document.getElementById("login-section").classList.add("hidden");
    document.getElementById("main-app").classList.remove("hidden");
    const opt = CONFIG_K.CLUSTERING_VARS.map(v => `<option value="${v}">${v}</option>`).join("");
    document.getElementById("select-x").innerHTML = opt; document.getElementById("select-y").innerHTML = opt;
  } catch (e) { status.textContent = "Gagal memuat data."; }
});

document.getElementById("elbow-btn")?.addEventListener("click", () => {
  const sse = [];
  for (let k=1; k<=8; k++) {
    const res = kmeans(clusteringData, k);
    sse.push(clusteringData.reduce((s, p, i) => s + Math.pow(euclidean(p, res.centroids[res.assignments[i]]), 2), 0));
  }
  renderElbowChart(sse);
  document.getElementById("elbow-container").classList.remove("hidden");
  document.getElementById("k-optimal").innerHTML = sse.map((_,i) => `<option value="${i+1}">K=${i+1}</option>`).join("");
  document.getElementById("execution-step").classList.remove("hidden");
});

document.getElementById("analyze-btn")?.addEventListener("click", () => {
  const k = parseInt(document.getElementById("k-optimal").value);
  const res = kmeans(clusteringData, k);
  currentAssignments = res.assignments; currentCentroids = res.centroids;
  document.getElementById("results-section").classList.remove("hidden");
  renderScatter(); renderSummary();
});

document.getElementById("select-x").onchange = renderScatter;
document.getElementById("select-y").onchange = renderScatter;

function renderElbowChart(sse) {
  const ctx = document.getElementById("elbowChart");
  if (elbowChartInstance) elbowChartInstance.destroy();
  elbowChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels: [1,2,3,4,5,6,7,8], datasets: [{ label: 'SSE', data: sse, borderColor: '#3B82F6', fill: false }] },
    options: { responsive: true, maintainAspectRatio: false } 
  });
}

function renderScatter() {
  const ctx = document.getElementById("scatterChart");
  if (scatterChartInstance) scatterChartInstance.destroy();
  const vX = document.getElementById("select-x").value, vY = document.getElementById("select-y").value;
  const iX = CONFIG_K.CLUSTERING_VARS.indexOf(vX), iY = CONFIG_K.CLUSTERING_VARS.indexOf(vY);
  const k = currentCentroids.length;
  
  const ds = Array.from({length: k}, (_, i) => ({
    label: `Cluster ${i+1}`,
    data: clusteringData.filter((_, idx) => currentAssignments[idx] === i).map(p => ({x: p[iX], y: p[iY]})),
    backgroundColor: `hsl(${i * 360/k}, 70%, 50%)`,
    pointRadius: 4
  }));
  
  // Dataset Centroid (Pusat Massa)
  ds.push({ 
    label: 'PUSAT KLASTER (CENTROID)', 
    data: currentCentroids.map(c => ({x: c[iX], y: c[iY]})), 
    backgroundColor: '#000', 
    pointStyle: 'crossRot', 
    pointRadius: 12,
    borderWidth: 3
  });

  scatterChartInstance = new Chart(ctx, {
    type: 'scatter',
    data: { datasets: ds },
    options: { 
      responsive: true, maintainAspectRatio: false,
      scales: { 
        xAxes: [{ scaleLabel: {display:true, labelString: vX}, ticks: {min:0, max:1} }], 
        yAxes: [{ scaleLabel: {display:true, labelString: vY}, ticks: {min:0, max:1} }] 
      }
    }
  });
}

function renderSummary() {
  const container = document.getElementById("result-text");
  container.innerHTML = "";
  for (let i = 0; i < currentCentroids.length; i++) {
    const pts = rawData.filter((_, idx) => currentAssignments[idx] === i);
    let html = `<div class="p-4 border-2 rounded-lg bg-white shadow-sm border-blue-100">
      <h4 class="font-bold text-blue-900 border-b mb-2">Klaster ${i+1} (n=${pts.length})</h4>
      <div class="text-xs space-y-1">`;
    
    CONFIG_K.CLUSTERING_VARS.forEach(v => {
      const avg = pts.reduce((s, c) => s + parseFloat(c[v]||0), 0) / pts.length;
      // Menampilkan karakteristik dominan (>40%)
      if (avg > 0.4) {
          let label = v.replace('Kategori_','').replace('Sifat_','');
          let val = (avg*100).toFixed(0) + "%";
          if(v === "durasi_video") val = MAPPING.durasi[Math.round(avg)];
          if(v === "format_video") val = MAPPING.format[Math.round(avg)];
          html += `<div class="flex justify-between"><span>${label}:</span><span class="font-bold text-blue-600">${val}</span></div>`;
      }
    });
    container.innerHTML += html + `</div></div>`;
  }
}
