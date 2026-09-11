/* =========================================================
 * --- SPIN THE WHEEL LOGIC --- 
 * ========================================================= */
let canvas, ctx;
const colors = ['#f87171', '#fb923c', '#fbbf24', '#4ade80', '#2dd4bf', '#38bdf8', '#818cf8', '#a78bfa', '#c084fc', '#f472b6', '#fb7185'];
let currentAngle = 0; let spinVelocity = 0; let isSpinning = false;

function initWheel() { canvas = document.getElementById('spinCanvas'); if (canvas) { ctx = canvas.getContext('2d'); drawWheel(); } }
function drawWheel() {
    if (!ctx || students.length === 0) { if(ctx) ctx.clearRect(0,0, canvas.width, canvas.height); return; }
    const w = canvas.width; const h = canvas.height; const cx = w / 2; const cy = h / 2; const r = w / 2; const arc = Math.PI * 2 / students.length;
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < students.length; i++) {
        const angle = currentAngle + i * arc;
        ctx.beginPath(); ctx.fillStyle = colors[i % colors.length]; ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, angle, angle + arc); ctx.lineTo(cx, cy); ctx.fill(); 
        ctx.lineWidth = 2; ctx.strokeStyle = "#1e293b"; ctx.stroke();
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle + arc / 2);
        ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.fillStyle = "#ffffff"; 
        ctx.font = `bold ${students.length > 12 ? 14 : 18}px Poppins, sans-serif`;
        ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 4; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
        ctx.fillText(students[i].first + " " + students[i].last.charAt(0) + ".", r - 30, 0); 
        ctx.restore();
    }
}
function rotateWheel() {
    currentAngle += spinVelocity; spinVelocity *= 0.98; drawWheel();
    if (spinVelocity < 0.002) { isSpinning = false; spinVelocity = 0; determineWinner(); } 
    else requestAnimationFrame(rotateWheel);
}
function handleSpinWheel() {
    applyMiddleware('SPIN_WHEEL', null, () => {
        if (students.length === 0) return showToast("No students to spin!");
        if (isSpinning) return;
        document.getElementById('wheel-winner').innerText = ""; document.getElementById('wheel-winner').classList.remove('animate-bounce');
        isSpinning = true; spinVelocity = Math.random() * 0.2 + 0.3; requestAnimationFrame(rotateWheel);
    });
}
function determineWinner() {
    const arc = Math.PI * 2 / students.length;
    let nAngle = currentAngle % (Math.PI * 2); if (nAngle < 0) nAngle += Math.PI * 2;
    const winner = students[Math.floor(((Math.PI * 2) - nAngle) / arc) % students.length];
    const winEl = document.getElementById('wheel-winner');
    winEl.innerText = `🎉 ${winner.first} ${winner.last}!`; winEl.classList.add('animate-bounce');
    showToast(`${winner.first} was selected!`);
}

