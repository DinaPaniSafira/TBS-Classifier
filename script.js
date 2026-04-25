let imageData = null;
let stream = null;
let model = null;
let modelReady = false;
let pendingAnalyze = false;

// ======================
// INIT
// ======================
document.addEventListener("DOMContentLoaded", ()=>{
    const loading = document.getElementById("loading");
    if(loading) loading.style.display = "none";
});

// ======================
// UI CONTROL
// ======================
function show(id){
    ["emptyState","cameraState","previewState"].forEach(el=>{
        let e = document.getElementById(el);
        if(e) e.style.display="none";
    });
    document.getElementById(id).style.display="block";
}

if(document.getElementById("emptyState")){
    show("emptyState");
}

// ======================
// LOAD MODEL (STABLE)
// ======================
async function loadModel(){
    const loading = document.getElementById("loading");

    try{
        loading.style.display = "flex";
        document.getElementById("loadingText").innerText =
            "⏳ Memuat AI model...";

        // 🔥 pastikan backend siap (penting di HP)
        await tf.setBackend('webgl');
        await tf.ready();

        // 🔥 gunakan base path + modelUrl (lebih aman untuk shard .bin)
       model = await tf.loadGraphModel(
    "https://cdn.jsdelivr.net/gh/DinaPaniSafira/TBS-Classifier@main/model.json"
);

        if(!model){
            throw new Error("Model null");
        }

        modelReady = true;
        loading.style.display = "none";

        console.log("✅ MODEL SIAP");

        // 🔥 kalau user sudah klik analisis duluan
        if(pendingAnalyze){
            analyze();
            pendingAnalyze = false;
        }

    }catch(err){
        console.error("❌ ERROR LOAD MODEL:", err);
        loading.style.display = "none";

        alert("❌ Model gagal load.\nCoba refresh atau buka di Chrome.");
    }
}
loadModel();

// ======================
// UPLOAD
// ======================
function pickImage(){
    document.getElementById("fileInput").click();
}

document.getElementById("fileInput")?.addEventListener("change",e=>{
    const file = e.target.files[0];
    if(!file) return;

    const reader = new FileReader();

    reader.onload = function(e){
        imageData = e.target.result;
        document.getElementById("previewImg").src = imageData;
    };

    reader.readAsDataURL(file);

    show("previewState");
});

// ======================
// CAMERA
// ======================
async function startCamera(){
    show("cameraState");

    try{
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } }
        });
        document.getElementById("video").srcObject = stream;
    }catch{
        alert("Kamera tidak tersedia");
        show("emptyState");
    }
}

function capture(){
    const video = document.getElementById("video");
    const canvas = document.createElement("canvas");

    canvas.width = 224;
    canvas.height = 224;

    canvas.getContext("2d").drawImage(video,0,0,224,224);

    imageData = canvas.toDataURL();
    document.getElementById("previewImg").src = imageData;

    stream.getTracks().forEach(t=>t.stop());
    show("previewState");
}

function cancelCamera(){
    if(stream) stream.getTracks().forEach(t=>t.stop());
    show("emptyState");
}

// ======================
// VALIDASI
// ======================
function isPalmLikely(data){
    return Math.max(...data) >= 0.45;
}

// ======================
// RESET
// ======================
function resetImage(){
    imageData = null;
    show("emptyState");
}

// ======================
// ANALYZE (FIX TOTAL)
// ======================
async function analyze(){

    if(!imageData){
        alert("⚠️ Pilih gambar dulu");
        return;
    }

    // 🔥 kalau model belum siap → tunggu
    if(!modelReady){
        pendingAnalyze = true;

        const loading = document.getElementById("loading");
        loading.style.display = "flex";

        document.getElementById("loadingText").innerText =
            "⏳ Model sedang loading...";

        return;
    }

    const loading = document.getElementById("loading");
    loading.style.display = "flex";
    document.getElementById("loadingText").innerText =
        "🔍 Menganalisis gambar...";

    try{
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imageData;

        await new Promise((resolve, reject)=>{
            img.onload = resolve;
            img.onerror = reject;
        });

        const tensor = tf.browser.fromPixels(img)
            .resizeNearestNeighbor([224,224])
            .toFloat()
            .div(255)
            .expandDims();

        const pred = model.predict(tensor);
        const data = Array.from(await pred.data());

        if(!isPalmLikely(data)){
            loading.style.display="none";
            alert("❌ Bukan gambar TBS");
            return;
        }

        let compressed;
        try{
            compressed = await compressImage(imageData, 0.7, 500);
        }catch{
            compressed = imageData;
        }

        sessionStorage.setItem("img", compressed);
        sessionStorage.setItem("res", JSON.stringify(data));

        loading.style.display="none";

        window.location.href="result.html";

    }catch(err){
        console.error("ERROR ANALYZE:", err);
        loading.style.display="none";
        alert("❌ Gagal analisis");
    }
}

// ======================
// RESULT PAGE
// ======================
if(location.pathname.includes("result.html")){

    const data = JSON.parse(sessionStorage.getItem("res"));
    const img = sessionStorage.getItem("img");

    if(!data || !img){
        alert("Data tidak ditemukan");
        window.location.href="upload.html";
    }

    const cls = ["Belum Masak","Masak","Terlalu Masak"];

    let i = data.indexOf(Math.max(...data));
    let conf = data[i]*100;

    document.getElementById("resultImg").src = img;
    document.getElementById("label").innerText = cls[i];
    document.getElementById("confidence").innerText = "Confidence: " + conf.toFixed(2) + "%";

    let status="", advice="", clsColor="";

    if(conf >= 80){
        status="🟢 Keyakinan Tinggi";
        advice="Hasil sangat dapat dipercaya.";
        clsColor="alert-success";
    }
    else if(conf >= 55){
        status="🟡 Keyakinan Sedang";
        advice="Perlu verifikasi.";
        clsColor="alert-warning";
    }
    else{
        status="🔴 Keyakinan Rendah";
        advice="Ambil ulang gambar.";
        clsColor="alert-danger";
    }

    document.getElementById("statusBox").innerHTML = `
        <div class="alert ${clsColor}">
            <b>${status}</b><br>${advice}
        </div>
    `;

    let html="";
    data.forEach((p, idx)=>{
        let percent = (p*100).toFixed(2);
        html += `
        <div class="mb-2">
            <div>${cls[idx]} (${percent}%)</div>
            <div class="progress">
                <div class="progress-bar bg-success" style="width:${percent}%"></div>
            </div>
        </div>
        `;
    });

    document.getElementById("detail").innerHTML = html;
}

// ======================
// CONVERT IMAGE → BASE64
// ======================
function toBase64(url){
    return new Promise((resolve)=>{
        const img = new Image();
        img.crossOrigin = "Anonymous";

        img.onload = function(){
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(img,0,0);

            resolve(canvas.toDataURL("image/jpeg"));
        };

        img.src = url;
    });
}

// ======================
// EXPORT PDF (FIX TOTAL)
// ======================
async function exportPDF(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    // =========================
    // DATA
    // =========================
    const label = document.getElementById("label").innerText;
    const confText = document.getElementById("confidence").innerText;
    const img = sessionStorage.getItem("img");
    const data = JSON.parse(sessionStorage.getItem("res"));

    const cls = ["Belum Masak","Masak","Terlalu Masak"];
    const i = data.indexOf(Math.max(...data));
    const confidence = (data[i]*100).toFixed(2);

    // =========================
    // TRUST LEVEL
    // =========================
    let status="", advice="";
    if(confidence >= 80){
        status="Tinggi";
        advice="Hasil sangat dapat dipercaya dan dapat digunakan sebagai dasar keputusan.";
    } else if(confidence >= 60){
        status="Sedang";
        advice="Disarankan melakukan verifikasi tambahan sebelum pengambilan keputusan.";
    } else {
        status="Rendah";
        advice="Hasil kurang akurat, disarankan mengambil ulang gambar dengan kondisi yang lebih baik.";
    }

    // =========================
    // HELPER
    // =========================
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;

    function hr(y){
        doc.setDrawColor(200);
        doc.line(margin, y, pageW - margin, y);
    }

    function sectionTitle(text, x, y){
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text(text, x, y);
        doc.setFont("helvetica", "normal");
    }

    // =========================
    // HEADER
    // =========================
    // (Opsional) LOGO base64 di kanan atas
    // doc.addImage(LOGO_BASE64, "PNG", pageW-40, 10, 25, 10);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("LAPORAN ANALISIS TBS SAWIT", margin, 15);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const reportId = "TBS-" + Date.now();
    const now = new Date().toLocaleString();

    // 🔥 TARUH DI SINI 
    console.log("ISI IMG:", img);

    doc.text(`ID Laporan : ${reportId}`, margin, 22);
    doc.text(`Tanggal    : ${now}`, margin, 27);
    doc.text(`Sistem     : Palm AI Scanner`, margin, 32);

    hr(36);

    // =========================
    // LAYOUT 2 KOLOM
    // =========================
    let leftX = margin;
    let rightX = 110;
    let yTop = 42;

    // ---- KIRI: GAMBAR ----
    sectionTitle("CITRA INPUT", leftX, yTop);
    doc.addImage(img, "JPEG", leftX, yTop + 5, 60, 60);

    // ---- KANAN: RINGKASAN ----
    sectionTitle("RINGKASAN EKSEKUTIF", rightX, yTop);

    doc.setFontSize(11);
    let y = yTop + 8;

    doc.text(`Prediksi        : ${label}`, rightX, y); y+=7;
    doc.text(`Confidence      : ${confidence}%`, rightX, y); y+=7;
    doc.text(`Tingkat Keyakinan: ${status}`, rightX, y); y+=7;

    // Advice (wrap)
    const adviceLines = doc.splitTextToSize(advice, 70);
    doc.text("Rekomendasi:", rightX, y); y+=6;
    doc.text(adviceLines, rightX, y);

    // =========================
    // DETAIL PROBABILITAS (TABEL)
    // =========================
    let tableY = 130;
    hr(tableY - 5);

    sectionTitle("DETAIL PROBABILITAS KLASIFIKASI", margin, tableY);

    // Header tabel
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Kelas", margin, tableY + 10);
    doc.text("Probabilitas (%)", margin + 90, tableY + 10);

    doc.setFont("helvetica", "normal");

    let rowY = tableY + 18;

    data.forEach((p, idx)=>{
        const percent = (p*100).toFixed(2) + "%";

        doc.text(cls[idx], margin, rowY);
        doc.text(percent, margin + 90, rowY);

        rowY += 8;
    });

    hr(rowY + 2);

    // =========================
    // CATATAN
    // =========================
    doc.setFontSize(10);
    const note = doc.splitTextToSize(
        "Catatan: Hasil ini merupakan prediksi berbasis kecerdasan buatan (AI). " +
        "Disarankan untuk digunakan sebagai alat bantu pengambilan keputusan dan bukan sebagai satu-satunya dasar keputusan.",
        pageW - margin*2
    );
    doc.text(note, margin, rowY + 10);

    // =========================
    // FOOTER
    // =========================
    doc.setFontSize(9);
    doc.text("TBS Classifier - Sistem Klasifikasi Kematangan TBS Sawit", margin, 285);
    doc.text("Halaman 1", pageW - 30, 285);

    // =========================
    // SAVE
    // =========================
    doc.save(`Laporan_${reportId}.pdf`);
}

function compressImage(base64, quality = 0.7, maxWidth = 500){
    return new Promise((resolve)=>{
        const img = new Image();

        img.onload = function(){
            const canvas = document.createElement("canvas");

            let scale = maxWidth / img.width;
            if(scale > 1) scale = 1;

            canvas.width = img.width * scale;
            canvas.height = img.height * scale;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            resolve(canvas.toDataURL("image/jpeg", quality));
        };

        img.src = base64;
    });
}

// ======================
function back(){
    window.location.href="upload.html";
}
