/**
 * The Singularity Wheel - Core Game Logic
 */

// 初始化大数
const DecimalLib = window.Decimal; 

class GameState {
    constructor() {
        this.mass = new DecimalLib(0);
        this.totalRotations = 0;
        this.angularVelocity = 0; // 当前角速度
        this.angle = 0; // 当前角度 (弧度)
        this.friction = 0.99; // 基础阻力
        this.lastFrameTime = performance.now();
        this.timeMultiplier = 1;
        this.timeWarpTimer = 0;

        // 升级项数据
        this.upgrades = {
            manualSpin: {
                level: 0,
                baseCost: new DecimalLib(10),
                costMultiplier: 1.5,
                power: 0.5
            },
            autoSpin: {
                level: 0,
                baseCost: new DecimalLib(50),
                costMultiplier: 1.8,
                power: 0.1
            }
        };

        // 轮盘槽位数据
        this.slots = [
            { name: '指数矿脉', type: 'resource', color: '#4a90e2', power: 1 },
            { name: '中立区', type: 'none', color: '#333', power: 0 },
            { name: '资本格(复利)', type: 'compound', color: '#f5a623', power: 1.02 },
            { name: '中立区', type: 'none', color: '#333', power: 0 },
            { name: '引力格', type: 'gravity', color: '#9013fe', power: 1.5 },
            { name: '中立区', type: 'none', color: '#333', power: 0 },
            { name: '时间沙漏', type: 'timewarp', color: '#7ed321', power: 5 },
            { name: '中立区', type: 'none', color: '#333', power: 0 },
        ];
    }
}

const state = new GameState();
const canvas = document.getElementById('wheel-canvas');
const ctx = canvas.getContext('2d');
const massDisplay = document.getElementById('mass-value');
const rotationDisplay = document.getElementById('rotation-count');

function formatNumber(decimal) {
    if (decimal.lt(1e6)) {
        return Math.floor(decimal.toNumber()).toLocaleString();
    }
    return decimal.toExponential(2).replace('+', '');
}

function updateUI() {
    massDisplay.innerText = formatNumber(state.mass);
    rotationDisplay.innerText = `总圈数: ${Math.floor(state.totalRotations)}`;
    renderUpgrades();
}

function renderUpgrades() {
    const list = document.getElementById('upgrade-list');
    // 简单起见，这里不每次重绘，只在需要时重绘。
    // 但为了 DEMO 快速实现，我们先逻辑上检查一下。
    if (list.children.length === 0) {
        for (let key in state.upgrades) {
            const upg = state.upgrades[key];
            const div = document.createElement('div');
            div.className = 'upgrade-item';
            div.id = `upg-${key}`;
            div.onclick = () => buyUpgrade(key);
            list.appendChild(div);
        }
    }

    for (let key in state.upgrades) {
        const upg = state.upgrades[key];
        const el = document.getElementById(`upg-${key}`);
        const cost = upg.baseCost.times(Math.pow(upg.costMultiplier, upg.level));
        el.innerHTML = `
            <span class="title">${key === 'manualSpin' ? '手动强化' : '自动核心'} (Lv.${upg.level})</span>
            <span class="cost">消耗: ${formatNumber(cost)} M</span>
        `;
        el.style.opacity = state.mass.gte(cost) ? '1' : '0.5';
    }
}

function buyUpgrade(key) {
    const upg = state.upgrades[key];
    const cost = upg.baseCost.times(Math.pow(upg.costMultiplier, upg.level));
    if (state.mass.gte(cost)) {
        state.mass = state.mass.minus(cost);
        upg.level++;
        log(`升级成功！${key} 等级 -> ${upg.level}`);
        updateUI();
    } else {
        log(`质量不足，还需要 ${formatNumber(cost.minus(state.mass))} M`);
    }
}

function drawWheel() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = 220;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const sliceAngle = (Math.PI * 2) / state.slots.length;

    state.slots.forEach((slot, i) => {
        const startA = state.angle + i * sliceAngle;
        const endA = startA + sliceAngle;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, startA, endA);
        ctx.fillStyle = slot.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff2';
        ctx.stroke();

        // 绘制文字
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(startA + sliceAngle / 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#fff';
        ctx.font = '14px Arial';
        ctx.fillText(slot.name, radius - 20, 5);
        ctx.restore();
    });

    // 装饰外圈
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 10, 0, Math.PI * 2);
    ctx.strokeStyle = '#7d5fff';
    ctx.lineWidth = 5;
    ctx.stroke();
}

function processSlot(slotIndex) {
    const slot = state.slots[slotIndex];
    if (slot.type === 'resource') {
        const gain = new DecimalLib(1).times(Math.pow(1.05, state.totalRotations));
        state.mass = state.mass.plus(gain);
        log(`命中[${slot.name}]，获得 ${formatNumber(gain)} 质量`);
    } else if (slot.type === 'compound') {
        if (state.mass.gt(0)) {
            const oldMass = state.mass;
            state.mass = state.mass.times(slot.power);
            const gain = state.mass.minus(oldMass);
            log(`命中[${slot.name}]，复利增值 ${formatNumber(gain)}`);
        }
    } else if (slot.type === 'timewarp') {
        state.timeWarpTimer = 10;
        state.timeMultiplier = slot.power;
        log(`命中[${slot.name}]！时间流速提升 500%！持续 10s`);
    }
}

function log(msg) {
    const logEl = document.getElementById('log');
    const p = document.createElement('p');
    p.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logEl.prepend(p);
    if (logEl.children.length > 10) logEl.lastChild.remove();
}

let lastActiveSlot = -1;

function gameLoop(now) {
    let dt = (now - state.lastFrameTime) / 1000;
    state.lastFrameTime = now;

    // 处理时间扭曲
    if (state.timeWarpTimer > 0) {
        state.timeWarpTimer -= dt;
        dt *= state.timeMultiplier;
        if (state.timeWarpTimer <= 0) {
            state.timeWarpTimer = 0;
            state.timeMultiplier = 1;
            log("时间流速恢复正常。");
        }
    }

    // 自动旋转贡献
    const autoPower = state.upgrades.autoSpin.level * state.upgrades.autoSpin.power;
    state.angularVelocity += autoPower * dt;

    // 更新角度
    const oldAngle = state.angle;
    state.angle += state.angularVelocity * dt;
    state.totalRotations += (state.angle - oldAngle) / (Math.PI * 2);

    // 摩擦力
    state.angularVelocity *= state.friction;
    if (state.angularVelocity < 0.01) state.angularVelocity = 0;

    // 计算当前指向的槽位 (指针在正上方 -PI/2)
    // 相对于轮盘的角度 = (-Math.PI/2 - state.angle)
    let pointerAngle = (-Math.PI/2 - state.angle) % (Math.PI * 2);
    if (pointerAngle < 0) pointerAngle += Math.PI * 2;
    
    const sliceAngle = (Math.PI * 2) / state.slots.length;
    const currentSlotIndex = Math.floor(pointerAngle / sliceAngle) % state.slots.length;

    // 只有当停下来或者慢速经过时触发？PRD 说是停靠/划过。
    // 为了简单，我们只在"进入新格子"时触发，且速度足够慢，或者实现"划过"逻辑。
    if (currentSlotIndex !== lastActiveSlot && state.angularVelocity > 0.1) {
        processSlot(currentSlotIndex);
        lastActiveSlot = currentSlotIndex;
    }

    drawWheel();
    updateUI();
    requestAnimationFrame(gameLoop);
}

document.getElementById('spin-btn').addEventListener('click', () => {
    const power = 1 + state.upgrades.manualSpin.level * state.upgrades.manualSpin.power;
    state.angularVelocity += power;
});

// 启动
requestAnimationFrame(gameLoop);
log("核心系统加载完成。通过手动点击或升级来累积宇宙质量。");
