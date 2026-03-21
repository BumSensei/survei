const CONFIG_K = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyaqwe_w0O9zWXITowThz5CkPleZ5s22lD-xmvBWwkvFvPNSW0iBqC2BLekM3pYEQZ3/exec",
  CLUSTERING_VARS: [
    "Kategori_Komedi", "Kategori_Edukasi", "Kategori_Makanan", "Kategori_Kecantikan", 
    "Kategori_Musik", "Kategori_Gaming", "Kategori_Berita", "Kategori_Travel",
    "Sifat_Informasi", "Sifat_Hiburan", "Sifat_Inspirasi", "Sifat_Estetik",
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

document.getElementById("load-data")?.addEventListener("click", () => {
  const pw = document.getElementById("admin-password").value;
  const status = document.getElementById("status-message");
  status.textContent = "⏳ Memproses dan Mengambil Data...";
  status.className = "text-sm text-blue-600 mt-2 text-center";
  
  const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
  
  window[callbackName] = function(json) {
    document.getElementById(callbackName).remove();
    delete window[callbackName];
    try {
      if (json.status !== "ok") throw new Error(json.message);
      let raw = json.data;
      if (!raw || raw.length === 0) throw new Error("Data di Google Sheets masih kosong!");

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
    }
  };

  const script = document.createElement('script');
  script.id = callbackName;
  script.src = `${CONFIG_K.APPS_SCRIPT_URL}?action=get_all&pw=${encodeURIComponent(pw)}&callback=${callbackName}`;
  script.onerror = function() {
    document.getElementById(callbackName).remove();
    delete window[callbackName];
    status.textContent = "❌ Gagal koneksi ke Google. Pastikan URL Deployment sudah benar.";
    status.className = "text-sm text-red-600 mt-2 text-center font-bold";
  };
  document.body.appendChild(script);
});

document.getElementById("elbow-btn")?.addEventListener("click", () => {
  if (clusteringData.length === 0) return alert("Data kosong atau belum dimuat!");
  const sse = [];
  const maxK = Math.min(8, clusteringData.length); 
  
  for (let k=1; k<=maxK; k++) {
    const res = kmeans(clusteringData, k);
    let totalSSE = 0;
    clusteringData.forEach((p, i) => { totalSSE += Math.pow(euclidean(p, res.centroids[res.assignments[i]]), 2); });
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

document.getElementById("update-scatter-btn")?.addEventListener("click", () => {
  if (currentCentroids.length === 0) {
    alert("Silakan klik 'Jalankan Analisis Final' terlebih dahulu!");
    return;
  }
  renderScatter(); // Hanya menggambar ulang grafik, tidak memicu algoritma ulang
});

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
  ds.push({ label: 'Centroid', data: currentCentroids.map(c => ({x: c[iX], y: c[iY]})), backgroundColor: '#000', pointStyle: 'crossRot', pointRadius: 10, borderWidth: 2 });
  scatterChartInstance = new Chart(ctx, { 
    type: 'scatter', 
    data: { datasets: ds }, 
    options: { 
      responsive: true, 
      maintainAspectRatio: false,
      scales: {
        xAxes: [{ ticks: { min: -0.1, max: 1.1 }, scaleLabel: { display: true, labelString: vX } }],
        yAxes: [{ ticks: { min: -0.1, max: 1.1 }, scaleLabel: { display: true, labelString: vY } }]
      }
    } 
  });
}

function renderSummary() {
  const container = document.getElementById("result-text");
  container.innerHTML = "";
  
  for (let i = 0; i < currentCentroids.length; i++) {
    const clusterIndices = currentAssignments.reduce((acc, val, idx) => {
        if (val === i) acc.push(idx);
        return acc;
    }, []);
    
    const total = clusterIndices.length;
    if (total === 0) continue;

    let html = `<div class="p-4 border-2 rounded-lg bg-white shadow-sm border-blue-200 mb-4">
      <h4 class="font-bold text-blue-900 border-b-2 border-blue-100 pb-2 mb-3">Klaster ${i+1} (n = ${total})</h4>
      <div class="text-[12px] space-y-3">`;

    // --- 1. BLOK SIFAT KONTEN ---
    let sifatHtml = `<div class="mb-2"><span class="font-bold text-gray-800 text-[11px] uppercase">Sifat Konten Dominan:</span><div class="mt-1 space-y-1">`;
    let hasSifat = false;

    CONFIG_K.CLUSTERING_VARS.forEach(v => {
      if (v.startsWith('Sifat_')) {
        let count = 0;
        clusterIndices.forEach(idx => {
            if (cleanValue(rawData[idx][v]) === 1) count++;
        });
        const pct = (count / total * 100).toFixed(0);
        
        if (pct > 30) {
            hasSifat = true;
            let label = v.replace('Sifat_','');
            sifatHtml += `
              <div class="flex justify-between items-center border-b border-gray-100 pb-1">
                  <span class="text-gray-700 font-medium">${label}</span>
                  <span class="font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded">${pct}%</span>
              </div>`;
        }
      }
    });
    
    if (!hasSifat) sifatHtml += `<span class="text-gray-400 italic">Tidak ada sifat dominan</span>`;
    sifatHtml += `</div></div>`;
    html += sifatHtml; // Masukkan blok Sifat ke HTML utama

    // --- 2. BLOK KATEGORI KONTEN ---
    let kategoriHtml = `<div class="mb-2"><span class="font-bold text-gray-800 text-[11px] uppercase">Kategori Konten Dominan:</span><div class="mt-1 space-y-1">`;
    let hasKategori = false;

    CONFIG_K.CLUSTERING_VARS.forEach(v => {
      if (v.startsWith('Kategori_')) {
        let count = 0;
        clusterIndices.forEach(idx => {
            if (cleanValue(rawData[idx][v]) === 1) count++;
        });
        const pct = (count / total * 100).toFixed(0);
        
        if (pct > 30) {
            hasKategori = true;
            let label = v.replace('Kategori_','');
            kategoriHtml += `
              <div class="flex justify-between items-center border-b border-gray-100 pb-1">
                  <span class="text-gray-700 font-medium">${label}</span>
                  <span class="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">${pct}%</span>
              </div>`;
        }
      }
    });
    
    if (!hasKategori) kategoriHtml += `<span class="text-gray-400 italic">Tidak ada kategori dominan</span>`;
    kategoriHtml += `</div></div>`;
    html += kategoriHtml; // Masukkan blok Kategori ke HTML utama

    // --- 3. BLOK DURASI & FORMAT (Tetap Sama) ---
    CONFIG_K.CLUSTERING_VARS.forEach(v => {
      if (v === 'durasi_video' || v === 'format_video') {
        const counts = {};
        clusterIndices.forEach(idx => {
            let val = cleanValue(rawData[idx][v]);
            counts[val] = (counts[val] || 0) + 1;
        });
        
        const mapKey = v.includes('durasi') ? 'durasi' : 'format';
        const labels = MAPPING[mapKey];
        const title = v.replace('_video', '').toUpperCase();
        
        let detail = `<div class="bg-gray-50 p-2 rounded mt-1 border border-gray-100 space-y-1">`;
        Object.keys(labels).forEach(key => {
          const countVal = counts[key] || 0;
          const pct = ((countVal / total) * 100).toFixed(0);
          if (pct > 0) {
              detail += `
                <div class="flex justify-between">
                    <span class="text-gray-600">• ${labels[key]}</span>
                    <span class="font-bold text-gray-800">${pct}%</span>
                </div>`;
          }
        });
        detail += `</div>`;
        
        html += `<div class="mb-2">
                  <span class="font-bold text-gray-800 text-[11px] uppercase">Distribusi ${title}:</span>
                  ${detail}
                 </div>`;
      }
    });
    
    container.innerHTML += html + `</div></div>`;
  }
}

document.getElementById("download-csv-btn")?.addEventListener("click", () => {
  if (currentAssignments.length === 0) {
    alert("Silakan klik 'Jalankan Analisis Final' terlebih dahulu!");
    return;
  }

  let headers = Object.keys(rawData[0]);
  headers.push("Hasil_Klaster"); // Tambahkan kolom baru untuk hasil

  let csvContent = headers.join(",") + "\n";

  rawData.forEach((row, idx) => {
    let rowData = headers.map(header => {
      if (header === "Hasil_Klaster") {
        return currentAssignments[idx] + 1; // Mengisi kolom baru dengan angka Klaster (1, 2, dst)
      }
      let val = row[header] !== undefined ? row[header] : "";
      return `"${val}"`; // Dibungkus tanda kutip agar aman jika ada koma di dalam teks
    });
    csvContent += rowData.join(",") + "\n";
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "Data_Klasterisasi_TikTok_Medan.csv");
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

document.getElementById("download-chart-btn")?.addEventListener("click", () => {
  const canvas = document.getElementById("scatterChart");
  if (!scatterChartInstance || currentAssignments.length === 0) {
    alert("Grafik belum tersedia!");
    return;
  }

  const newCanvas = document.createElement('canvas');
  newCanvas.width = canvas.width;
  newCanvas.height = canvas.height;
  const ctx = newCanvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, newCanvas.width, newCanvas.height);
  ctx.drawImage(canvas, 0, 0);

  const link = document.createElement('a');
  link.download = 'Scatter_Plot_Audiens.png';
  link.href = newCanvas.toDataURL('image/png');
  link.click();
});

document.getElementById("trigger-upload-btn")?.addEventListener("click", () => {
  document.getElementById("upload-csv-input").click();
});

document.getElementById("upload-csv-input")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const text = event.target.result;
      const lines = text.split('\n').filter(line => line.trim() !== '');
      if (lines.length < 2) throw new Error("File CSV kosong atau tidak valid.");

      const headers = lines[0].split(',');
      const clusterColIndex = headers.indexOf('Hasil_Klaster');
      
      if (clusterColIndex === -1) {
        throw new Error("Kolom 'Hasil_Klaster' tidak ditemukan! Pastikan ini adalah file CSV yang di-download dari sistem ini.");
      }

      rawData = [];
      currentAssignments = [];

      for (let i = 1; i < lines.length; i++) {
        // Regex memisahkan koma tapi mengabaikan koma di dalam tanda kutip
        let cols = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        if (!cols) continue;
        cols = cols.map(c => c.replace(/^"|"$/g, '').trim()); // Hilangkan tanda kutip

        let obj = {};
        headers.forEach((h, idx) => {
          if (h !== 'Hasil_Klaster') {
            obj[h.trim()] = cols[idx];
          }
        });
        rawData.push(obj);
        currentAssignments.push(parseInt(cols[clusterColIndex]) - 1); // Kurangi 1 karena array dimulai dari 0
      }

      const numeric = rawData.map(d => CONFIG_K.CLUSTERING_VARS.map(v => cleanValue(d[v])));
      clusteringData = normalize(numeric);

      const k = Math.max(...currentAssignments) + 1;
      currentCentroids = Array.from({ length: k }, () => Array(clusteringData[0].length).fill(0));
      let counts = Array(k).fill(0);

      clusteringData.forEach((p, idx) => {
        let clusterIdx = currentAssignments[idx];
        counts[clusterIdx]++;
        p.forEach((v, dim) => currentCentroids[clusterIdx][dim] += v);
      });
      currentCentroids = currentCentroids.map((c, j) => counts[j] > 0 ? c.map(v => v / counts[j]) : c);

      document.getElementById("login-section").classList.add("hidden");
      document.getElementById("main-app").classList.remove("hidden");
      
      renderRawTable(rawData);
      const opt = CONFIG_K.CLUSTERING_VARS.map(v => `<option value="${v}">${v}</option>`).join("");
      document.getElementById("select-x").innerHTML = opt; 
      document.getElementById("select-y").innerHTML = opt;
      
      document.getElementById("results-section").classList.remove("hidden");
      renderScatter();
      renderSummary();

      alert("Data klaster lama berhasil direkonstruksi!");

    } catch (err) {
      alert("❌ Gagal memuat file: " + err.message);
    }
    
    e.target.value = ""; 
  };
  
  reader.readAsText(file);
});
