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
// LOAD MODEL (FIX TOTAL)
// ======================
async function loadModel(){
    const loading = document.getElementById("loading");

    try{
        console.log("START LOAD");

        loading.style.display = "flex";
        document.getElementById("loadingText").innerText =
            "⏳ Memuat AI model...";

        model = await tf.loadGraphModel(
          "https://cdn.jsdelivr.net/gh/DinaPaniSafira/TBS-Classifier@main/model.json"
        );

        modelReady = true;

        loading.style.display = "none";

        console.log("SELESAI LOAD");

        // 🔥 AUTO LANJUT kalau user sudah klik duluan
        if(pendingAnalyze){
            analyze();
            pendingAnalyze = false;
        }

    }catch(err){
        console.error("ERROR LOAD MODEL:", err);
        loading.style.display = "none";
        alert("❌ Model gagal load");
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
    document.getElementById("confidence").innerText =
        "Confidence: " + conf.toFixed(2) + "%";

    let html="";
    data.forEach((p, idx)=>{
        let percent = (p*100).toFixed(2);
        html += `
        <div class="mb-2">
            <div>${cls[idx]} (${percent}%)</div>
            <div class="progress">
                <div class="progress-bar bg-success" style="width:${percent}%"></div>
            </div>
        </div>`;
    });

    document.getElementById("detail").innerHTML = html;
}

// ======================
// COMPRESS
// ======================
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
