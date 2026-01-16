const CONFIG_K = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbxFj17_Wk7ui_-E36xHSZwjF_gj5sqvPCgLqhCiz1tCGhXQLfdixI_cQ_mPdGeleJ2v/exec",
  CLUSTERING_VARS: [
    "Kategori_Komedi", "Kategori_Edukasi", "Kategori_Makanan", "Kategori_Mode", "Kategori_Gaming", 
    "Kategori_Berita", "Kategori_Olahraga", "Kategori_DIY", "Kategori_Musik", "Kategori_Mental", "Kategori_Travel",
    "Sifat_Fakta", "Sifat_Hiburan", "Sifat_Relaksasi", "Sifat_Inspirasi", "Sifat_Narasi", "Sifat_Skill", "Sifat_Estetik",
    "durasi_video", "format_video"
  ]
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
    if (json.status !== "ok") throw new Error(json.message);
    rawData = json.data;

    // MIN-MAX SCALING
    const numericRaw = rawData.map(d => CONFIG_K.CLUSTERING_VARS.map(v => parseFloat(d[v] || 0)));
    const mins = Array(CONFIG_K.CLUSTERING_VARS.length).fill(Infinity);
    const maxs = Array(CONFIG_K.CLUSTERING_VARS.length).fill(-Infinity);
    numericRaw.forEach(p => p.forEach((v, i) => { mins[i] = Math.min(mins[i], v); maxs[i] = Math.max(maxs[i], v); }));
    clusteringData = numericRaw.map(p => p.map((v, i) => (v - mins[i]) / ((maxs[i] - mins[i]) || 1)));

    document.getElementById("login-section").classList.add("hidden");
    document.getElementById("main-app").classList.remove("hidden");
    const axesOptions = CONFIG_K.CLUSTERING_VARS.map(v => `<option value="${v}">${v}</option>`).join("");
    document.getElementById("select-x").innerHTML = axesOptions;
    document.getElementById("select-y").innerHTML = axesOptions;
    document.getElementById("select-y").selectedIndex = 1;
  } catch (e) { status.textContent = "Gagal memuat data."; }
});

document.getElementById("elbow-btn")?.addEventListener("click", () => {
  const sse = [];
  for (let k=1; k<=8; k++) {
    const {centroids, assignments} = kmeans(clusteringData, k);
    sse.push(clusteringData.reduce((sum, p, i) => sum + Math.pow(euclidean(p, centroids[assignments[i]]), 2), 0));
  }
  renderElbowChart(sse);
  document.getElementById("elbow-container").classList.remove("hidden");
  document.getElementById("k-optimal").innerHTML = sse.map((_,i) => `<option value="${i+1}">K=${i+1}</option>`).join("");
  document.getElementById("execution-step").classList.remove("hidden");
});

document.getElementById("analyze-btn")?.addEventListener("click", () => {
  const k = parseInt(document.getElementById("k-optimal").value);
  const { centroids, assignments } = kmeans(clusteringData, k);
  currentAssignments = assignments;
  currentCentroids = centroids;
  document.getElementById("results-section").classList.remove("hidden");
  renderScatter();
});

document.getElementById("select-x")?.addEventListener("change", renderScatter);
document.getElementById("select-y")?.addEventListener("change", renderScatter);

function renderElbowChart(sse) {
  const ctx = document.getElementById("elbowChart");
  if (elbowChartInstance) elbowChartInstance.destroy();
  elbowChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels: [1,2,3,4,5,6,7,8], datasets: [{ label: 'Inersia (SSE)', data: sse, borderColor: '#3B82F6', fill: false }] }
  });
}

function renderScatter() {
  const ctx = document.getElementById("scatterChart");
  if (scatterChartInstance) scatterChartInstance.destroy();
  const varX = document.getElementById("select-x").value;
  const varY = document.getElementById("select-y").value;
  const idxX = CONFIG_K.CLUSTERING_VARS.indexOf(varX);
  const idxY = CONFIG_K.CLUSTERING_VARS.indexOf(varY);
  const k = parseInt(document.getElementById("k-optimal").value);

  scatterChartInstance = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: Array.from({length: k}, (_, i) => ({
        label: `Cluster ${i+1}`,
        data: clusteringData.filter((_, idx) => currentAssignments[idx] === i).map(p => ({x: p[idxX], y: p[idxY]})),
        backgroundColor: `hsl(${i * 360/k}, 70%, 50%)`
      }))
    },
    options: { scales: { xAxes: [{ticks: {min:0, max:1}}], yAxes: [{ticks: {min:0, max:1}}] } }
  });
}
