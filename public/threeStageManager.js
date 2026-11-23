// ThreeStageManager v3.0: Expansive 3D Tropical Beach, Expressive Faces, Shoreline Gator & 3D Homing Missiles
// - 3D Tropical Seaside Beach Environment (sky dome, sun, drifting clouds, distant islands, palms, umbrellas, surf)
// - Fixed +Z Forward-Facing Characters with expressive 3D facial features (eyes, eyebrows, nose, blush, smile, bangs)
// - Crocodile with 4 animated legs prowling along the sand-sea shoreline boundary
// - Real 3D Three.js Homing Missile with fast 3D spiral over the sea, smoke/flame trail & 3D explosion

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ThreeStageManager = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    let scene, camera, renderer, containerEl;
    let isInitialized = false;
    let isVisible = false;
    let animFrameId = null;

    // Environment & Entities
    let waterMesh = null;
    let terrainMesh = null;
    const cloudGroups = [];
    const foamMeshes = [];
    const chairSlots = []; // { index, x, z, chairGroup, hinge, seat, back, charGroup, bubbleSprite, ... }
    let sharkEntity = null;
    let gatorEntity = null;
    let gullEntity = null;
    const activeParticles = [];
    const activeMissiles = [];
    let sharedSmokeGeo = null;
    let sharedEmberGeo = null;
    let sharedSparkGeo = null;

    let clock = null;
    let resizeObserver = null;

    // Camera control variables (Smooth Orbit & Adaptive Framing)
    let isDragging = false;
    let prevMouseX = 0, prevMouseY = 0;
    const DEFAULT_PHI = Math.PI / 2.34; // ~77 deg from zenith -> frames chairs, shoreline, sea, islands, clouds & sky
    let baseRadius = 24;
    let spherical = { radius: 24, theta: 0, phi: DEFAULT_PHI };
    let targetSpherical = { radius: 24, theta: 0, phi: DEFAULT_PHI };
    let currentLookAt = { x: 0, y: 2.9, z: 0.8 };
    let targetLookAt = { x: 0, y: 2.9, z: 0.8 };

    const MALE_COLORS = [0x3498db, 0x2980b9, 0x1abc9c, 0x16a085, 0x34495e, 0x2c3e50];
    const FEMALE_COLORS = [0xe84393, 0xfd79a8, 0xe17055, 0xd63031, 0x9b59b6, 0x8e44ad];

    function createMat(color, roughness = 0.5, metalness = 0.1) {
        return new THREE.MeshStandardMaterial({
            color: color,
            roughness: roughness,
            metalness: metalness
        });
    }

    function smoothstep(edge0, edge1, x) {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
    }

    // Single Source of Truth for beach & seabed elevation
    // Chair strip (|x| <= 14.5, z in [5.2, 10.5]) sits flat at y = 1.2
    // Shoreline (water level y = 0.05) lies along z ≈ 2.2 .. 2.7
    function getBeachHeight(x, z) {
        if (z >= 5.2) {
            const sideFactor = smoothstep(14.5, 35, Math.abs(x));
            const backFactor = smoothstep(10.5, 34, z);
            const dune = (sideFactor * 0.9 + backFactor * 0.7) *
                (0.55 + 0.45 * Math.sin(x * 0.09 + 0.7) * Math.cos(z * 0.11));
            return 1.2 + dune;
        }
        if (z >= 1.8) {
            return smoothstep(1.8, 5.2, z) * 1.2;
        }
        const shallowT = smoothstep(1.8, -10.0, z);
        const deepT = smoothstep(-10.0, -75.0, z);
        const ripple = Math.sin(x * 0.12) * Math.cos(z * 0.12) * 0.16 * shallowT;
        return -3.4 * shallowT - 3.6 * deepT + ripple;
    }

    // ─────────────────────────────────────────────────────────────
    // 1. Initialization
    // ─────────────────────────────────────────────────────────────
    function init(domContainer) {
        if (isInitialized) return;
        if (typeof THREE === 'undefined') {
            console.warn('[ThreeStageManager] THREE is not loaded yet.');
            return;
        }

        containerEl = domContainer;
        clock = new THREE.Clock();

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87ceeb);
        scene.fog = new THREE.FogExp2(0xb8e6ff, 0.0042);

        const w = containerEl.clientWidth || (containerEl.parentElement ? containerEl.parentElement.clientWidth : 800) || 800;
        const h = containerEl.clientHeight || (containerEl.parentElement ? containerEl.parentElement.clientHeight : 500) || 500;
        const aspect = w / h;

        if (aspect < 0.85) {
            baseRadius = 37;
            spherical.radius = 37;
            targetSpherical.radius = 37;
            spherical.phi = Math.PI / 2.45;
            targetSpherical.phi = Math.PI / 2.45;
        } else if (aspect < 1.2) {
            baseRadius = 30;
            spherical.radius = 30;
            targetSpherical.radius = 30;
        } else {
            baseRadius = 24;
            spherical.radius = 24;
            targetSpherical.radius = 24;
        }

        camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 600);
        updateCameraPosition();

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        const canvas = renderer.domElement;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
        containerEl.appendChild(canvas);

        setupLights();
        buildEnvironment();
        buildAnimals();
        setupControls(canvas);
        window.addEventListener('resize', onResize);
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => onResize());
            resizeObserver.observe(containerEl);
        }

        isInitialized = true;
        if (typeof window !== 'undefined' && window.state && window.state.players) {
            syncPlayers(window.state.players);
        }
        console.log('[ThreeStageManager] Initialized v3.0 Tropical Beach, Expressive Faces & 3D Missiles.');
    }

    // ─────────────────────────────────────────────────────────────
    // 2. Lighting Setup
    // ─────────────────────────────────────────────────────────────
    function setupLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.32);
        scene.add(ambient);

        const hemi = new THREE.HemisphereLight(0x87ceeb, 0xc29b61, 0.38);
        scene.add(hemi);

        const sun = new THREE.DirectionalLight(0xfff6e0, 0.72);
        sun.position.set(25, 38, 22);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 1024;
        sun.shadow.mapSize.height = 1024;
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 110;
        const d = 28;
        sun.shadow.camera.left = -d;
        sun.shadow.camera.right = d;
        sun.shadow.camera.top = d;
        sun.shadow.camera.bottom = -d;
        scene.add(sun);

        const waterGlow = new THREE.PointLight(0x00d2d3, 0.25, 45);
        waterGlow.position.set(0, 1.5, -6);
        scene.add(waterGlow);
    }

    // ─────────────────────────────────────────────────────────────
    // 3. Environment: Expansive 3D Tropical Beach & Ocean
    // ─────────────────────────────────────────────────────────────
    function createSkyDomeTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 4;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0.0, '#1e90ff');
        grad.addColorStop(0.32, '#4ea8f8');
        grad.addColorStop(0.50, '#a6e4ff');
        grad.addColorStop(0.56, '#fff3d6');
        grad.addColorStop(1.0, '#ffe8b8');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 4, 256);
        return new THREE.CanvasTexture(canvas);
    }

    function createSunGlowTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
        grad.addColorStop(0.0, 'rgba(255, 252, 220, 1.0)');
        grad.addColorStop(0.3, 'rgba(255, 236, 153, 0.55)');
        grad.addColorStop(1.0, 'rgba(255, 236, 153, 0.0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(canvas);
    }

    function createCloudCluster(x, y, z, scale) {
        const group = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.92,
            fog: false
        });
        const puffs = [
            { x: 0, y: 0, z: 0, r: 2.6 },
            { x: -2.2, y: -0.35, z: 0.3, r: 1.9 },
            { x: 2.3, y: -0.3, z: -0.2, r: 2.0 },
            { x: -0.9, y: 0.9, z: 0.2, r: 1.8 },
            { x: 1.0, y: 0.75, z: -0.3, r: 1.6 }
        ];
        puffs.forEach(p => {
            const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.r, 12, 10), mat);
            mesh.position.set(p.x, p.y, p.z);
            mesh.scale.set(1.15, 0.62, 0.9);
            group.add(mesh);
        });
        group.position.set(x, y, z);
        group.scale.setScalar(scale);
        group.userData = { speed: 0.35 + Math.random() * 0.45 };
        scene.add(group);
        cloudGroups.push(group);
    }

    function createPalmTree(x, z, scale = 1.0, leanDir = 1) {
        const group = new THREE.Group();
        const groundY = getBeachHeight(x, z);
        group.position.set(x, groundY - 0.15, z);

        const trunkMat = createMat(0x7c5333, 0.85, 0.05);
        const leafMat = createMat(0x27ae60, 0.65, 0.05);
        const coconutMat = createMat(0x5d4037, 0.75);

        let curX = 0, curY = 0;
        const segments = 6;
        const segH = 1.15;
        for (let i = 0; i < segments; i++) {
            const rBottom = 0.28 - i * 0.025;
            const rTop = 0.25 - i * 0.025;
            const seg = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, segH, 10), trunkMat);
            const leanAngle = leanDir * (0.06 + i * 0.045);
            seg.position.set(curX + Math.sin(leanAngle) * (segH * 0.5), curY + Math.cos(leanAngle) * (segH * 0.5), 0);
            seg.rotation.z = -leanAngle;
            seg.castShadow = true;
            group.add(seg);
            curX += Math.sin(leanAngle) * segH;
            curY += Math.cos(leanAngle) * segH;
        }

        const crown = new THREE.Group();
        crown.position.set(curX, curY, 0);
        group.add(crown);

        for (let c = 0; c < 3; c++) {
            const cAngle = (c / 3) * Math.PI * 2;
            const nut = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), coconutMat);
            nut.position.set(Math.cos(cAngle) * 0.25, -0.15, Math.sin(cAngle) * 0.25);
            crown.add(nut);
        }

        const frondCount = 7;
        for (let f = 0; f < frondCount; f++) {
            const yaw = (f / frondCount) * Math.PI * 2 + 0.2;
            const frondPivot = new THREE.Group();
            frondPivot.rotation.y = yaw;

            const inner = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.45), leafMat);
            inner.position.set(0.85, 0.15, 0);
            inner.rotation.z = 0.15;
            inner.castShadow = true;
            frondPivot.add(inner);

            const outer = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.8, 4), leafMat);
            outer.rotation.z = -Math.PI / 2 - 0.35;
            outer.scale.set(1.0, 1.0, 0.25);
            outer.position.set(2.3, -0.18, 0);
            outer.castShadow = true;
            frondPivot.add(outer);

            crown.add(frondPivot);
        }

        group.scale.setScalar(scale);
        scene.add(group);
    }

    function createBeachUmbrella(x, z, colorA, colorB) {
        const group = new THREE.Group();
        const groundY = getBeachHeight(x, z);
        group.position.set(x, groundY - 0.05, z);
        group.rotation.z = (x < 0 ? -0.07 : 0.07);

        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 8), createMat(0xf5f6fa, 0.4, 0.5));
        pole.position.y = 1.8;
        pole.castShadow = true;
        group.add(pole);

        const wedges = 8;
        const angleStep = (Math.PI * 2) / wedges;
        for (let i = 0; i < wedges; i++) {
            const wedgeGeo = new THREE.ConeGeometry(2.15, 0.72, 2, 1, false, i * angleStep, angleStep);
            const mat = new THREE.MeshStandardMaterial({
                color: i % 2 === 0 ? colorA : colorB,
                roughness: 0.65,
                side: THREE.DoubleSide
            });
            const wedge = new THREE.Mesh(wedgeGeo, mat);
            wedge.position.y = 3.45;
            wedge.castShadow = true;
            group.add(wedge);
        }

        // Beach mat beneath umbrella
        const matMesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 2.4), createMat(colorA, 0.9));
        matMesh.position.set(0.6, 0.06, 0.2);
        matMesh.rotation.y = 0.15;
        matMesh.receiveShadow = true;
        group.add(matMesh);

        scene.add(group);
    }

    function createSurfboard(x, z, color, tiltZ) {
        const groundY = getBeachHeight(x, z);
        const boardGroup = new THREE.Group();
        boardGroup.position.set(x, groundY + 1.05, z);
        boardGroup.rotation.set(-0.1, x < 0 ? 0.35 : -0.35, tiltZ);

        const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 14), createMat(color, 0.3, 0.15));
        body.scale.set(0.82, 2.85, 0.16);
        body.castShadow = true;
        boardGroup.add(body);

        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.3, 0.16), createMat(0xffffff, 0.3));
        boardGroup.add(stripe);

        scene.add(boardGroup);
    }

    function createCoastalRock(x, z, scale) {
        const groundY = getBeachHeight(x, z);
        const rock = new THREE.Mesh(
            new THREE.DodecahedronGeometry(1.0, 0),
            createMat(0x7f8c8d, 0.9, 0.05)
        );
        rock.scale.set(scale * 1.3, scale * 0.72, scale * 1.1);
        rock.position.set(x, groundY + scale * 0.22, z);
        rock.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.4);
        rock.castShadow = true;
        rock.receiveShadow = true;
        scene.add(rock);
    }

    function createDistantIsland(x, z, radius, height) {
        const group = new THREE.Group();
        group.position.set(x, -0.4, z);

        const sandBase = new THREE.Mesh(
            new THREE.ConeGeometry(radius, height * 0.42, 18),
            createMat(0xe8cd95, 0.9)
        );
        sandBase.position.y = height * 0.15;
        group.add(sandBase);

        const hill = new THREE.Mesh(
            new THREE.SphereGeometry(radius * 0.62, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
            createMat(0x2e8b57, 0.85)
        );
        hill.scale.set(1.0, height / (radius * 0.62), 0.9);
        hill.position.y = height * 0.2;
        group.add(hill);

        const peak = new THREE.Mesh(
            new THREE.SphereGeometry(radius * 0.35, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
            createMat(0x27ae60, 0.8)
        );
        peak.position.set(radius * 0.15, height * 0.48, -radius * 0.1);
        group.add(peak);

        scene.add(group);
    }

    function buildEnvironment() {
        // 1. Sky Dome
        const skyGeo = new THREE.SphereGeometry(280, 32, 20);
        const skyMat = new THREE.MeshBasicMaterial({
            map: createSkyDomeTexture(),
            side: THREE.BackSide,
            fog: false,
            depthWrite: false
        });
        const skyDome = new THREE.Mesh(skyGeo, skyMat);
        scene.add(skyDome);

        // 2. Sun & Glow (framed visibly in upper-right tropical sky)
        const sunMesh = new THREE.Mesh(
            new THREE.SphereGeometry(6.5, 20, 20),
            new THREE.MeshBasicMaterial({ color: 0xfff8d6, fog: false })
        );
        sunMesh.position.set(42, 26, -148);
        scene.add(sunMesh);

        const sunGlowMat = new THREE.SpriteMaterial({
            map: createSunGlowTexture(),
            transparent: true,
            fog: false,
            depthWrite: false
        });
        const sunGlow = new THREE.Sprite(sunGlowMat);
        sunGlow.position.copy(sunMesh.position);
        sunGlow.scale.set(42, 42, 1);
        scene.add(sunGlow);

        // 3. Drifting 3D Clouds
        cloudGroups.length = 0;
        const cloudCoords = [
            [-75, 19, -110, 1.2],
            [-36, 22, -128, 1.4],
            [-4, 17, -96, 1.0],
            [28, 23, -134, 1.45],
            [72, 18, -112, 1.25],
            [-55, 16, -78, 0.9],
            [56, 20, -82, 1.05]
        ];
        cloudCoords.forEach(c => createCloudCluster(c[0], c[1], c[2], c[3]));

        // 4. Continuous Vertex-Colored Beach & Seabed Terrain
        const terrainGeo = new THREE.PlaneGeometry(340, 240, 88, 68);
        terrainGeo.rotateX(-Math.PI / 2);

        const posAttr = terrainGeo.attributes.position;
        const colors = new Float32Array(posAttr.count * 3);

        const cDrySand = new THREE.Color(0xdcb46c);
        const cWetSand = new THREE.Color(0xa67f42);
        const cShallow = new THREE.Color(0x3bc8e8);
        const cDeep = new THREE.Color(0x0a3d62);
        const tmpColor = new THREE.Color();

        const terrainOffsetZ = -50;
        for (let i = 0; i < posAttr.count; i++) {
            const vx = posAttr.getX(i);
            const vz = posAttr.getZ(i) + terrainOffsetZ;
            const y = getBeachHeight(vx, vz);
            posAttr.setY(i, y);

            if (y >= 0.45) {
                tmpColor.copy(cDrySand);
            } else if (y >= 0.0) {
                tmpColor.copy(cWetSand).lerp(cDrySand, y / 0.45);
            } else if (y >= -2.2) {
                tmpColor.copy(cShallow).lerp(cWetSand, (y + 2.2) / 2.2);
            } else {
                const deepAlpha = Math.max(0, Math.min(1, (y + 7.0) / 4.8));
                tmpColor.copy(cDeep).lerp(cShallow, deepAlpha);
            }

            colors[i * 3] = tmpColor.r;
            colors[i * 3 + 1] = tmpColor.g;
            colors[i * 3 + 2] = tmpColor.b;
        }

        terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        terrainGeo.computeVertexNormals();

        const terrainMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.95,
            metalness: 0.0
        });
        terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
        terrainMesh.position.set(0, 0, terrainOffsetZ);
        terrainMesh.receiveShadow = true;
        scene.add(terrainMesh);

        // 5. Expansive Ocean Water Surface
        const waterGeo = new THREE.PlaneGeometry(340, 220, 64, 48);
        waterGeo.rotateX(-Math.PI / 2);
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x0998e0,
            roughness: 0.12,
            metalness: 0.16,
            transparent: true,
            opacity: 0.78,
            side: THREE.DoubleSide
        });
        waterMesh = new THREE.Mesh(waterGeo, waterMat);
        waterMesh.position.set(0, 0.05, -106.8);
        waterMesh.receiveShadow = true;
        scene.add(waterMesh);

        // 6. Shoreline Surf Foam Strips
        foamMeshes.length = 0;
        const foamSpecs = [
            { z: 2.25, width: 0.72, opacity: 0.75, phase: 0 },
            { z: 2.68, width: 0.48, opacity: 0.55, phase: 1.8 }
        ];
        foamSpecs.forEach(spec => {
            const fGeo = new THREE.PlaneGeometry(240, spec.width, 40, 1);
            fGeo.rotateX(-Math.PI / 2);
            const fMat = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: spec.opacity,
                depthWrite: false
            });
            const fMesh = new THREE.Mesh(fGeo, fMat);
            fMesh.position.set(0, 0.09, spec.z);
            fMesh.userData = { baseZ: spec.z, baseOpacity: spec.opacity, phase: spec.phase };
            scene.add(fMesh);
            foamMeshes.push(fMesh);
        });

        // 7. Distant Tropical Islands on Horizon
        createDistantIsland(-78, -108, 22, 11);
        createDistantIsland(84, -120, 26, 13);
        createDistantIsland(-10, -158, 30, 12);

        // 8. Beach Flank Props (kept clear of up to 6-player chair strip |x| <= 10.5)
        createPalmTree(-15.2, 7.8, 0.80, -1);
        createPalmTree(-20.0, 5.4, 0.74, -1);
        createPalmTree(-25.5, 10.5, 0.90, 1);
        createPalmTree(15.2, 7.8, 0.80, 1);
        createPalmTree(20.0, 5.4, 0.74, 1);
        createPalmTree(25.5, 10.5, 0.90, -1);

        createBeachUmbrella(-14.2, 10.4, 0xff4757, 0xffffff);
        createBeachUmbrella(14.2, 10.4, 0x00cec9, 0xffffff);
        createBeachUmbrella(-21.5, 8.6, 0xfeca57, 0xffffff);
        createBeachUmbrella(21.5, 8.6, 0xff6b81, 0xffffff);

        createSurfboard(-12.6, 6.8, 0xff6348, 0.16);
        createSurfboard(12.6, 7.0, 0x1e90ff, -0.15);

        createCoastalRock(-17.8, 2.3, 1.0);
        createCoastalRock(-22.5, 1.6, 1.4);
        createCoastalRock(18.0, 2.1, 1.1);
        createCoastalRock(23.0, 1.4, 1.5);
    }

    // ─────────────────────────────────────────────────────────────
    // 4. Flying Chairs (Installed Directly on the Beach Sand)
    // ─────────────────────────────────────────────────────────────
    function disposeSlot(slot) {
        if (!slot) return;
        if (slot.bubbleTimeout) clearTimeout(slot.bubbleTimeout);

        if (slot.chairGroup) {
            scene.remove(slot.chairGroup);
            slot.chairGroup.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                    else child.material.dispose();
                }
            });
        }
        if (slot.charGroup) {
            scene.remove(slot.charGroup);
            slot.charGroup.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (child.material.map) child.material.map.dispose();
                    if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                    else child.material.dispose();
                }
            });
        }
    }

    function createChairSlot(index, slotX, slotZ) {
        const chairGroup = new THREE.Group();
        chairGroup.position.set(slotX, 1.2, slotZ);

        // Metal Pedestal resting firmly on beach sand
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.95, 0.35, 16), createMat(0x2d3436, 0.4, 0.7));
        base.position.y = 0.18;
        base.castShadow = true;
        base.receiveShadow = true;
        chairGroup.add(base);

        // Hydraulic Piston
        const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.85, 16), createMat(0x636e72, 0.2, 0.9));
        piston.position.y = 0.65;
        chairGroup.add(piston);

        // Hinge Pivot
        const hinge = new THREE.Group();
        hinge.position.set(0, 1.05, -0.35);
        chairGroup.add(hinge);

        // Red Seat Cushion
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.32, 1.35), createMat(0xd63031, 0.65));
        seat.position.set(0, 0.16, 0.35);
        seat.castShadow = true;
        hinge.add(seat);

        // Backrest
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.95, 0.28), createMat(0xd63031, 0.65));
        back.position.set(0, 1.15, -0.28);
        back.castShadow = true;
        hinge.add(back);

        // Armrests
        const armMat = createMat(0x2d3436, 0.5, 0.5);
        const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 1.0), armMat);
        lArm.position.set(-0.72, 0.55, 0.35);
        hinge.add(lArm);
        const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 1.0), armMat);
        rArm.position.set(0.72, 0.55, 0.35);
        hinge.add(rArm);

        scene.add(chairGroup);

        // Character Group
        const charGroup = new THREE.Group();
        charGroup.position.set(slotX, 2.4, slotZ + 0.1);
        charGroup.visible = false;
        scene.add(charGroup);

        // 3D Speech Bubble Sprite attached above head (depthTest: false for 100% visibility)
        const bubbleSprite = createSpeechBubbleSprite('');
        bubbleSprite.position.set(0, 3.8, 0);
        bubbleSprite.visible = false;
        charGroup.add(bubbleSprite);

        return {
            index: index,
            x: slotX,
            z: slotZ,
            chairGroup: chairGroup,
            hinge: hinge,
            seat: seat,
            back: back,
            charGroup: charGroup,
            bubbleSprite: bubbleSprite,
            bubbleTimeout: null,
            player: null,
            isTilted: false,
            currentAnim: null,
            avatarMeshes: null
        };
    }

    function buildChairs(count) {
        while (chairSlots.length > 0) {
            const oldSlot = chairSlots.pop();
            disposeSlot(oldSlot);
        }

        if (!count || count <= 0) return;

        // Generous horizontal spacing when fewer than 6 players so speech bubbles don't overlap;
        // supports up to 6 players cleanly on the beach terrace.
        let chairSpacing = 3.85;
        if (count <= 2) chairSpacing = 6.8;
        else if (count === 3) chairSpacing = 5.6;
        else if (count === 4) chairSpacing = 5.0;
        else if (count === 5) chairSpacing = 4.4;
        else if (count === 6) chairSpacing = 3.85;
        else chairSpacing = Math.max(3.1, 19.5 / (count - 1));

        const startX = -((count - 1) * chairSpacing) / 2;
        const slotZ = 6.6;

        for (let i = 0; i < count; i++) {
            const slotX = startX + i * chairSpacing;
            const slot = createChairSlot(i, slotX, slotZ);
            chairSlots.push(slot);
        }

        onResize();
    }

    // ─────────────────────────────────────────────────────────────
    // 5. 3D Character Avatar (+Z Forward-Facing with Expressive Face)
    // ─────────────────────────────────────────────────────────────
    function buildCharacterMesh(player, slotIndex) {
        const group = new THREE.Group();
        const isFemale = player.gender === 'female' || player.gender === 'F';
        const palette = isFemale ? FEMALE_COLORS : MALE_COLORS;
        const bodyColor = palette[slotIndex % palette.length];

        // Head
        const skinMat = createMat(0xffdbac, 0.55, 0.02);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.58, 22, 20), skinMat);
        head.position.y = 1.3;
        head.castShadow = true;
        group.add(head);

        // Styled Hair (Top/back cap tilted slightly back so +Z face is open + front bangs)
        const hairColor = isFemale ? 0x5c3d99 : 0x2d3436;
        const hairMat = createMat(hairColor, 0.78);
        const hairCap = new THREE.Mesh(
            new THREE.SphereGeometry(0.615, 18, 16, 0, Math.PI * 2, 0, Math.PI * 0.58),
            hairMat
        );
        hairCap.position.set(0, 1.34, -0.04);
        hairCap.rotation.x = -0.24;
        hairCap.castShadow = true;
        group.add(hairCap);

        // Front Bangs / Fringe (+Z forehead)
        const bangOffsets = [
            { x: -0.22, y: 1.67, z: 0.38, rx: 0.2, rz: 0.25, s: [0.22, 0.14, 0.18] },
            { x: 0.0, y: 1.71, z: 0.42, rx: 0.25, rz: 0.0, s: [0.25, 0.14, 0.18] },
            { x: 0.22, y: 1.67, z: 0.38, rx: 0.2, rz: -0.25, s: [0.22, 0.14, 0.18] }
        ];
        bangOffsets.forEach(b => {
            const bang = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), hairMat);
            bang.scale.set(b.s[0], b.s[1], b.s[2]);
            bang.position.set(b.x, b.y, b.z);
            bang.rotation.set(b.rx, 0, b.rz);
            group.add(bang);
        });

        if (isFemale) {
            [-0.51, 0.51].forEach(sx => {
                const sideLock = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.65, 10), hairMat);
                sideLock.position.set(sx, 1.15, 0.05);
                group.add(sideLock);
            });
            const ponytail = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), hairMat);
            ponytail.scale.set(0.9, 1.4, 0.9);
            ponytail.position.set(0, 1.25, -0.64);
            group.add(ponytail);
        }

        // Expressive Face on +Z (facing camera)
        const scleraMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        const browMat = new THREE.MeshBasicMaterial({ color: 0x2d3436 });
        const blushMat = new THREE.MeshBasicMaterial({ color: 0xff9aa2, transparent: true, opacity: 0.72 });
        const mouthMat = new THREE.MeshBasicMaterial({ color: 0xd63031 });

        [-1, 1].forEach(side => {
            const ex = side * 0.205;

            // White Sclera
            const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.112, 12, 12), scleraMat);
            sclera.scale.set(1.0, 1.15, 0.55);
            sclera.position.set(ex, 1.33, 0.515);
            group.add(sclera);

            // Black Pupil
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 10), pupilMat);
            pupil.scale.set(1.0, 1.1, 0.6);
            pupil.position.set(ex, 1.33, 0.558);
            group.add(pupil);

            // Eye Catchlight
            const glint = new THREE.Mesh(new THREE.SphereGeometry(0.023, 8, 8), scleraMat);
            glint.position.set(ex + 0.026, 1.365, 0.588);
            group.add(glint);

            // Eyebrow
            const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.038, 0.04), browMat);
            brow.position.set(ex, 1.495, 0.53);
            brow.rotation.z = side * -0.10;
            group.add(brow);

            // Cheek Blush
            const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.088, 10, 8), blushMat);
            cheek.scale.set(1.25, 0.72, 0.4);
            cheek.position.set(side * 0.34, 1.19, 0.455);
            group.add(cheek);
        });

        // Nose
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skinMat);
        nose.position.set(0, 1.24, 0.585);
        group.add(nose);

        // Smiling Mouth (Torus arc rotated to bottom half)
        const smileArc = Math.PI * 0.75;
        const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.024, 8, 14, smileArc), mouthMat);
        mouth.position.set(0, 1.18, 0.54);
        mouth.rotation.z = Math.PI + (Math.PI - smileArc) / 2;
        group.add(mouth);

        // Torso
        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.48, 0.95, 16), createMat(bodyColor, 0.6));
        torso.position.y = 0.45;
        torso.castShadow = true;
        group.add(torso);

        // Arms & Hands (Shoulder Pivot Groups so hands animate cleanly during swim & walk)
        const armMat = createMat(bodyColor, 0.6);
        const armGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.72, 10);
        const handGeo = new THREE.SphereGeometry(0.13, 10, 10);

        function createArmPivot(sideX) {
            const pivot = new THREE.Group();
            pivot.position.set(sideX, 0.72, 0.02);
            const armMesh = new THREE.Mesh(armGeo, armMat);
            armMesh.position.set(0, -0.36, 0);
            armMesh.castShadow = true;
            pivot.add(armMesh);
            const handMesh = new THREE.Mesh(handGeo, skinMat);
            handMesh.position.set(0, -0.72, 0);
            pivot.add(handMesh);
            pivot.rotation.set(-Math.PI / 3.5, 0, 0); // Forward +Z on armrests
            group.add(pivot);
            return pivot;
        }

        const leftArm = createArmPivot(-0.6);
        const rightArm = createArmPivot(0.6);

        // Legs & Shoes (Hip Pivot Groups so shoes animate cleanly during swim & walk)
        const pantsMat = createMat(0x34495e, 0.7);
        const shoeMat = createMat(0xffffff, 0.4);
        const legGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.72, 10);
        const shoeGeo = new THREE.BoxGeometry(0.24, 0.18, 0.32);

        function createLegPivot(sideX) {
            const pivot = new THREE.Group();
            pivot.position.set(sideX, 0.0, 0.05);
            const legMesh = new THREE.Mesh(legGeo, pantsMat);
            legMesh.position.set(0, -0.36, 0);
            legMesh.castShadow = true;
            pivot.add(legMesh);
            const shoeMesh = new THREE.Mesh(shoeGeo, shoeMat);
            shoeMesh.position.set(0, -0.74, 0.06);
            pivot.add(shoeMesh);
            pivot.rotation.set(-Math.PI / 2, 0, 0); // Horizontal forward +Z seated pose
            group.add(pivot);
            return pivot;
        }

        const leftLeg = createLegPivot(-0.25);
        const rightLeg = createLegPivot(0.25);

        // 3D Nickname Sprite
        const labelSprite = createNameLabel(player.name || '플레이어');
        labelSprite.position.set(0, 2.25, 0);
        group.add(labelSprite);

        return {
            group: group,
            head: head,
            torso: torso,
            leftArm: leftArm,
            rightArm: rightArm,
            leftLeg: leftLeg,
            rightLeg: rightLeg,
            labelSprite: labelSprite
        };
    }

    function createNameLabel(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        if (ctx.roundRect) ctx.roundRect(8, 8, 240, 48, 16);
        else ctx.rect(8, 8, 240, 48);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.font = 'bold 26px Pretendard, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text.length > 7 ? text.substring(0, 7) + '..' : text, 128, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(2.6, 0.65, 1);
        sprite.renderOrder = 800;
        return sprite;
    }

    function createSpeechBubbleSprite(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 480;
        canvas.height = 180;
        const info = renderBubbleCanvas(canvas, text);
        const texture = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(info.scaleW, info.scaleH, 1);
        sprite.renderOrder = 999;
        sprite.userData = { canvas: canvas, texture: texture };
        return sprite;
    }

    function wrapText(ctx, text, maxTextWidth, maxLines = 3) {
        if (!text) return [];
        const clean = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const paragraphs = clean.split('\n');
        const lines = [];

        for (const paragraph of paragraphs) {
            if (!paragraph.trim()) continue;
            const words = paragraph.split(' ');
            let currentLine = '';

            for (let i = 0; i < words.length; i++) {
                const word = words[i];
                const testLine = currentLine ? `${currentLine} ${word}` : word;
                const w = ctx.measureText(testLine).width;

                if (w <= maxTextWidth) {
                    currentLine = testLine;
                } else {
                    if (currentLine) {
                        lines.push(currentLine);
                        currentLine = '';
                    }
                    if (ctx.measureText(word).width <= maxTextWidth) {
                        currentLine = word;
                    } else {
                        for (let c = 0; c < word.length; c++) {
                            const char = word[c];
                            const testChar = currentLine + char;
                            if (ctx.measureText(testChar).width <= maxTextWidth) {
                                currentLine = testChar;
                            } else {
                                if (currentLine) lines.push(currentLine);
                                currentLine = char;
                            }
                        }
                    }
                }
            }
            if (currentLine) lines.push(currentLine);
        }

        if (lines.length > maxLines) {
            lines.length = maxLines;
            let last = lines[maxLines - 1];
            while (last.length > 0 && ctx.measureText(last + '..').width > maxTextWidth) {
                last = last.slice(0, -1);
            }
            lines[maxLines - 1] = last + '..';
        }

        return lines;
    }

    function renderBubbleCanvas(canvas, text) {
        const ctx = canvas.getContext('2d');
        if (!text) {
            canvas.width = 480;
            canvas.height = 160;
            ctx.clearRect(0, 0, 480, 160);
            return { scaleW: 3.4, scaleH: 1.4, lineCount: 0 };
        }

        ctx.font = 'bold 42px Pretendard, "Apple SD Gothic Neo", sans-serif';
        const maxTextWidth = 440;
        const lines = wrapText(ctx, text, maxTextWidth, 3);
        if (lines.length === 0) {
            canvas.width = 480;
            canvas.height = 160;
            ctx.clearRect(0, 0, 480, 160);
            return { scaleW: 3.4, scaleH: 1.4, lineCount: 0 };
        }

        let maxLineWidth = 0;
        lines.forEach(line => {
            const w = ctx.measureText(line).width;
            if (w > maxLineWidth) maxLineWidth = w;
        });

        const padX = 32;
        const padY = 26;
        const lineHeight = 54;
        const tailH = 28;
        const tailW = 32;

        const bubbleW = Math.max(260, maxLineWidth + padX * 2);
        const bubbleH = padY * 2 + lines.length * lineHeight;

        const canvasW = Math.ceil(bubbleW + 20);
        const canvasH = Math.ceil(bubbleH + tailH + 20);
        canvas.width = canvasW;
        canvas.height = canvasH;

        ctx.clearRect(0, 0, canvasW, canvasH);

        const bx = 10;
        const by = 10;
        const r = 26;

        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 6;

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#ff4757';
        ctx.lineWidth = 4.5;

        ctx.beginPath();
        ctx.moveTo(bx + r, by);
        ctx.lineTo(bx + bubbleW - r, by);
        ctx.quadraticCurveTo(bx + bubbleW, by, bx + bubbleW, by + r);
        ctx.lineTo(bx + bubbleW, by + bubbleH - r);
        ctx.quadraticCurveTo(bx + bubbleW, by + bubbleH, bx + bubbleW - r, by + bubbleH);

        const tailX = canvasW / 2;
        ctx.lineTo(tailX + tailW / 2, by + bubbleH);
        ctx.lineTo(tailX, by + bubbleH + tailH);
        ctx.lineTo(tailX - tailW / 2, by + bubbleH);

        ctx.lineTo(bx + r, by + bubbleH);
        ctx.quadraticCurveTo(bx, by + bubbleH, bx, by + bubbleH - r);
        ctx.lineTo(bx, by + r);
        ctx.quadraticCurveTo(bx, by, bx + r, by);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        ctx.font = 'bold 42px Pretendard, "Apple SD Gothic Neo", sans-serif';
        ctx.fillStyle = '#111111';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const textStartY = by + padY + lineHeight / 2;
        lines.forEach((line, idx) => {
            ctx.fillText(line, canvasW / 2, textStartY + idx * lineHeight);
        });

        const scaleW = Math.max(3.2, Math.min(4.3, (canvasW / 400) * 3.5));
        const scaleH = scaleW * (canvasH / canvasW);

        return { scaleW, scaleH, lineCount: lines.length };
    }

    // ─────────────────────────────────────────────────────────────
    // 6. Animals: 3D High-Detail Shark, 4-Legged Shoreline Gator, Seagull
    // ─────────────────────────────────────────────────────────────
    function buildAnimals() {
        const toothMat = createMat(0xfdfefe, 0.18, 0.05);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });

        // 6-1. Realistic Great White Shark (Lathe fusiform body + countershading + 5 gill slits + 2-joint tail)
        const sharkGroup = new THREE.Group();
        const sharkTopMat = createMat(0x324658, 0.28, 0.14);
        const sharkBellyMat = createMat(0xf0f4f7, 0.35, 0.06);
        const sharkCavityMat = createMat(0x1b0b0d, 0.55, 0.05);
        const sharkEyeMat = new THREE.MeshStandardMaterial({ color: 0x070a0e, roughness: 0.06, metalness: 0.28 });

        // Continuous fusiform body along +Z
        const sharkProfile = [
            new THREE.Vector2(0.20, -1.68),
            new THREE.Vector2(0.30, -1.35),
            new THREE.Vector2(0.43, -0.95),
            new THREE.Vector2(0.57, -0.50),
            new THREE.Vector2(0.72,  0.00),
            new THREE.Vector2(0.82,  0.45),
            new THREE.Vector2(0.80,  0.90),
            new THREE.Vector2(0.72,  1.30),
            new THREE.Vector2(0.59,  1.65),
            new THREE.Vector2(0.44,  1.96),
            new THREE.Vector2(0.28,  2.24),
            new THREE.Vector2(0.14,  2.44),
            new THREE.Vector2(0.01,  2.58)
        ];
        const sharkBodyGeo = new THREE.LatheGeometry(sharkProfile, 28);
        sharkBodyGeo.rotateX(Math.PI / 2);

        const sPos = sharkBodyGeo.attributes.position;
        const sColors = new Float32Array(sPos.count * 3);
        const cSharkDorsal = new THREE.Color(0x2e4152);
        const cSharkFlank = new THREE.Color(0x526b80);
        const cSharkBelly = new THREE.Color(0xf1f5f8);
        const tmpSharkCol = new THREE.Color();

        for (let i = 0; i < sPos.count; i++) {
            let vx = sPos.getX(i);
            let vy = sPos.getY(i);
            const vz = sPos.getZ(i);

            // Sleek lateral compression toward tail peduncle
            if (vz < -0.45) {
                const pedT = smoothstep(-0.45, -1.68, vz);
                vx *= (1.0 - 0.24 * pedT);
                vy *= (1.0 + 0.08 * pedT);
            }
            // Proud dorsal ridge & flattened belly
            if (vy > 0 && Math.abs(vx) < 0.28) {
                vy *= 1.07;
            } else if (vy < 0) {
                vy *= 0.85;
            }
            // Overhanging conical snout & recessed mouth arch
            if (vz > 1.2) {
                vy += smoothstep(1.2, 2.58, vz) * 0.15;
            }
            if (vz > 1.05 && vz < 2.05 && vy < -0.05 && Math.abs(vx) < 0.48) {
                const arch = Math.sin(smoothstep(1.05, 2.05, vz) * Math.PI);
                const centerW = 1.0 - Math.min(1, Math.abs(vx) / 0.48);
                vy += arch * centerW * 0.14;
            }

            sPos.setXYZ(i, vx, vy, vz);

            // Countershading with subtle organic wavy lateral line
            const waveLine = -0.08 + 0.06 * Math.sin(vz * 3.6);
            const heightFrac = vy - waveLine;
            if (heightFrac > 0.28) {
                tmpSharkCol.copy(cSharkFlank).lerp(cSharkDorsal, Math.min(1, (heightFrac - 0.28) / 0.45));
            } else if (heightFrac >= -0.08) {
                tmpSharkCol.copy(cSharkBelly).lerp(cSharkFlank, (heightFrac + 0.08) / 0.36);
            } else {
                tmpSharkCol.copy(cSharkBelly);
            }
            sColors[i * 3] = tmpSharkCol.r;
            sColors[i * 3 + 1] = tmpSharkCol.g;
            sColors[i * 3 + 2] = tmpSharkCol.b;
        }
        sharkBodyGeo.setAttribute('color', new THREE.BufferAttribute(sColors, 3));
        sharkBodyGeo.computeVertexNormals();

        const sharkBodyMat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.28,
            metalness: 0.12
        });
        const sharkBodyMesh = new THREE.Mesh(sharkBodyGeo, sharkBodyMat);
        sharkBodyMesh.castShadow = true;
        sharkGroup.add(sharkBodyMesh);

        // Recessed Dark Oral Cavity under snout
        const cavity = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), sharkCavityMat);
        cavity.scale.set(1.0, 0.42, 1.35);
        cavity.position.set(0, -0.14, 1.48);
        sharkGroup.add(cavity);

        // Head details (eyes, nostrils, 5 curved gill slits, upper & lower serrated teeth)
        const headGroup = new THREE.Group();
        headGroup.position.set(0, 0, 0);

        [-0.45, 0.45].forEach(eyeX => {
            const rim = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 10), createMat(0x1c2833, 0.4));
            rim.scale.set(0.65, 1.0, 1.1);
            rim.position.set(eyeX, 0.15, 1.56);
            headGroup.add(rim);

            const eyeBall = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 10), sharkEyeMat);
            eyeBall.position.set(eyeX + (eyeX > 0 ? 0.015 : -0.015), 0.15, 1.57);
            headGroup.add(eyeBall);
        });

        // Snout nostrils
        [-0.19, 0.19].forEach(nx => {
            const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), createMat(0x111921, 0.7));
            nostril.position.set(nx, 0.02, 2.16);
            headGroup.add(nostril);
        });

        // 5 Curved Gill Slits on both flanks
        const gillMat = createMat(0x19242e, 0.7);
        [-1, 1].forEach(side => {
            for (let g = 0; g < 5; g++) {
                const gz = 0.98 - g * 0.13;
                const gx = side * (0.76 + (g === 2 ? 0.03 : 0.0));
                const gill = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.34 - g * 0.02, 0.032), gillMat);
                gill.position.set(gx, 0.02, gz);
                gill.rotation.set(0.12, side * -0.15, side * -0.12);
                headGroup.add(gill);
            }
        });

        // Articulated Lower Jaw with serrated teeth
        const lowerJaw = new THREE.Group();
        lowerJaw.position.set(0, -0.22, 1.05);

        const jawGeo = new THREE.CylinderGeometry(0.32, 0.44, 0.85, 16);
        jawGeo.rotateX(Math.PI / 2);
        const jawMesh = new THREE.Mesh(jawGeo, sharkBellyMat);
        jawMesh.scale.set(0.95, 0.38, 1.0);
        jawMesh.position.set(0, 0, 0.40);
        lowerJaw.add(jawMesh);

        const jawTip = new THREE.Mesh(new THREE.SphereGeometry(0.31, 14, 10), sharkBellyMat);
        jawTip.scale.set(0.95, 0.38, 1.0);
        jawTip.position.set(0, 0, 0.80);
        lowerJaw.add(jawTip);

        const toothGeo = new THREE.ConeGeometry(0.04, 0.11, 4);
        for (let i = -4; i <= 4; i++) {
            const t = i / 4.5;
            const angle = t * 1.1;
            const lTooth = new THREE.Mesh(toothGeo, toothMat);
            lTooth.position.set(Math.sin(angle) * 0.31, 0.09, 0.48 + Math.cos(angle) * 0.45);
            lTooth.rotation.x = 0.15;
            lowerJaw.add(lTooth);
        }
        headGroup.add(lowerJaw);

        // Upper Teeth along snout arch
        const uToothGeo = new THREE.ConeGeometry(0.042, 0.12, 4);
        uToothGeo.rotateX(Math.PI);
        for (let i = -5; i <= 5; i++) {
            const t = i / 5.5;
            const angle = t * 1.15;
            const uTooth = new THREE.Mesh(uToothGeo, toothMat);
            uTooth.position.set(Math.sin(angle) * 0.36, -0.16, 1.48 + Math.cos(angle) * 0.50);
            uTooth.rotation.x = -0.18;
            headGroup.add(uTooth);
        }

        sharkGroup.add(headGroup);

        // Primary Curved Dorsal Fin
        const dorsalShape = new THREE.Shape();
        dorsalShape.moveTo(0, 0);
        dorsalShape.quadraticCurveTo(0.35, 0.95, -0.35, 1.62);
        dorsalShape.quadraticCurveTo(-0.48, 0.92, -1.05, 0);
        dorsalShape.closePath();
        const dorsalGeo = new THREE.ExtrudeGeometry(dorsalShape, { depth: 0.10, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03 });
        dorsalGeo.rotateY(-Math.PI / 2);
        dorsalGeo.translate(0.05, 0.68, 0.45);
        const dorsalFin = new THREE.Mesh(dorsalGeo, sharkTopMat);
        dorsalFin.castShadow = true;
        sharkGroup.add(dorsalFin);

        // Second Dorsal Fin
        const secDorsalShape = new THREE.Shape();
        secDorsalShape.moveTo(0, 0);
        secDorsalShape.lineTo(-0.22, 0.38);
        secDorsalShape.lineTo(-0.44, 0);
        secDorsalShape.closePath();
        const secDorsalGeo = new THREE.ExtrudeGeometry(secDorsalShape, { depth: 0.05, bevelEnabled: false });
        secDorsalGeo.rotateY(-Math.PI / 2);
        secDorsalGeo.translate(0.025, 0.34, -0.95);
        sharkGroup.add(new THREE.Mesh(secDorsalGeo, sharkTopMat));

        // Swept Hydrofoil Pectoral Fins (Left & Right, symmetric shapes without negative scale)
        function createPecFin(sideSign) {
            const pShape = new THREE.Shape();
            pShape.moveTo(0, 0);
            pShape.quadraticCurveTo(sideSign * 0.85, -0.25, sideSign * 1.48, -0.78);
            pShape.quadraticCurveTo(sideSign * 0.65, -0.68, sideSign * 0.12, -0.42);
            pShape.closePath();
            const pGeo = new THREE.ExtrudeGeometry(pShape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02 });
            pGeo.rotateX(Math.PI / 2);
            const fin = new THREE.Mesh(pGeo, sharkTopMat);
            fin.position.set(sideSign * 0.68, -0.12, 0.72);
            fin.rotation.set(0.08, 0, sideSign * -0.26);
            fin.castShadow = true;
            sharkGroup.add(fin);
        }
        createPecFin(-1);
        createPecFin(1);

        // Paired Pelvic Fins
        [-1, 1].forEach(side => {
            const pelShape = new THREE.Shape();
            pelShape.moveTo(0, 0);
            pelShape.lineTo(side * 0.45, -0.35);
            pelShape.lineTo(side * 0.05, -0.28);
            pelShape.closePath();
            const pelGeo = new THREE.ExtrudeGeometry(pelShape, { depth: 0.04, bevelEnabled: false });
            pelGeo.rotateX(Math.PI / 2);
            const pel = new THREE.Mesh(pelGeo, sharkBellyMat);
            pel.position.set(side * 0.36, -0.35, -0.55);
            pel.rotation.z = side * -0.35;
            sharkGroup.add(pel);
        });

        // 2-Segment Articulated Tail + Asymmetrical Crescent Caudal Fin
        const midTailJoint = new THREE.Group();
        midTailJoint.position.set(0, 0.02, -1.58);

        const pedGeo = new THREE.CylinderGeometry(0.11, 0.21, 0.84, 14);
        pedGeo.rotateX(Math.PI / 2);
        const pedMesh = new THREE.Mesh(pedGeo, sharkTopMat);
        pedMesh.position.set(0, 0, -0.40);
        midTailJoint.add(pedMesh);

        const tailJoint = new THREE.Group();
        tailJoint.position.set(0, 0, -0.78);

        const caudalShape = new THREE.Shape();
        caudalShape.moveTo(0, 0.12);
        caudalShape.quadraticCurveTo(-0.42, 0.85, -0.95, 1.48);
        caudalShape.lineTo(-0.62, 0.65);
        caudalShape.quadraticCurveTo(-0.42, 0.15, -0.36, 0.0);
        caudalShape.quadraticCurveTo(-0.48, -0.42, -0.78, -0.95);
        caudalShape.quadraticCurveTo(-0.28, -0.52, 0, -0.10);
        caudalShape.closePath();

        const caudalGeo = new THREE.ExtrudeGeometry(caudalShape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02 });
        caudalGeo.rotateY(-Math.PI / 2);
        caudalGeo.translate(0.04, 0, 0);
        const caudalMesh = new THREE.Mesh(caudalGeo, sharkTopMat);
        tailJoint.add(caudalMesh);

        midTailJoint.add(tailJoint);
        sharkGroup.add(midTailJoint);

        sharkGroup.position.set(0, 0.05, -7);
        sharkGroup.visible = false;
        scene.add(sharkGroup);
        sharkEntity = {
            group: sharkGroup,
            headGroup: headGroup,
            lowerJaw: lowerJaw,
            midTailJoint: midTailJoint,
            tailJoint: tailJoint,
            isRoaming: false,
            roamTime: 0,
            activeAttackAnim: null
        };

        // 6-2. 4-Legged Crocodile / Gator (prowls along beach-sea shoreline)
        const gatorGroup = new THREE.Group();
        const gatorMat = createMat(0x1e824c, 0.7);
        const gatorBellyMat = createMat(0x82ccdd, 0.6);
        const gatorRidgeMat = createMat(0x145a32, 0.8);

        const upperJaw = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 2.4), gatorMat);
        upperJaw.position.set(0, 0.1, 1.1);
        upperJaw.castShadow = true;
        gatorGroup.add(upperJaw);

        // Nostrils at tip of snout
        [-0.25, 0.25].forEach(nx => {
            const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), gatorRidgeMat);
            nostril.position.set(nx, 0.28, 2.1);
            gatorGroup.add(nostril);
        });

        // Lower jaw hinged near skull for +X downward opening
        const gLowerJawPivot = new THREE.Group();
        gLowerJawPivot.position.set(0, -0.15, 0.0);
        const gLowerJaw = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 2.2), gatorBellyMat);
        gLowerJaw.position.set(0, 0, 1.1);
        gLowerJawPivot.add(gLowerJaw);
        gatorGroup.add(gLowerJawPivot);

        // Teeth along upper snout
        const gToothGeo = new THREE.ConeGeometry(0.05, 0.14, 4);
        gToothGeo.rotateX(Math.PI);
        for (let tz = 0.6; tz <= 2.1; tz += 0.35) {
            [-0.45, 0.45].forEach(tx => {
                const gt = new THREE.Mesh(gToothGeo, toothMat);
                gt.position.set(tx, -0.09, tz);
                gatorGroup.add(gt);
            });
        }

        // Yellow eyes with vertical slit pupils
        const gatorEyeMat = createMat(0xf1c40f, 0.2);
        [-0.38, 0.38].forEach(ex => {
            const gEye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 10), gatorEyeMat);
            gEye.position.set(ex, 0.36, 0.3);
            gatorGroup.add(gEye);

            const slit = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), eyeMat);
            slit.scale.set(0.45, 1.25, 0.75);
            slit.position.set(ex + (ex > 0 ? 0.11 : -0.11), 0.37, 0.41);
            gatorGroup.add(slit);
        });

        const gBody = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.6, 2.4), gatorMat);
        gBody.position.set(0, 0, -1.2);
        gBody.castShadow = true;
        gatorGroup.add(gBody);

        for (let rz = -0.4; rz >= -2.0; rz -= 0.5) {
            const ridge = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 4), gatorRidgeMat);
            ridge.position.set(0.25, 0.45, rz);
            gatorGroup.add(ridge);
            const ridge2 = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 4), gatorRidgeMat);
            ridge2.position.set(-0.25, 0.45, rz);
            gatorGroup.add(ridge2);
        }

        // 4 Splayed Crocodile Legs
        function createGatorLeg(sideSign, zOffset) {
            const legPivot = new THREE.Group();
            legPivot.position.set(sideSign * 0.65, -0.1, zOffset);

            const upper = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.26), gatorMat);
            upper.position.set(sideSign * 0.2, -0.05, 0);
            upper.rotation.z = sideSign * -0.3;
            upper.castShadow = true;
            legPivot.add(upper);

            const lower = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.34, 0.28), gatorMat);
            lower.position.set(sideSign * 0.36, -0.22, 0.05);
            legPivot.add(lower);

            const foot = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.10, 0.42), gatorRidgeMat);
            foot.position.set(sideSign * 0.38, -0.36, 0.14);
            legPivot.add(foot);

            gatorGroup.add(legPivot);
            return legPivot;
        }

        const gLegs = [
            createGatorLeg(-1, -0.35), // front-left
            createGatorLeg(1, -0.35),  // front-right
            createGatorLeg(-1, -1.85), // back-left
            createGatorLeg(1, -1.85)   // back-right
        ];

        const gTailJoint = new THREE.Group();
        gTailJoint.position.set(0, -0.05, -2.4);
        const gTail = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 2.0), gatorMat);
        gTail.position.set(0, 0, -1.0);
        gTailJoint.add(gTail);
        gatorGroup.add(gTailJoint);

        gatorGroup.position.set(-5, 0.22, 2.45);
        gatorGroup.visible = false;
        scene.add(gatorGroup);
        gatorEntity = {
            group: gatorGroup,
            lowerJaw: gLowerJawPivot,
            tailJoint: gTailJoint,
            legs: gLegs,
            isRoaming: false,
            roamTime: 0,
            activeAttackAnim: null
        };

        // 6-3. Realistic Coastal Seagull (Oriented +Z beak-first, Lathe torso, M-shaped 2-joint wings, black tips & tail band)
        const gullGroup = new THREE.Group();
        const gullWhiteMat = createMat(0xf7f9fc, 0.58, 0.04);
        const gullMantleMat = createMat(0x98aab9, 0.62, 0.04);
        const gullTipMat = createMat(0x1e272e, 0.65, 0.05);
        const gullBeakMat = createMat(0xf4b41a, 0.32, 0.08);
        const gullSpotMat = createMat(0xd63031, 0.35);
        const gullIrisMat = createMat(0xf6e58d, 0.2);

        // Sculpted teardrop avian body along +Z
        const gullProfile = [
            new THREE.Vector2(0.01, -0.95),
            new THREE.Vector2(0.11, -0.78),
            new THREE.Vector2(0.22, -0.45),
            new THREE.Vector2(0.32, -0.05),
            new THREE.Vector2(0.36,  0.24),
            new THREE.Vector2(0.33,  0.48),
            new THREE.Vector2(0.24,  0.68),
            new THREE.Vector2(0.08,  0.80),
            new THREE.Vector2(0.01,  0.83)
        ];
        const gullBodyGeo = new THREE.LatheGeometry(gullProfile, 24);
        gullBodyGeo.rotateX(Math.PI / 2);

        const gPos = gullBodyGeo.attributes.position;
        const gColors = new Float32Array(gPos.count * 3);
        const cGullWhite = new THREE.Color(0xf7f9fc);
        const cGullMantle = new THREE.Color(0x95a8b8);
        const tmpGullCol = new THREE.Color();

        for (let i = 0; i < gPos.count; i++) {
            const vx = gPos.getX(i) * 1.06;
            const vy = gPos.getY(i) * 0.86;
            const vz = gPos.getZ(i);
            gPos.setXYZ(i, vx, vy, vz);

            // Silver-grey back saddle over white chest & underbelly
            const backBlend = smoothstep(0.02, 0.14, vy) * smoothstep(0.45, -0.1, vz);
            tmpGullCol.copy(cGullWhite).lerp(cGullMantle, backBlend);
            gColors[i * 3] = tmpGullCol.r;
            gColors[i * 3 + 1] = tmpGullCol.g;
            gColors[i * 3 + 2] = tmpGullCol.b;
        }
        gullBodyGeo.setAttribute('color', new THREE.BufferAttribute(gColors, 3));
        gullBodyGeo.computeVertexNormals();

        const gullBodyMesh = new THREE.Mesh(
            gullBodyGeo,
            new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.04 })
        );
        gullBodyMesh.castShadow = true;
        gullGroup.add(gullBodyMesh);

        // Neck, Avian Head, Golden Eyes & Hooked Yellow Bill (+Z)
        const gHeadGroup = new THREE.Group();
        gHeadGroup.position.set(0, 0.08, 0.66);

        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.23, 0.42, 14), gullWhiteMat);
        neck.position.set(0, 0.12, 0.10);
        neck.rotation.x = 0.68;
        gHeadGroup.add(neck);

        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 14), gullWhiteMat);
        skull.scale.set(0.90, 0.94, 1.22);
        skull.position.set(0, 0.24, 0.30);
        gHeadGroup.add(skull);

        // Golden-ringed gull eyes
        [-0.165, 0.165].forEach(ex => {
            const eyeRing = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), gullIrisMat);
            eyeRing.position.set(ex, 0.27, 0.36);
            gHeadGroup.add(eyeRing);

            const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), eyeMat);
            pupil.position.set(ex + (ex > 0 ? 0.018 : -0.018), 0.27, 0.37);
            gHeadGroup.add(pupil);
        });

        // Two-part hooked yellow bill pointing +Z with red gonys spot
        const upperBillGeo = new THREE.ConeGeometry(0.064, 0.52, 10);
        upperBillGeo.rotateX(Math.PI / 2);
        const upperBill = new THREE.Mesh(upperBillGeo, gullBeakMat);
        upperBill.scale.set(0.75, 0.9, 1.0);
        upperBill.position.set(0, 0.23, 0.70);
        gHeadGroup.add(upperBill);

        const billHook = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.12, 8), gullBeakMat);
        billHook.rotation.x = Math.PI * 0.72;
        billHook.position.set(0, 0.20, 0.96);
        gHeadGroup.add(billHook);

        const lowerBillGeo = new THREE.ConeGeometry(0.050, 0.46, 10);
        lowerBillGeo.rotateX(Math.PI / 2);
        const lowerBill = new THREE.Mesh(lowerBillGeo, gullBeakMat);
        lowerBill.scale.set(0.72, 0.78, 1.0);
        lowerBill.position.set(0, 0.19, 0.67);
        gHeadGroup.add(lowerBill);

        const redSpot = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), gullSpotMat);
        redSpot.position.set(0, 0.175, 0.84);
        gHeadGroup.add(redSpot);

        gullGroup.add(gHeadGroup);

        // Articulated 2-Joint M-Shaped Seagull Wings (Inner Mantle + Swept Black-Tipped Outer Primaries)
        function createGullWingSide(sideSign) {
            const shoulderJoint = new THREE.Group();
            shoulderJoint.position.set(sideSign * 0.30, 0.10, 0.10);

            // Inner wing shape (-sy maps to +Z leading edge, +sy maps to -Z trailing edge)
            const innerShape = new THREE.Shape();
            innerShape.moveTo(0, -0.22);
            innerShape.quadraticCurveTo(sideSign * 0.58, -0.32, sideSign * 1.18, -0.30);
            innerShape.lineTo(sideSign * 1.18, 0.20);
            innerShape.quadraticCurveTo(sideSign * 0.58, 0.32, 0, 0.34);
            innerShape.closePath();

            const innerGeo = new THREE.ExtrudeGeometry(innerShape, {
                depth: 0.055,
                bevelEnabled: true,
                bevelThickness: 0.018,
                bevelSize: 0.018
            });
            innerGeo.rotateX(-Math.PI / 2);
            const innerMesh = new THREE.Mesh(innerGeo, gullMantleMat);
            innerMesh.castShadow = true;
            shoulderJoint.add(innerMesh);

            // White trailing feather edge
            const trailMesh = new THREE.Mesh(
                new THREE.BoxGeometry(1.12, 0.025, 0.10),
                gullWhiteMat
            );
            trailMesh.position.set(sideSign * 0.58, 0.015, -0.25);
            shoulderJoint.add(trailMesh);

            // Wrist / Outer Wing Joint
            const outerJoint = new THREE.Group();
            outerJoint.position.set(sideSign * 1.15, 0.01, 0.04);

            const outerShape = new THREE.Shape();
            outerShape.moveTo(0, -0.26);
            outerShape.quadraticCurveTo(sideSign * 0.65, -0.05, sideSign * 1.38, 0.46);
            outerShape.lineTo(sideSign * 1.30, 0.60);
            outerShape.quadraticCurveTo(sideSign * 0.60, 0.36, 0, 0.24);
            outerShape.closePath();

            const outerGeo = new THREE.ExtrudeGeometry(outerShape, {
                depth: 0.042,
                bevelEnabled: true,
                bevelThickness: 0.012,
                bevelSize: 0.012
            });
            outerGeo.rotateX(-Math.PI / 2);
            const outerMesh = new THREE.Mesh(outerGeo, gullMantleMat);
            outerMesh.castShadow = true;
            outerJoint.add(outerMesh);

            // Iconic Black Primary Wingtips
            const tipShape = new THREE.Shape();
            tipShape.moveTo(sideSign * 0.55, -0.05);
            tipShape.quadraticCurveTo(sideSign * 0.98, 0.16, sideSign * 1.38, 0.46);
            tipShape.lineTo(sideSign * 1.30, 0.60);
            tipShape.quadraticCurveTo(sideSign * 0.88, 0.44, sideSign * 0.55, 0.32);
            tipShape.closePath();

            const tipGeo = new THREE.ExtrudeGeometry(tipShape, { depth: 0.050, bevelEnabled: false });
            tipGeo.rotateX(-Math.PI / 2);
            const tipMesh = new THREE.Mesh(tipGeo, gullTipMat);
            tipMesh.position.y = -0.003;
            outerJoint.add(tipMesh);

            // White apical spots on wingtips
            const spot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), gullWhiteMat);
            spot.scale.set(1.6, 0.4, 0.9);
            spot.position.set(sideSign * 1.16, 0.032, -0.42);
            outerJoint.add(spot);

            shoulderJoint.add(outerJoint);
            gullGroup.add(shoulderJoint);
            return { shoulderJoint, outerJoint };
        }

        const leftWing = createGullWingSide(-1);
        const rightWing = createGullWingSide(1);

        // Fanned Tail Feathers with Black Subterminal Band (-Z)
        const tailGroup = new THREE.Group();
        tailGroup.position.set(0, 0.03, -0.82);
        for (let f = -2; f <= 2; f++) {
            const feather = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.54), gullWhiteMat);
            feather.position.set(f * 0.08, 0, -0.22);
            feather.rotation.y = f * -0.14;
            tailGroup.add(feather);

            const band = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.034, 0.13), gullTipMat);
            band.position.set(f * 0.10, 0, -0.37);
            band.rotation.y = f * -0.14;
            tailGroup.add(band);
        }
        gullGroup.add(tailGroup);

        // Tucked Webbed Feet under rear belly
        [-0.14, 0.14].forEach(fx => {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.025, 0.35, 6), gullBeakMat);
            leg.rotation.x = Math.PI / 2.2;
            leg.position.set(fx, -0.18, -0.52);
            gullGroup.add(leg);

            const web = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 3), gullBeakMat);
            web.rotation.x = -Math.PI / 2;
            web.scale.set(1.2, 1.0, 0.25);
            web.position.set(fx, -0.22, -0.72);
            gullGroup.add(web);
        });

        gullGroup.scale.setScalar(1.12);
        gullGroup.position.set(0, 8.8, -6.5);
        gullGroup.visible = false;
        scene.add(gullGroup);
        gullEntity = {
            group: gullGroup,
            leftWingJoint: leftWing.shoulderJoint,
            rightWingJoint: rightWing.shoulderJoint,
            leftOuterWing: leftWing.outerJoint,
            rightOuterWing: rightWing.outerJoint,
            isRoaming: false,
            roamAngle: 0,
            activeAttackAnim: null
        };
    }

    // ─────────────────────────────────────────────────────────────
    // 7. Controls & Dynamic Camera Tracking
    // ─────────────────────────────────────────────────────────────
    function setupControls(canvas) {
        let touchStartDist = 0;
        let initialRadius = 28;

        function getTouchDistance(e) {
            if (e.touches && e.touches.length >= 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                return Math.sqrt(dx * dx + dy * dy);
            }
            return 0;
        }

        function onPointerDown(e) {
            isDragging = true;
            prevMouseX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
            prevMouseY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
        }

        function onPointerMove(e) {
            if (!isDragging) return;
            const curX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
            const curY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
            const deltaX = curX - prevMouseX;
            const deltaY = curY - prevMouseY;
            prevMouseX = curX;
            prevMouseY = curY;

            targetSpherical.theta -= deltaX * 0.007;
            targetSpherical.phi -= deltaY * 0.007;
            targetSpherical.phi = Math.max(0.18, Math.min(Math.PI / 2.22, targetSpherical.phi));
            targetSpherical.theta = Math.max(-Math.PI / 2.6, Math.min(Math.PI / 2.6, targetSpherical.theta));
        }

        function onPointerUp() { isDragging = false; }

        function onWheel(e) {
            targetSpherical.radius += e.deltaY * 0.02;
            targetSpherical.radius = Math.max(12, Math.min(54, targetSpherical.radius));
            e.preventDefault();
        }

        function onTouchStart(e) {
            if (e.touches.length === 2) {
                isDragging = false;
                touchStartDist = getTouchDistance(e);
                initialRadius = targetSpherical.radius;
            } else if (e.touches.length === 1) {
                onPointerDown(e);
            }
        }

        function onTouchMove(e) {
            if (e.touches.length === 2 && touchStartDist > 0) {
                const curDist = getTouchDistance(e);
                if (curDist > 0) {
                    const factor = touchStartDist / curDist;
                    targetSpherical.radius = Math.max(12, Math.min(54, initialRadius * factor));
                }
            } else if (e.touches.length === 1 && !touchStartDist) {
                onPointerMove(e);
            }
        }

        function onTouchEnd(e) {
            if (e.touches.length < 2) {
                touchStartDist = 0;
            }
            if (e.touches.length === 0) {
                isDragging = false;
            }
        }

        canvas.addEventListener('mousedown', onPointerDown);
        window.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);

        canvas.addEventListener('touchstart', onTouchStart, { passive: true });
        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('touchend', onTouchEnd);
        canvas.addEventListener('wheel', onWheel, { passive: false });
    }

    function updateCameraPosition() {
        spherical.theta += (targetSpherical.theta - spherical.theta) * 0.1;
        spherical.phi += (targetSpherical.phi - spherical.phi) * 0.1;
        spherical.radius += (targetSpherical.radius - spherical.radius) * 0.1;

        currentLookAt.x += (targetLookAt.x - currentLookAt.x) * 0.08;
        currentLookAt.y += (targetLookAt.y - currentLookAt.y) * 0.08;
        currentLookAt.z += (targetLookAt.z - currentLookAt.z) * 0.08;

        const x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
        const y = spherical.radius * Math.cos(spherical.phi);
        const z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);

        camera.position.set(x + currentLookAt.x, y + currentLookAt.y, z + currentLookAt.z);
        camera.lookAt(currentLookAt.x, currentLookAt.y, currentLookAt.z);
    }

    function onResize() {
        if (!renderer || !containerEl || !camera) return;
        const w = containerEl.clientWidth || (containerEl.parentElement ? containerEl.parentElement.clientWidth : 800) || 800;
        const h = containerEl.clientHeight || (containerEl.parentElement ? containerEl.parentElement.clientHeight : 500) || 500;
        const aspect = w / h;

        camera.aspect = aspect;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);

        const count = chairSlots.length || 6;
        let calcBase = 24;
        if (count <= 2) calcBase = 21;
        else if (count <= 4) calcBase = 24;
        else if (count === 5) calcBase = 26;
        else calcBase = 28;

        if (aspect < 0.85) {
            targetSpherical.radius = calcBase + 16;
        } else if (aspect < 1.2) {
            targetSpherical.radius = calcBase + 7;
        } else {
            targetSpherical.radius = calcBase;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 8. Player Sync & Dynamic Seating Adaptation
    // ─────────────────────────────────────────────────────────────
    function syncPlayers(players) {
        if (!isInitialized) return;
        const list = players || [];

        const currentIds = chairSlots.map(s => s.player ? s.player.id : null);
        const newIds = list.map(p => p.id);
        const needsRebuild = chairSlots.length !== list.length || currentIds.join(',') !== newIds.join(',');

        if (needsRebuild) {
            buildChairs(list.length);
        }

        chairSlots.forEach((slot, index) => {
            const player = list[index];
            if (player) {
                if (!slot.avatarMeshes || slot.player?.id !== player.id || slot.player?.name !== player.name) {
                    if (slot.charGroup.children.length > 0) {
                        for (let k = slot.charGroup.children.length - 1; k >= 0; k--) {
                            const child = slot.charGroup.children[k];
                            if (child !== slot.bubbleSprite) slot.charGroup.remove(child);
                        }
                    }
                    slot.avatarMeshes = buildCharacterMesh(player, index);
                    slot.charGroup.add(slot.avatarMeshes.group);
                }
                slot.player = player;
                slot.charGroup.visible = true;

                if (player.status === 'idle') {
                    resetSlotToSeat(slot);
                } else if (!slot.currentAnim) {
                    applyStatusToSlot(slot, player.status);
                }
            } else {
                slot.player = null;
                slot.charGroup.visible = false;
                slot.hinge.rotation.x = 0;
            }
        });
    }

    function applyStatusToSlot(slot, status) {
        const { hinge, charGroup } = slot;
        if (!charGroup) return;

        if (status === 'flying') {
            hinge.rotation.x = -1.3;
            charGroup.rotation.set(0, 0, 0);
        } else if (status === 'dead' || status === 'dead-gator') {
            hinge.rotation.x = -1.3;
            charGroup.position.set(slot.x, -0.45, -11.0);
            charGroup.rotation.set(0, 0, Math.PI / 2);
        } else if (status === 'snatched') {
            hinge.rotation.x = -1.3;
            charGroup.position.set(slot.x, 13, -3);
            charGroup.rotation.set(0, 0, 0);
        } else if (status === 'dead-missile') {
            hinge.rotation.x = -0.65;
            charGroup.position.set(slot.x, 2.55, slot.z + 0.1);
            charGroup.rotation.set(-0.85, 0, 0);
        } else {
            resetSlotToSeat(slot);
        }
    }

    function resetSlotToSeat(slot) {
        slot.isTilted = false;
        slot.hinge.rotation.x = 0;
        slot.charGroup.position.set(slot.x, 2.4, slot.z + 0.1);
        slot.charGroup.rotation.set(0, 0, 0);
        if (slot.avatarMeshes) {
            slot.avatarMeshes.leftLeg.rotation.set(-Math.PI / 2, 0, 0);
            slot.avatarMeshes.rightLeg.rotation.set(-Math.PI / 2, 0, 0);
            slot.avatarMeshes.leftArm.rotation.set(-Math.PI / 3.5, 0, 0);
            slot.avatarMeshes.rightArm.rotation.set(-Math.PI / 3.5, 0, 0);
        }
        slot.currentAnim = null;
    }

    // ─────────────────────────────────────────────────────────────
    // 9. 3D Flying & Animal Attack Animations
    // ─────────────────────────────────────────────────────────────
    function triggerFly(playerId, specialEvent) {
        if (!isInitialized) return;
        const slot = chairSlots.find(s => s.player && s.player.id === playerId);
        if (!slot) return;

        const startTime = clock.getElapsedTime();
        const startPos = { x: slot.x, y: 2.4, z: slot.z + 0.1 };
        const landingPos = {
            x: slot.x + (Math.random() * 2.4 - 1.2),
            y: 0.15,
            z: -13.5 - Math.random() * 4.5
        };

        targetLookAt.x = slot.x * 0.4;
        targetLookAt.y = 3.2;

        if (specialEvent === 'gull') {
            triggerGullSnatch(slot);
            return;
        }

        slot.isTilted = true;
        slot.hinge.rotation.x = -1.35;

        slot.currentAnim = {
            type: 'flying',
            specialEvent: specialEvent,
            startTime: startTime,
            duration: 1.0,
            update: (time) => {
                const elapsed = time - slot.currentAnim.startTime;
                const progress = Math.min(1, elapsed / 1.0);

                const arcY = Math.sin(progress * Math.PI) * 12.5;
                const curX = startPos.x + (landingPos.x - startPos.x) * progress;
                const curZ = startPos.z + (landingPos.z - startPos.z) * progress;
                const curY = startPos.y + (landingPos.y - startPos.y) * progress + arcY;

                slot.charGroup.position.set(curX, curY, curZ);
                slot.charGroup.rotation.x = progress * Math.PI * 4;

                if (progress >= 1) {
                    slot.currentAnim = null;
                    createWaterSplash(landingPos.x, 0.05, landingPos.z, 1.45);
                    slot.charGroup.rotation.set(0, 0, 0);

                    if (specialEvent === 'shark') {
                        triggerSharkAttack(slot, landingPos);
                    } else if (specialEvent === 'gator') {
                        triggerGatorAttack(slot, landingPos);
                    } else {
                        triggerSwimAndReturn(slot, landingPos);
                    }
                }
            }
        };
    }

    function triggerSharkAttack(slot, pos) {
        if (!sharkEntity) return;
        sharkEntity.group.visible = true;
        sharkEntity.group.position.set(pos.x + 6, 0.05, pos.z - 3);
        const attackStart = clock.getElapsedTime();

        sharkEntity.activeAttackAnim = {
            startTime: attackStart,
            update: (time) => {
                const el = time - attackStart;
                if (sharkEntity.midTailJoint) {
                    sharkEntity.midTailJoint.rotation.y = Math.sin(time * 12) * 0.25;
                }
                sharkEntity.tailJoint.rotation.y = Math.sin(time * 12 - 0.7) * 0.45;
                if (el < 0.9) {
                    const t = el / 0.9;
                    const curX = (pos.x + 6) * (1 - t) + pos.x * t;
                    const curZ = (pos.z - 3) * (1 - t) + pos.z * t;
                    sharkEntity.group.position.set(curX, 0.05, curZ);

                    const dx = pos.x - curX;
                    const dz = pos.z - curZ;
                    if (Math.hypot(dx, dz) > 0.01) {
                        sharkEntity.group.rotation.set(0, Math.atan2(dx, dz), 0);
                    }
                    if (sharkEntity.lowerJaw) sharkEntity.lowerJaw.rotation.x = t * 0.55;
                } else if (el < 2.0) {
                    const breachT = (el - 0.9) / 1.1;
                    const leapY = Math.sin(breachT * Math.PI) * 2.6;
                    sharkEntity.group.position.y = 0.05 + leapY;
                    sharkEntity.group.rotation.x = -Math.cos(breachT * Math.PI) * 0.7;

                    slot.charGroup.position.set(pos.x, -0.3 - breachT * 1.5, pos.z);
                    slot.charGroup.rotation.z = Math.PI / 2;

                    if (breachT > 0.4 && !sharkEntity.splashed) {
                        createBloodSplash(pos.x, 0.05, pos.z);
                        sharkEntity.splashed = true;
                    }
                } else {
                    sharkEntity.group.rotation.set(0, 0, 0);
                    if (sharkEntity.lowerJaw) sharkEntity.lowerJaw.rotation.x = 0;
                    sharkEntity.splashed = false;
                    sharkEntity.activeAttackAnim = null;
                    sharkEntity.group.visible = sharkEntity.isRoaming;
                    targetLookAt.x = 0;
                    targetLookAt.y = 2.9;
                }
            }
        };
    }

    function triggerGatorAttack(slot, pos) {
        if (!gatorEntity) return;
        gatorEntity.group.visible = true;
        const startX = pos.x - 5.5;
        const startZ = 2.2;
        gatorEntity.group.position.set(startX, 0.15, startZ);
        const attackStart = clock.getElapsedTime();

        gatorEntity.activeAttackAnim = {
            startTime: attackStart,
            update: (time) => {
                const el = time - attackStart;
                if (el < 0.8) {
                    const t = el / 0.8;
                    const curX = startX * (1 - t) + pos.x * t;
                    const curZ = startZ * (1 - t) + pos.z * t;
                    const curY = Math.max(-0.1, getBeachHeight(curX, curZ) + 0.2);
                    gatorEntity.group.position.set(curX, curY, curZ);

                    const dx = pos.x - curX;
                    const dz = pos.z - curZ;
                    if (Math.hypot(dx, dz) > 0.01) {
                        gatorEntity.group.rotation.set(0, Math.atan2(dx, dz), 0);
                    }
                    if (gatorEntity.lowerJaw) gatorEntity.lowerJaw.rotation.x = t * 0.45;
                } else if (el < 2.4) {
                    const rollT = el - 0.8;
                    gatorEntity.group.position.set(pos.x, -0.05, pos.z);
                    gatorEntity.group.rotation.z = rollT * Math.PI * 6;
                    slot.charGroup.rotation.z = rollT * Math.PI * 6;
                    slot.charGroup.position.set(pos.x, -0.2, pos.z);
                    if (Math.random() < 0.3) {
                        createWaterSplash(pos.x, 0.05, pos.z, 0.45);
                    }
                } else {
                    createBloodSplash(pos.x, 0.05, pos.z);
                    gatorEntity.group.rotation.set(0, 0, 0);
                    if (gatorEntity.lowerJaw) gatorEntity.lowerJaw.rotation.x = 0;
                    gatorEntity.activeAttackAnim = null;
                    gatorEntity.group.visible = gatorEntity.isRoaming;
                    targetLookAt.x = 0;
                    targetLookAt.y = 2.9;
                }
            }
        };
    }

    function triggerGullSnatch(slot) {
        if (!gullEntity) return;
        gullEntity.group.visible = true;
        const startY = 16;
        gullEntity.group.position.set(slot.x + 10, startY, slot.z - 7);
        const snatchStart = clock.getElapsedTime();

        gullEntity.activeAttackAnim = {
            startTime: snatchStart,
            update: (time) => {
                const el = time - snatchStart;
                if (el < 1.1) {
                    const t = el / 1.1;
                    gullEntity.group.position.x = (slot.x + 10) * (1 - t) + slot.x * t;
                    gullEntity.group.position.y = startY * (1 - t) + 2.8 * t;
                    gullEntity.group.position.z = (slot.z - 7) * (1 - t) + slot.z * t;
                    gullEntity.group.lookAt(slot.x, 2.4, slot.z);
                } else if (el < 1.3) {
                    slot.hinge.rotation.x = -1.3;
                    gullEntity.group.position.set(slot.x, 2.8, slot.z);
                    slot.charGroup.position.set(slot.x, 2.2, slot.z);
                } else if (el < 3.8) {
                    const soarT = (el - 1.3) / 2.5;
                    const skyY = 2.8 + soarT * 11;
                    const skyX = slot.x + Math.sin(soarT * Math.PI * 2) * 7;
                    const skyZ = slot.z - Math.cos(soarT * Math.PI * 2) * 5;

                    const nextT = Math.min(1, soarT + 0.02);
                    const nextY = 2.8 + nextT * 11;
                    const nextX = slot.x + Math.sin(nextT * Math.PI * 2) * 7;
                    const nextZ = slot.z - Math.cos(nextT * Math.PI * 2) * 5;

                    gullEntity.group.position.set(skyX, skyY, skyZ);
                    gullEntity.group.lookAt(nextX, nextY, nextZ);
                    slot.charGroup.position.set(skyX, skyY - 0.85, skyZ);
                    slot.charGroup.rotation.z = Math.sin(time * 12) * 0.3;
                } else {
                    gullEntity.activeAttackAnim = null;
                    gullEntity.group.visible = gullEntity.isRoaming;
                    slot.currentAnim = null;
                    targetLookAt.x = 0;
                    targetLookAt.y = 2.9;
                }
            }
        };
    }

    function triggerSwimAndReturn(slot, landingPos) {
        const swimStart = clock.getElapsedTime();
        const shoreZ = 2.4;

        slot.currentAnim = {
            type: 'swim_return',
            startTime: swimStart,
            update: (time) => {
                const el = time - swimStart;
                if (el < 2.8) {
                    // Straight, calm belly-down freestyle swim back to shore
                    const t = el / 2.8;
                    const curX = landingPos.x * (1 - t) + slot.x * t;
                    const curZ = landingPos.z * (1 - t) + shoreZ * t;
                    const swimY = 0.06 + Math.sin(time * 3.5) * 0.05;
                    slot.charGroup.position.set(curX, swimY, curZ);
                    slot.charGroup.rotation.set(Math.PI * 0.42, 0, 0);

                    if (slot.avatarMeshes) {
                        slot.avatarMeshes.leftArm.rotation.x = time * 5.2;
                        slot.avatarMeshes.rightArm.rotation.x = time * 5.2 + Math.PI;
                        slot.avatarMeshes.leftLeg.rotation.x = Math.sin(time * 10.0) * 0.35;
                        slot.avatarMeshes.rightLeg.rotation.x = -Math.sin(time * 10.0) * 0.35;
                    }
                    if (Math.random() < 0.18) {
                        createWaterSplash(curX, 0.05, curZ - 0.5, 0.28);
                    }
                } else if (el < 3.9) {
                    // Stand up and walk calmly from shoreline up the beach slope back to chair
                    const walkT = (el - 2.8) / 1.1;
                    const curZ = shoreZ * (1 - walkT) + (slot.z + 0.1) * walkT;
                    const walkY = getBeachHeight(slot.x, curZ) + 1.2;
                    slot.charGroup.position.set(slot.x, walkY, curZ);
                    slot.charGroup.rotation.set(0, 0, 0);
                    if (slot.avatarMeshes) {
                        slot.avatarMeshes.leftArm.rotation.x = Math.sin(time * 9.0) * 0.45;
                        slot.avatarMeshes.rightArm.rotation.x = -Math.sin(time * 9.0) * 0.45;
                        slot.avatarMeshes.leftLeg.rotation.x = -Math.sin(time * 9.0) * 0.55;
                        slot.avatarMeshes.rightLeg.rotation.x = Math.sin(time * 9.0) * 0.55;
                    }
                } else {
                    resetSlotToSeat(slot);
                    targetLookAt.x = 0;
                    targetLookAt.y = 2.9;
                }
            }
        };
    }

    // ─────────────────────────────────────────────────────────────
    // 10. 3D Homing Missile & Explosion System
    // ─────────────────────────────────────────────────────────────
    function createMissileMesh3D() {
        const group = new THREE.Group();

        // Fuselage pointing along +Z (for Object3D.lookAt)
        const bodyGeo = new THREE.CylinderGeometry(0.24, 0.24, 1.55, 16);
        bodyGeo.rotateX(Math.PI / 2);
        const body = new THREE.Mesh(bodyGeo, createMat(0xecf0f1, 0.3, 0.45));
        group.add(body);

        // Red collar band
        const bandGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.18, 16);
        bandGeo.rotateX(Math.PI / 2);
        const band = new THREE.Mesh(bandGeo, createMat(0xe74c3c, 0.4));
        band.position.z = 0.52;
        group.add(band);

        // Red nose cone at +Z
        const noseGeo = new THREE.ConeGeometry(0.26, 0.7, 16);
        noseGeo.rotateX(Math.PI / 2);
        const nose = new THREE.Mesh(noseGeo, createMat(0xe74c3c, 0.35, 0.2));
        nose.position.z = 1.12;
        group.add(nose);

        // 4 tail fins at -Z
        const finMat = createMat(0xc0392b, 0.5);
        const vFinGeo = new THREE.BoxGeometry(0.05, 0.62, 0.48);
        const hFinGeo = new THREE.BoxGeometry(0.62, 0.05, 0.48);
        const vFin = new THREE.Mesh(vFinGeo, finMat);
        vFin.position.z = -0.58;
        group.add(vFin);
        const hFin = new THREE.Mesh(hFinGeo, finMat);
        hFin.position.z = -0.58;
        group.add(hFin);

        // Exhaust nozzle
        const nozzleGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.22, 12);
        nozzleGeo.rotateX(Math.PI / 2);
        const nozzle = new THREE.Mesh(nozzleGeo, createMat(0x2d3436, 0.5, 0.8));
        nozzle.position.z = -0.84;
        group.add(nozzle);

        // Thruster Flame at -Z
        const flameGeo = new THREE.ConeGeometry(0.22, 1.05, 12);
        flameGeo.rotateX(-Math.PI / 2);
        const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({
            color: 0xff9f43,
            transparent: true,
            opacity: 0.92
        }));
        flame.position.z = -1.42;
        group.add(flame);

        const coreGeo = new THREE.ConeGeometry(0.12, 0.65, 10);
        coreGeo.rotateX(-Math.PI / 2);
        const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: 0xfff200 }));
        core.position.z = -1.25;
        group.add(core);

        const light = new THREE.PointLight(0xff6b35, 1.8, 14);
        light.position.set(0, 0, -1.0);
        group.add(light);

        return { group, flame };
    }

    function disposeObjectGroup(group) {
        group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
        });
    }

    function createExplosion3D(x, y, z) {
        // Expanding Fireball
        const fireball = new THREE.Mesh(
            new THREE.SphereGeometry(0.8, 16, 14),
            new THREE.MeshBasicMaterial({ color: 0xff6b35, transparent: true, opacity: 0.95 })
        );
        fireball.position.set(x, y, z);
        fireball.velocity = new THREE.Vector3(0, 0.6, 0);
        fireball.gravity = 0;
        fireball.life = 0.55;
        fireball.maxLife = 0.55;
        fireball.growRate = 5.5;
        scene.add(fireball);
        activeParticles.push(fireball);

        // Expanding Shockwave Ring
        const ringGeo = new THREE.RingGeometry(0.4, 0.75, 24);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xffd32a,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(x, y, z);
        ring.lookAt(camera.position);
        ring.velocity = new THREE.Vector3(0, 0, 0);
        ring.gravity = 0;
        ring.life = 0.5;
        ring.maxLife = 0.5;
        ring.growRate = 7.0;
        scene.add(ring);
        activeParticles.push(ring);

        // Debris / Spark / Smoke Burst
        if (!sharedSparkGeo) sharedSparkGeo = new THREE.SphereGeometry(0.22, 6, 6);
        const palette = [0xff4757, 0xff9f43, 0xffd32a, 0x576574];
        for (let i = 0; i < 32; i++) {
            const col = palette[i % palette.length];
            const pMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95 });
            const p = new THREE.Mesh(sharedSparkGeo, pMat);
            p.position.set(x, y, z);
            p.scale.setScalar(0.75 + Math.random() * 0.7);

            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const speed = 4.0 + Math.random() * 6.5;
            p.velocity = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta) * speed,
                Math.abs(Math.cos(phi)) * speed + 1.5,
                Math.sin(phi) * Math.sin(theta) * speed
            );
            p.gravity = 9.0;
            p.life = 0.65 + Math.random() * 0.4;
            p.maxLife = p.life;
            scene.add(p);
            activeParticles.push(p);
        }
    }

    function getSpiralPoint(t) {
        const angle = t * Math.PI * 5.5; // Fast 2.75 loops over the ocean and shoreline
        return new THREE.Vector3(
            Math.sin(angle) * 9.5,
            6.2 + Math.sin(angle * 2.0) * 3.4,
            -5.5 + Math.cos(angle * 1.5) * 6.5
        );
    }

    function getPhase3Point(startPos, targetPos, u) {
        const ease = u * u;
        const pos = startPos.clone().lerp(targetPos, ease);
        pos.y += Math.sin(u * Math.PI) * 1.4;
        return pos;
    }

    function triggerMissile(senderId, targetId, callbacks) {
        const onHit = typeof callbacks === 'function' ? callbacks : (callbacks && callbacks.onHit);
        const onStrike = (callbacks && typeof callbacks === 'object') ? callbacks.onStrike : null;

        if (!isInitialized) {
            if (onHit) onHit();
            return false;
        }

        const senderSlot = chairSlots.find(s => s.player && s.player.id === senderId);
        const targetSlot = chairSlots.find(s => s.player && s.player.id === targetId);
        if (!senderSlot || !targetSlot) {
            if (onHit) onHit();
            return false;
        }

        const { group, flame } = createMissileMesh3D();
        const startPos = senderSlot.charGroup.position.clone().add(new THREE.Vector3(0, 1.35, 0));
        const spiralEntry = getSpiralPoint(0);
        group.position.copy(startPos);
        scene.add(group);

        const missileObj = {
            group: group,
            flame: flame,
            targetSlot: targetSlot,
            startPos: startPos,
            spiralEntry: spiralEntry,
            p3StartPos: null,
            startTime: clock.getElapsedTime(),
            lastSmokeTime: -1,
            strikePlayed: false,
            finished: false,
            onStrike: onStrike,
            onHit: onHit
        };

        activeMissiles.push(missileObj);
        return true;
    }

    function updateActiveMissiles(time, delta) {
        const phase1Dur = 0.70;
        const phase2End = 3.90; // 3.20s fast 3D sea spiral
        const totalDur = 4.50;  // 0.60s terminal homing dive

        for (let i = activeMissiles.length - 1; i >= 0; i--) {
            const m = activeMissiles[i];
            if (m.finished) {
                activeMissiles.splice(i, 1);
                continue;
            }

            const elapsed = time - m.startTime;
            const curPos = new THREE.Vector3();
            let lookPos = null;

            if (elapsed < phase1Dur) {
                const p = Math.min(1, elapsed / phase1Dur);
                const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
                curPos.copy(m.startPos).lerp(m.spiralEntry, ease);
                curPos.y += Math.sin(p * Math.PI) * 3.2;

                const pNext = Math.min(1, (elapsed + 0.03) / phase1Dur);
                const easeNext = pNext < 0.5 ? 2 * pNext * pNext : 1 - Math.pow(-2 * pNext + 2, 2) / 2;
                lookPos = m.startPos.clone().lerp(m.spiralEntry, easeNext);
                lookPos.y += Math.sin(pNext * Math.PI) * 3.2;
            } else if (elapsed < phase2End) {
                const t = Math.min(1, (elapsed - phase1Dur) / (phase2End - phase1Dur));
                curPos.copy(getSpiralPoint(t));
                const tNext = Math.min(1, t + 0.015);
                lookPos = getSpiralPoint(tNext);
            } else {
                if (!m.strikePlayed) {
                    m.strikePlayed = true;
                    m.p3StartPos = m.group.position.clone();
                    if (m.onStrike) m.onStrike();
                }

                const targetCenter = m.targetSlot.charGroup.position.clone().add(new THREE.Vector3(0, 1.1, 0));
                const u = Math.min(1, (elapsed - phase2End) / (totalDur - phase2End));

                curPos.copy(getPhase3Point(m.p3StartPos, targetCenter, u));
                lookPos = (u < 0.96)
                    ? getPhase3Point(m.p3StartPos, targetCenter, Math.min(1, u + 0.04))
                    : targetCenter.clone();

                if (u >= 1) {
                    m.finished = true;
                    createExplosion3D(targetCenter.x, targetCenter.y, targetCenter.z);
                    scene.remove(m.group);
                    disposeObjectGroup(m.group);
                    activeMissiles.splice(i, 1);
                    if (m.onHit) m.onHit();
                    continue;
                }
            }

            m.group.position.copy(curPos);
            if (lookPos && lookPos.distanceToSquared(curPos) > 0.0001) {
                m.group.lookAt(lookPos);
            }

            // Flicker thruster flame
            if (m.flame) {
                const flick = 0.85 + Math.random() * 0.45;
                m.flame.scale.set(1, flick, 1);
            }

            // Emit 3D smoke/fire trail
            if (time - m.lastSmokeTime > 0.032) {
                m.lastSmokeTime = time;
                if (!sharedSmokeGeo) sharedSmokeGeo = new THREE.SphereGeometry(0.22, 6, 6);
                if (!sharedEmberGeo) sharedEmberGeo = new THREE.SphereGeometry(0.14, 6, 6);
                const backward = new THREE.Vector3(0, 0, -1.2).applyQuaternion(m.group.quaternion);
                const smokePos = curPos.clone().add(backward);
                const isEmber = Math.random() < 0.3;
                const sMesh = new THREE.Mesh(
                    isEmber ? sharedEmberGeo : sharedSmokeGeo,
                    new THREE.MeshBasicMaterial({
                        color: isEmber ? 0xff9f43 : 0xeef2f5,
                        transparent: true,
                        opacity: isEmber ? 0.9 : 0.65
                    })
                );
                sMesh.position.copy(smokePos);
                sMesh.velocity = new THREE.Vector3(
                    (Math.random() - 0.5) * 0.6,
                    0.5 + Math.random() * 0.5,
                    (Math.random() - 0.5) * 0.6
                );
                sMesh.gravity = 0;
                sMesh.life = 0.55;
                sMesh.maxLife = 0.55;
                sMesh.growRate = 1.6;
                scene.add(sMesh);
                activeParticles.push(sMesh);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 11. 3D Speech Bubble System (Multi-line & Anti-Overlap Staggering)
    // ─────────────────────────────────────────────────────────────
    function showSpeechBubble(playerId, text) {
        if (!isInitialized) return;
        const slot = chairSlots.find(s => s.player && s.player.id === playerId);
        if (!slot || !slot.bubbleSprite) return;

        const { canvas, texture } = slot.bubbleSprite.userData;
        const info = renderBubbleCanvas(canvas, text);
        texture.needsUpdate = true;

        slot.bubbleSprite.scale.set(info.scaleW, info.scaleH, 1);

        const leftSlot = chairSlots.find(s => s.index === slot.index - 1);
        const rightSlot = chairSlots.find(s => s.index === slot.index + 1);
        const neighborSpeaking = (leftSlot && leftSlot.bubbleSprite && leftSlot.bubbleSprite.visible) ||
                                 (rightSlot && rightSlot.bubbleSprite && rightSlot.bubbleSprite.visible);

        let targetY = 4.2;
        if (chairSlots.length >= 6) {
            targetY = (slot.index % 2 === 1) ? 5.2 : 4.3;
            if (neighborSpeaking) {
                targetY += (slot.index % 2 === 1) ? 0.75 : 0.6;
            }
        } else {
            if (slot.index % 2 === 1) {
                targetY = 4.55;
            }
            if (neighborSpeaking) {
                targetY += 0.35;
            }
        }
        slot.bubbleSprite.position.set(0, targetY, 0);
        slot.bubbleSprite.visible = true;

        if (slot.bubbleTimeout) clearTimeout(slot.bubbleTimeout);
        const displayDuration = Math.min(6000, Math.max(3600, text.length * 130));
        slot.bubbleTimeout = setTimeout(() => {
            slot.bubbleSprite.visible = false;
        }, displayDuration);
    }

    // ─────────────────────────────────────────────────────────────
    // 12. 3D Particles
    // ─────────────────────────────────────────────────────────────
    function createWaterSplash(x, y, z, scale = 1.0) {
        const count = 26;
        const pGeo = new THREE.SphereGeometry(0.12 * scale, 6, 6);

        for (let i = 0; i < count; i++) {
            const pMat = new THREE.MeshBasicMaterial({ color: 0xe0f7fa, transparent: true, opacity: 0.85 });
            const p = new THREE.Mesh(pGeo, pMat);
            p.position.set(x, y + 0.1, z);
            const angle = Math.random() * Math.PI * 2;
            const speed = (2.2 + Math.random() * 4.2) * scale;
            p.velocity = new THREE.Vector3(
                Math.cos(angle) * (0.8 + Math.random() * 1.4),
                speed,
                Math.sin(angle) * (0.8 + Math.random() * 1.4)
            );
            p.gravity = 9.8;
            p.life = 0.8 + Math.random() * 0.35;
            p.maxLife = p.life;
            scene.add(p);
            activeParticles.push(p);
        }
    }

    function createBloodSplash(x, y, z) {
        const count = 18;
        const pGeo = new THREE.SphereGeometry(0.16, 6, 6);

        for (let i = 0; i < count; i++) {
            const pMat = new THREE.MeshBasicMaterial({ color: 0xc0392b, transparent: true, opacity: 0.9 });
            const p = new THREE.Mesh(pGeo, pMat);
            p.position.set(x, y + 0.1, z);
            p.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 2.8,
                1.4 + Math.random() * 2.8,
                (Math.random() - 0.5) * 2.8
            );
            p.gravity = 6.0;
            p.life = 1.3;
            p.maxLife = p.life;
            scene.add(p);
            activeParticles.push(p);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 13. Roaming Animals
    // ─────────────────────────────────────────────────────────────
    function updateRoamingAnimal(animal, visible) {
        if (!isInitialized) return;
        if (animal === 'shark' && sharkEntity) {
            sharkEntity.isRoaming = visible;
            if (!sharkEntity.activeAttackAnim) sharkEntity.group.visible = visible;
        } else if (animal === 'gator' && gatorEntity) {
            gatorEntity.isRoaming = visible;
            if (!gatorEntity.activeAttackAnim) gatorEntity.group.visible = visible;
        } else if (animal === 'gull' && gullEntity) {
            gullEntity.isRoaming = visible;
            if (!gullEntity.activeAttackAnim) gullEntity.group.visible = visible;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 14. Main Render Loop
    // ─────────────────────────────────────────────────────────────
    function animate() {
        if (!isVisible) return;
        animFrameId = requestAnimationFrame(animate);

        const delta = Math.min(clock.getDelta(), 0.1);
        const time = clock.getElapsedTime();

        updateCameraPosition();

        // Ocean Y-axis waves (dampened smoothly at shoreline)
        if (waterMesh && waterMesh.geometry) {
            const posAttr = waterMesh.geometry.attributes.position;
            const waterZOffset = waterMesh.position.z;
            for (let i = 0; i < posAttr.count; i++) {
                const u = posAttr.getX(i);
                const vz = posAttr.getZ(i);
                const worldZ = vz + waterZOffset;
                const shoreDamp = smoothstep(3.4, -2.5, worldZ);
                const waveY = (Math.sin(u * 0.25 + time * 2.1) * 0.14 + Math.cos(worldZ * 0.35 + time * 1.6) * 0.10) * shoreDamp;
                posAttr.setY(i, waveY);
            }
            posAttr.needsUpdate = true;
        }

        // Shoreline surf foam surge
        foamMeshes.forEach(foam => {
            const d = foam.userData;
            const surge = Math.sin(time * 1.35 + d.phase) * 0.42;
            const fz = d.baseZ + surge;
            foam.position.z = fz;
            foam.position.y = Math.max(0.08, getBeachHeight(0, fz) + 0.03);
            foam.material.opacity = d.baseOpacity * (0.65 + 0.35 * Math.cos(time * 1.35 + d.phase));
        });

        // Drifting clouds
        cloudGroups.forEach(cloud => {
            cloud.position.x += delta * cloud.userData.speed;
            if (cloud.position.x > 155) cloud.position.x = -155;
        });

        // Shark patrolling deeper offshore waters with fluid 2-segment S-wave tail
        if (sharkEntity && sharkEntity.isRoaming && !sharkEntity.activeAttackAnim) {
            sharkEntity.roamTime += delta;
            const t = sharkEntity.roamTime * 0.45;
            const posX = Math.sin(t) * 11.5;
            const posZ = -7.2 + Math.cos(t * 1.5) * 2.6;
            sharkEntity.group.position.set(posX, 0.02, posZ);

            const vx = Math.cos(t) * 11.5 * 0.45;
            const vz = -Math.sin(t * 1.5) * 2.6 * 1.5 * 0.45;
            sharkEntity.group.rotation.set(0, Math.atan2(vx, vz), 0);
            if (sharkEntity.midTailJoint) {
                sharkEntity.midTailJoint.rotation.y = Math.sin(time * 5.2) * 0.22;
            }
            sharkEntity.tailJoint.rotation.y = Math.sin(time * 5.2 - 0.75) * 0.42;
        }

        // Crocodile prowling along the sand-sea shoreline boundary
        if (gatorEntity && gatorEntity.isRoaming && !gatorEntity.activeAttackAnim) {
            gatorEntity.roamTime += delta;
            const gt = gatorEntity.roamTime * 0.42;
            const gX = Math.sin(gt) * 10.5;
            const gZ = 2.45 + Math.sin(gt * 1.7) * 0.65;
            const gY = Math.max(0.02, getBeachHeight(gX, gZ) + 0.24);
            gatorEntity.group.position.set(gX, gY, gZ);

            const gvx = Math.cos(gt) * 10.5 * 0.42;
            const gvz = Math.cos(gt * 1.7) * 0.65 * 1.7 * 0.42;
            gatorEntity.group.rotation.set(0, Math.atan2(gvx, gvz), 0);
            gatorEntity.tailJoint.rotation.y = Math.sin(time * 5.0) * 0.32;
            if (gatorEntity.lowerJaw) {
                gatorEntity.lowerJaw.rotation.x = Math.max(0, Math.sin(time * 2.2) * 0.14);
            }
            if (gatorEntity.legs) {
                const stride = Math.sin(time * 6.5) * 0.45;
                gatorEntity.legs[0].rotation.y = stride;
                gatorEntity.legs[1].rotation.y = -stride;
                gatorEntity.legs[2].rotation.y = -stride;
                gatorEntity.legs[3].rotation.y = stride;
            }
        }

        if (gullEntity) {
            const innerFlap = Math.sin(time * 8.5) * 0.36;
            const outerFlap = Math.sin(time * 8.5 - 0.85) * 0.48;
            gullEntity.leftWingJoint.rotation.z = -innerFlap;
            gullEntity.rightWingJoint.rotation.z = innerFlap;
            if (gullEntity.leftOuterWing) gullEntity.leftOuterWing.rotation.z = -outerFlap;
            if (gullEntity.rightOuterWing) gullEntity.rightOuterWing.rotation.z = outerFlap;

            if (gullEntity.isRoaming && !gullEntity.activeAttackAnim) {
                gullEntity.roamAngle += delta * 0.42;
                const rX = Math.sin(gullEntity.roamAngle) * 11.0;
                const rZ = -6.5 + Math.cos(gullEntity.roamAngle) * 4.5;
                const vx = Math.cos(gullEntity.roamAngle) * 11.0 * 0.42;
                const vz = -Math.sin(gullEntity.roamAngle) * 4.5 * 0.42;
                gullEntity.group.position.set(rX, 8.8 + Math.sin(time * 2.0) * 0.55, rZ);
                gullEntity.group.rotation.set(0, Math.atan2(vx, vz), -0.20);
            }
        }

        if (sharkEntity && sharkEntity.activeAttackAnim) sharkEntity.activeAttackAnim.update(time);
        if (gatorEntity && gatorEntity.activeAttackAnim) gatorEntity.activeAttackAnim.update(time);
        if (gullEntity && gullEntity.activeAttackAnim) gullEntity.activeAttackAnim.update(time);

        chairSlots.forEach(slot => {
            if (slot.currentAnim && slot.currentAnim.update) {
                slot.currentAnim.update(time);
            }
        });

        updateActiveMissiles(time, delta);

        for (let i = activeParticles.length - 1; i >= 0; i--) {
            const p = activeParticles[i];
            p.life -= delta;
            if (p.life <= 0) {
                scene.remove(p);
                if (p.material) p.material.dispose();
                activeParticles.splice(i, 1);
            } else {
                p.position.addScaledVector(p.velocity, delta);
                p.velocity.y -= p.gravity * delta;
                if (p.growRate) {
                    const s = 1 + p.growRate * (1 - p.life / p.maxLife);
                    p.scale.setScalar(s);
                }
                p.material.opacity = Math.max(0, p.life / p.maxLife);
            }
        }

        renderer.render(scene, camera);
    }

    // ─────────────────────────────────────────────────────────────
    // 15. Visibility
    // ─────────────────────────────────────────────────────────────
    function setVisible(show) {
        isVisible = show;
        if (containerEl) {
            containerEl.style.display = show ? 'block' : 'none';
        }
        if (show) {
            if (!isInitialized) init(containerEl);
            onResize();
            if (!animFrameId) animFrameId = requestAnimationFrame(animate);
        } else {
            if (animFrameId) {
                cancelAnimationFrame(animFrameId);
                animFrameId = null;
            }
            // Complete any mid-flight missiles cleanly when leaving 3D view
            while (activeMissiles.length > 0) {
                const m = activeMissiles.pop();
                if (!m.finished) {
                    m.finished = true;
                    scene.remove(m.group);
                    disposeObjectGroup(m.group);
                    if (m.onHit) m.onHit();
                }
            }
        }
    }

    return {
        init: init,
        setVisible: setVisible,
        syncPlayers: syncPlayers,
        triggerFly: triggerFly,
        triggerMissile: triggerMissile,
        showSpeechBubble: showSpeechBubble,
        updateRoamingAnimal: updateRoamingAnimal,
        handleResize: onResize,
        getSlots: () => chairSlots,
        isInitialized: () => isInitialized,
        isVisible: () => isVisible
    };
}));
