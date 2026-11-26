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
    const activeSaltAnims = [];
    let sharedSmokeGeo = null;
    let sharedEmberGeo = null;
    let sharedSparkGeo = null;

    let clock = null;
    let resizeObserver = null;

    // Camera control variables (Smooth Orbit & Adaptive Framing)
    let isDragging = false;
    let prevMouseX = 0, prevMouseY = 0;
    const DEFAULT_PHI = Math.PI / 2.34; // ~77 deg from zenith -> frames chairs, shoreline, sea, islands, clouds & sky
    const BASE_FOV = 50;
    let baseRadius = 24;
    let baselineW = 0;
    let baselineH = 0;
    let userHasZoomed = false;
    let spherical = { radius: 24, theta: 0, phi: DEFAULT_PHI };
    let targetSpherical = { radius: 24, theta: 0, phi: DEFAULT_PHI };
    let currentLookAt = { x: 0, y: 2.9, z: 0.8 };
    let targetLookAt = { x: 0, y: 2.9, z: 0.8 };
    const cameraFocusState = {
        active: false,
        restoring: false,
        savedSpherical: null,
        savedLookAt: null,
        focusSpherical: { radius: 7.4, theta: 0.08, phi: 1.26 },
        focusLookAt: { x: 0, y: 1.25, z: -14.8 }
    };

    const MALE_COLORS = [0x3498db, 0x2980b9, 0x1abc9c, 0x16a085, 0x34495e, 0x2c3e50];
    const FEMALE_COLORS = [0xe84393, 0xfd79a8, 0xe17055, 0xd63031, 0x9b59b6, 0x8e44ad];
    const ALIEN_COLORS = [0x8e44ad, 0x9b59b6, 0x7158e2, 0x6c5ce7, 0x8854d0, 0x5f27cd];

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

        const rawW = containerEl.clientWidth || (containerEl.parentElement ? containerEl.parentElement.clientWidth : 0);
        const rawH = containerEl.clientHeight || (containerEl.parentElement ? containerEl.parentElement.clientHeight : 0);
        const w = rawW || 800;
        const h = rawH || 500;
        const aspect = w / h;
        baselineW = rawW || 0;
        baselineH = rawH || 0;
        userHasZoomed = false;

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

        camera = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.1, 600);
        updateCameraPosition();

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        const initMaxBuf = 2560;
        const initRawDpr = Math.min(window.devicePixelRatio || 1, 2);
        const initSafeDpr = Math.max(0.5, Math.min(initRawDpr, initMaxBuf / Math.max(w, h, 1)));
        renderer.setPixelRatio(initSafeDpr);
        renderer.setSize(w, h, false);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        const canvas = renderer.domElement;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
        canvas.style.touchAction = 'none';
        canvas.addEventListener('webglcontextlost', (ev) => {
            ev.preventDefault();
            console.warn('[ThreeStageManager] WebGL context lost; awaiting automatic restore.');
        }, false);
        canvas.addEventListener('webglcontextrestored', () => {
            onResize({ immediate: true });
        }, false);
        containerEl.appendChild(canvas);

        setupLights();
        buildEnvironment();
        buildAnimals();
        setupControls(canvas);
        window.addEventListener('resize', () => scheduleResize());
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => scheduleResize());
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

    function createDistantIsland(x, z, radius, height, isSaltIsland = false) {
        const group = new THREE.Group();
        group.position.set(x, -0.4, z);

        const sandBase = new THREE.Mesh(
            new THREE.ConeGeometry(radius, height * 0.42, 18),
            createMat(isSaltIsland ? 0xd8c8e8 : 0xe8cd95, 0.9)
        );
        sandBase.position.y = height * 0.15;
        group.add(sandBase);

        const hill = new THREE.Mesh(
            new THREE.SphereGeometry(radius * 0.62, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.52),
            createMat(isSaltIsland ? 0x7c3aed : 0x2e8b57, 0.85)
        );
        hill.scale.set(1.0, height / (radius * 0.62), 0.9);
        hill.position.y = height * 0.2;
        group.add(hill);

        const peak = new THREE.Mesh(
            new THREE.SphereGeometry(radius * 0.35, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
            createMat(isSaltIsland ? 0xa855f7 : 0x27ae60, 0.8)
        );
        peak.position.set(radius * 0.15, height * 0.48, -radius * 0.1);
        group.add(peak);

        if (isSaltIsland) {
            // Purple Island lavender bushes & coastal flower clusters
            const bushMatA = createMat(0xc084fc, 0.78);
            const bushMatB = createMat(0x9333ea, 0.82);
            [
                [-11.5, 4.4, -2.5, 3.6, true],
                [-5.0, 6.2, -5.0, 3.2, false],
                [8.5, 5.2, -4.0, 3.5, true],
                [13.5, 3.6, 2.5, 2.8, false]
            ].forEach(([bx, by, bz, br, alt]) => {
                const bush = new THREE.Mesh(new THREE.SphereGeometry(br, 12, 10), alt ? bushMatA : bushMatB);
                bush.scale.set(1.15, 0.85, 1.0);
                bush.position.set(bx, by, bz);
                group.add(bush);
            });

            // Salt evaporation pan bed on front-facing shore of the island
            const panZ = radius * 0.62;
            const panBase = new THREE.Mesh(
                new THREE.BoxGeometry(20, 0.6, 12),
                createMat(0x4c1d95, 0.9)
            );
            panBase.position.set(-2, 0.65, panZ);
            group.add(panBase);

            const saltSurface = new THREE.Mesh(
                new THREE.BoxGeometry(18.6, 0.25, 10.6),
                createMat(0xf4f9ff, 0.35)
            );
            saltSurface.position.set(-2, 0.98, panZ);
            group.add(saltSurface);

            // Purple-stained boardwalk dividers inside the salt pan
            const dividerMat = createMat(0x6d28d9, 0.85);
            for (let dx = -5; dx <= 5; dx += 5) {
                const beam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 10.8), dividerMat);
                beam.position.set(-2 + dx, 1.05, panZ);
                group.add(beam);
            }
            const midBeam = new THREE.Mesh(new THREE.BoxGeometry(18.8, 0.35, 0.4), dividerMat);
            midBeam.position.set(-2, 1.05, panZ);
            group.add(midBeam);

            // White salt harvest mounds
            const saltMoundMat = createMat(0xffffff, 0.25);
            [[-7, 1.9, panZ - 2.2, 2.2, 1.9], [-2, 2.1, panZ + 2.0, 2.5, 2.2], [3.5, 1.8, panZ - 1.5, 2.0, 1.7]].forEach(([mx, my, mz, r, h]) => {
                const mound = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), saltMoundMat);
                mound.position.set(mx, my, mz);
                group.add(mound);
            });

            // Iconic Purple Island village houses (lavender walls + vivid purple roofs)
            const wallMat = createMat(0xf3e8ff, 0.78);
            const roofMat = createMat(0x6d28d9, 0.7);
            const shack = new THREE.Mesh(new THREE.BoxGeometry(6.2, 4.2, 5.2), wallMat);
            shack.position.set(11, 2.6, panZ - 3.5);
            group.add(shack);
            const roof = new THREE.Mesh(new THREE.ConeGeometry(5.2, 2.4, 4), roofMat);
            roof.rotation.y = Math.PI / 4;
            roof.position.set(11, 5.8, panZ - 3.5);
            group.add(roof);

            const sideHouse = new THREE.Mesh(new THREE.BoxGeometry(4.8, 3.3, 4.2), wallMat);
            sideHouse.position.set(-12, 2.2, panZ - 4.5);
            group.add(sideHouse);
            const sideRoof = new THREE.Mesh(new THREE.ConeGeometry(4.1, 2.0, 4), roofMat);
            sideRoof.rotation.y = Math.PI / 4;
            sideRoof.position.set(-12, 4.75, panZ - 4.5);
            group.add(sideRoof);

            // Signature Purple Bridge jetty dock jutting toward the main stage sea
            const pier = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.5, 10.5), createMat(0x8b5cf6, 0.88));
            pier.position.set(0, 0.85, panZ + 10.2);
            group.add(pier);
            const lanternMat = new THREE.MeshBasicMaterial({ color: 0xe9d5ff });
            [[-2.2, panZ + 14.5], [2.2, panZ + 14.5]].forEach(([px, pz]) => {
                const post = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.35, 3.2, 8), dividerMat);
                post.position.set(px, 1.4, pz);
                group.add(post);
                const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), lanternMat);
                lantern.position.set(px, 3.15, pz);
                group.add(lantern);
            });
        }

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
        createDistantIsland(-10, -158, 30, 12, true); // Salt Farm Island in the back sea

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
        if (sharkEntity && sharkEntity.activeAttackAnim && sharkEntity.activeAttackAnim.targetSlot === slot) {
            sharkEntity.activeAttackAnim = null;
            sharkEntity.splashed = false;
            sharkEntity.group.rotation.set(0, 0, 0);
            if (sharkEntity.lowerJaw) sharkEntity.lowerJaw.rotation.x = 0;
            sharkEntity.group.visible = sharkEntity.isRoaming;
        }
        if (gatorEntity && gatorEntity.activeAttackAnim && gatorEntity.activeAttackAnim.targetSlot === slot) {
            gatorEntity.activeAttackAnim = null;
            gatorEntity.group.rotation.set(0, 0, 0);
            if (gatorEntity.lowerJaw) gatorEntity.lowerJaw.rotation.x = 0;
            gatorEntity.group.visible = gatorEntity.isRoaming;
        }
        if (gullEntity && gullEntity.activeAttackAnim && gullEntity.activeAttackAnim.targetSlot === slot) {
            gullEntity.activeAttackAnim = null;
            gullEntity.group.visible = gullEntity.isRoaming;
        }
        for (let i = activeSaltAnims.length - 1; i >= 0; i--) {
            if (activeSaltAnims[i].slot === slot) {
                finishSaltAnimImmediate(activeSaltAnims[i]);
                activeSaltAnims.splice(i, 1);
            }
        }

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

    function getChairLayout(count) {
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
        return { chairSpacing, startX, slotZ: 6.6 };
    }

    function buildChairs(count) {
        while (chairSlots.length > 0) {
            const oldSlot = chairSlots.pop();
            disposeSlot(oldSlot);
        }

        if (!count || count <= 0) return;

        const { chairSpacing, startX, slotZ } = getChairLayout(count);
        for (let i = 0; i < count; i++) {
            const slotX = startX + i * chairSpacing;
            const slot = createChairSlot(i, slotX, slotZ);
            chairSlots.push(slot);
        }

        onResize({ forceRadius: true });
    }

    // ─────────────────────────────────────────────────────────────
    // 5. 3D Character Avatar (+Z Forward-Facing with Expressive Face)
    // ─────────────────────────────────────────────────────────────
    function buildCharacterMesh(player, slotIndex) {
        const group = new THREE.Group();
        const isAlien = player.gender === 'alien' || player.gender === 'A';
        const isFemale = !isAlien && (player.gender === 'female' || player.gender === 'F');
        const palette = isAlien ? ALIEN_COLORS : (isFemale ? FEMALE_COLORS : MALE_COLORS);
        const bodyColor = palette[slotIndex % palette.length];

        // Head Group (pivots around neck so head can turn sideways when stunned)
        const headGroup = new THREE.Group();
        headGroup.position.set(0, 1.3, 0);
        group.add(headGroup);

        // Head
        const originalSkinHex = isAlien ? 0x2ecc71 : 0xffdbac;
        const skinMat = createMat(originalSkinHex, isAlien ? 0.42 : 0.55, isAlien ? 0.06 : 0.02);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.58, 22, 20), skinMat);
        if (isAlien) head.scale.set(1.06, 1.08, 0.96);
        head.castShadow = true;
        headGroup.add(head);

        // Styled Hair OR Alien Antennas (hidden when bomb-blasted)
        const normalHairGroup = new THREE.Group();
        headGroup.add(normalHairGroup);
        let alienAntennaGroup = null;

        if (isAlien) {
            alienAntennaGroup = new THREE.Group();
            const antennaTipMat = new THREE.MeshStandardMaterial({
                color: 0xe74c3c,
                emissive: 0x661111,
                roughness: 0.25,
                metalness: 0.15
            });
            [-1, 1].forEach(side => {
                const curve = new THREE.QuadraticBezierCurve3(
                    new THREE.Vector3(side * 0.24, 0.48, 0.0),
                    new THREE.Vector3(side * 0.42, 0.86, 0.04),
                    new THREE.Vector3(side * 0.58, 0.90, 0.08)
                );
                const stalk = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.042, 8, false), skinMat);
                stalk.castShadow = true;
                alienAntennaGroup.add(stalk);

                const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), antennaTipMat);
                orb.position.set(side * 0.58, 0.90, 0.08);
                orb.castShadow = true;
                alienAntennaGroup.add(orb);
            });
            normalHairGroup.add(alienAntennaGroup);
        } else {
            const hairColor = isFemale ? 0x5c3d99 : 0x2d3436;
            const hairMat = createMat(hairColor, 0.78);
            const hairCap = new THREE.Mesh(
                new THREE.SphereGeometry(0.615, 18, 16, 0, Math.PI * 2, 0, Math.PI * 0.58),
                hairMat
            );
            hairCap.position.set(0, 0.04, -0.04);
            hairCap.rotation.x = -0.24;
            hairCap.castShadow = true;
            normalHairGroup.add(hairCap);

            // Front Bangs / Fringe (+Z forehead)
            const bangOffsets = [
                { x: -0.22, y: 0.37, z: 0.38, rx: 0.2, rz: 0.25, s: [0.22, 0.14, 0.18] },
                { x: 0.0, y: 0.41, z: 0.42, rx: 0.25, rz: 0.0, s: [0.25, 0.14, 0.18] },
                { x: 0.22, y: 0.37, z: 0.38, rx: 0.2, rz: -0.25, s: [0.22, 0.14, 0.18] }
            ];
            bangOffsets.forEach(b => {
                const bang = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), hairMat);
                bang.scale.set(b.s[0], b.s[1], b.s[2]);
                bang.position.set(b.x, b.y, b.z);
                bang.rotation.set(b.rx, 0, b.rz);
                normalHairGroup.add(bang);
            });

            if (isFemale) {
                [-0.51, 0.51].forEach(sx => {
                    const sideLock = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.65, 10), hairMat);
                    sideLock.position.set(sx, -0.15, 0.05);
                    normalHairGroup.add(sideLock);
                });
                const ponytail = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), hairMat);
                ponytail.scale.set(0.9, 1.4, 0.9);
                ponytail.position.set(0, -0.05, -0.64);
                normalHairGroup.add(ponytail);
            }
        }

        // Bomb-Blasted Spiky Hair ("삐죽삐죽 솟구친 머리")
        const bombCharredHairGroup = new THREE.Group();
        bombCharredHairGroup.visible = false;
        const charredHairMat = createMat(0x161616, 0.9, 0.02);
        const charredCap = new THREE.Mesh(
            new THREE.SphereGeometry(0.60, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
            charredHairMat
        );
        charredCap.position.set(0, 0.04, -0.02);
        bombCharredHairGroup.add(charredCap);
        const spikeGeo = new THREE.ConeGeometry(0.11, 0.52, 6);
        const spikeSpecs = [
            { x: 0, y: 0.72, z: 0.02, rx: 0, rz: 0, s: 1.15 },
            { x: -0.28, y: 0.66, z: 0.12, rx: 0.18, rz: 0.42, s: 1.0 },
            { x: 0.28, y: 0.66, z: 0.12, rx: 0.18, rz: -0.42, s: 1.0 },
            { x: -0.48, y: 0.45, z: 0.08, rx: 0.15, rz: 0.85, s: 0.95 },
            { x: 0.48, y: 0.45, z: 0.08, rx: 0.15, rz: -0.85, s: 0.95 },
            { x: -0.56, y: 0.20, z: 0.0, rx: 0.05, rz: 1.25, s: 0.85 },
            { x: 0.56, y: 0.20, z: 0.0, rx: 0.05, rz: -1.25, s: 0.85 },
            { x: -0.18, y: 0.62, z: 0.34, rx: 0.58, rz: 0.28, s: 0.9 },
            { x: 0.18, y: 0.62, z: 0.34, rx: 0.58, rz: -0.28, s: 0.9 },
            { x: 0, y: 0.66, z: 0.32, rx: 0.5, rz: 0, s: 1.05 },
            { x: -0.24, y: 0.62, z: -0.26, rx: -0.52, rz: 0.32, s: 0.95 },
            { x: 0.24, y: 0.62, z: -0.26, rx: -0.52, rz: -0.32, s: 0.95 },
            { x: 0, y: 0.65, z: -0.34, rx: -0.62, rz: 0, s: 1.0 },
            { x: -0.42, y: 0.35, z: -0.28, rx: -0.45, rz: 0.78, s: 0.85 },
            { x: 0.42, y: 0.35, z: -0.28, rx: -0.45, rz: -0.78, s: 0.85 },
            { x: 0, y: 0.45, z: -0.48, rx: -0.95, rz: 0, s: 0.9 }
        ];
        spikeSpecs.forEach(sp => {
            const spike = new THREE.Mesh(spikeGeo, charredHairMat);
            spike.position.set(sp.x, sp.y, sp.z);
            spike.rotation.set(sp.rx, 0, sp.rz);
            spike.scale.setScalar(sp.s);
            bombCharredHairGroup.add(spike);
        });
        headGroup.add(bombCharredHairGroup);

        // Floating Ticking Bomb Above Head (visible while target is defusing)
        const headBombGroup = new THREE.Group();
        headBombGroup.position.set(0, 1.08, 0);
        headBombGroup.visible = false;
        const bombBody = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 14), createMat(0x222222, 0.35, 0.55));
        headBombGroup.add(bombBody);
        const bombCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.12, 10), createMat(0x7f8c8d, 0.3, 0.7));
        bombCollar.position.set(0, 0.27, 0);
        headBombGroup.add(bombCollar);
        const headBombLed = new THREE.Mesh(
            new THREE.SphereGeometry(0.065, 10, 10),
            new THREE.MeshBasicMaterial({ color: 0xff2e43 })
        );
        headBombLed.position.set(0, 0.08, 0.27);
        headBombGroup.add(headBombLed);
        const wireRedLoop = new THREE.Mesh(
            new THREE.TorusGeometry(0.14, 0.025, 8, 14, Math.PI * 1.1),
            new THREE.MeshBasicMaterial({ color: 0xff4757 })
        );
        wireRedLoop.position.set(-0.14, 0.24, 0.08);
        wireRedLoop.rotation.set(0.3, 0.3, 0.7);
        headBombGroup.add(wireRedLoop);
        const wireBlueLoop = new THREE.Mesh(
            new THREE.TorusGeometry(0.14, 0.025, 8, 14, Math.PI * 1.1),
            new THREE.MeshBasicMaterial({ color: 0x3182f6 })
        );
        wireBlueLoop.position.set(0.14, 0.24, 0.08);
        wireBlueLoop.rotation.set(0.3, -0.3, -0.7);
        headBombGroup.add(wireBlueLoop);
        headGroup.add(headBombGroup);

        // Expressive Face on +Z (facing camera)
        const scleraMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
        const browMat = new THREE.MeshBasicMaterial({ color: 0x2d3436 });
        const blushMat = new THREE.MeshBasicMaterial({ color: isAlien ? 0x55efc4 : 0xff9aa2, transparent: true, opacity: isAlien ? 0.55 : 0.72 });
        const mouthMat = new THREE.MeshBasicMaterial({ color: isAlien ? 0x145a32 : 0xd63031 });
        const tongueMat = new THREE.MeshBasicMaterial({ color: 0xff7675 });

        const normalFaceGroup = new THREE.Group();
        const deadFaceGroup = new THREE.Group();
        const bombFaceGroup = new THREE.Group();
        const duelFaceGroup = new THREE.Group();
        deadFaceGroup.visible = false;
        bombFaceGroup.visible = false;
        duelFaceGroup.visible = false;
        headGroup.add(normalFaceGroup);
        headGroup.add(deadFaceGroup);
        headGroup.add(bombFaceGroup);
        headGroup.add(duelFaceGroup);
        const cheeks = [];

        [-1, 1].forEach(side => {
            const ex = side * (isAlien ? 0.22 : 0.205);

            if (isAlien) {
                // Iconic large glossy black almond alien eyes
                const alienEyeMat = new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.08, metalness: 0.2 });
                const alienEye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 12), alienEyeMat);
                alienEye.scale.set(0.95, 1.35, 0.45);
                alienEye.position.set(ex, 0.06, 0.515);
                alienEye.rotation.z = side * 0.24;
                normalFaceGroup.add(alienEye);

                const glintBig = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), scleraMat);
                glintBig.position.set(ex + 0.035, 0.13, 0.578);
                normalFaceGroup.add(glintBig);

                const glintSmall = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), scleraMat);
                glintSmall.position.set(ex - 0.025, 0.03, 0.575);
                normalFaceGroup.add(glintSmall);
            } else {
                // White Sclera
                const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.112, 12, 12), scleraMat);
                sclera.scale.set(1.0, 1.15, 0.55);
                sclera.position.set(ex, 0.03, 0.515);
                normalFaceGroup.add(sclera);

                // Black Pupil
                const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 10), pupilMat);
                pupil.scale.set(1.0, 1.1, 0.6);
                pupil.position.set(ex, 0.03, 0.558);
                normalFaceGroup.add(pupil);

                // Eye Catchlight
                const glint = new THREE.Mesh(new THREE.SphereGeometry(0.023, 8, 8), scleraMat);
                glint.position.set(ex + 0.026, 0.065, 0.588);
                normalFaceGroup.add(glint);

                // Eyebrow
                const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.038, 0.04), browMat);
                brow.position.set(ex, 0.195, 0.53);
                brow.rotation.z = side * -0.10;
                normalFaceGroup.add(brow);
            }

            // Cheek Blush (shared across expressions)
            const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.088, 10, 8), blushMat);
            cheek.scale.set(1.25, 0.72, 0.4);
            cheek.position.set(side * 0.34, -0.11, 0.455);
            headGroup.add(cheek);
            cheeks.push(cheek);

            // Dead / Knocked-out X_X Eye
            const xBar1 = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.036, 0.03), pupilMat);
            xBar1.position.set(ex, 0.03, 0.56);
            xBar1.rotation.z = Math.PI / 4;
            deadFaceGroup.add(xBar1);

            const xBar2 = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.036, 0.03), pupilMat);
            xBar2.position.set(ex, 0.03, 0.56);
            xBar2.rotation.z = -Math.PI / 4;
            deadFaceGroup.add(xBar2);

            // Stunned / Droopy Eyebrow
            const deadBrow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.034, 0.035), browMat);
            deadBrow.position.set(ex, 0.185, 0.535);
            deadBrow.rotation.z = side * 0.25;
            deadFaceGroup.add(deadBrow);

            // Bomb-Stunned Wide White Eyes + Pinpoint Pupils (pop on soot-black face)
            const bombSclera = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 12), scleraMat);
            bombSclera.scale.set(1.05, 1.15, 0.5);
            bombSclera.position.set(ex, 0.035, 0.525);
            bombFaceGroup.add(bombSclera);

            const bombPupil = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), pupilMat);
            bombPupil.scale.set(1.0, 1.0, 0.6);
            bombPupil.position.set(ex, 0.035, 0.585);
            bombFaceGroup.add(bombPupil);

            const bombBrow = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.032, 0.035), scleraMat);
            bombBrow.position.set(ex, 0.22, 0.535);
            bombBrow.rotation.z = side * 0.22;
            bombFaceGroup.add(bombBrow);
        });

        // Nose (human characters only; aliens have sleek smooth faces)
        if (!isAlien) {
            const nose = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skinMat);
            nose.position.set(0, -0.06, 0.585);
            headGroup.add(nose);
        }

        // Smiling Mouth (Torus arc rotated to bottom half)
        const smileArc = Math.PI * 0.75;
        const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.024, 8, 14, smileArc), mouthMat);
        mouth.position.set(0, -0.12, 0.54);
        mouth.rotation.z = Math.PI + (Math.PI - smileArc) / 2;
        normalFaceGroup.add(mouth);

        // Knocked-out Mouth + Tongue sticking out ("꿰꼬닥" expression)
        const deadMouth = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), pupilMat);
        deadMouth.scale.set(1.15, 0.9, 0.35);
        deadMouth.position.set(0, -0.135, 0.565);
        deadFaceGroup.add(deadMouth);

        const deadTongue = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), tongueMat);
        deadTongue.scale.set(0.9, 1.35, 0.45);
        deadTongue.position.set(0.042, -0.185, 0.582);
        deadTongue.rotation.z = -0.35;
        deadFaceGroup.add(deadTongue);

        // Bomb-Stunned Open O-Mouth (light outline so it reads clearly against dark soot)
        const bombMouth = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), scleraMat);
        bombMouth.scale.set(1.1, 0.85, 0.35);
        bombMouth.position.set(0, -0.155, 0.565);
        bombFaceGroup.add(bombMouth);
        const bombMouthInner = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 8), pupilMat);
        bombMouthInner.scale.set(1.05, 0.8, 0.4);
        bombMouthInner.position.set(0, -0.155, 0.578);
        bombFaceGroup.add(bombMouthInner);

        // Duel-Defeat Swollen Black-and-Blue Eye ("눈탱이 밤탱이") + Lump + Dizzy Stars
        const duelEx = isAlien ? 0.22 : 0.205;
        const bruiseOuter = new THREE.Mesh(
            new THREE.SphereGeometry(0.185, 14, 12),
            createMat(0x3b0764, 0.78)
        );
        bruiseOuter.scale.set(1.18, 1.12, 0.42);
        bruiseOuter.position.set(-duelEx, 0.035, 0.515);
        duelFaceGroup.add(bruiseOuter);

        const bruiseInner = new THREE.Mesh(
            new THREE.SphereGeometry(0.135, 12, 10),
            createMat(0x6d28d9, 0.65)
        );
        bruiseInner.scale.set(1.12, 1.0, 0.48);
        bruiseInner.position.set(-duelEx, 0.035, 0.542);
        duelFaceGroup.add(bruiseInner);

        const swollenShutEye = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.038, 0.035), pupilMat);
        swollenShutEye.position.set(-duelEx, 0.035, 0.605);
        swollenShutEye.rotation.z = -0.12;
        duelFaceGroup.add(swollenShutEye);

        // Other eye: dizzy X
        const dx1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.034, 0.03), pupilMat);
        dx1.position.set(duelEx, 0.03, 0.56);
        dx1.rotation.z = Math.PI / 4;
        duelFaceGroup.add(dx1);
        const dx2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.034, 0.03), pupilMat);
        dx2.position.set(duelEx, 0.03, 0.56);
        dx2.rotation.z = -Math.PI / 4;
        duelFaceGroup.add(dx2);

        // Swollen bruised cheek bump + crooked mouth
        const cheekLump = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), createMat(0xc0392b, 0.6));
        cheekLump.scale.set(1.2, 0.95, 0.65);
        cheekLump.position.set(-0.34, -0.09, 0.49);
        duelFaceGroup.add(cheekLump);

        const duelMouth = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.032, 0.03), pupilMat);
        duelMouth.position.set(0.02, -0.15, 0.57);
        duelMouth.rotation.z = -0.22;
        duelFaceGroup.add(duelMouth);

        // Orbiting yellow dizzy stars above head
        const duelStarsRing = new THREE.Group();
        duelStarsRing.position.set(0, isAlien ? 0.92 : 0.78, 0);
        const starMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
        for (let st = 0; st < 3; st++) {
            const ang = (st / 3) * Math.PI * 2;
            const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.085, 0), starMat);
            star.position.set(Math.cos(ang) * 0.46, 0, Math.sin(ang) * 0.46);
            duelStarsRing.add(star);
        }
        duelFaceGroup.add(duelStarsRing);

        // Torso
        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.48, 0.95, 16), createMat(bodyColor, 0.6));
        torso.position.y = 0.45;
        torso.castShadow = true;
        group.add(torso);

        if (isAlien) {
            // Sleek spacesuit collar & glowing chest emblem
            const suitCollar = new THREE.Mesh(
                new THREE.TorusGeometry(0.42, 0.055, 8, 18),
                createMat(0x00cec9, 0.25, 0.65)
            );
            suitCollar.rotation.x = Math.PI / 2;
            suitCollar.position.set(0, 0.92, 0);
            group.add(suitCollar);

            const chestBadge = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.11, 0),
                new THREE.MeshBasicMaterial({ color: 0x00f5d4 })
            );
            chestBadge.scale.set(1.0, 1.0, 0.45);
            chestBadge.position.set(0, 0.56, 0.45);
            group.add(chestBadge);
        }

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

        // 3D Nickname Sprite (with optional launch count badge)
        const labelSprite = createNameLabel(player.name || '플레이어', player.splashCount || 0);
        labelSprite.position.set(0, isAlien ? 2.52 : 2.25, 0);
        group.add(labelSprite);

        return {
            group: group,
            isAlien: isAlien,
            head: head,
            headGroup: headGroup,
            skinMat: skinMat,
            originalSkinHex: originalSkinHex,
            cheeks: cheeks,
            normalHairGroup: normalHairGroup,
            alienAntennaGroup: alienAntennaGroup,
            bombCharredHairGroup: bombCharredHairGroup,
            normalFaceGroup: normalFaceGroup,
            normalMouth: mouth,
            deadFaceGroup: deadFaceGroup,
            bombFaceGroup: bombFaceGroup,
            duelFaceGroup: duelFaceGroup,
            duelStarsRing: duelStarsRing,
            headBombGroup: headBombGroup,
            headBombLed: headBombLed,
            torso: torso,
            leftArm: leftArm,
            rightArm: rightArm,
            leftLeg: leftLeg,
            rightLeg: rightLeg,
            labelSprite: labelSprite
        };
    }

    function drawNameLabelCanvas(canvas, text, splashCount = 0) {
        const count = Math.max(0, Number(splashCount) || 0);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const pillW = 240;
        const pillH = 48;
        const pillX = count > 0 ? 12 : (canvas.width - pillW) / 2;
        const pillY = (canvas.height - pillH) / 2;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(pillX, pillY, pillW, pillH, 16);
        else ctx.rect(pillX, pillY, pillW, pillH);
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        const displayName = text.length > 7 ? text.substring(0, 7) + '..' : text;
        ctx.font = 'bold 26px Pretendard, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayName, pillX + pillW / 2, pillY + pillH / 2);

        if (count > 0) {
            const countStr = String(count);
            const badgeY = canvas.height / 2;
            const badgeR = 22;
            const badgeX = pillX + pillW + 24;
            const extraW = countStr.length >= 3 ? (countStr.length - 2) * 12 : 0;

            ctx.fillStyle = '#ff4757';
            ctx.beginPath();
            if (extraW > 0 && ctx.roundRect) {
                ctx.roundRect(badgeX - badgeR, badgeY - badgeR, badgeR * 2 + extraW, badgeR * 2, badgeR);
            } else {
                ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
            }
            ctx.fill();
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            ctx.font = countStr.length >= 3 ? 'bold 20px Pretendard, sans-serif' : 'bold 24px Pretendard, sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(countStr, badgeX + extraW / 2, badgeY + 1);
        }
    }

    function createNameLabel(text, splashCount = 0) {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 76;
        drawNameLabelCanvas(canvas, text, splashCount);

        const texture = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(3.1, 0.74, 1);
        sprite.renderOrder = 800;
        sprite.userData = {
            canvas: canvas,
            texture: texture,
            text: text,
            splashCount: Math.max(0, Number(splashCount) || 0)
        };
        return sprite;
    }

    function updateNameLabel(sprite, text, splashCount = 0) {
        if (!sprite || !sprite.userData || !sprite.userData.canvas) return;
        const normalizedCount = Math.max(0, Number(splashCount) || 0);
        if (sprite.userData.text === text && sprite.userData.splashCount === normalizedCount) return;
        drawNameLabelCanvas(sprite.userData.canvas, text, normalizedCount);
        sprite.userData.text = text;
        sprite.userData.splashCount = normalizedCount;
        sprite.userData.texture.needsUpdate = true;
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
            if (cameraFocusState.active) return;
            cameraFocusState.restoring = false;
            isDragging = true;
            prevMouseX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
            prevMouseY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
        }

        function onPointerMove(e) {
            if (!isDragging || cameraFocusState.active) return;
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
            if (cameraFocusState.active) {
                if (e.cancelable) e.preventDefault();
                return;
            }
            cameraFocusState.restoring = false;
            userHasZoomed = true;
            const step = e.ctrlKey ? 0.05 : 0.02;
            targetSpherical.radius += e.deltaY * step;
            targetSpherical.radius = Math.max(9, Math.min(56, targetSpherical.radius));
            if (e.cancelable) e.preventDefault();
        }

        function onTouchStart(e) {
            if (cameraFocusState.active) return;
            if (e.touches.length >= 2) {
                isDragging = false;
                if (e.cancelable) e.preventDefault();
                if (!e.__agyPinchHandled) {
                    cameraFocusState.restoring = false;
                    touchStartDist = getTouchDistance(e);
                    initialRadius = targetSpherical.radius;
                }
            } else if (e.touches.length === 1) {
                onPointerDown(e);
            }
        }

        function onTouchMove(e) {
            if (cameraFocusState.active) {
                isDragging = false;
                if (e.cancelable) e.preventDefault();
                return;
            }
            if (e.touches.length >= 2) {
                isDragging = false;
                if (e.cancelable) e.preventDefault();
                if (!e.__agyPinchHandled && touchStartDist > 0) {
                    const curDist = getTouchDistance(e);
                    if (curDist > 0) {
                        cameraFocusState.restoring = false;
                        userHasZoomed = true;
                        const factor = touchStartDist / curDist;
                        targetSpherical.radius = Math.max(9, Math.min(56, initialRadius * factor));
                    }
                }
            } else if (e.touches.length === 1 && !touchStartDist && isDragging) {
                if (e.cancelable) e.preventDefault();
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

        let gestureBaseRadius = 28;
        function onGestureStart(e) {
            isDragging = false;
            if (e.cancelable) e.preventDefault();
            gestureBaseRadius = targetSpherical.radius;
        }
        function onGestureChange(e) {
            isDragging = false;
            if (e.cancelable) e.preventDefault();
            if (!cameraFocusState.active && !e.__agyGestureHandled && e.scale && e.scale > 0) {
                cameraFocusState.restoring = false;
                userHasZoomed = true;
                targetSpherical.radius = Math.max(9, Math.min(56, gestureBaseRadius / e.scale));
            }
        }

        canvas.addEventListener('mousedown', onPointerDown);
        window.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);

        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onTouchEnd);
        window.addEventListener('touchcancel', onTouchEnd);
        canvas.addEventListener('gesturestart', onGestureStart, { passive: false });
        canvas.addEventListener('gesturechange', onGestureChange, { passive: false });
        canvas.addEventListener('gestureend', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
        canvas.addEventListener('wheel', onWheel, { passive: false });
    }

    let resizeRafPending = false;
    let lastBufferW = 0;
    let lastBufferH = 0;

    function scheduleResize() {
        if (resizeRafPending) return;
        resizeRafPending = true;
        requestAnimationFrame(() => {
            resizeRafPending = false;
            onResize({ immediate: true });
        });
    }

    function startCameraFocus(lookAtVec, radius = 7.4, theta = 0.08, phi = 1.26) {
        if (!cameraFocusState.active && !cameraFocusState.restoring) {
            cameraFocusState.savedSpherical = {
                radius: targetSpherical.radius,
                theta: targetSpherical.theta,
                phi: targetSpherical.phi
            };
            cameraFocusState.savedLookAt = {
                x: targetLookAt.x,
                y: targetLookAt.y,
                z: targetLookAt.z
            };
        }
        isDragging = false;
        cameraFocusState.active = true;
        cameraFocusState.restoring = false;
        cameraFocusState.focusLookAt = {
            x: lookAtVec.x,
            y: lookAtVec.y,
            z: lookAtVec.z
        };
        cameraFocusState.focusSpherical = { radius, theta, phi };
    }

    function releaseCameraFocus() {
        if (!cameraFocusState.active) return;
        cameraFocusState.active = false;
        if (cameraFocusState.savedSpherical && cameraFocusState.savedLookAt) {
            targetSpherical.radius = cameraFocusState.savedSpherical.radius;
            targetSpherical.theta = cameraFocusState.savedSpherical.theta;
            targetSpherical.phi = cameraFocusState.savedSpherical.phi;
            targetLookAt.x = cameraFocusState.savedLookAt.x;
            targetLookAt.y = cameraFocusState.savedLookAt.y;
            targetLookAt.z = cameraFocusState.savedLookAt.z;
            cameraFocusState.restoring = true;
        }
    }

    function updateCameraPosition(delta) {
        const dt = Math.min(0.1, Math.max(0.001, Number(delta) || 0.016));
        const goalSpherical = cameraFocusState.active ? cameraFocusState.focusSpherical : targetSpherical;
        const goalLookAt = cameraFocusState.active ? cameraFocusState.focusLookAt : targetLookAt;
        const sphLerp = cameraFocusState.active
            ? (1 - Math.exp(-4.8 * dt))
            : (cameraFocusState.restoring ? (1 - Math.exp(-4.2 * dt)) : 0.10);
        const lookLerp = cameraFocusState.active
            ? (1 - Math.exp(-5.2 * dt))
            : (cameraFocusState.restoring ? (1 - Math.exp(-4.2 * dt)) : 0.08);

        spherical.theta += (goalSpherical.theta - spherical.theta) * sphLerp;
        spherical.phi += (goalSpherical.phi - spherical.phi) * sphLerp;
        spherical.radius += (goalSpherical.radius - spherical.radius) * sphLerp;

        currentLookAt.x += (goalLookAt.x - currentLookAt.x) * lookLerp;
        currentLookAt.y += (goalLookAt.y - currentLookAt.y) * lookLerp;
        currentLookAt.z += (goalLookAt.z - currentLookAt.z) * lookLerp;

        if (!cameraFocusState.active && cameraFocusState.restoring) {
            const done =
                Math.abs(goalSpherical.theta - spherical.theta) < 0.01 &&
                Math.abs(goalSpherical.phi - spherical.phi) < 0.01 &&
                Math.abs(goalSpherical.radius - spherical.radius) < 0.03 &&
                Math.abs(goalLookAt.x - currentLookAt.x) < 0.03 &&
                Math.abs(goalLookAt.y - currentLookAt.y) < 0.03 &&
                Math.abs(goalLookAt.z - currentLookAt.z) < 0.03;
            if (done) {
                cameraFocusState.restoring = false;
                cameraFocusState.savedSpherical = null;
                cameraFocusState.savedLookAt = null;
            }
        }

        const x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
        const y = spherical.radius * Math.cos(spherical.phi);
        const z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);

        camera.position.set(x + currentLookAt.x, y + currentLookAt.y, z + currentLookAt.z);
        camera.lookAt(currentLookAt.x, currentLookAt.y, currentLookAt.z);
    }

    function onResize(opts) {
        if (!renderer || !containerEl || !camera) return;
        const w = containerEl.clientWidth || (containerEl.parentElement ? containerEl.parentElement.clientWidth : 0);
        const h = containerEl.clientHeight || (containerEl.parentElement ? containerEl.parentElement.clientHeight : 0);
        if (w <= 0 || h <= 0) return;

        const aspect = w / h;
        const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
        const keyboardOpen = typeof document !== 'undefined' && document.body && document.body.classList.contains('keyboard-open');
        const widthChanged = baselineW === 0 || Math.abs(w - baselineW) >= 4;
        const isMobileHeightResize = isMobile && !widthChanged && (keyboardOpen || (baselineH > 0 && h < baselineH - 20));

        if (widthChanged) {
            baselineW = w;
            baselineH = h;
        } else if (!keyboardOpen && h > baselineH) {
            baselineH = h;
        }

        if (isMobileHeightResize && baselineH > 0) {
            // Preserve exact 3D visual scale while mobile keyboard shrinks stage height
            const baseTanHalfFov = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2));
            const scaledFov = THREE.MathUtils.radToDeg(2 * Math.atan(baseTanHalfFov * (h / baselineH)));
            camera.fov = Math.max(14, Math.min(65, scaledFov));
        } else {
            camera.fov = BASE_FOV;
            const forceRadius = !!(opts && typeof opts === 'object' && opts.forceRadius === true);
            if (!cameraFocusState.active && !userHasZoomed && (widthChanged || forceRadius)) {
                const count = chairSlots.length || 6;
                let calcBase = 24;
                if (count <= 2) calcBase = 21;
                else if (count <= 4) calcBase = 24;
                else if (count === 5) calcBase = 26;
                else calcBase = 28;

                const refAspect = (baselineW > 0 && baselineH > 0) ? (baselineW / baselineH) : aspect;
                if (refAspect < 0.85) {
                    targetSpherical.radius = calcBase + 16;
                } else if (refAspect < 1.2) {
                    targetSpherical.radius = calcBase + 7;
                } else {
                    targetSpherical.radius = calcBase;
                }
            }
        }

        camera.aspect = aspect;
        camera.updateProjectionMatrix();

        const MAX_BUFFER_DIM = 2560;
        const rawDpr = Math.min(window.devicePixelRatio || 1, 2);
        const safeDpr = Math.max(0.5, Math.min(rawDpr, MAX_BUFFER_DIM / Math.max(w, h, 1)));
        const nextBufW = Math.max(1, Math.round(w * safeDpr));
        const nextBufH = Math.max(1, Math.round(h * safeDpr));
        if (nextBufW !== lastBufferW || nextBufH !== lastBufferH) {
            lastBufferW = nextBufW;
            lastBufferH = nextBufH;
            renderer.setPixelRatio(safeDpr);
            renderer.setSize(w, h, false);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 8. Player Sync & Dynamic Seating Adaptation
    // ─────────────────────────────────────────────────────────────
    function syncPlayers(players) {
        if (!isInitialized) return;
        const list = players || [];
        const countChanged = chairSlots.length !== list.length;

        if (list.length === 0) {
            buildChairs(0);
            return;
        }

        const { chairSpacing, startX, slotZ } = getChairLayout(list.length);
        const reused = new Set();
        const nextSlots = [];

        list.forEach((player, index) => {
            const slotX = startX + index * chairSpacing;
            let slot = chairSlots.find(s => !reused.has(s) && s.player && s.player.id === player.id);
            if (!slot && Array.isArray(player.previousIds)) {
                slot = chairSlots.find(s => !reused.has(s) && s.player && player.previousIds.includes(s.player.id));
            }

            if (slot) {
                reused.add(slot);
                slot.index = index;
                slot.x = slotX;
                slot.z = slotZ;
                if (slot.chairGroup) {
                    slot.chairGroup.position.set(slotX, 1.2, slotZ);
                }
                const prevPlayer = slot.player;
                if (!slot.avatarMeshes || !prevPlayer || prevPlayer.name !== player.name || prevPlayer.gender !== player.gender) {
                    if (slot.charGroup.children.length > 0) {
                        for (let k = slot.charGroup.children.length - 1; k >= 0; k--) {
                            const child = slot.charGroup.children[k];
                            if (child !== slot.bubbleSprite) slot.charGroup.remove(child);
                        }
                    }
                    slot.avatarMeshes = buildCharacterMesh(player, index);
                    slot.charGroup.add(slot.avatarMeshes.group);
                }
            } else {
                slot = createChairSlot(index, slotX, slotZ);
                slot.avatarMeshes = buildCharacterMesh(player, index);
                slot.charGroup.add(slot.avatarMeshes.group);
            }

            slot.player = player;
            nextSlots.push(slot);
        });

        // Dispose only slots for players who genuinely left
        chairSlots.forEach(oldSlot => {
            if (!reused.has(oldSlot)) {
                disposeSlot(oldSlot);
            }
        });

        chairSlots.length = 0;
        chairSlots.push(...nextSlots);
        if (countChanged) {
            onResize({ forceRadius: true });
        }

        chairSlots.forEach(slot => {
            const player = slot.player;
            if (!player) return;
            slot.charGroup.visible = true;
            if (slot.avatarMeshes && slot.avatarMeshes.labelSprite) {
                updateNameLabel(slot.avatarMeshes.labelSprite, player.name || '플레이어', player.splashCount || 0);
            }
            if (slot.avatarMeshes && slot.avatarMeshes.headBombGroup) {
                slot.avatarMeshes.headBombGroup.visible = !!player.activeBomb;
            }

            if (player.status === 'idle') {
                if (slot.currentAnim !== 'salt-abduct' && slot.currentAnim !== 'salt-return' && slot.currentAnim !== 'octopus-dive' && slot.currentAnim !== 'octopus-show') {
                    resetSlotToSeat(slot);
                }
            } else if (!slot.currentAnim) {
                applyStatusToSlot(slot, player.status);
            }
        });
    }

    function applyStatusToSlot(slot, status) {
        const { hinge, charGroup } = slot;
        if (!charGroup) return;

        const m = slot.avatarMeshes;
        const setNormalSkinAndHair = () => {
            if (!m) return;
            if (m.headGroup) m.headGroup.visible = true;
            if (m.alienAntennaGroup) m.alienAntennaGroup.visible = true;
            if (m.skinMat) m.skinMat.color.setHex(m.originalSkinHex || 0xffdbac);
            if (m.cheeks) m.cheeks.forEach(c => { c.visible = true; });
            if (m.normalHairGroup) m.normalHairGroup.visible = true;
            if (m.bombCharredHairGroup) m.bombCharredHairGroup.visible = false;
            if (m.bombFaceGroup) m.bombFaceGroup.visible = false;
            if (m.duelFaceGroup) m.duelFaceGroup.visible = false;
        };

        if (status === 'flying') {
            setNormalSkinAndHair();
            charGroup.visible = true;
            hinge.rotation.x = -1.3;
            charGroup.rotation.set(0, 0, 0);
        } else if (status === 'swimming' || status === 'walking') {
            setNormalSkinAndHair();
            charGroup.visible = true;
            hinge.rotation.x = -1.3;
            if (status === 'swimming' && charGroup.position.z >= -2) {
                charGroup.position.set(slot.x, 0.05, -11.0);
                charGroup.rotation.set(0, 0, 0);
            }
        } else if (status === 'dead' || status === 'dead-gator' || status === 'dead-octopus') {
            setNormalSkinAndHair();
            charGroup.visible = true;
            hinge.rotation.x = status === 'dead-octopus' ? 0 : -1.3;
            const waterX = charGroup.position.z < -2 ? charGroup.position.x : slot.x;
            const waterZ = status === 'dead-octopus' ? -15.5 : (charGroup.position.z < -2 ? charGroup.position.z : -11.0);
            charGroup.position.set(waterX, -0.45, waterZ);
            charGroup.rotation.set(0, 0, Math.PI / 2);
            const isOctoBomb = (status === 'dead-octopus' && slot.player && slot.player.octopusBombDead);
            if (isOctoBomb && m) {
                if (m.skinMat) m.skinMat.color.setHex(0x1e1e1e);
                if (m.cheeks) m.cheeks.forEach(c => { c.visible = false; });
                if (m.normalHairGroup) m.normalHairGroup.visible = false;
                if (m.bombCharredHairGroup) m.bombCharredHairGroup.visible = true;
                m.headGroup.rotation.set(0, 0, 0);
                m.normalFaceGroup.visible = false;
                m.deadFaceGroup.visible = false;
                if (m.bombFaceGroup) m.bombFaceGroup.visible = true;
            } else if (m) {
                m.headGroup.rotation.set(0, 0, 0);
                m.normalFaceGroup.visible = false;
                m.deadFaceGroup.visible = true;
            }
        } else if (status === 'snatched') {
            setNormalSkinAndHair();
            hinge.rotation.x = -1.3;
            charGroup.visible = false;
        } else if (status === 'salt-farm' || status === 'dueling' || status === 'octopus-hunt') {
            setNormalSkinAndHair();
            hinge.rotation.x = 0;
            charGroup.visible = false;
        } else if (status === 'dead-duel') {
            setNormalSkinAndHair();
            charGroup.visible = true;
            hinge.rotation.x = 0;
            charGroup.position.set(slot.x, 2.4, slot.z + 0.1);
            charGroup.rotation.set(0, 0, 0);
            if (m) {
                m.headGroup.rotation.set(0.08, 0, -0.16);
                m.normalFaceGroup.visible = false;
                m.deadFaceGroup.visible = false;
                if (m.duelFaceGroup) m.duelFaceGroup.visible = true;
            }
        } else if (status === 'dead-missile') {
            setNormalSkinAndHair();
            charGroup.visible = true;
            hinge.rotation.x = -0.65;
            charGroup.position.set(slot.x, 2.55, slot.z + 0.1);
            charGroup.rotation.set(-0.85, 0, 0);
            if (m) {
                m.headGroup.rotation.set(0.15, 0.82, -0.22);
                m.normalFaceGroup.visible = false;
                m.deadFaceGroup.visible = true;
            }
        } else if (status === 'dead-bomb') {
            charGroup.visible = true;
            hinge.rotation.x = 0;
            charGroup.position.set(slot.x, 2.4, slot.z + 0.1);
            charGroup.rotation.set(0, 0, 0);
            if (m) {
                if (m.skinMat) m.skinMat.color.setHex(0x1e1e1e);
                if (m.cheeks) m.cheeks.forEach(c => { c.visible = false; });
                if (m.normalHairGroup) m.normalHairGroup.visible = false;
                if (m.bombCharredHairGroup) m.bombCharredHairGroup.visible = true;
                m.headGroup.rotation.set(0, 0, 0);
                m.normalFaceGroup.visible = false;
                m.deadFaceGroup.visible = false;
                if (m.duelFaceGroup) m.duelFaceGroup.visible = false;
                if (m.bombFaceGroup) m.bombFaceGroup.visible = true;
            }
        } else {
            resetSlotToSeat(slot);
        }
    }

    function resetSlotToSeat(slot) {
        slot.isTilted = false;
        slot.hinge.rotation.x = 0;
        slot.charGroup.visible = true;
        slot.charGroup.position.set(slot.x, 2.4, slot.z + 0.1);
        slot.charGroup.rotation.set(0, 0, 0);
        if (slot.avatarMeshes) {
            const m = slot.avatarMeshes;
            if (m.skinMat) m.skinMat.color.setHex(m.originalSkinHex || 0xffdbac);
            if (m.cheeks) m.cheeks.forEach(c => { c.visible = true; });
            if (m.normalHairGroup) m.normalHairGroup.visible = true;
            if (m.bombCharredHairGroup) m.bombCharredHairGroup.visible = false;
            m.headGroup.rotation.set(0, 0, 0);
            m.normalFaceGroup.visible = true;
            m.deadFaceGroup.visible = false;
            if (m.bombFaceGroup) m.bombFaceGroup.visible = false;
            if (m.duelFaceGroup) m.duelFaceGroup.visible = false;
            m.leftLeg.rotation.set(-Math.PI / 2, 0, 0);
            m.rightLeg.rotation.set(-Math.PI / 2, 0, 0);
            m.leftArm.rotation.set(-Math.PI / 3.5, 0, 0);
            m.rightArm.rotation.set(-Math.PI / 3.5, 0, 0);
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
        if (slot.avatarMeshes && slot.avatarMeshes.labelSprite && slot.player) {
            updateNameLabel(slot.avatarMeshes.labelSprite, slot.player.name || '플레이어', slot.player.splashCount || 0);
        }

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
        slot.currentAnim = { type: 'shark_attack' };
        slot.charGroup.position.set(pos.x, 0.05, pos.z);
        sharkEntity.group.visible = true;
        sharkEntity.group.position.set(pos.x + 6, 0.05, pos.z - 3);
        const attackStart = clock.getElapsedTime();

        sharkEntity.activeAttackAnim = {
            targetSlot: slot,
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
                    slot.charGroup.position.set(pos.x, 0.05 + Math.sin(time * 8) * 0.08, pos.z);

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
                    if (slot.currentAnim && slot.currentAnim.type === 'shark_attack') {
                        slot.currentAnim = null;
                    }
                    slot.charGroup.position.set(pos.x, -0.45, pos.z);
                    slot.charGroup.rotation.set(0, 0, Math.PI / 2);
                    if (slot.avatarMeshes) {
                        slot.avatarMeshes.headGroup.rotation.set(0, 0, 0);
                        slot.avatarMeshes.normalFaceGroup.visible = false;
                        slot.avatarMeshes.deadFaceGroup.visible = true;
                    }
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
        slot.currentAnim = { type: 'gator_attack' };
        slot.charGroup.position.set(pos.x, 0.05, pos.z);
        gatorEntity.group.visible = true;
        const startX = pos.x - 5.5;
        const startZ = 2.2;
        gatorEntity.group.position.set(startX, 0.15, startZ);
        const attackStart = clock.getElapsedTime();

        gatorEntity.activeAttackAnim = {
            targetSlot: slot,
            startTime: attackStart,
            update: (time) => {
                const el = time - attackStart;
                if (el < 0.8) {
                    const t = el / 0.8;
                    const curX = startX * (1 - t) + pos.x * t;
                    const curZ = startZ * (1 - t) + pos.z * t;
                    const curY = Math.max(-0.1, getBeachHeight(curX, curZ) + 0.2);
                    gatorEntity.group.position.set(curX, curY, curZ);
                    slot.charGroup.position.set(pos.x, 0.05 + Math.sin(time * 8) * 0.08, pos.z);

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
                    if (slot.currentAnim && slot.currentAnim.type === 'gator_attack') {
                        slot.currentAnim = null;
                    }
                    slot.charGroup.position.set(pos.x, -0.45, pos.z);
                    slot.charGroup.rotation.set(0, 0, Math.PI / 2);
                    if (slot.avatarMeshes) {
                        slot.avatarMeshes.headGroup.rotation.set(0, 0, 0);
                        slot.avatarMeshes.normalFaceGroup.visible = false;
                        slot.avatarMeshes.deadFaceGroup.visible = true;
                    }
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
        slot.charGroup.visible = true;
        slot.currentAnim = { type: 'gull_snatch' };
        gullEntity.group.visible = true;
        const startY = 16;
        gullEntity.group.position.set(slot.x + 10, startY, slot.z - 7);
        const snatchStart = clock.getElapsedTime();

        gullEntity.activeAttackAnim = {
            targetSlot: slot,
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
                    slot.charGroup.visible = false;
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

    function triggerBombExplosion(playerId) {
        if (!isInitialized) return;
        const slot = chairSlots.find(s => s.player && s.player.id === playerId);
        if (!slot) return;
        if (slot.avatarMeshes && slot.avatarMeshes.labelSprite && slot.player) {
            updateNameLabel(slot.avatarMeshes.labelSprite, slot.player.name || '플레이어', slot.player.splashCount || 0);
        }
        const pos = slot.charGroup.position.clone().add(new THREE.Vector3(0, 2.35, 0));
        createExplosion3D(pos.x, pos.y, pos.z);
        if (!sharedSmokeGeo) sharedSmokeGeo = new THREE.SphereGeometry(0.22, 6, 6);
        for (let i = 0; i < 18; i++) {
            const soot = new THREE.Mesh(
                sharedSmokeGeo,
                new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0x1b1b1b : 0x3d3d3d, transparent: true, opacity: 0.9 })
            );
            soot.position.set(pos.x + (Math.random() - 0.5) * 0.5, pos.y, pos.z + (Math.random() - 0.5) * 0.5);
            soot.velocity = new THREE.Vector3((Math.random() - 0.5) * 3.5, 1.8 + Math.random() * 3.2, (Math.random() - 0.5) * 3.5);
            soot.gravity = 1.5;
            soot.life = 1.0 + Math.random() * 0.5;
            soot.maxLife = soot.life;
            soot.growRate = 2.4;
            scene.add(soot);
            activeParticles.push(soot);
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

        updateCameraPosition(delta);

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
            if (slot.player && slot.avatarMeshes) {
                if (slot.avatarMeshes.alienAntennaGroup && slot.avatarMeshes.normalHairGroup && slot.avatarMeshes.normalHairGroup.visible) {
                    slot.avatarMeshes.alienAntennaGroup.rotation.z = Math.sin(time * 3.5 + slot.index) * 0.06;
                }
                if (slot.player.activeBomb && slot.avatarMeshes.headBombGroup && slot.avatarMeshes.headBombGroup.visible) {
                    slot.avatarMeshes.headBombGroup.position.y = 1.08 + Math.sin(time * 8) * 0.08;
                    if (slot.avatarMeshes.headBombLed) {
                        slot.avatarMeshes.headBombLed.material.color.setHex(Math.sin(time * 16) > 0 ? 0xff2e43 : 0x550000);
                    }
                }
                if (slot.player.status === 'dead-duel' && slot.avatarMeshes.duelStarsRing) {
                    slot.avatarMeshes.duelStarsRing.rotation.y = time * 3.6;
                    slot.avatarMeshes.headGroup.rotation.z = -0.14 + Math.sin(time * 3.2) * 0.06;
                }
                if (slot.player.status === 'dead-bomb' && Math.random() < delta * 6) {
                    if (!sharedSmokeGeo) sharedSmokeGeo = new THREE.SphereGeometry(0.22, 6, 6);
                    const puff = new THREE.Mesh(
                        sharedSmokeGeo,
                        new THREE.MeshBasicMaterial({ color: 0x353b48, transparent: true, opacity: 0.55 })
                    );
                    const headPos = slot.charGroup.position;
                    puff.position.set(headPos.x + (Math.random() - 0.5) * 0.5, headPos.y + 2.0, headPos.z + (Math.random() - 0.5) * 0.3);
                    puff.velocity = new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.1 + Math.random() * 0.6, (Math.random() - 0.5) * 0.4);
                    puff.gravity = 0;
                    puff.life = 0.85;
                    puff.maxLife = 0.85;
                    puff.growRate = 1.3;
                    scene.add(puff);
                    activeParticles.push(puff);
                }
            }
        });

        updateActiveMissiles(time, delta);
        updateActiveSaltAnims(time, delta);
        updateActiveOctopusAnims(time, delta);

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
    // 14B. 3D Salt Farm Abduction & Return Boat Animations
    // ─────────────────────────────────────────────────────────────
    function buildMaskedAbductor3D(carryType) {
        const g = new THREE.Group();
        const suitMat = createMat(0x16181f, 0.85);
        const maskMat = createMat(0x0c0d12, 0.9);
        const skinMat = createMat(0xf1c27d, 0.6);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

        // Legs
        const legGeo = new THREE.BoxGeometry(0.28, 0.85, 0.28);
        const leftLeg = new THREE.Mesh(legGeo, suitMat);
        leftLeg.position.set(-0.18, 0.42, 0);
        g.add(leftLeg);
        const rightLeg = new THREE.Mesh(legGeo, suitMat);
        rightLeg.position.set(0.18, 0.42, 0);
        g.add(rightLeg);

        // Torso
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.92, 0.42), suitMat);
        torso.position.set(0, 1.32, 0);
        torso.castShadow = true;
        g.add(torso);

        // Head with black balaclava mask & eye slit
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 12), maskMat);
        head.position.set(0, 2.08, 0);
        g.add(head);
        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.14), skinMat);
        slit.position.set(0, 2.1, -0.24);
        g.add(slit);
        [-0.1, 0.1].forEach(ex => {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat);
            eye.position.set(ex, 2.1, -0.31);
            g.add(eye);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 6), pupilMat);
            pupil.position.set(ex, 2.1, -0.34);
            g.add(pupil);
        });

        // Arms extended forward to carry bag / rope
        const armGeo = new THREE.BoxGeometry(0.22, 0.72, 0.22);
        const leftArm = new THREE.Mesh(armGeo, suitMat);
        leftArm.position.set(-0.46, 1.48, -0.22);
        leftArm.rotation.x = Math.PI / 2.6;
        g.add(leftArm);
        const rightArm = new THREE.Mesh(armGeo, suitMat);
        rightArm.position.set(0.46, 1.48, -0.22);
        rightArm.rotation.x = Math.PI / 2.6;
        g.add(rightArm);

        let prop = null;
        if (carryType === 'bag') {
            prop = new THREE.Group();
            const bagMat = createMat(0x0d0e13, 0.28);
            const bagBody = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), bagMat);
            bagBody.scale.set(1.0, 1.2, 0.95);
            prop.add(bagBody);
            const handleA = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 6, 10), bagMat);
            handleA.position.set(-0.1, 0.42, 0);
            prop.add(handleA);
            const handleB = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.03, 6, 10), bagMat);
            handleB.position.set(0.1, 0.42, 0);
            prop.add(handleB);
            prop.position.set(0, 1.45, -0.58);
            g.add(prop);
        } else if (carryType === 'rope') {
            prop = new THREE.Group();
            const ropeMat = createMat(0xd4a373, 0.85);
            for (let r = 0; r < 4; r++) {
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.045, 7, 14), ropeMat);
                ring.rotation.x = Math.PI / 2 + (r * 0.12);
                ring.position.set(0, (r - 1.5) * 0.07, 0);
                prop.add(ring);
            }
            prop.position.set(0, 1.45, -0.55);
            g.add(prop);
        }

        return { group: g, leftLeg, rightLeg, leftArm, rightArm, prop };
    }

    function buildSaltBoat3D() {
        const g = new THREE.Group();
        const hullMat = createMat(0x7c4a26, 0.82);
        const trimMat = createMat(0x4b2c16, 0.88);
        const plankMat = createMat(0xa46b3e, 0.78);

        const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 5.2), hullMat);
        hull.position.set(0, 0.35, 0);
        g.add(hull);

        const bow = new THREE.Mesh(new THREE.ConeGeometry(1.45, 1.9, 4), trimMat);
        bow.rotation.x = -Math.PI / 2;
        bow.rotation.z = Math.PI / 4;
        bow.scale.set(1.2, 0.62, 1);
        bow.position.set(0, 0.42, -3.45);
        g.add(bow);

        [-0.9, 0.3, 1.5].forEach(z => {
            const bench = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.16, 0.55), plankMat);
            bench.position.set(0, 0.84, z);
            g.add(bench);
        });

        // Outrigger oar poles
        const oarMat = createMat(0xc9965c, 0.8);
        [-1.45, 1.45].forEach(ox => {
            const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.0, 6), oarMat);
            oar.rotation.z = ox < 0 ? 0.65 : -0.65;
            oar.rotation.x = 0.25;
            oar.position.set(ox, 0.85, 0.2);
            g.add(oar);
        });

        return g;
    }

    function buildVictimBindRigs3D() {
        const bagGroup = new THREE.Group();
        bagGroup.name = 'saltVictimBag';
        const bagMat = createMat(0x0a0b10, 0.28);
        // Full-head & full-face black plastic bag enclosing headGroup (y=0.67..1.95, z=-0.58..0.64) completely
        const hood = new THREE.Mesh(new THREE.SphereGeometry(0.74, 18, 16), bagMat);
        hood.scale.set(1.06, 1.24, 1.12);
        hood.position.set(0, 1.38, 0.05);
        hood.renderOrder = 15;
        bagGroup.add(hood);

        const neckSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.66, 0.34, 16), bagMat);
        neckSkirt.position.set(0, 0.68, 0.03);
        neckSkirt.renderOrder = 15;
        bagGroup.add(neckSkirt);

        const neckTie = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.048, 8, 18), createMat(0x1f2430, 0.45));
        neckTie.rotation.x = Math.PI / 2;
        neckTie.position.set(0, 0.77, 0.03);
        neckTie.renderOrder = 16;
        bagGroup.add(neckTie);

        const knotA = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.38, 7), bagMat);
        knotA.position.set(-0.08, 2.34, 0.02);
        knotA.rotation.z = 0.22;
        knotA.renderOrder = 15;
        bagGroup.add(knotA);

        const knotB = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.32, 6), bagMat);
        knotB.position.set(0.11, 2.31, 0.02);
        knotB.rotation.z = -0.28;
        knotB.renderOrder = 15;
        bagGroup.add(knotB);

        bagGroup.visible = false;

        const ropeGroup = new THREE.Group();
        const ropeMat = createMat(0xd4a373, 0.85);
        [0.86, 1.12, 1.36].forEach(ry => {
            const coil = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.055, 8, 16), ropeMat);
            coil.rotation.x = Math.PI / 2;
            coil.position.set(0, ry, 0);
            ropeGroup.add(coil);
        });
        ropeGroup.visible = false;

        return { bagGroup, ropeGroup };
    }

    function finishSaltAnimImmediate(anim) {
        if (!anim || anim.finished) return;
        anim.finished = true;
        if (anim.container) {
            scene.remove(anim.container);
            disposeObjectGroup(anim.container);
        }
        if (anim.victimBag && anim.victimParent) {
            anim.victimParent.remove(anim.victimBag);
            disposeObjectGroup(anim.victimBag);
        }
        if (anim.victimRope && anim.victimParent) {
            anim.victimParent.remove(anim.victimRope);
            disposeObjectGroup(anim.victimRope);
        }
        if (anim.slot) {
            if (anim.slot.avatarMeshes) {
                if (anim.slot.avatarMeshes.headGroup) anim.slot.avatarMeshes.headGroup.visible = true;
                if (anim.slot.avatarMeshes.alienAntennaGroup) anim.slot.avatarMeshes.alienAntennaGroup.visible = true;
            }
            if (anim.mode === 'abduct') {
                anim.slot.charGroup.visible = false;
                anim.slot.hinge.rotation.x = 0;
                anim.slot.currentAnim = null;
            } else {
                resetSlotToSeat(anim.slot);
            }
        }
        if (typeof anim.callback === 'function') {
            try { anim.callback(); } catch (e) {}
        }
    }

    function triggerSaltAbduction(playerId, onArrived) {
        if (!isInitialized || !isVisible) {
            if (typeof onArrived === 'function') setTimeout(onArrived, 4200);
            return;
        }
        const slot = chairSlots.find(s => s.player && s.player.id === playerId);
        if (!slot) {
            if (typeof onArrived === 'function') setTimeout(onArrived, 4200);
            return;
        }
        // Cancel any previous salt anim on this slot
        for (let i = activeSaltAnims.length - 1; i >= 0; i--) {
            if (activeSaltAnims[i].slot === slot) {
                finishSaltAnimImmediate(activeSaltAnims[i]);
                activeSaltAnims.splice(i, 1);
            }
        }

        slot.currentAnim = 'salt-abduct';
        slot.charGroup.visible = true;
        slot.charGroup.position.set(slot.x, 2.4, slot.z + 0.1);
        slot.charGroup.rotation.set(0, 0, 0);
        slot.hinge.rotation.x = 0;

        const container = new THREE.Group();
        const abdA = buildMaskedAbductor3D('bag');
        const abdB = buildMaskedAbductor3D('rope');
        const boat = buildSaltBoat3D();

        const shoreX = Math.max(-12, Math.min(12, slot.x));
        const shoreZ = -10.5;
        const spawnX = slot.x >= 0 ? 32 : -32;
        const spawnZ = 12.5;
        boat.position.set(shoreX, 0.22, shoreZ);

        abdA.group.position.set(spawnX - 0.9, 0.35, spawnZ);
        abdB.group.position.set(spawnX + 0.9, 0.35, spawnZ + 0.6);

        container.add(boat);
        container.add(abdA.group);
        container.add(abdB.group);
        scene.add(container);

        const victimParent = slot.avatarMeshes ? slot.avatarMeshes.group : slot.charGroup;
        const { bagGroup, ropeGroup } = buildVictimBindRigs3D();
        victimParent.add(bagGroup);
        victimParent.add(ropeGroup);

        activeSaltAnims.push({
            mode: 'abduct',
            slot,
            container,
            abdA,
            abdB,
            boat,
            victimBag: bagGroup,
            victimRope: ropeGroup,
            victimParent,
            elapsed: 0,
            total: 5.4,
            spawnX,
            spawnZ,
            shoreX,
            shoreZ,
            islandX: -10,
            islandZ: -128,
            wakeAccum: 0,
            finished: false,
            callback: onArrived
        });
    }

    function triggerSaltReturn(playerId, onReturned) {
        if (!isInitialized || !isVisible) {
            if (typeof onReturned === 'function') setTimeout(onReturned, 2200);
            return;
        }
        const slot = chairSlots.find(s => s.player && s.player.id === playerId);
        if (!slot) {
            if (typeof onReturned === 'function') setTimeout(onReturned, 2200);
            return;
        }
        for (let i = activeSaltAnims.length - 1; i >= 0; i--) {
            if (activeSaltAnims[i].slot === slot) {
                finishSaltAnimImmediate(activeSaltAnims[i]);
                activeSaltAnims.splice(i, 1);
            }
        }

        slot.currentAnim = 'salt-return';
        slot.charGroup.visible = true;
        slot.hinge.rotation.x = 0;

        const container = new THREE.Group();
        const boat = buildSaltBoat3D();
        // White salt harvest sack on the return boat
        const sack = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), createMat(0xf5f9ff, 0.4));
        sack.scale.set(1.0, 1.15, 0.95);
        sack.position.set(0.6, 1.15, 0.3);
        boat.add(sack);

        const shoreX = Math.max(-12, Math.min(12, slot.x));
        const shoreZ = -10.5;
        boat.position.set(-10, 0.22, -128);
        boat.rotation.y = Math.PI;
        container.add(boat);
        scene.add(container);

        activeSaltAnims.push({
            mode: 'return',
            slot,
            container,
            boat,
            elapsed: 0,
            total: 2.6,
            shoreX,
            shoreZ,
            islandX: -10,
            islandZ: -128,
            wakeAccum: 0,
            finished: false,
            callback: onReturned
        });
    }

    function clamp01(v) {
        return Math.max(0, Math.min(1, v));
    }

    function updateActiveSaltAnims(time, delta) {
        for (let i = activeSaltAnims.length - 1; i >= 0; i--) {
            const anim = activeSaltAnims[i];
            if (anim.finished) {
                activeSaltAnims.splice(i, 1);
                continue;
            }
            anim.elapsed += delta;
            const t = anim.elapsed;
            const { slot, boat } = anim;

            if (anim.mode === 'abduct') {
                const { abdA, abdB, victimBag, victimRope } = anim;
                if (t < 1.4) {
                    // Phase 1: Two masked abductors sprint from afar carrying black bag & rope
                    const p = clamp01(t / 1.4);
                    const ease = 1 - Math.pow(1 - p, 2);
                    const ax = THREE.MathUtils.lerp(anim.spawnX - 0.9, slot.x - 0.95, ease);
                    const az = THREE.MathUtils.lerp(anim.spawnZ, slot.z + 0.35, ease);
                    const bx = THREE.MathUtils.lerp(anim.spawnX + 0.9, slot.x + 0.95, ease);
                    const bz = THREE.MathUtils.lerp(anim.spawnZ + 0.6, slot.z + 0.35, ease);
                    abdA.group.position.set(ax, 0.35, az);
                    abdB.group.position.set(bx, 0.35, bz);
                    abdA.group.lookAt(slot.x - 0.95, 0.35, slot.z + 0.35);
                    abdA.group.rotateY(Math.PI);
                    abdB.group.lookAt(slot.x + 0.95, 0.35, slot.z + 0.35);
                    abdB.group.rotateY(Math.PI);
                    const stride = Math.sin(t * 20) * 0.6;
                    abdA.leftLeg.rotation.x = stride; abdA.rightLeg.rotation.x = -stride;
                    abdB.leftLeg.rotation.x = -stride; abdB.rightLeg.rotation.x = stride;
                    boat.position.y = 0.22 + Math.sin(time * 2.5) * 0.08;
                } else if (t < 2.5) {
                    // Phase 2: Bag over head + rope wrapped around victim
                    const p = clamp01((t - 1.4) / 1.1);
                    abdA.group.position.set(slot.x - 0.95, 0.35, slot.z + 0.25);
                    abdB.group.position.set(slot.x + 0.95, 0.35, slot.z + 0.25);
                    abdA.group.lookAt(slot.x, 0.35, slot.z + 0.1); abdA.group.rotateY(Math.PI);
                    abdB.group.lookAt(slot.x, 0.35, slot.z + 0.1); abdB.group.rotateY(Math.PI);
                    abdA.leftLeg.rotation.x = 0; abdA.rightLeg.rotation.x = 0;
                    abdB.leftLeg.rotation.x = 0; abdB.rightLeg.rotation.x = 0;
                    if (abdA.prop) abdA.prop.visible = false;
                    victimBag.visible = true;
                    victimBag.position.y = THREE.MathUtils.lerp(0.85, 0, Math.min(1, p * 2.5));
                    if (p >= 0.2 && slot.avatarMeshes && slot.avatarMeshes.alienAntennaGroup) {
                        slot.avatarMeshes.alienAntennaGroup.visible = false;
                    }
                    if (p >= 0.45 && slot.avatarMeshes && slot.avatarMeshes.headGroup) {
                        slot.avatarMeshes.headGroup.visible = false;
                    }
                    if (p >= 0.3) {
                        if (abdB.prop) abdB.prop.visible = false;
                        victimRope.visible = true;
                        const s = THREE.MathUtils.lerp(1.45, 1.0, Math.min(1, (p - 0.3) * 1.8));
                        victimRope.scale.set(s, 1, s);
                    }
                    if (slot.avatarMeshes) {
                        slot.avatarMeshes.leftArm.rotation.set(0.1, 0, 0.2);
                        slot.avatarMeshes.rightArm.rotation.set(0.1, 0, -0.2);
                    }
                    slot.charGroup.rotation.z = Math.sin(t * 28) * 0.1;
                } else if (t < 3.5) {
                    // Phase 3: Haul bagged & tied victim into the boat at shoreline
                    const p = clamp01((t - 2.5) / 1.0);
                    const vx = THREE.MathUtils.lerp(slot.x, anim.shoreX, p);
                    const vy = THREE.MathUtils.lerp(2.4, 1.25, p) + Math.sin(p * Math.PI) * 0.8;
                    const vz = THREE.MathUtils.lerp(slot.z + 0.1, anim.shoreZ, p);
                    slot.charGroup.position.set(vx, vy, vz);
                    slot.charGroup.rotation.set(0, Math.PI, 0);
                    abdA.group.position.set(vx - 0.9, vy - 0.85, vz + 0.6);
                    abdB.group.position.set(vx + 0.9, vy - 0.85, vz + 0.6);
                    abdA.group.rotation.set(0, 0, 0);
                    abdB.group.rotation.set(0, 0, 0);
                } else if (t < anim.total) {
                    // Phase 4: Boat carries captive to the distant Salt Farm Island (-10, -128)
                    const p = clamp01((t - 3.5) / (anim.total - 3.5));
                    const ease = p * p * (3 - 2 * p);
                    const bx = THREE.MathUtils.lerp(anim.shoreX, anim.islandX, ease);
                    const bz = THREE.MathUtils.lerp(anim.shoreZ, anim.islandZ, ease);
                    const bob = Math.sin(t * 7.5) * 0.14;
                    boat.position.set(bx, 0.22 + bob, bz);
                    boat.lookAt(anim.islandX, 0.22, anim.islandZ);
                    boat.rotateY(Math.PI);
                    slot.charGroup.position.set(bx, 1.25 + bob, bz - 0.3);
                    slot.charGroup.rotation.set(-0.08, 0, 0);
                    abdA.group.position.set(bx - 0.65, 0.55 + bob, bz + 1.0);
                    abdB.group.position.set(bx + 0.65, 0.55 + bob, bz + 1.0);

                    anim.wakeAccum += delta;
                    if (anim.wakeAccum >= 0.08) {
                        anim.wakeAccum = 0;
                        if (!sharedSmokeGeo) sharedSmokeGeo = new THREE.SphereGeometry(0.22, 6, 6);
                        const wake = new THREE.Mesh(
                            sharedSmokeGeo,
                            new THREE.MeshBasicMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.75 })
                        );
                        wake.position.set(bx + (Math.random() - 0.5) * 1.1, 0.25, bz + 2.5);
                        wake.velocity = new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.25, 1.2);
                        wake.gravity = 0.2;
                        wake.life = 0.65;
                        wake.maxLife = 0.65;
                        wake.growRate = 2.0;
                        scene.add(wake);
                        activeParticles.push(wake);
                    }
                } else {
                    finishSaltAnimImmediate(anim);
                    activeSaltAnims.splice(i, 1);
                }
            } else if (anim.mode === 'return') {
                if (t < 1.9) {
                    const p = clamp01(t / 1.9);
                    const ease = 1 - Math.pow(1 - p, 2);
                    const bx = THREE.MathUtils.lerp(anim.islandX, anim.shoreX, ease);
                    const bz = THREE.MathUtils.lerp(anim.islandZ, anim.shoreZ, ease);
                    const bob = Math.sin(t * 7.5) * 0.14;
                    boat.position.set(bx, 0.22 + bob, bz);
                    boat.lookAt(anim.shoreX, 0.22, anim.shoreZ);
                    boat.rotateY(Math.PI);
                    slot.charGroup.position.set(bx, 1.25 + bob, bz);
                    slot.charGroup.rotation.set(0, Math.PI, 0);
                } else if (t < anim.total) {
                    const p = clamp01((t - 1.9) / (anim.total - 1.9));
                    const vx = THREE.MathUtils.lerp(anim.shoreX, slot.x, p);
                    const vy = THREE.MathUtils.lerp(1.25, 2.4, p) + Math.sin(p * Math.PI) * 1.15;
                    const vz = THREE.MathUtils.lerp(anim.shoreZ, slot.z + 0.1, p);
                    slot.charGroup.position.set(vx, vy, vz);
                    slot.charGroup.rotation.set(0, THREE.MathUtils.lerp(Math.PI, 0, p), 0);
                } else {
                    finishSaltAnimImmediate(anim);
                    activeSaltAnims.splice(i, 1);
                }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 14-B. Octopus Haerujil ("낙지잡아와") & Center Chojang Show 3D
    // ─────────────────────────────────────────────────────────────
    const activeOctopusAnims = [];

    function buildDiveGearRig3D() {
        const maskGroup = new THREE.Group();
        const frameMat = createMat(0x111827, 0.35, 0.25);
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            roughness: 0.12,
            metalness: 0.1,
            transparent: true,
            opacity: 0.68
        });
        const snorkelMat = createMat(0xfacc15, 0.3, 0.1);

        const visorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.26, 0.14), frameMat);
        visorFrame.position.set(0, 0.05, 0.56);
        maskGroup.add(visorFrame);

        const visorGlass = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.18, 0.16), glassMat);
        visorGlass.position.set(0, 0.05, 0.565);
        maskGroup.add(visorGlass);

        const strap = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.032, 6, 18), frameMat);
        strap.rotation.x = Math.PI / 2;
        strap.position.set(0, 0.05, 0.02);
        maskGroup.add(strap);

        // Bright yellow snorkel tube curving up past the right cheek
        const mouthPiece = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8), snorkelMat);
        mouthPiece.rotation.z = Math.PI / 2;
        mouthPiece.position.set(0.18, -0.14, 0.54);
        maskGroup.add(mouthPiece);

        const snorkelStem = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.72, 10), snorkelMat);
        snorkelStem.position.set(0.36, 0.22, 0.44);
        maskGroup.add(snorkelStem);

        const snorkelTip = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), createMat(0xf97316, 0.3, 0.1));
        snorkelTip.position.set(0.36, 0.59, 0.44);
        maskGroup.add(snorkelTip);

        // Woven mesh catch bag (망태기) worn on hip/back
        const bagGroup = new THREE.Group();
        const meshBag = new THREE.Mesh(
            new THREE.CylinderGeometry(0.19, 0.26, 0.52, 10, 1, false),
            new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.75, wireframe: false })
        );
        bagGroup.add(meshBag);
        const netRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.2, 0.03, 6, 14),
            createMat(0x22d3ee, 0.4, 0.1)
        );
        netRing.rotation.x = Math.PI / 2;
        netRing.position.y = 0.25;
        bagGroup.add(netRing);
        bagGroup.position.set(-0.46, 0.05, -0.05);
        bagGroup.rotation.z = 0.28;

        return { maskGroup, bagGroup };
    }

    function buildDanglingOctopus3D() {
        const g = new THREE.Group();
        const bodyMat = createMat(0xd94848, 0.40, 0.08);
        const suckerMat = createMat(0xfda4af, 0.45, 0.05);
        const chojangGlazeMat = new THREE.MeshStandardMaterial({
            color: 0xe11d48,
            emissive: 0x450a0a,
            emissiveIntensity: 0.25,
            roughness: 0.14,
            metalness: 0.08
        });

        // Single gripped tentacle held in fist at origin (0, 0, 0) hanging downward
        const gripLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.036, 0.36, 8), bodyMat);
        gripLeg.position.set(0, -0.17, 0);
        g.add(gripLeg);
        [-0.08, -0.18, -0.27].forEach(sy => {
            const s = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), suckerMat);
            s.position.set(0.032, sy, 0.028);
            g.add(s);
        });

        // Dangling body + remaining 7 tentacles hanging straight down under gravity
        const danglePivot = new THREE.Group();
        danglePivot.position.set(0, -0.34, 0);
        g.add(danglePivot);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.235, 14, 12), bodyMat);
        head.scale.set(0.86, 1.38, 0.86);
        head.position.set(0, -0.18, 0);
        danglePivot.add(head);

        const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const eyeBlack = new THREE.MeshBasicMaterial({ color: 0x111111 });
        [-1, 1].forEach(side => {
            const ew = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 8), eyeWhite);
            ew.position.set(side * 0.105, -0.14, 0.185);
            danglePivot.add(ew);
            const eb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), eyeBlack);
            eb.position.set(side * 0.105, -0.14, 0.228);
            danglePivot.add(eb);
        });

        const limpTentacles = [];
        for (let t = 0; t < 7; t++) {
            const ang = (t / 7) * Math.PI * 2 + 0.35;
            const limb = new THREE.Group();
            limb.position.set(Math.cos(ang) * 0.125, -0.35, Math.sin(ang) * 0.125);
            limb.rotation.set(Math.sin(ang) * 0.16, 0, -Math.cos(ang) * 0.16);

            const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.018, 0.56, 7), bodyMat);
            seg.position.y = -0.28;
            limb.add(seg);

            const tip = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 6), suckerMat);
            tip.position.set(0, -0.54, 0.02);
            limb.add(tip);

            danglePivot.add(limb);
            limpTentacles.push({ group: limb, baseRx: limb.rotation.x, baseRz: limb.rotation.z, phase: t * 0.9 });
        }

        // Glossy red chojang sauce coat revealed during chojang squirt phase
        const chojangCoatGroup = new THREE.Group();
        chojangCoatGroup.visible = false;
        const topGlaze = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), chojangGlazeMat);
        topGlaze.scale.set(0.88, 0.55, 0.88);
        topGlaze.position.set(0, -0.02, 0.02);
        chojangCoatGroup.add(topGlaze);
        for (let d = 0; d < 6; d++) {
            const ang = (d / 6) * Math.PI * 2;
            const drip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.014, 0.38, 6), chojangGlazeMat);
            drip.position.set(Math.cos(ang) * 0.145, -0.26 - (d % 2) * 0.08, Math.sin(ang) * 0.145);
            chojangCoatGroup.add(drip);
        }
        danglePivot.add(chojangCoatGroup);

        g.userData = { danglePivot, limpTentacles, chojangCoatGroup };
        return g;
    }

    function buildEatMouthRig3D() {
        const g = new THREE.Group();
        const cavity = new THREE.Mesh(
            new THREE.SphereGeometry(0.118, 10, 8),
            new THREE.MeshBasicMaterial({ color: 0x2b090c })
        );
        cavity.scale.set(1.18, 0.95, 0.38);
        g.add(cavity);

        const toothMat = createMat(0xffffff, 0.2, 0.05);
        const upperTeeth = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.042, 0.05), toothMat);
        upperTeeth.position.set(0, 0.055, 0.026);
        g.add(upperTeeth);

        const lowerJaw = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.042, 0.05), toothMat);
        lowerJaw.position.set(0, -0.055, 0.026);
        g.add(lowerJaw);

        const biteChunk = new THREE.Group();
        const chunkMeat = new THREE.Mesh(
            new THREE.CylinderGeometry(0.048, 0.042, 0.15, 8),
            createMat(0xd94848, 0.35, 0.05)
        );
        chunkMeat.rotation.z = Math.PI / 2;
        biteChunk.add(chunkMeat);
        const chunkSauce = new THREE.Mesh(
            new THREE.SphereGeometry(0.052, 8, 8),
            createMat(0xe11d48, 0.15, 0.08)
        );
        chunkSauce.scale.set(1.25, 0.85, 0.9);
        biteChunk.add(chunkSauce);
        biteChunk.position.set(0.02, -0.008, 0.052);
        biteChunk.visible = false;
        g.add(biteChunk);

        g.userData = { cavity, upperTeeth, lowerJaw, biteChunk };
        return g;
    }

    function createOctopusShoutSprite(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const cx = 256, cy = 100;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetY = 6;
        ctx.beginPath();
        const spikes = 16;
        for (let i = 0; i < spikes * 2; i++) {
            const ang = (i / (spikes * 2)) * Math.PI * 2;
            const rx = (i % 2 === 0) ? 236 : 196;
            const ry = (i % 2 === 0) ? 84 : 62;
            const px = cx + Math.cos(ang) * rx;
            const py = cy + Math.sin(ang) * ry;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        const grad = ctx.createLinearGradient(40, 20, 470, 180);
        grad.addColorStop(0, '#fef08a');
        grad.addColorStop(0.55, '#facc15');
        grad.addColorStop(1, '#fb923c');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.lineWidth = 7;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.restore();

        ctx.font = '900 66px Pretendard, "Apple SD Gothic Neo", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 10;
        ctx.strokeStyle = '#7c2d12';
        ctx.strokeText(text || '아싸!! 🐙', cx, cy + 3);
        ctx.fillStyle = '#fffbeb';
        ctx.fillText(text || '아싸!! 🐙', cx, cy + 3);

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(4.1, 1.6, 1);
        sprite.position.set(0, 2.7, 0);
        sprite.renderOrder = 22;
        return sprite;
    }

    function spawnChojangDrop(wx, wy, wz, vx, vy, vz) {
        if (!scene) return;
        const drop = new THREE.Mesh(
            new THREE.SphereGeometry(0.055, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xe11d48, transparent: true, opacity: 0.95 })
        );
        drop.position.set(wx, wy, wz);
        drop.velocity = new THREE.Vector3(vx, vy, vz);
        drop.gravity = 9.5;
        drop.life = 0.42;
        drop.maxLife = 0.42;
        drop.growRate = -0.35;
        scene.add(drop);
        activeParticles.push(drop);
    }

    function buildCaughtOctopus3D() {
        const g = new THREE.Group();
        const bodyMat = createMat(0xd94848, 0.42, 0.08);
        const suckerMat = createMat(0xfda4af, 0.5, 0.05);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 12), bodyMat);
        head.scale.set(0.9, 1.32, 0.9);
        head.position.y = 0.26;
        g.add(head);

        const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const eyeBlack = new THREE.MeshBasicMaterial({ color: 0x111111 });
        [-1, 1].forEach(side => {
            const ew = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeWhite);
            ew.position.set(side * 0.11, 0.2, 0.19);
            g.add(ew);
            const eb = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), eyeBlack);
            eb.position.set(side * 0.11, 0.2, 0.235);
            g.add(eb);
        });

        for (let t = 0; t < 8; t++) {
            const ang = (t / 8) * Math.PI * 2;
            const leg = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.44, 7), bodyMat);
            leg.position.set(Math.cos(ang) * 0.14, -0.08, Math.sin(ang) * 0.14);
            leg.rotation.set(Math.sin(ang) * 0.55 + Math.PI, 0, -Math.cos(ang) * 0.55);
            g.add(leg);
            const tip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), suckerMat);
            tip.position.set(Math.cos(ang) * 0.22, -0.24, Math.sin(ang) * 0.22);
            g.add(tip);
        }
        return g;
    }

    function buildChojangBottle3D() {
        const g = new THREE.Group();
        const bottleMat = createMat(0xdc2626, 0.28, 0.12);
        const capMat = createMat(0xf8fafc, 0.25, 0.1);
        const labelMat = createMat(0xfef08a, 0.45, 0.05);

        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.125, 0.44, 12), bottleMat);
        body.position.y = 0.22;
        g.add(body);

        const label = new THREE.Mesh(new THREE.CylinderGeometry(0.116, 0.118, 0.18, 12), labelMat);
        label.position.y = 0.21;
        g.add(label);

        const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.17, 10), capMat);
        nozzle.position.y = 0.52;
        g.add(nozzle);

        const squirt = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), createMat(0xe11d48, 0.15, 0.05));
        squirt.position.y = 0.64;
        squirt.visible = false;
        g.add(squirt);

        const squirtStream = new THREE.Mesh(
            new THREE.CylinderGeometry(0.018, 0.042, 0.58, 8),
            createMat(0xe11d48, 0.15, 0.08)
        );
        squirtStream.position.set(0, 0.91, 0);
        squirtStream.visible = false;
        g.add(squirtStream);

        g.userData.squirt = squirt;
        g.userData.squirtStream = squirtStream;

        return g;
    }

    let latestOctopusShowDebug = {
        active: false,
        phaseName: 'idle',
        ceremonySpriteVisible: false,
        chojangCoatVisible: false,
        squirtStreamVisible: false,
        eatMouthVisible: false,
        biteChunkVisible: false,
        octoScaleY: 1,
        headRotX: 0,
        headRotZ: 0,
        rightArmRotX: 0,
        rightArmRotZ: 0
    };

    function finishOctopusAnimImmediate(anim) {
        if (!anim || anim.finished) return;
        anim.finished = true;
        const { slot } = anim;
        if (anim.gearRig) {
            if (anim.gearRig.maskGroup && anim.gearRig.maskGroup.parent) {
                anim.gearRig.maskGroup.parent.remove(anim.gearRig.maskGroup);
                disposeObjectGroup(anim.gearRig.maskGroup);
            }
            if (anim.gearRig.bagGroup && anim.gearRig.bagGroup.parent) {
                anim.gearRig.bagGroup.parent.remove(anim.gearRig.bagGroup);
                disposeObjectGroup(anim.gearRig.bagGroup);
            }
        }
        if (anim.octoMesh && anim.octoMesh.parent) {
            anim.octoMesh.parent.remove(anim.octoMesh);
            disposeObjectGroup(anim.octoMesh);
        }
        if (anim.chojangMesh && anim.chojangMesh.parent) {
            anim.chojangMesh.parent.remove(anim.chojangMesh);
            disposeObjectGroup(anim.chojangMesh);
        }
        if (anim.ceremonySprite && anim.ceremonySprite.parent) {
            anim.ceremonySprite.parent.remove(anim.ceremonySprite);
            disposeObjectGroup(anim.ceremonySprite);
        }
        if (anim.eatMouthGroup && anim.eatMouthGroup.parent) {
            anim.eatMouthGroup.parent.remove(anim.eatMouthGroup);
            disposeObjectGroup(anim.eatMouthGroup);
        }
        if (slot) {
            if (slot.avatarMeshes) {
                if (slot.avatarMeshes.normalMouth) slot.avatarMeshes.normalMouth.visible = true;
                if (slot.avatarMeshes.cheeks) {
                    slot.avatarMeshes.cheeks.forEach(c => c.scale.set(1.25, 0.72, 0.4));
                }
                if (slot.avatarMeshes.headGroup) slot.avatarMeshes.headGroup.rotation.set(0, 0, 0);
                if (slot.avatarMeshes.leftArm) slot.avatarMeshes.leftArm.rotation.set(0, 0, 0);
                if (slot.avatarMeshes.rightArm) slot.avatarMeshes.rightArm.rotation.set(0, 0, 0);
                if (slot.avatarMeshes.leftLeg) slot.avatarMeshes.leftLeg.rotation.set(0, 0, 0);
                if (slot.avatarMeshes.rightLeg) slot.avatarMeshes.rightLeg.rotation.set(0, 0, 0);
            }
            if (anim.mode === 'dive') {
                slot.currentAnim = null;
                if (slot.charGroup) slot.charGroup.visible = false;
                if (anim.onSubmerged) anim.onSubmerged();
            } else {
                releaseCameraFocus();
                latestOctopusShowDebug.active = false;
                latestOctopusShowDebug.phaseName = 'finished';
                slot.currentAnim = null;
                resetSlotToSeat(slot);
                if (anim.onFinished) anim.onFinished();
            }
        }
    }

    function triggerOctopusDive(playerId, onSubmerged) {
        const slot = chairSlots.find(s => s.player && s.player.id === playerId);
        if (!isInitialized || !slot) {
            if (onSubmerged) setTimeout(onSubmerged, 200);
            return;
        }
        for (let i = activeOctopusAnims.length - 1; i >= 0; i--) {
            if (activeOctopusAnims[i].slot === slot) {
                activeOctopusAnims[i].onSubmerged = null;
                activeOctopusAnims[i].onFinished = null;
                finishOctopusAnimImmediate(activeOctopusAnims[i]);
                activeOctopusAnims.splice(i, 1);
            }
        }

        const scale = Math.max(0.05, Number(window.__TEST_OCTOPUS_DIVE_SCALE) || 1);
        const gearRig = buildDiveGearRig3D();
        if (slot.avatarMeshes && slot.avatarMeshes.headGroup) {
            gearRig.maskGroup.visible = false;
            slot.avatarMeshes.headGroup.add(gearRig.maskGroup);
        }
        if (slot.avatarMeshes && slot.avatarMeshes.group) {
            gearRig.bagGroup.visible = false;
            slot.avatarMeshes.group.add(gearRig.bagGroup);
        }

        slot.currentAnim = 'octopus-dive';
        slot.hinge.rotation.x = 0;
        slot.charGroup.visible = true;
        slot.charGroup.position.set(slot.x, 2.4, slot.z + 0.1);
        slot.charGroup.rotation.set(0, 0, 0);

        activeOctopusAnims.push({
            mode: 'dive',
            slot,
            startPerf: performance.now(),
            elapsed: 0,
            total: 4.1 * scale,
            scale,
            shoreX: slot.x,
            shoreZ: 2.55,
            deepX: THREE.MathUtils.clamp(slot.x * 0.45, -4.5, 4.5),
            deepZ: -17.5,
            gearRig,
            splashEntryDone: false,
            splashDiveDone: false,
            finished: false,
            onSubmerged
        });
    }

    function triggerOctopusSuccessShow(playerId, onFinished) {
        const slot = chairSlots.find(s => s.player && s.player.id === playerId);
        if (!isInitialized || !slot) {
            if (onFinished) setTimeout(onFinished, 200);
            return;
        }
        for (let i = activeOctopusAnims.length - 1; i >= 0; i--) {
            if (activeOctopusAnims[i].slot === slot) {
                activeOctopusAnims[i].onSubmerged = null;
                activeOctopusAnims[i].onFinished = null;
                finishOctopusAnimImmediate(activeOctopusAnims[i]);
                activeOctopusAnims.splice(i, 1);
            }
        }

        const scale = Math.max(0.05, Number(window.__TEST_OCTOPUS_SHOW_SCALE) || 1);
        const octoMesh = buildDanglingOctopus3D();
        const chojangMesh = buildChojangBottle3D();
        const eatMouthGroup = buildEatMouthRig3D();
        const ceremonySprite = createOctopusShoutSprite('아싸!! 🐙');

        if (slot.avatarMeshes && slot.avatarMeshes.rightArm) {
            octoMesh.position.set(0, -0.76, 0.06);
            octoMesh.scale.setScalar(1.05);
            slot.avatarMeshes.rightArm.add(octoMesh);
        }
        if (slot.avatarMeshes && slot.avatarMeshes.leftArm) {
            chojangMesh.position.set(0, -0.72, 0.15);
            chojangMesh.visible = false;
            slot.avatarMeshes.leftArm.add(chojangMesh);
        }
        if (slot.avatarMeshes && slot.avatarMeshes.headGroup) {
            eatMouthGroup.position.set(0, -0.135, 0.568);
            eatMouthGroup.visible = false;
            slot.avatarMeshes.headGroup.add(eatMouthGroup);
        }
        ceremonySprite.visible = false;
        slot.charGroup.add(ceremonySprite);

        slot.currentAnim = 'octopus-show';
        slot.hinge.rotation.x = 0;
        slot.charGroup.visible = true;
        const deepX = THREE.MathUtils.clamp(slot.x * 0.45, -4.5, 4.5);
        const deepZ = -14.8;
        slot.charGroup.position.set(deepX, -1.2, deepZ);
        slot.charGroup.rotation.set(0, 0, 0);

        // Zoom all players' 3D cameras smoothly onto the rising diver for the "아싸!" surface ceremony
        startCameraFocus({ x: deepX, y: 1.25, z: deepZ }, 7.4, 0.08, 1.26);

        activeOctopusAnims.push({
            mode: 'show',
            slot,
            startPerf: performance.now(),
            elapsed: 0,
            total: 8.6 * scale,
            scale,
            deepX,
            deepZ,
            centerX: 0,
            centerZ: 8.6,
            octoMesh,
            chojangMesh,
            eatMouthGroup,
            ceremonySprite,
            phaseName: 'ceremony',
            cameraReleased: false,
            ceremonyBurstDone: false,
            lastSauceDropPerf: 0,
            tearSplatterDone: false,
            surfaceSplashDone: false,
            finished: false,
            onFinished
        });
    }

    function triggerOctopusWaterExplosion(playerId) {
        if (!isInitialized) return;
        const slot = chairSlots.find(s => s.player && s.player.id === playerId);
        const deepX = slot ? THREE.MathUtils.clamp(slot.x * 0.45, -4.5, 4.5) : 0;
        const deepZ = -15.5;
        createExplosion3D(deepX, 0.45, deepZ);
        createWaterSplash(deepX, 0.3, deepZ, 1.85);
        if (!sharedSmokeGeo) sharedSmokeGeo = new THREE.SphereGeometry(0.24, 6, 6);
        for (let i = 0; i < 14; i++) {
            const soot = new THREE.Mesh(
                sharedSmokeGeo,
                new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0x1b1b1b : 0x3d3d3d, transparent: true, opacity: 0.9 })
            );
            soot.position.set(deepX + (Math.random() - 0.5) * 0.9, 0.4, deepZ + (Math.random() - 0.5) * 0.9);
            soot.velocity = new THREE.Vector3((Math.random() - 0.5) * 3.8, 2.2 + Math.random() * 3.6, (Math.random() - 0.5) * 3.8);
            soot.gravity = 1.6;
            soot.life = 1.0 + Math.random() * 0.45;
            soot.maxLife = soot.life;
            soot.growRate = 2.4;
            scene.add(soot);
            activeParticles.push(soot);
        }
    }

    function updateActiveOctopusAnims(time, delta) {
        if (activeOctopusAnims.length === 0) return;
        const CHAR_GROUND_STAND_OFFSET = 0.84; // Foot soles sit at y = -0.83 relative to charGroup
        const nowPerf = performance.now();
        const nowSec = nowPerf * 0.001;
        for (let i = activeOctopusAnims.length - 1; i >= 0; i--) {
            const anim = activeOctopusAnims[i];
            if (!anim || anim.finished) {
                activeOctopusAnims.splice(i, 1);
                continue;
            }
            if (!anim.startPerf) anim.startPerf = nowPerf;
            anim.elapsed = Math.max(0, (nowPerf - anim.startPerf) * 0.001);
            const s = anim.scale || 1;
            const t = anim.elapsed / s; // normalized logical seconds 0..total_base
            const { slot } = anim;
            const m = slot.avatarMeshes;

            if (anim.mode === 'dive') {
                if (t < 1.1) {
                    // Phase 1: Walk down beach to shoreline wearing mask, snorkel & catch bag
                    const p = clamp01(t / 1.1);
                    const px = slot.x;
                    const pz = THREE.MathUtils.lerp(slot.z + 0.1, anim.shoreZ, p);
                    const groundStandY = getBeachHeight(px, pz) + CHAR_GROUND_STAND_OFFSET;
                    const py = THREE.MathUtils.lerp(2.4, groundStandY, smoothstep(0.0, 0.35, p)) + Math.abs(Math.sin(t * 11)) * 0.09;
                    slot.charGroup.position.set(px, py, pz);
                    slot.charGroup.rotation.set(0, Math.PI, 0);
                    if (m) {
                        m.leftLeg.rotation.set(Math.sin(t * 11) * 0.55, 0, 0);
                        m.rightLeg.rotation.set(-Math.sin(t * 11) * 0.55, 0, 0);
                        if (p >= 0.45) {
                            if (anim.gearRig.maskGroup) anim.gearRig.maskGroup.visible = true;
                            if (anim.gearRig.bagGroup) anim.gearRig.bagGroup.visible = true;
                            m.rightArm.rotation.set(-1.35, 0, -0.35);
                            m.leftArm.rotation.set(-0.95, 0, 0.35);
                        }
                    }
                } else if (t < 2.9) {
                    // Phase 2: Swim out to deep sea
                    if (!anim.splashEntryDone) {
                        anim.splashEntryDone = true;
                        createWaterSplash(anim.shoreX, 0.2, anim.shoreZ - 1.2, 1.1);
                    }
                    const p = clamp01((t - 1.1) / 1.8);
                    const px = THREE.MathUtils.lerp(anim.shoreX, anim.deepX, p);
                    const pz = THREE.MathUtils.lerp(anim.shoreZ - 0.6, anim.deepZ, p);
                    const bob = Math.sin(t * 8) * 0.12;
                    slot.charGroup.position.set(px, -0.05 + bob, pz);
                    slot.charGroup.lookAt(anim.deepX, -0.05, anim.deepZ - 4);
                    if (m) {
                        m.leftArm.rotation.set(t * 6.2, 0, 0.15);
                        m.rightArm.rotation.set(t * 6.2 + Math.PI, 0, -0.15);
                        m.leftLeg.rotation.x = Math.sin(t * 13) * 0.42;
                        m.rightLeg.rotation.x = -Math.sin(t * 13) * 0.42;
                    }
                } else if (t < 4.1) {
                    // Phase 3: Vertical duck dive (몸을 거꾸로 세워 물속 잠수)
                    if (!anim.splashDiveDone) {
                        anim.splashDiveDone = true;
                        createWaterSplash(anim.deepX, 0.25, anim.deepZ, 1.35);
                    }
                    const p = clamp01((t - 2.9) / 1.2);
                    const ease = p * p * (3 - 2 * p);
                    const py = p < 0.35
                        ? THREE.MathUtils.lerp(0.05, 0.65, p / 0.35)
                        : THREE.MathUtils.lerp(0.65, -2.35, (p - 0.35) / 0.65);
                    slot.charGroup.position.set(anim.deepX, py, anim.deepZ);
                    slot.charGroup.rotation.set(ease * Math.PI * 0.92, Math.PI, 0);
                    if (m) {
                        m.leftArm.rotation.set(-2.6, 0, 0.2);
                        m.rightArm.rotation.set(-2.6, 0, -0.2);
                        m.leftLeg.rotation.x = Math.sin(t * 16) * 0.55;
                        m.rightLeg.rotation.x = -Math.sin(t * 16) * 0.55;
                    }
                } else {
                    finishOctopusAnimImmediate(anim);
                    activeOctopusAnims.splice(i, 1);
                }
            } else if (anim.mode === 'show') {
                if (!anim.surfaceSplashDone) {
                    anim.surfaceSplashDone = true;
                    createWaterSplash(anim.deepX, 0.2, anim.deepZ, 1.25);
                }

                if (t < 2.3) {
                    // Phase 1: Surface "아싸!" skyward ceremony with zoomed-in all-player camera
                    anim.phaseName = 'ceremony';
                    const p = clamp01(t / 2.3);
                    const py = t < 0.42 ? THREE.MathUtils.lerp(-1.2, 0.42, t / 0.42) : 0.32 + Math.sin(t * 7) * 0.10;
                    slot.charGroup.position.set(anim.deepX, py, anim.deepZ);
                    slot.charGroup.rotation.set(0, 0, 0);
                    cameraFocusState.focusLookAt.x = anim.deepX;
                    cameraFocusState.focusLookAt.y = py + 0.95;
                    cameraFocusState.focusLookAt.z = anim.deepZ;
                    if (m) {
                        if (m.headGroup) m.headGroup.rotation.set(-0.30 + Math.sin(t * 8) * 0.05, 0, Math.sin(t * 5) * 0.05);
                        m.rightArm.rotation.set(-2.92, 0, -0.18);
                        m.leftArm.rotation.set(-2.28, 0, 0.52);
                    }
                    if (anim.ceremonySprite) {
                        anim.ceremonySprite.visible = t >= 0.25;
                        const pop = t < 0.45 ? smoothstep(0.25, 0.45, t) : (1.0 + Math.sin(t * 14) * 0.07);
                        anim.ceremonySprite.scale.set(4.1 * pop, 1.6 * pop, 1);
                    }
                    if (!anim.ceremonyBurstDone && t >= 0.35) {
                        anim.ceremonyBurstDone = true;
                        createWaterSplash(anim.deepX, 0.3, anim.deepZ, 1.45);
                    }
                } else if (t < 3.7) {
                    // Phase 2: Release camera smoothly back to normal view & swim/walk onto sand center
                    anim.phaseName = 'return_shore';
                    if (!anim.cameraReleased) {
                        anim.cameraReleased = true;
                        releaseCameraFocus();
                    }
                    if (anim.ceremonySprite) anim.ceremonySprite.visible = false;
                    const p = clamp01((t - 2.3) / 1.4);
                    const ease = p * p * (3 - 2 * p);
                    const px = THREE.MathUtils.lerp(anim.deepX, anim.centerX, ease);
                    const pz = THREE.MathUtils.lerp(anim.deepZ, anim.centerZ, ease);
                    let py;
                    if (pz < 2.1) {
                        py = 0.15 + Math.sin(t * 8) * 0.08;
                    } else {
                        const landBlend = smoothstep(2.1, 3.2, pz);
                        const walkStandY = getBeachHeight(px, pz) + CHAR_GROUND_STAND_OFFSET + Math.abs(Math.sin(t * 12)) * 0.09;
                        py = THREE.MathUtils.lerp(0.15, walkStandY, landBlend);
                    }
                    slot.charGroup.position.set(px, py, pz);
                    slot.charGroup.rotation.set(0, 0, 0);
                    if (m) {
                        if (m.headGroup) m.headGroup.rotation.set(0, 0, 0);
                        m.rightArm.rotation.set(-2.05, 0, -0.25);
                        m.leftArm.rotation.set(Math.sin(t * 9) * 0.3, 0, 0.2);
                        m.leftLeg.rotation.set(Math.sin(t * 12) * 0.5, 0, 0);
                        m.rightLeg.rotation.set(-Math.sin(t * 12) * 0.5, 0, 0);
                    }
                } else if (t < 7.5) {
                    // Phase 3: Center front on flat sand — Dangle 1 tentacle, squirt red chojang, bite & tear diagonally, wild chew
                    const centerStandY = getBeachHeight(anim.centerX, anim.centerZ) + CHAR_GROUND_STAND_OFFSET;
                    slot.charGroup.position.set(anim.centerX, centerStandY, anim.centerZ);
                    slot.charGroup.rotation.set(0, 0, 0);
                    if (m) {
                        m.leftLeg.rotation.set(0, 0, 0);
                        m.rightLeg.rotation.set(0, 0, 0);

                        if (t < 4.8) {
                            // 3a: Hold by 1 tentacle, dangle downward, squirt red chojang all over it
                            anim.phaseName = 'chojang_squirt';
                            const sub = clamp01((t - 3.7) / 1.1);
                            m.rightArm.rotation.set(-1.55, -0.22, 0.18);
                            m.leftArm.rotation.set(-1.62, 0.42, -0.35);
                            if (m.headGroup) m.headGroup.rotation.set(0.12, -0.1, 0);
                            if (anim.chojangMesh) {
                                anim.chojangMesh.visible = true;
                                anim.chojangMesh.rotation.set(0.35, 0, -2.05);
                                if (anim.chojangMesh.userData.squirt) {
                                    anim.chojangMesh.userData.squirt.visible = true;
                                }
                                if (anim.chojangMesh.userData.squirtStream) {
                                    const ss = anim.chojangMesh.userData.squirtStream;
                                    ss.visible = sub > 0.12;
                                    ss.scale.set(0.85 + Math.sin(t * 28) * 0.22, 1.0, 0.85 + Math.cos(t * 28) * 0.22);
                                }
                            }
                            if (anim.octoMesh && anim.octoMesh.userData.chojangCoatGroup) {
                                const coat = anim.octoMesh.userData.chojangCoatGroup;
                                coat.visible = sub > 0.18;
                                coat.scale.setScalar(0.25 + sub * 0.78);
                            }
                            if (sub > 0.15 && (nowPerf - anim.lastSauceDropPerf > 90 * s)) {
                                anim.lastSauceDropPerf = nowPerf;
                                spawnChojangDrop(
                                    anim.centerX + 0.18 + (Math.random() - 0.5) * 0.25,
                                    centerStandY + 0.95,
                                    anim.centerZ + 0.65,
                                    (Math.random() - 0.5) * 0.9,
                                    -0.6 - Math.random() * 0.8,
                                    (Math.random() - 0.5) * 0.9
                                );
                            }
                        } else if (t < 6.2) {
                            // 3b: Clamp teeth onto sauced octopus, yank head UP-LEFT & hand DOWN-RIGHT to tear flesh!
                            anim.phaseName = 'bite_tear';
                            const u = clamp01((t - 4.8) / 1.4);
                            if (anim.chojangMesh) {
                                if (anim.chojangMesh.userData.squirt) anim.chojangMesh.userData.squirt.visible = false;
                                if (anim.chojangMesh.userData.squirtStream) anim.chojangMesh.userData.squirtStream.visible = false;
                                anim.chojangMesh.rotation.set(0, 0, 0);
                            }
                            m.leftArm.rotation.set(-0.55, 0, 0.32);
                            if (m.normalMouth) m.normalMouth.visible = false;
                            if (anim.eatMouthGroup) {
                                anim.eatMouthGroup.visible = true;
                                anim.eatMouthGroup.userData.biteChunk.visible = u >= 0.22;
                            }

                            if (u < 0.28) {
                                // Bring sauced octopus right up to mouth and clamp teeth
                                const c = smoothstep(0, 0.28, u);
                                m.rightArm.rotation.set(
                                    THREE.MathUtils.lerp(-1.55, -1.72, c),
                                    THREE.MathUtils.lerp(-0.22, -0.62, c),
                                    THREE.MathUtils.lerp(0.18, -0.05, c)
                                );
                                if (m.headGroup) m.headGroup.rotation.set(-0.10 * c, -0.08 * c, 0);
                                if (anim.octoMesh) anim.octoMesh.scale.setScalar(1.05);
                            } else if (u < 0.84) {
                                // Vigorous opposite-diagonal tear (head UP-LEFT vs hand DOWN-RIGHT)
                                const pull = smoothstep(0.28, 0.82, u);
                                const jit = Math.sin(t * 52) * 0.045 * pull;
                                if (m.headGroup) {
                                    m.headGroup.rotation.set(-0.12 - pull * 0.45 + jit, -pull * 0.34, pull * 0.38 + jit);
                                }
                                m.rightArm.rotation.set(
                                    -1.72 + pull * 1.07,
                                    -0.62 + pull * 0.98,
                                    -0.05 + pull * 0.38 + jit
                                );
                                if (anim.octoMesh) {
                                    anim.octoMesh.scale.set(1.05 - pull * 0.16, 1.05 + pull * 0.36, 1.05 - pull * 0.16);
                                }
                                if (anim.eatMouthGroup) {
                                    anim.eatMouthGroup.userData.lowerJaw.position.y = -0.025;
                                }
                            } else {
                                // Snap-off! Flesh tears free with chojang splatter
                                if (!anim.tearSplatterDone) {
                                    anim.tearSplatterDone = true;
                                    for (let k = 0; k < 6; k++) {
                                        spawnChojangDrop(
                                            anim.centerX + 0.1,
                                            centerStandY + 1.15,
                                            anim.centerZ + 0.65,
                                            (Math.random() - 0.5) * 2.2,
                                            0.5 + Math.random() * 1.8,
                                            1.2 + Math.random() * 1.4
                                        );
                                    }
                                }
                                if (anim.octoMesh) anim.octoMesh.scale.setScalar(1.05);
                                m.rightArm.rotation.set(-0.72, 0.28, 0.35);
                                if (m.headGroup) m.headGroup.rotation.set(-0.44, -0.2, 0.22);
                            }
                        } else {
                            // 3c: Wild chomping chew with big jaw & cheek movement
                            anim.phaseName = 'chew';
                            m.rightArm.rotation.set(-1.18, -0.08, 0.25);
                            m.leftArm.rotation.set(-0.55, 0, 0.32);
                            if (anim.octoMesh) anim.octoMesh.scale.setScalar(1.05);
                            if (m.normalMouth) m.normalMouth.visible = false;
                            if (anim.eatMouthGroup) {
                                anim.eatMouthGroup.visible = true;
                                anim.eatMouthGroup.userData.biteChunk.visible = t < 7.25;
                                const chew = 0.5 + 0.5 * Math.sin(t * 20);
                                anim.eatMouthGroup.userData.cavity.scale.set(1.15 + chew * 0.22, 0.42 + chew * 1.15, 0.38);
                                anim.eatMouthGroup.userData.lowerJaw.position.y = -0.025 - chew * 0.075;
                                if (m.cheeks) {
                                    const ck = 1.0 + (1 - chew) * 0.35;
                                    m.cheeks.forEach(c => c.scale.set(1.25 * ck, 0.72 * ck, 0.4));
                                }
                            }
                            if (m.headGroup) {
                                m.headGroup.rotation.set(
                                    0.06 + Math.sin(t * 20) * 0.14,
                                    Math.sin(t * 9) * 0.08,
                                    Math.sin(t * 10) * 0.10
                                );
                            }
                        }
                    }
                } else if (t < 8.6) {
                    // Phase 4: Walk cleanly back to own seat across flat sand
                    anim.phaseName = 'walk_seat';
                    const p = clamp01((t - 7.5) / 1.1);
                    const ease = p * p * (3 - 2 * p);
                    if (anim.chojangMesh) anim.chojangMesh.visible = false;
                    if (anim.octoMesh) anim.octoMesh.visible = false;
                    if (anim.eatMouthGroup) anim.eatMouthGroup.visible = false;
                    if (m) {
                        if (m.normalMouth) m.normalMouth.visible = true;
                        if (m.cheeks) m.cheeks.forEach(c => c.scale.set(1.25, 0.72, 0.4));
                    }
                    const px = THREE.MathUtils.lerp(anim.centerX, slot.x, ease);
                    const pz = THREE.MathUtils.lerp(anim.centerZ, slot.z + 0.1, ease);
                    const standY = getBeachHeight(px, pz) + CHAR_GROUND_STAND_OFFSET;
                    const seatBlend = smoothstep(0.72, 1.0, p);
                    const py = THREE.MathUtils.lerp(standY, 2.4, seatBlend) + (1 - seatBlend) * Math.abs(Math.sin(t * 11)) * 0.08;
                    slot.charGroup.position.set(px, py, pz);
                    slot.charGroup.rotation.set(0, 0, 0);
                    if (m) {
                        if (m.headGroup) m.headGroup.rotation.set(0, 0, 0);
                        m.rightArm.rotation.set(Math.sin(t * 10) * 0.3, 0, 0);
                        m.leftArm.rotation.set(-Math.sin(t * 10) * 0.3, 0, 0);
                        m.leftLeg.rotation.set(Math.sin(t * 11) * 0.45, 0, 0);
                        m.rightLeg.rotation.set(-Math.sin(t * 11) * 0.45, 0, 0);
                    }
                } else {
                    finishOctopusAnimImmediate(anim);
                    activeOctopusAnims.splice(i, 1);
                }

                // Keep dangling octopus & remaining 7 tentacles hanging straight downward under gravity
                if (anim.octoMesh && anim.octoMesh.visible && m && m.rightArm) {
                    anim.octoMesh.quaternion.copy(m.rightArm.quaternion).invert();
                    const dp = anim.octoMesh.userData.danglePivot;
                    if (dp) {
                        dp.rotation.set(Math.sin(nowSec * 3.8) * 0.08, 0, Math.cos(nowSec * 4.4) * 0.09);
                    }
                    const limbs = anim.octoMesh.userData.limpTentacles;
                    if (Array.isArray(limbs)) {
                        limbs.forEach(lt => {
                            lt.group.rotation.x = lt.baseRx + Math.sin(nowSec * 6.5 + lt.phase) * 0.09;
                            lt.group.rotation.z = lt.baseRz + Math.cos(nowSec * 5.8 + lt.phase) * 0.09;
                        });
                    }
                }

                // Publish live show telemetry for QA & inspection
                latestOctopusShowDebug = {
                    active: true,
                    phaseName: anim.phaseName,
                    ceremonySpriteVisible: !!(anim.ceremonySprite && anim.ceremonySprite.visible),
                    chojangCoatVisible: !!(anim.octoMesh && anim.octoMesh.userData.chojangCoatGroup && anim.octoMesh.userData.chojangCoatGroup.visible),
                    squirtStreamVisible: !!(anim.chojangMesh && anim.chojangMesh.userData.squirtStream && anim.chojangMesh.userData.squirtStream.visible),
                    eatMouthVisible: !!(anim.eatMouthGroup && anim.eatMouthGroup.visible),
                    biteChunkVisible: !!(anim.eatMouthGroup && anim.eatMouthGroup.userData.biteChunk && anim.eatMouthGroup.userData.biteChunk.visible),
                    octoScaleY: anim.octoMesh ? Number(anim.octoMesh.scale.y.toFixed(3)) : 1,
                    headRotX: (m && m.headGroup) ? Number(m.headGroup.rotation.x.toFixed(3)) : 0,
                    headRotZ: (m && m.headGroup) ? Number(m.headGroup.rotation.z.toFixed(3)) : 0,
                    rightArmRotX: (m && m.rightArm) ? Number(m.rightArm.rotation.x.toFixed(3)) : 0,
                    rightArmRotZ: (m && m.rightArm) ? Number(m.rightArm.rotation.z.toFixed(3)) : 0
                };
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 16. 3D First-Person POV Duel Arena & Referee Sky Coin Toss
    // ─────────────────────────────────────────────────────────────
    const duelArena = (function () {
        let dScene = null;
        let dCamera = null;
        let dRenderer = null;
        let dContainer = null;
        let dResizeObs = null;
        let dRafId = null;
        let dClock = null;
        let dVisible = false;
        let dInitialized = false;

        let ringGroup = null;
        let oppRoot = null;
        let oppChar = null;
        let oppLeftGlove = null;
        let oppRightGlove = null;

        let fpRig = null;
        let fpLeftPivot = null;
        let fpRightPivot = null;

        let refereeRoot = null;
        let refereeChar = null;
        let coinGroup = null;
        let coinSpinGroup = null;
        let coinGlowRing = null;

        const dParticles = [];

        const dState = {
            mode: 'idle',        // 'idle' | 'choosing' | 'slowmo' | 'coin_toss'
            povRole: 'attacker', // 'attacker' | 'defender' | 'spectator'
            isFinalMatch: false,
            preChoice: null,     // 'left' | 'right' | null
            attackDir: 'left',
            dodgeDir: 'right',
            hit: false,
            animElapsed: 0,
            animDuration: 2.4,
            impactAt: 0.9,
            impactTriggered: false,
            coinResult: 'heads',
            coinSoundAt: 0.52,
            coinLaunched: false,
            coinPeakY: 0,
            shakeTime: 0,
            shakeMag: 0,
            oppHeadOffsetX: 0,
            fpPunchProgress: 0
        };

        function makeGloveMesh(isRed, scale = 1.0) {
            const g = new THREE.Group();
            const mainHex = isRed ? 0xe11d48 : 0x2563eb;
            const darkHex = isRed ? 0x881337 : 0x1e3a8a;
            const gloveMat = new THREE.MeshStandardMaterial({ color: mainHex, roughness: 0.26, metalness: 0.14 });
            const cuffMat = new THREE.MeshStandardMaterial({ color: darkHex, roughness: 0.45, metalness: 0.1 });
            const trimMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });

            const pad = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 14), gloveMat);
            pad.scale.set(1.05, 1.15, 1.28);
            g.add(pad);

            const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 10), gloveMat);
            thumb.position.set(0.16, 0.04, 0.06);
            thumb.scale.set(0.9, 1.15, 1.05);
            g.add(thumb);

            const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.165, 0.17, 14), cuffMat);
            cuff.rotation.x = Math.PI / 2;
            cuff.position.set(0, 0, -0.24);
            g.add(cuff);

            const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.158, 0.018, 8, 18), trimMat);
            stripe.position.set(0, 0, -0.17);
            g.add(stripe);

            g.scale.setScalar(scale);
            return g;
        }

        function makeRefereeStripeTexture() {
            const c = document.createElement('canvas');
            c.width = 256;
            c.height = 128;
            const ctx = c.getContext('2d');
            const stripes = 12;
            const sw = c.width / stripes;
            for (let i = 0; i < stripes; i++) {
                ctx.fillStyle = (i % 2 === 0) ? '#111827' : '#f8fafc';
                ctx.fillRect(i * sw, 0, sw, c.height);
            }
            const tex = new THREE.CanvasTexture(c);
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            return tex;
        }

        function makeCoinFaceTexture(isHeads) {
            const c = document.createElement('canvas');
            c.width = 256;
            c.height = 256;
            const ctx = c.getContext('2d');
            const grad = ctx.createRadialGradient(110, 96, 18, 128, 128, 126);
            if (isHeads) {
                grad.addColorStop(0, '#fef9c3');
                grad.addColorStop(0.45, '#facc15');
                grad.addColorStop(1, '#b45309');
            } else {
                grad.addColorStop(0, '#f1f5f9');
                grad.addColorStop(0.48, '#93c5fd');
                grad.addColorStop(1, '#1d4ed8');
            }
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(128, 128, 124, 0, Math.PI * 2);
            ctx.fill();

            ctx.lineWidth = 10;
            ctx.strokeStyle = isHeads ? '#fef08a' : '#dbeafe';
            ctx.beginPath();
            ctx.arc(128, 128, 108, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = isHeads ? '#451a03' : '#0f172a';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 64px Pretendard, sans-serif';
            ctx.fillText(isHeads ? '앞면' : '뒷면', 128, 108);

            ctx.font = 'bold 28px Pretendard, sans-serif';
            ctx.fillText(isHeads ? 'HEADS · 신청자' : 'TAILS · 지목자', 128, 172);
            return new THREE.CanvasTexture(c);
        }

        function buildArenaEnvironment() {
            ringGroup = new THREE.Group();
            dScene.add(ringGroup);

            // Stadium overhead truss & spotlights (visible when camera tilts up during sky coin toss)
            const trussMat = createMat(0x334155, 0.4, 0.7);
            const trussRing = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.12, 8, 28), trussMat);
            trussRing.rotation.x = Math.PI / 2;
            trussRing.position.set(0, 10.6, -0.3);
            ringGroup.add(trussRing);

            const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfef9c3 });
            const beamMat = new THREE.MeshBasicMaterial({
                color: 0xbae6fd,
                transparent: true,
                opacity: 0.08,
                side: THREE.DoubleSide,
                depthWrite: false
            });
            for (let i = 0; i < 6; i++) {
                const ang = (i / 6) * Math.PI * 2;
                const lx = Math.cos(ang) * 4.5;
                const lz = -0.3 + Math.sin(ang) * 4.5;
                const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), bulbMat);
                lamp.position.set(lx, 10.4, lz);
                ringGroup.add(lamp);

                const beam = new THREE.Mesh(new THREE.ConeGeometry(2.1, 8.8, 12, 1, true), beamMat);
                beam.position.set(lx * 0.55, 6.0, lz * 0.55);
                beam.lookAt(0, 1.0, -0.3);
                beam.rotateX(Math.PI / 2);
                ringGroup.add(beam);
            }

            // Distant crowd silhouette bleachers
            const crowdMat = createMat(0x161b2e, 0.95, 0.02);
            const arenaWall = new THREE.Mesh(new THREE.CylinderGeometry(13.5, 11.0, 7.5, 24, 1, true), crowdMat);
            arenaWall.material.side = THREE.BackSide;
            arenaWall.position.set(0, 3.4, -0.3);
            ringGroup.add(arenaWall);

            // Boxing Ring Platform & Royal Blue Mat
            const apron = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.8, 7.0), createMat(0x0f172a, 0.8));
            apron.position.set(0, -0.42, -0.3);
            ringGroup.add(apron);

            const matCanvas = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.08, 6.6), createMat(0x1d4ed8, 0.65, 0.05));
            matCanvas.position.set(0, 0.0, -0.3);
            ringGroup.add(matCanvas);

            const centerCircle = new THREE.Mesh(
                new THREE.RingGeometry(0.95, 1.12, 32),
                new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide })
            );
            centerCircle.rotation.x = -Math.PI / 2;
            centerCircle.position.set(0, 0.05, -0.3);
            ringGroup.add(centerCircle);

            // 4 Corner Posts & 3 Horizontal Ropes (Red, White, Blue)
            const corners = [
                { x: -3.15, z: -3.45, c: 0xe11d48 },
                { x:  3.15, z: -3.45, c: 0x2563eb },
                { x: -3.15, z:  2.85, c: 0x64748b },
                { x:  3.15, z:  2.85, c: 0x64748b }
            ];
            corners.forEach(pt => {
                const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 2.25, 12), createMat(pt.c, 0.4, 0.35));
                post.position.set(pt.x, 1.1, pt.z);
                ringGroup.add(post);
            });

            const ropeSpecs = [
                { y: 1.82, c: 0xef4444 },
                { y: 1.34, c: 0xf8fafc },
                { y: 0.86, c: 0x38bdf8 }
            ];
            ropeSpecs.forEach(rp => {
                const rMat = createMat(rp.c, 0.45, 0.15);
                // Front & Back ropes (along X)
                [-3.45, 2.85].forEach(rz => {
                    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 6.3, 8), rMat);
                    bar.rotation.z = Math.PI / 2;
                    bar.position.set(0, rp.y, rz);
                    ringGroup.add(bar);
                });
                // Left & Right ropes (along Z)
                [-3.15, 3.15].forEach(rx => {
                    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 6.3, 8), rMat);
                    bar.rotation.x = Math.PI / 2;
                    bar.position.set(rx, rp.y, -0.3);
                    ringGroup.add(bar);
                });
            });

            // 3D Striped Referee + Sky-Toss Coin
            refereeRoot = new THREE.Group();
            refereeRoot.position.set(0, 0.90, 0.05);
            refereeRoot.visible = false;
            refereeChar = buildCharacterMesh({ name: '심판', gender: 'M', splashCount: 0 }, 4);
            refereeChar.labelSprite.visible = false;
            refereeChar.leftLeg.rotation.set(0, 0, -0.06);
            refereeChar.rightLeg.rotation.set(0, 0, 0.06);

            const stripeMat = new THREE.MeshStandardMaterial({ map: makeRefereeStripeTexture(), roughness: 0.65 });
            refereeChar.torso.material = stripeMat;
            refereeChar.leftArm.children[0].material = stripeMat;
            refereeChar.rightArm.children[0].material = stripeMat;

            // Referee Cap & Bow-tie
            const capMat = createMat(0x111827, 0.6);
            const capCrown = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.48), capMat);
            capCrown.position.set(0, 0.08, 0);
            refereeChar.headGroup.add(capCrown);
            const capVisor = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.05, 0.36), capMat);
            capVisor.position.set(0, 0.24, 0.54);
            capVisor.rotation.x = 0.14;
            refereeChar.headGroup.add(capVisor);

            const bowTie = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.10, 0.08), createMat(0xe11d48, 0.5));
            bowTie.position.set(0, 0.86, 0.44);
            refereeChar.group.add(bowTie);

            refereeRoot.add(refereeChar.group);
            dScene.add(refereeRoot);

            // 3D Two-Sided Coin
            coinGroup = new THREE.Group();
            coinGroup.visible = false;
            coinSpinGroup = new THREE.Group();
            coinGroup.add(coinSpinGroup);

            const rimMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.2, metalness: 0.78 });
            const coinBody = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.068, 32), rimMat);
            coinBody.rotation.x = Math.PI / 2;
            coinSpinGroup.add(coinBody);

            const headsFace = new THREE.Mesh(
                new THREE.CircleGeometry(0.368, 32),
                new THREE.MeshBasicMaterial({ map: makeCoinFaceTexture(true) })
            );
            headsFace.position.z = 0.036;
            coinSpinGroup.add(headsFace);

            const tailsFace = new THREE.Mesh(
                new THREE.CircleGeometry(0.368, 32),
                new THREE.MeshBasicMaterial({ map: makeCoinFaceTexture(false) })
            );
            tailsFace.position.z = -0.036;
            tailsFace.rotation.y = Math.PI;
            coinSpinGroup.add(tailsFace);

            coinGlowRing = new THREE.Mesh(
                new THREE.RingGeometry(0.42, 0.54, 32),
                new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide, transparent: true, opacity: 0.0 })
            );
            coinGroup.add(coinGlowRing);
            dScene.add(coinGroup);
        }

        function init(container) {
            if (!container || typeof THREE === 'undefined') return false;
            dContainer = container;
            if (dInitialized && dRenderer) {
                if (dRenderer.domElement.parentNode !== dContainer) {
                    dContainer.innerHTML = '';
                    dContainer.appendChild(dRenderer.domElement);
                }
                handleResize();
                return true;
            }
            try {
                dScene = new THREE.Scene();
                dScene.background = new THREE.Color(0x0b0e1c);
                dScene.fog = new THREE.FogExp2(0x0b0e1c, 0.035);

                const w = Math.max(260, dContainer.clientWidth || 440);
                const h = Math.max(150, dContainer.clientHeight || 205);
                dCamera = new THREE.PerspectiveCamera(52, w / h, 0.08, 90);
                dCamera.position.set(0, 2.22, 2.25);
                dCamera.lookAt(0, 2.08, -0.45);

                dRenderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
                const dRawDpr = Math.min(window.devicePixelRatio || 1, 2);
                const dSafeDpr = Math.max(0.5, Math.min(dRawDpr, 1920 / Math.max(w, h, 1)));
                dRenderer.setPixelRatio(dSafeDpr);
                dRenderer.setSize(w, h, false);
                dRenderer.domElement.style.width = '100%';
                dRenderer.domElement.style.height = '100%';
                dRenderer.domElement.style.touchAction = 'none';
                dRenderer.domElement.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); }, false);
                dContainer.innerHTML = '';
                dContainer.appendChild(dRenderer.domElement);

                const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x1e1b4b, 0.85);
                dScene.add(hemi);

                const keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
                keyLight.position.set(2.8, 7.5, 4.5);
                dScene.add(keyLight);

                const rimLight = new THREE.PointLight(0xf43f5e, 0.65, 16);
                rimLight.position.set(-3.2, 4.0, -2.5);
                dScene.add(rimLight);

                const blueRim = new THREE.PointLight(0x38bdf8, 0.65, 16);
                blueRim.position.set(3.2, 4.0, -2.5);
                dScene.add(blueRim);

                fpRig = new THREE.Group();
                dScene.add(fpRig);

                buildArenaEnvironment();

                dClock = new THREE.Clock();
                if (typeof ResizeObserver !== 'undefined') {
                    dResizeObs = new ResizeObserver(() => handleResize());
                    dResizeObs.observe(dContainer);
                }
                dInitialized = true;
                return true;
            } catch (err) {
                console.warn('DuelArena 3D WebGL fallback:', err);
                dInitialized = false;
                return false;
            }
        }

        let dLastBufW = 0;
        let dLastBufH = 0;

        function handleResize() {
            if (!dInitialized || !dRenderer || !dCamera || !dContainer) return;
            const w = dContainer.clientWidth;
            const h = dContainer.clientHeight;
            if (w <= 10 || h <= 10) return;
            dCamera.aspect = w / h;
            // Slightly wider horizontal framing on narrow mobile screens
            dCamera.fov = (w / h < 1.55) ? 58 : 50;
            dCamera.updateProjectionMatrix();
            const dRawDpr = Math.min(window.devicePixelRatio || 1, 2);
            const dSafeDpr = Math.max(0.5, Math.min(dRawDpr, 1920 / Math.max(w, h, 1)));
            const bw = Math.max(1, Math.round(w * dSafeDpr));
            const bh = Math.max(1, Math.round(h * dSafeDpr));
            if (bw !== dLastBufW || bh !== dLastBufH) {
                dLastBufW = bw;
                dLastBufH = bh;
                dRenderer.setPixelRatio(dSafeDpr);
                dRenderer.setSize(w, h, false);
            }
        }

        function clearParticles() {
            while (dParticles.length > 0) {
                const p = dParticles.pop();
                if (p.mesh && dScene) {
                    dScene.remove(p.mesh);
                    disposeObjectGroup(p.mesh);
                }
            }
        }

        function buildOpponentInRing(oppGender, oppIsChallenger, oppName) {
            if (oppRoot && dScene) {
                dScene.remove(oppRoot);
                disposeObjectGroup(oppRoot);
                oppRoot = null;
            }
            oppRoot = new THREE.Group();
            oppRoot.position.set(0, 0.90, -0.45);
            oppChar = buildCharacterMesh({ name: oppName || '상대', gender: oppGender || 'M', splashCount: 0 }, oppIsChallenger ? 0 : 1);
            oppChar.labelSprite.visible = false;
            oppChar.leftLeg.rotation.set(0, 0, -0.07);
            oppChar.rightLeg.rotation.set(0, 0, 0.07);

            oppLeftGlove = makeGloveMesh(oppIsChallenger, 1.05);
            oppLeftGlove.position.set(0, -0.76, 0.08);
            oppChar.leftArm.add(oppLeftGlove);

            oppRightGlove = makeGloveMesh(oppIsChallenger, 1.05);
            oppRightGlove.position.set(0, -0.76, 0.08);
            oppChar.rightArm.add(oppRightGlove);

            // Boxing high guard pose facing +Z
            oppChar.leftArm.position.set(-0.56, 0.76, 0.14);
            oppChar.rightArm.position.set(0.56, 0.76, 0.14);
            oppChar.leftArm.rotation.set(-2.15, 0.25, 0.35);
            oppChar.rightArm.rotation.set(-2.15, -0.25, -0.35);

            oppRoot.add(oppChar.group);
            dScene.add(oppRoot);
        }

        function buildFirstPersonArms(myGender, myIsChallenger) {
            if (!fpRig) return;
            while (fpRig.children.length > 0) {
                const ch = fpRig.children[0];
                fpRig.remove(ch);
                disposeObjectGroup(ch);
            }
            const isAlien = myGender === 'alien' || myGender === 'A';
            const isFemale = !isAlien && (myGender === 'female' || myGender === 'F');
            const palette = isAlien ? ALIEN_COLORS : (isFemale ? FEMALE_COLORS : MALE_COLORS);
            const sleeveHex = palette[myIsChallenger ? 0 : 1];
            const skinHex = isAlien ? 0x2ecc71 : 0xffdbac;

            const sleeveMat = createMat(sleeveHex, 0.55);
            const skinMat = createMat(skinHex, 0.5);

            function makeFpArm(sideSign) {
                const pivot = new THREE.Group();
                const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.125, 0.68, 12), sleeveMat);
                forearm.rotation.x = Math.PI / 2.35;
                forearm.rotation.z = sideSign * 0.18;
                forearm.position.set(0, -0.14, 0.26);
                pivot.add(forearm);

                const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.10, 0.14, 10), skinMat);
                wrist.rotation.x = Math.PI / 2.35;
                wrist.position.set(0, -0.02, 0.0);
                pivot.add(wrist);

                const glove = makeGloveMesh(myIsChallenger, 1.12);
                glove.position.set(0, 0.05, -0.14);
                // Flip thumb inward toward center screen
                glove.scale.x = sideSign < 0 ? 1.12 : -1.12;
                pivot.add(glove);
                return pivot;
            }

            fpLeftPivot = makeFpArm(-1);
            fpRightPivot = makeFpArm(1);
            fpRig.add(fpLeftPivot);
            fpRig.add(fpRightPivot);
        }

        function syncFpRigToCamera() {
            if (!fpRig || !dCamera) return;
            fpRig.position.copy(dCamera.position);
            fpRig.quaternion.copy(dCamera.quaternion);
        }

        function spawn3DImpactFX(wx, wy, wz, isHit) {
            if (!dScene) return;
            const ringMat = new THREE.MeshBasicMaterial({
                color: isHit ? 0xfacc15 : 0x38bdf8,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.95
            });
            const shockRing = new THREE.Mesh(new THREE.RingGeometry(0.12, isHit ? 0.28 : 0.22, 24), ringMat);
            shockRing.position.set(wx, wy, wz);
            shockRing.lookAt(dCamera.position);
            dScene.add(shockRing);
            dParticles.push({ mesh: shockRing, kind: 'ring', age: 0, life: 0.52, maxScale: isHit ? 3.8 : 2.6 });

            if (isHit) {
                const sparkCols = [0xfef08a, 0xf97316, 0xef4444, 0xffffff];
                for (let i = 0; i < 18; i++) {
                    const spMat = new THREE.MeshBasicMaterial({
                        color: sparkCols[i % sparkCols.length],
                        transparent: true,
                        opacity: 1
                    });
                    const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), spMat);
                    sp.position.set(wx, wy, wz);
                    const ang = (i / 18) * Math.PI * 2 + (Math.random() * 0.25);
                    const spd = 2.4 + Math.random() * 2.6;
                    dScene.add(sp);
                    dParticles.push({
                        mesh: sp,
                        kind: 'spark',
                        vx: Math.cos(ang) * spd,
                        vy: Math.sin(ang) * spd + 0.8,
                        vz: (Math.random() - 0.3) * 2.2,
                        age: 0,
                        life: 0.62
                    });
                }
            }
        }

        function setRoundPOV(opts) {
            if (!dInitialized && dContainer) init(dContainer);
            if (!dInitialized) return;
            clearParticles();

            dState.mode = 'choosing';
            dState.povRole = opts.povRole || 'attacker';
            dState.isFinalMatch = !!opts.isFinalMatch;
            dState.preChoice = null;
            dState.animElapsed = 0;
            dState.impactTriggered = false;
            dState.shakeTime = 0;
            dState.oppHeadOffsetX = 0;
            dState.fpPunchProgress = 0;

            if (refereeRoot) refereeRoot.visible = false;
            if (coinGroup) coinGroup.visible = false;

            buildOpponentInRing(opts.oppGender, !!opts.oppIsChallenger, opts.oppName);
            buildFirstPersonArms(opts.myGender, !!opts.myIsChallenger);
            if (fpRig) fpRig.visible = true;
            if (oppRoot) oppRoot.visible = true;

            handleResize();
            setVisible(true);
        }

        function setPreChoice(dir) {
            if (dir === 'left' || dir === 'right' || dir === null) {
                dState.preChoice = dir;
            }
        }

        function playSlowMoRound(opts) {
            if (!dInitialized) return;
            dState.mode = 'slowmo';
            dState.povRole = opts.povRole || dState.povRole || 'attacker';
            dState.attackDir = opts.attackDir || 'left';
            dState.dodgeDir = opts.dodgeDir || 'right';
            dState.hit = !!opts.hit;
            dState.isFinalMatch = !!opts.isFinalMatch;
            dState.animElapsed = 0;
            dState.animDuration = (opts.durationMs || 2400) / 1000;
            dState.impactAt = (opts.impactAtMs || 900) / 1000;
            dState.impactTriggered = false;
            dState.fpPunchProgress = 0;
            dState.oppHeadOffsetX = 0;
        }

        function playCoinToss(opts) {
            if (!dInitialized && dContainer) init(dContainer);
            if (!dInitialized) return;
            clearParticles();

            dState.mode = 'coin_toss';
            dState.coinResult = opts.coinResult === 'tails' ? 'tails' : 'heads';
            dState.animElapsed = 0;
            dState.animDuration = (opts.durationMs || 3800) / 1000;
            dState.coinSoundAt = 0.52;
            dState.coinLaunched = false;
            dState.coinPeakY = 0;
            dState.shakeTime = 0;

            if (fpRig) fpRig.visible = false;
            // Show opponent in background corner + referee center stage
            buildOpponentInRing(opts.targetGender || 'M', false, opts.targetName || '상대');
            if (oppRoot) {
                oppRoot.visible = true;
                oppRoot.position.set(1.38, 0.90, -0.85);
                oppRoot.rotation.set(0, -0.35, 0);
            }
            if (refereeRoot) {
                refereeRoot.visible = true;
                refereeRoot.position.set(0, 0.90, 0.05);
                refereeChar.leftArm.rotation.set(-0.55, 0, 0.18);
                refereeChar.rightArm.rotation.set(-1.35, 0, -0.1);
            }
            if (coinGroup) {
                coinGroup.visible = true;
                coinGroup.position.set(0.45, 2.02, 0.62);
                coinSpinGroup.rotation.set(0, 0, 0);
                if (coinGlowRing) coinGlowRing.material.opacity = 0;
            }

            handleResize();
            setVisible(true);
        }

        function updateParticles(dt) {
            for (let i = dParticles.length - 1; i >= 0; i--) {
                const p = dParticles[i];
                p.age += dt;
                const u = Math.min(1, p.age / p.life);
                if (p.kind === 'ring') {
                    const s = 1 + (p.maxScale - 1) * (1 - Math.pow(1 - u, 3));
                    p.mesh.scale.setScalar(s);
                    p.mesh.material.opacity = (1 - u) * 0.92;
                } else {
                    p.mesh.position.x += p.vx * dt;
                    p.mesh.position.y += p.vy * dt;
                    p.mesh.position.z += p.vz * dt;
                    p.vy -= 5.8 * dt;
                    p.mesh.rotation.x += 9 * dt;
                    p.mesh.rotation.y += 7 * dt;
                    p.mesh.material.opacity = 1 - u;
                    p.mesh.scale.setScalar(Math.max(0.15, 1 - u * 0.75));
                }
                if (p.age >= p.life) {
                    dScene.remove(p.mesh);
                    disposeObjectGroup(p.mesh);
                    dParticles.splice(i, 1);
                }
            }
        }

        function animateDuel() {
            if (!dVisible || !dInitialized) {
                dRafId = null;
                return;
            }
            dRafId = requestAnimationFrame(animateDuel);
            const dt = Math.min(0.05, dClock ? dClock.getDelta() : 0.016);
            const nowSec = performance.now() * 0.001;

            updateParticles(dt);

            if (oppChar && oppChar.duelFaceGroup && oppChar.duelFaceGroup.visible && oppChar.duelStarsRing) {
                oppChar.duelStarsRing.rotation.y += dt * 4.2;
            }

            if (dState.mode === 'choosing') {
                const bob = Math.sin(nowSec * 5.2) * 0.035;
                const sway = Math.cos(nowSec * 2.6) * 0.04;
                const isDef = dState.povRole === 'defender';
                const preDir = dState.preChoice === 'left' ? -1 : (dState.preChoice === 'right' ? 1 : 0);

                const camLeanX = isDef ? preDir * 0.11 : 0;
                dCamera.position.set(camLeanX, 2.22 + bob * 0.5, dState.povRole === 'spectator' ? 2.52 : 2.22);
                dCamera.lookAt(camLeanX * 0.35, 2.10, -0.45);
                dCamera.rotation.z = isDef ? -preDir * 0.04 : 0;
                syncFpRigToCamera();

                if (oppRoot && oppChar) {
                    oppRoot.position.set(sway, 0.90 + Math.abs(bob), -0.45);
                    oppRoot.rotation.set(0, 0, -sway * 0.4);
                    oppChar.headGroup.position.set(0, 1.3, 0);
                    oppChar.headGroup.rotation.set(0, 0, 0);
                    oppChar.normalFaceGroup.visible = true;
                    oppChar.duelFaceGroup.visible = false;
                    oppChar.leftArm.position.set(-0.56, 0.76, 0.14);
                    oppChar.rightArm.position.set(0.56, 0.76, 0.14);
                    oppChar.leftArm.rotation.set(-2.15 + bob, 0.25, 0.35);
                    oppChar.rightArm.rotation.set(-2.15 - bob, -0.25, -0.35);
                }

                if (fpLeftPivot && fpRightPivot) {
                    const guardY = isDef ? -0.34 : -0.42;
                    const cockL = (!isDef && dState.preChoice === 'left') ? 0.12 : 0;
                    const cockR = (!isDef && dState.preChoice === 'right') ? 0.12 : 0;
                    fpLeftPivot.position.set(-0.46, guardY + bob * 0.7, -0.82 + cockL);
                    fpRightPivot.position.set(0.46, guardY - bob * 0.7, -0.82 + cockR);
                    fpLeftPivot.rotation.set(0.18, 0.16, 0.12);
                    fpRightPivot.rotation.set(0.18, -0.16, -0.12);
                }
            } else if (dState.mode === 'slowmo') {
                dState.animElapsed += dt;
                const t = dState.animElapsed;
                const imp = dState.impactAt;
                const atkSign = dState.attackDir === 'left' ? -1 : 1;
                const dodgeSign = dState.dodgeDir === 'left' ? -1 : 1;

                // Normalized slow-motion travel curve: windup (0..0.18) -> extension (0.18..1.0 at impact) -> hold/retract
                let reach = 0;
                if (t < imp * 0.2) {
                    reach = -0.18 * (t / (imp * 0.2));
                } else if (t <= imp) {
                    const u = (t - imp * 0.2) / (imp * 0.8);
                    reach = -0.18 + 1.18 * smoothstep(0, 1, u);
                } else {
                    const after = Math.min(1, (t - imp) / Math.max(0.4, dState.animDuration - imp));
                    reach = 1.0 - 0.55 * smoothstep(0, 1, after);
                }
                dState.fpPunchProgress = Math.max(dState.fpPunchProgress, reach);

                // Weave curve for head/face movement toward selected dodge direction
                const weaveU = t <= imp
                    ? smoothstep(0.08, 0.96, t / imp)
                    : 1.0 - 0.25 * smoothstep(0, 1, (t - imp) / Math.max(0.4, dState.animDuration - imp));

                if (!dState.impactTriggered && t >= imp) {
                    dState.impactTriggered = true;
                    if (dState.hit) {
                        dState.shakeTime = 0.42;
                        dState.shakeMag = dState.povRole === 'defender' ? 0.14 : 0.08;
                        if (dState.povRole === 'defender') {
                            spawn3DImpactFX(dodgeSign * 0.46, 2.08, 1.35, true);
                        } else {
                            if (oppChar) {
                                oppChar.normalFaceGroup.visible = false;
                                oppChar.duelFaceGroup.visible = true;
                            }
                            spawn3DImpactFX(dodgeSign * 0.48, 2.16, 0.05, true);
                        }
                    } else {
                        const slipX = dState.povRole === 'defender' ? -dodgeSign * 0.46 : dodgeSign * 0.52;
                        const slipZ = dState.povRole === 'defender' ? 1.35 : -0.25;
                        spawn3DImpactFX(slipX, 2.12, slipZ, false);
                    }
                }

                let shakeX = 0, shakeY = 0;
                if (dState.shakeTime > 0) {
                    dState.shakeTime = Math.max(0, dState.shakeTime - dt);
                    const k = (dState.shakeTime / 0.42) * dState.shakeMag;
                    shakeX = Math.sin(t * 68) * k;
                    shakeY = Math.cos(t * 57) * k;
                }

                if (dState.povRole === 'defender') {
                    // DEFENDER FIRST-PERSON POV:
                    // My camera (head/face) weaves toward dodgeSign; Opponent in front throws slow-mo punch into atkSign!
                    const hitRecoilZ = (dState.hit && t >= imp) ? Math.sin(Math.min(1, (t - imp) / 0.45) * Math.PI) * 0.28 : 0;
                    const myCamX = dodgeSign * 0.56 * weaveU + shakeX;
                    const myCamY = 2.22 - 0.11 * weaveU + shakeY;
                    const myCamZ = 2.18 + hitRecoilZ;

                    dCamera.position.set(myCamX, myCamY, myCamZ);
                    dCamera.lookAt(myCamX * 0.45, 2.10, -0.35);
                    dCamera.rotation.z = -dodgeSign * 0.16 * weaveU + (dState.hit && t >= imp ? dodgeSign * 0.18 : 0);
                    syncFpRigToCamera();

                    dState.oppHeadOffsetX = myCamX;

                    if (fpLeftPivot && fpRightPivot) {
                        fpLeftPivot.position.set(-0.46, -0.36, -0.78);
                        fpRightPivot.position.set(0.46, -0.36, -0.78);
                        fpLeftPivot.rotation.set(0.24, 0.2, 0.18);
                        fpRightPivot.rotation.set(0.24, -0.2, -0.18);
                    }

                    if (oppRoot && oppChar) {
                        const lungeZ = -0.45 + Math.max(0, reach) * 0.85;
                        oppRoot.position.set(atkSign * 0.14 * Math.max(0, reach), 0.90, lungeZ);
                        oppRoot.rotation.set(0.08 * Math.max(0, reach), -atkSign * 0.18 * Math.max(0, reach), 0);

                        const punchArm = atkSign < 0 ? oppChar.leftArm : oppChar.rightArm;
                        const guardArm = atkSign < 0 ? oppChar.rightArm : oppChar.leftArm;
                        const pGlove = atkSign < 0 ? oppLeftGlove : oppRightGlove;
                        const gGlove = atkSign < 0 ? oppRightGlove : oppLeftGlove;

                        // Extend attacker's chosen arm straight toward defender's face plane in slow-mo!
                        punchArm.position.set(
                            atkSign * (0.52 - 0.04 * Math.max(0, reach)),
                            0.80 + 0.36 * Math.max(0, reach),
                            0.18 + Math.max(0, reach) * 0.82
                        );
                        punchArm.rotation.set(-Math.PI / 2 - 0.06, 0, 0);
                        if (pGlove) pGlove.scale.setScalar(1.05 + Math.max(0, reach) * 0.42);

                        guardArm.position.set(-atkSign * 0.56, 0.76, 0.14);
                        guardArm.rotation.set(-2.15, -atkSign * 0.25, -atkSign * 0.35);
                        if (gGlove) gGlove.scale.setScalar(1.05);
                    }
                } else {
                    // ATTACKER (or SPECTATOR) FIRST-PERSON POV:
                    // Defender stands in front of me; my chosen arm punches in slow-mo while Defender moves their face toward dodgeSign!
                    const baseZ = dState.povRole === 'spectator' ? 2.46 : 2.18;
                    const camLungeZ = baseZ - Math.max(0, reach) * 0.36;
                    dCamera.position.set(atkSign * 0.06 * Math.max(0, reach) + shakeX, 2.22 + shakeY, camLungeZ);
                    dCamera.lookAt(0, 2.12, -0.45);
                    dCamera.rotation.z = -atkSign * 0.035 * Math.max(0, reach);
                    syncFpRigToCamera();

                    if (fpLeftPivot && fpRightPivot) {
                        const activePivot = atkSign < 0 ? fpLeftPivot : fpRightPivot;
                        const idlePivot = atkSign < 0 ? fpRightPivot : fpLeftPivot;
                        const rClamped = Math.max(-0.18, reach);

                        // Smooth slow-mo fist extension right to opponent's face plane!
                        activePivot.position.set(
                            atkSign * (0.46 - 0.06 * Math.max(0, rClamped)),
                            -0.40 + 0.34 * Math.max(0, rClamped),
                            -0.82 - 1.05 * rClamped
                        );
                        activePivot.rotation.set(
                            0.18 - 0.32 * Math.max(0, rClamped),
                            -atkSign * 0.08,
                            -atkSign * 0.55 * Math.max(0, rClamped)
                        );

                        idlePivot.position.set(-atkSign * 0.48, -0.46, -0.78);
                        idlePivot.rotation.set(0.22, atkSign * 0.16, atkSign * 0.14);
                    }

                    if (oppRoot && oppChar) {
                        const postHitU = (dState.hit && t >= imp) ? Math.min(1, (t - imp) / 0.32) : 0;
                        const bodyShiftX = dodgeSign * 0.42 * weaveU + (dState.hit ? dodgeSign * 0.12 * postHitU : 0);
                        const bodyDuckY = (!dState.hit ? -0.09 * weaveU : 0);
                        const bodyRecoilZ = -0.45 - (dState.hit ? 0.38 * Math.sin(postHitU * Math.PI * 0.85) : 0);

                        oppRoot.position.set(bodyShiftX, 0.90 + bodyDuckY, bodyRecoilZ);
                        oppRoot.rotation.set(
                            dState.hit ? -0.26 * postHitU : 0.06 * weaveU,
                            dodgeSign * 0.16 * weaveU,
                            -dodgeSign * 0.18 * weaveU - (dState.hit ? dodgeSign * 0.22 * postHitU : 0)
                        );

                        // Explicit face/head movement toward chosen dodge direction!
                        oppChar.headGroup.position.set(dodgeSign * 0.11 * weaveU, 1.30, 0);
                        oppChar.headGroup.rotation.set(
                            dState.hit ? -0.42 * postHitU : 0.04 * weaveU,
                            dodgeSign * 0.24 * weaveU - (dState.hit ? dodgeSign * 0.45 * postHitU : 0),
                            -dodgeSign * 0.22 * weaveU
                        );
                        dState.oppHeadOffsetX = bodyShiftX + dodgeSign * 0.11 * weaveU;

                        // Defender guard arms shift with dodge
                        oppChar.leftArm.position.set(-0.56, 0.76, 0.14);
                        oppChar.rightArm.position.set(0.56, 0.76, 0.14);
                        oppChar.leftArm.rotation.set(-2.05 + postHitU * 0.8, 0.25, 0.35 + postHitU * 0.5);
                        oppChar.rightArm.rotation.set(-2.05 + postHitU * 0.8, -0.25, -0.35 - postHitU * 0.5);
                    }
                }
            } else if (dState.mode === 'coin_toss') {
                dState.animElapsed += dt;
                const t = dState.animElapsed;
                const launchT = dState.coinSoundAt;
                const catchT = 2.48;

                if (t < launchT) {
                    // Referee prepares & flicks thumb upward
                    const prep = t / launchT;
                    dCamera.position.set(0, 2.18, 2.55);
                    dCamera.lookAt(0, 2.02, 0.15);
                    dCamera.rotation.z = 0;
                    if (refereeChar) {
                        refereeChar.rightArm.rotation.set(-1.25 - prep * 0.45, 0, -0.08);
                    }
                    if (coinGroup) {
                        coinGroup.position.set(0.45, 2.02 - Math.sin(prep * Math.PI) * 0.12, 0.62);
                        coinSpinGroup.rotation.set(0, 0, 0);
                    }
                } else if (t < catchT) {
                    // Coin shoots way up into the arena sky ("동전을 저 하늘 위로 팅군 다음")!
                    if (!dState.coinLaunched) {
                        dState.coinLaunched = true;
                        if (refereeChar) refereeChar.rightArm.rotation.set(-2.55, 0, -0.05);
                    }
                    const u = (t - launchT) / (catchT - launchT); // 0 -> 1
                    const arc = Math.sin(u * Math.PI);
                    const coinY = THREE.MathUtils.lerp(2.05, 2.14, u) + arc * 7.25; // Peaks at y ≈ 9.35 high in stadium sky!
                    const coinX = THREE.MathUtils.lerp(0.45, 0.0, smoothstep(0, 0.65, u));
                    const coinZ = THREE.MathUtils.lerp(0.62, 1.42, smoothstep(0.35, 1.0, u));
                    if (coinY > dState.coinPeakY) dState.coinPeakY = coinY;

                    if (coinGroup) {
                        coinGroup.position.set(coinX, coinY, coinZ);
                        const targetYaw = dState.coinResult === 'heads' ? 0 : Math.PI;
                        coinSpinGroup.rotation.set(u * Math.PI * 16, targetYaw * smoothstep(0.55, 1.0, u), 0);
                    }

                    // Camera tilts up to track the coin soaring into the stadium lights, then frames close-up reveal
                    const camY = 2.18 + arc * 0.45;
                    const camZ = THREE.MathUtils.lerp(2.55, 2.28, smoothstep(0.5, 1.0, u));
                    dCamera.position.set(0, camY, camZ);
                    dCamera.lookAt(coinX * 0.5, Math.min(8.6, coinY), coinZ * 0.5);
                } else {
                    // Close-up dramatic settle showing HEADS (앞면) or TAILS (뒷면) squarely!
                    const settleU = Math.min(1, (t - catchT) / 0.35);
                    const targetYaw = dState.coinResult === 'heads' ? 0 : Math.PI;
                    if (coinGroup) {
                        coinGroup.position.set(0, 2.14 + Math.sin(nowSec * 4) * 0.015, 1.44);
                        coinSpinGroup.rotation.set(0, targetYaw, (1 - settleU) * 0.25 * Math.sin(t * 28));
                        if (coinGlowRing) {
                            coinGlowRing.material.color.setHex(dState.coinResult === 'heads' ? 0xfacc15 : 0x60a5fa);
                            coinGlowRing.material.opacity = 0.72 + Math.sin(nowSec * 8) * 0.2;
                            coinGlowRing.scale.setScalar(1 + 0.08 * Math.sin(nowSec * 6));
                        }
                    }
                    dCamera.position.set(0, 2.15, 2.26);
                    dCamera.lookAt(0, 2.14, 1.44);
                }
            }

            dRenderer.render(dScene, dCamera);
        }

        function setVisible(show) {
            dVisible = !!show;
            if (show) {
                if (dClock) dClock.getDelta();
                handleResize();
                if (!dRafId) dRafId = requestAnimationFrame(animateDuel);
            } else {
                if (dRafId) {
                    cancelAnimationFrame(dRafId);
                    dRafId = null;
                }
                clearParticles();
                dState.mode = 'idle';
            }
        }

        return {
            init: init,
            setVisible: setVisible,
            handleResize: handleResize,
            setRoundPOV: setRoundPOV,
            setPreChoice: setPreChoice,
            playSlowMoRound: playSlowMoRound,
            playCoinToss: playCoinToss,
            getDebugState: () => ({
                initialized: dInitialized,
                visible: dVisible,
                mode: dState.mode,
                povRole: dState.povRole,
                isFinalMatch: dState.isFinalMatch,
                preChoice: dState.preChoice,
                attackDir: dState.attackDir,
                dodgeDir: dState.dodgeDir,
                hit: dState.hit,
                coinResult: dState.coinResult,
                coinPeakY: Number(dState.coinPeakY.toFixed(2)),
                oppHeadOffsetX: Number(dState.oppHeadOffsetX.toFixed(3)),
                fpPunchProgress: Number(dState.fpPunchProgress.toFixed(3)),
                oppBruisedVisible: !!(oppChar && oppChar.duelFaceGroup && oppChar.duelFaceGroup.visible),
                cameraPos: dCamera ? {
                    x: Number(dCamera.position.x.toFixed(2)),
                    y: Number(dCamera.position.y.toFixed(2)),
                    z: Number(dCamera.position.z.toFixed(2))
                } : null
            })
        };
    }());

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
            while (activeSaltAnims.length > 0) {
                finishSaltAnimImmediate(activeSaltAnims.pop());
            }
            while (activeOctopusAnims.length > 0) {
                finishOctopusAnimImmediate(activeOctopusAnims.pop());
            }
        }
    }

    function zoomByDelta(deltaRadius) {
        if (!isInitialized) return;
        const d = Number(deltaRadius);
        if (!Number.isFinite(d)) return;
        userHasZoomed = true;
        targetSpherical.radius = Math.max(9, Math.min(56, targetSpherical.radius + d));
    }

    function setZoomRadius(nextRadius) {
        if (!isInitialized) return;
        const r = Number(nextRadius);
        if (!Number.isFinite(r) || r <= 0) return;
        userHasZoomed = true;
        targetSpherical.radius = Math.max(9, Math.min(56, r));
    }

    // ─────────────────────────────────────────────────────────────
    // 14-C. 3D Underwater Octopus Haerujil Arena ("낙지잡아와")
    // ─────────────────────────────────────────────────────────────
    const octopusArena = (function () {
        let oScene = null;
        let oCamera = null;
        let oRenderer = null;
        let oContainer = null;
        let oResizeObs = null;
        let oRafId = null;
        let oClock = null;
        let oVisible = false;
        let oInitialized = false;
        let oLastBufW = 0;
        let oLastBufH = 0;

        let diverRoot = null;
        let diverChar = null;
        let gearRig = null;
        let emergeRoot = null;
        let octoProp = null;
        let bombProp = null;
        let ambientBubbles = [];
        let kelpMeshes = [];
        const oParticles = [];

        const oState = {
            mode: 'waiting', // 'waiting' | 'caught' | 'bomb_explode' | 'drowning'
            peeking: false,
            peekKind: 'octopus',
            peekStartPerf: 0,
            peekElapsed: 0,
            peekDuration: 0.285,
            lastPeekProgress: 0,
            grabStartPerf: 0,
            grabEndPerf: 0,
            grabDuration: 0.34,
            whiffEndPerf: 0,
            whiffTimer: 0,
            explodeStartPerf: 0,
            explodeElapsed: 0,
            drownStartPerf: 0,
            drownElapsed: 0,
            drownDuration: 2.8,
            gurgleSpawned: false,
            shakeTime: 0,
            shakeMag: 0,
            lastStepPerf: 0
        };

        // Fast emerge (0..0.42) followed by ~22% slower retract (0.42..1.0) so players can react cleanly
        function evalOctopusPeekCurve(u) {
            const c = clamp01(u);
            if (c < 0.42) return Math.sin((c / 0.42) * (Math.PI / 2));
            return Math.cos(((c - 0.42) / 0.58) * (Math.PI / 2));
        }

        function buildUnderwaterBomb3D() {
            const g = new THREE.Group();
            const bodyMat = createMat(0x111827, 0.35, 0.55);
            const bandMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
            const collarMat = createMat(0x64748b, 0.3, 0.7);

            const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 16), bodyMat);
            g.add(body);

            const badge = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), bandMat);
            badge.scale.set(0.4, 1.0, 1.0);
            badge.position.set(-0.30, 0.02, 0);
            g.add(badge);

            const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.12, 10), collarMat);
            collar.position.set(0, 0.31, 0);
            g.add(collar);

            const curve = new THREE.QuadraticBezierCurve3(
                new THREE.Vector3(0, 0.36, 0),
                new THREE.Vector3(0.09, 0.52, 0.03),
                new THREE.Vector3(0.18, 0.48, 0.05)
            );
            const fuse = new THREE.Mesh(
                new THREE.TubeGeometry(curve, 8, 0.024, 6, false),
                createMat(0xd97706, 0.65)
            );
            g.add(fuse);

            const spark = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.09, 0),
                new THREE.MeshBasicMaterial({ color: 0xfacc15 })
            );
            spark.position.set(0.18, 0.48, 0.05);
            g.add(spark);
            g.userData.spark = spark;
            return g;
        }

        function buildUnderwaterEnv() {
            const seabedGeo = new THREE.PlaneGeometry(16, 10, 20, 12);
            seabedGeo.rotateX(-Math.PI / 2);
            const pos = seabedGeo.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                const vx = pos.getX(i);
                const vz = pos.getZ(i);
                pos.setY(i, Math.sin(vx * 0.8) * 0.08 + Math.cos(vz * 0.9) * 0.06);
            }
            seabedGeo.computeVertexNormals();
            const seabed = new THREE.Mesh(
                seabedGeo,
                createMat(0x1f3a4d, 0.95, 0.02)
            );
            seabed.position.set(0, -1.32, 0);
            oScene.add(seabed);

            // Sun rays filtering down from surface
            for (let r = 0; r < 4; r++) {
                const ray = new THREE.Mesh(
                    new THREE.ConeGeometry(0.65 + r * 0.08, 4.4, 12, 1, true),
                    new THREE.MeshBasicMaterial({
                        color: 0x7dd3fc,
                        transparent: true,
                        opacity: 0.065,
                        side: THREE.DoubleSide,
                        depthWrite: false
                    })
                );
                ray.position.set(-1.9 + r * 1.25, 0.9, -0.9);
                ray.rotation.z = -0.18;
                oScene.add(ray);
            }

            // Underwater Pipe on the right (where octopus & bomb emerge toward -X)
            const pipeGroup = new THREE.Group();
            pipeGroup.position.set(1.62, -0.22, 0);
            const pipeBodyMat = createMat(0x64748b, 0.42, 0.45);
            const pipeLipMat = createMat(0x94a3b8, 0.35, 0.55);
            const pipeCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 1.9, 22), pipeBodyMat);
            pipeCyl.rotation.z = Math.PI / 2;
            pipeCyl.position.x = 0.25;
            pipeGroup.add(pipeCyl);

            const pipeLip = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.26, 22), pipeLipMat);
            pipeLip.rotation.z = Math.PI / 2;
            pipeLip.position.x = -0.68;
            pipeGroup.add(pipeLip);

            const pipeBore = new THREE.Mesh(
                new THREE.CylinderGeometry(0.39, 0.39, 0.3, 20),
                new THREE.MeshBasicMaterial({ color: 0x020617 })
            );
            pipeBore.rotation.z = Math.PI / 2;
            pipeBore.position.x = -0.69;
            pipeGroup.add(pipeBore);
            oScene.add(pipeGroup);

            // Rocks beside/under pipe
            [
                [1.85, -1.12, -0.5, 0.55],
                [2.35, -1.05, 0.2, 0.72],
                [-2.2, -1.16, -0.6, 0.48],
                [0.45, -1.24, -0.8, 0.34]
            ].forEach(([rx, ry, rz, rs]) => {
                const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rs, 0), createMat(0x334155, 0.9));
                rock.position.set(rx, ry, rz);
                rock.scale.set(1.2, 0.75, 1.0);
                oScene.add(rock);
            });

            // Swaying 3D kelp stalks
            kelpMeshes = [];
            const kelpMat = createMat(0x10b981, 0.7);
            [-2.45, -2.15, 2.28, 2.55].forEach((kx, idx) => {
                const pivot = new THREE.Group();
                pivot.position.set(kx, -1.32, idx % 2 === 0 ? -0.4 : 0.35);
                const stalk = new THREE.Mesh(new THREE.ConeGeometry(0.11, 1.5 + (idx % 2) * 0.45, 7), kelpMat);
                stalk.position.y = 0.75;
                pivot.add(stalk);
                oScene.add(pivot);
                kelpMeshes.push({ pivot, phase: idx * 1.4 });
            });

            // Ambient drifting bubbles
            ambientBubbles = [];
            const bMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.45 });
            const bGeo = new THREE.SphereGeometry(0.045, 8, 8);
            for (let b = 0; b < 14; b++) {
                const bm = new THREE.Mesh(bGeo, bMat);
                const sx = -2.4 + Math.random() * 4.8;
                const sy = -1.2 + Math.random() * 2.8;
                const sz = -0.8 + Math.random() * 1.2;
                bm.position.set(sx, sy, sz);
                bm.scale.setScalar(0.6 + Math.random() * 0.9);
                bm.userData = { baseX: sx, speed: 0.45 + Math.random() * 0.55, phase: Math.random() * 6.28 };
                oScene.add(bm);
                ambientBubbles.push(bm);
            }

            // Emerging prop container
            emergeRoot = new THREE.Group();
            emergeRoot.position.set(1.18, -0.22, 0.02);
            oScene.add(emergeRoot);

            octoProp = buildCaughtOctopus3D();
            octoProp.scale.setScalar(1.25);
            octoProp.rotation.set(0, -Math.PI / 2, 0);
            octoProp.visible = false;
            emergeRoot.add(octoProp);

            bombProp = buildUnderwaterBomb3D();
            bombProp.visible = false;
            emergeRoot.add(bombProp);
        }

        function init(domContainer) {
            if (oInitialized) {
                if (domContainer && oRenderer && oRenderer.domElement.parentNode !== domContainer) {
                    oContainer = domContainer;
                    oContainer.innerHTML = '';
                    oContainer.appendChild(oRenderer.domElement);
                    handleResize();
                }
                return true;
            }
            if (typeof THREE === 'undefined' || !domContainer) return false;
            try {
                oContainer = domContainer;
                oScene = new THREE.Scene();
                oScene.background = new THREE.Color(0x042847);
                oScene.fog = new THREE.FogExp2(0x052c4d, 0.068);

                const w = oContainer.clientWidth || 440;
                const h = oContainer.clientHeight || 248;
                oCamera = new THREE.PerspectiveCamera(46, w / h, 0.1, 60);
                oCamera.position.set(0, 0.25, 4.35);
                oCamera.lookAt(0.05, -0.05, 0);

                oRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
                const rawDpr = Math.min(window.devicePixelRatio || 1, 2);
                const safeDpr = Math.max(0.5, Math.min(rawDpr, 1920 / Math.max(w, h, 1)));
                oRenderer.setPixelRatio(safeDpr);
                oRenderer.setSize(w, h, false);
                oRenderer.domElement.style.width = '100%';
                oRenderer.domElement.style.height = '100%';
                oRenderer.domElement.style.display = 'block';
                oRenderer.domElement.style.touchAction = 'none';
                oRenderer.domElement.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); }, false);
                oContainer.innerHTML = '';
                oContainer.appendChild(oRenderer.domElement);

                const hemi = new THREE.HemisphereLight(0x7dd3fc, 0x082f49, 1.0);
                oScene.add(hemi);
                const keyLight = new THREE.DirectionalLight(0xe0f2fe, 1.15);
                keyLight.position.set(1.5, 6.0, 3.5);
                oScene.add(keyLight);
                const fillLight = new THREE.PointLight(0x38bdf8, 0.85, 14);
                fillLight.position.set(0, 2.0, 1.8);
                oScene.add(fillLight);

                buildUnderwaterEnv();
                oClock = new THREE.Clock();
                if (typeof ResizeObserver !== 'undefined') {
                    oResizeObs = new ResizeObserver(() => handleResize());
                    oResizeObs.observe(oContainer);
                }
                oInitialized = true;
                return true;
            } catch (err) {
                console.warn('[OctopusArena3D] WebGL fallback to 2D:', err);
                oInitialized = false;
                return false;
            }
        }

        function handleResize() {
            if (!oInitialized || !oRenderer || !oCamera || !oContainer) return;
            const w = oContainer.clientWidth;
            const h = oContainer.clientHeight;
            if (w <= 10 || h <= 10) return;
            oCamera.aspect = w / h;
            oCamera.fov = (w / h < 1.45) ? 54 : 46;
            oCamera.updateProjectionMatrix();
            const rawDpr = Math.min(window.devicePixelRatio || 1, 2);
            const safeDpr = Math.max(0.5, Math.min(rawDpr, 1920 / Math.max(w, h, 1)));
            const bw = Math.max(1, Math.round(w * safeDpr));
            const bh = Math.max(1, Math.round(h * safeDpr));
            if (bw !== oLastBufW || bh !== oLastBufH) {
                oLastBufW = bw;
                oLastBufH = bh;
                oRenderer.setPixelRatio(safeDpr);
                oRenderer.setSize(w, h, false);
            }
        }

        function clearParticles() {
            while (oParticles.length > 0) {
                const p = oParticles.pop();
                if (p.mesh && oScene) {
                    oScene.remove(p.mesh);
                    disposeObjectGroup(p.mesh);
                }
            }
        }

        function spawnBubbles(wx, wy, wz, count, big = false) {
            if (!oScene) return;
            for (let i = 0; i < count; i++) {
                const r = (big ? 0.065 : 0.04) + Math.random() * (big ? 0.07 : 0.035);
                const mat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.85 });
                const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), mat);
                mesh.position.set(wx + (Math.random() - 0.5) * 0.25, wy + (Math.random() - 0.5) * 0.15, wz + (Math.random() - 0.5) * 0.25);
                oScene.add(mesh);
                oParticles.push({
                    kind: 'bubble',
                    mesh,
                    vx: (Math.random() - 0.5) * (big ? 0.9 : 0.4),
                    vy: (big ? 1.1 : 0.7) + Math.random() * 0.9,
                    vz: (Math.random() - 0.5) * 0.4,
                    age: 0,
                    life: big ? (1.1 + Math.random() * 0.6) : (0.7 + Math.random() * 0.4)
                });
            }
        }

        function spawnBombExplosion3D(wx, wy, wz) {
            if (!oScene) return;
            const ringMat = new THREE.MeshBasicMaterial({ color: 0xfde047, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
            const ring = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.34, 24), ringMat);
            ring.position.set(wx, wy, wz);
            oScene.add(ring);
            oParticles.push({ kind: 'ring', mesh: ring, age: 0, life: 0.65, maxScale: 4.5 });

            const cols = [0xffffff, 0xfacc15, 0xf97316, 0xef4444, 0x262626];
            for (let i = 0; i < 24; i++) {
                const mat = new THREE.MeshBasicMaterial({ color: cols[i % cols.length], transparent: true, opacity: 1 });
                const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.11 + Math.random() * 0.08, 8, 8), mat);
                mesh.position.set(wx, wy, wz);
                const ang = (i / 24) * Math.PI * 2 + Math.random() * 0.3;
                const spd = 1.6 + Math.random() * 2.4;
                oScene.add(mesh);
                oParticles.push({
                    kind: 'spark',
                    mesh,
                    vx: Math.cos(ang) * spd,
                    vy: Math.sin(ang) * spd + 0.5,
                    vz: (Math.random() - 0.5) * 1.4,
                    age: 0,
                    life: 0.72
                });
            }
        }

        function setupHunt(opts) {
            if (!oInitialized || !oScene) return;
            clearParticles();

            if (diverRoot) {
                oScene.remove(diverRoot);
                disposeObjectGroup(diverRoot);
                diverRoot = null;
                diverChar = null;
                gearRig = null;
            }

            diverRoot = new THREE.Group();
            diverRoot.position.set(-1.18, -0.18, 0);
            diverRoot.rotation.set(0, 0, -0.35);

            diverChar = buildCharacterMesh({
                name: (opts && opts.diverName) || '잠수부',
                gender: (opts && opts.diverGender) || 'M',
                splashCount: 0
            }, 0);
            diverChar.labelSprite.visible = false;
            diverChar.group.rotation.set(0, Math.PI / 2, 0);
            diverChar.group.scale.setScalar(0.84);
            diverChar.leftLeg.rotation.set(0.18, 0, 0);
            diverChar.rightLeg.rotation.set(-0.18, 0, 0);
            diverChar.leftArm.rotation.set(-0.75, 0, 0.25);
            diverChar.rightArm.rotation.set(-0.95, 0, -0.2);

            gearRig = buildDiveGearRig3D();
            if (diverChar.headGroup) {
                gearRig.maskGroup.visible = true;
                diverChar.headGroup.add(gearRig.maskGroup);
            }
            if (diverChar.group) {
                gearRig.bagGroup.visible = true;
                diverChar.group.add(gearRig.bagGroup);
            }

            diverRoot.add(diverChar.group);
            oScene.add(diverRoot);

            if (octoProp) octoProp.visible = false;
            if (bombProp) bombProp.visible = false;

            oState.mode = 'waiting';
            oState.peeking = false;
            oState.peekKind = 'octopus';
            oState.peekStartPerf = 0;
            oState.peekElapsed = 0;
            oState.lastPeekProgress = 0;
            oState.grabStartPerf = 0;
            oState.grabEndPerf = 0;
            oState.whiffEndPerf = 0;
            oState.whiffTimer = 0;
            oState.explodeStartPerf = 0;
            oState.explodeElapsed = 0;
            oState.drownStartPerf = 0;
            oState.drownElapsed = 0;
            oState.gurgleSpawned = false;
            oState.shakeTime = 0;
            oState.lastStepPerf = performance.now();
            if (oCamera) {
                oCamera.position.set(0, 0.25, 4.35);
                oCamera.lookAt(0.05, -0.05, 0);
            }
        }

        function triggerPeek(opts) {
            oState.peeking = true;
            oState.peekKind = (opts && opts.kind === 'bomb') ? 'bomb' : 'octopus';
            oState.peekStartPerf = performance.now();
            oState.peekElapsed = 0;
            oState.lastPeekProgress = 0;
            oState.peekDuration = ((opts && opts.durationMs) || 285) / 1000;
            spawnBubbles(0.82, -0.22, 0, 5, false);
        }

        function hidePeek() {
            oState.peeking = false;
            oState.lastPeekProgress = 0;
            if (octoProp && oState.mode !== 'caught') octoProp.visible = false;
            if (bombProp) bombProp.visible = false;
        }

        function triggerGrabMotion() {
            if (!oInitialized || oState.mode !== 'waiting') return;
            const now = performance.now();
            oState.grabStartPerf = now;
            oState.grabEndPerf = now + 340;
            oState.whiffEndPerf = oState.grabEndPerf;
            oState.whiffTimer = 0.34;
            spawnBubbles(-0.35, -0.08, 0, 6, false);
            if (oVisible && oRenderer && oScene && oCamera) {
                stepOctopusScene(now);
                oRenderer.render(oScene, oCamera);
            }
        }

        function triggerWhiff() {
            const now = performance.now();
            if (oState.grabEndPerf > now + 60) return;
            triggerGrabMotion();
        }

        function triggerCatch() {
            oState.mode = 'caught';
            oState.peeking = false;
            if (bombProp) bombProp.visible = false;
            if (octoProp) octoProp.visible = true;
            spawnBubbles(0.15, -0.1, 0, 14, true);
        }

        function triggerBombExplode() {
            oState.mode = 'bomb_explode';
            oState.peeking = false;
            oState.explodeStartPerf = performance.now();
            oState.explodeElapsed = 0;
            oState.shakeTime = 0.55;
            oState.shakeMag = 0.16;
            if (octoProp) octoProp.visible = false;
            if (bombProp) bombProp.visible = false;
            spawnBombExplosion3D(0.28, -0.18, 0);
            if (diverChar) {
                if (diverChar.skinMat) diverChar.skinMat.color.setHex(0x1e1e1e);
                if (diverChar.cheeks) diverChar.cheeks.forEach(c => { c.visible = false; });
                if (diverChar.normalHairGroup) diverChar.normalHairGroup.visible = false;
                if (diverChar.bombCharredHairGroup) diverChar.bombCharredHairGroup.visible = true;
                diverChar.normalFaceGroup.visible = false;
                diverChar.deadFaceGroup.visible = false;
                if (diverChar.bombFaceGroup) diverChar.bombFaceGroup.visible = true;
            }
        }

        function playDrownDeath(opts) {
            oState.mode = 'drowning';
            oState.peeking = false;
            oState.drownStartPerf = performance.now();
            oState.drownElapsed = 0;
            oState.drownDuration = ((opts && opts.durationMs) || 2800) / 1000;
            oState.gurgleSpawned = false;
            if (octoProp) octoProp.visible = false;
            if (bombProp) bombProp.visible = false;
        }

        function updateParticles(dt) {
            for (let i = oParticles.length - 1; i >= 0; i--) {
                const p = oParticles[i];
                p.age += dt;
                const u = clamp01(p.age / p.life);
                if (p.kind === 'ring') {
                    const s = 1 + (p.maxScale - 1) * (1 - Math.pow(1 - u, 3));
                    p.mesh.scale.setScalar(s);
                    p.mesh.material.opacity = (1 - u) * 0.92;
                } else if (p.kind === 'bubble') {
                    p.mesh.position.x += (p.vx + Math.sin(p.age * 10) * 0.25) * dt;
                    p.mesh.position.y += p.vy * dt;
                    p.mesh.position.z += p.vz * dt;
                    p.mesh.material.opacity = (1 - u) * 0.85;
                } else {
                    p.mesh.position.x += p.vx * dt;
                    p.mesh.position.y += p.vy * dt;
                    p.mesh.position.z += p.vz * dt;
                    p.mesh.material.opacity = 1 - u;
                    p.mesh.scale.setScalar(Math.max(0.15, 1 - u * 0.7));
                }
                if (p.age >= p.life) {
                    oScene.remove(p.mesh);
                    disposeObjectGroup(p.mesh);
                    oParticles.splice(i, 1);
                }
            }
        }

        function stepOctopusScene(nowPerf) {
            if (!oInitialized) return;
            const dt = oState.lastStepPerf > 0
                ? Math.min(0.15, Math.max(0.001, (nowPerf - oState.lastStepPerf) * 0.001))
                : 0.016;
            oState.lastStepPerf = nowPerf;
            const nowSec = nowPerf * 0.001;

            updateParticles(dt);

            // Sway kelp & drift ambient bubbles
            kelpMeshes.forEach(k => {
                k.pivot.rotation.z = Math.sin(nowSec * 1.8 + k.phase) * 0.16;
            });
            ambientBubbles.forEach(bm => {
                bm.position.y += bm.userData.speed * dt;
                bm.position.x = bm.userData.baseX + Math.sin(nowSec * 2.2 + bm.userData.phase) * 0.12;
                if (bm.position.y > 1.75) bm.position.y = -1.25;
            });

            // Wall-clock elapsed sync so animations stay locked to server/audio timers even at low FPS
            if (oState.peeking) {
                oState.peekElapsed = Math.max(0, (nowPerf - (oState.peekStartPerf || nowPerf)) * 0.001);
            }
            oState.whiffTimer = oState.whiffEndPerf > nowPerf ? (oState.whiffEndPerf - nowPerf) * 0.001 : 0;

            // Emerging octopus / bomb inside pipe
            if (oState.mode === 'caught' && octoProp && emergeRoot) {
                emergeRoot.position.set(0.05, -0.04 + Math.sin(nowSec * 10) * 0.05, 0.08);
                octoProp.visible = true;
                octoProp.rotation.y = -Math.PI / 2 + Math.sin(nowSec * 12) * 0.28;
                if (bombProp) bombProp.visible = false;
            } else if (oState.peeking && emergeRoot) {
                const p = evalOctopusPeekCurve(oState.peekElapsed / Math.max(0.05, oState.peekDuration));
                oState.lastPeekProgress = p;
                emergeRoot.position.set(THREE.MathUtils.lerp(1.22, 0.24, p), -0.22, 0.04);
                if (oState.peekKind === 'bomb') {
                    if (octoProp) octoProp.visible = false;
                    if (bombProp) {
                        bombProp.visible = p > 0.04;
                        bombProp.rotation.z = Math.sin(nowSec * 25) * 0.12;
                        if (bombProp.userData.spark) {
                            const sp = 0.8 + Math.abs(Math.sin(nowSec * 38)) * 0.85;
                            bombProp.userData.spark.scale.setScalar(sp);
                        }
                    }
                } else {
                    if (bombProp) bombProp.visible = false;
                    if (octoProp) {
                        octoProp.visible = p > 0.04;
                        octoProp.rotation.z = Math.sin(nowSec * 22) * 0.15;
                    }
                }
            } else if (emergeRoot) {
                oState.lastPeekProgress = 0;
                if (octoProp) octoProp.visible = false;
                if (bombProp) bombProp.visible = false;
            }

            // Animate 3D Diver based on current state
            if (diverRoot && diverChar) {
                if (oState.mode === 'waiting') {
                    diverRoot.position.set(-1.18, -0.18 + Math.sin(nowSec * 2.4) * 0.06, 0);
                    diverRoot.rotation.set(0, 0, -0.35 + Math.sin(nowSec * 1.9) * 0.04);
                    diverChar.leftLeg.rotation.set(Math.sin(nowSec * 5.2) * 0.25, 0, 0);
                    diverChar.rightLeg.rotation.set(-Math.sin(nowSec * 5.2) * 0.25, 0, 0);
                    if (oState.grabEndPerf > nowPerf) {
                        const gu = clamp01((nowPerf - (oState.grabStartPerf || nowPerf)) / 340);
                        const lunge = gu < 0.18
                            ? (0.55 + (gu / 0.18) * 0.45)
                            : Math.cos(((gu - 0.18) / 0.82) * (Math.PI / 2));
                        diverRoot.position.x = -1.18 + lunge * 0.44;
                        diverRoot.rotation.z = -0.35 - lunge * 0.12;
                        diverChar.rightArm.rotation.set(-1.55 - lunge * 0.48, 0, -0.08);
                        diverChar.leftArm.rotation.set(-0.95 - lunge * 0.35, 0, 0.18);
                    } else {
                        diverChar.leftArm.rotation.set(-0.75, 0, 0.25);
                        diverChar.rightArm.rotation.set(-0.95, 0, -0.2);
                    }
                } else if (oState.mode === 'caught') {
                    diverRoot.position.set(-0.82, -0.04 + Math.sin(nowSec * 8) * 0.06, 0);
                    diverRoot.rotation.set(0, 0, -0.22);
                    diverChar.rightArm.rotation.set(-1.52, 0, -0.15);
                    diverChar.leftArm.rotation.set(-2.35, 0, 0.35);
                } else if (oState.mode === 'bomb_explode') {
                    oState.explodeElapsed = Math.max(0, (nowPerf - (oState.explodeStartPerf || nowPerf)) * 0.001);
                    const u = clamp01(oState.explodeElapsed / 0.7);
                    diverRoot.position.set(THREE.MathUtils.lerp(-1.0, -1.95, u), -0.25 + Math.sin(u * Math.PI) * 0.35, 0);
                    diverRoot.rotation.set(0, 0, 0.45 * u);
                    diverChar.leftArm.rotation.set(-2.2, 0, 0.65);
                    diverChar.rightArm.rotation.set(-2.2, 0, -0.65);
                } else if (oState.mode === 'drowning') {
                    oState.drownElapsed = Math.max(0, (nowPerf - (oState.drownStartPerf || nowPerf)) * 0.001);
                    const dur = Math.max(0.4, oState.drownDuration);
                    const u = clamp01(oState.drownElapsed / dur);
                    const gurgleSplit = 0.57;

                    if (u < gurgleSplit) {
                        // Phase A: Face flushes bright red & panicky thrashing for air!
                        const flush = clamp01(u / gurgleSplit);
                        const baseCol = new THREE.Color(diverChar.originalSkinHex || 0xffdbac);
                        const redCol = new THREE.Color(0xff1e38);
                        if (diverChar.skinMat) {
                            diverChar.skinMat.color.copy(baseCol).lerp(redCol, flush);
                        }
                        if (diverChar.headGroup) {
                            diverChar.headGroup.scale.setScalar(1.0 + flush * 0.14);
                            diverChar.headGroup.rotation.set(Math.sin(nowSec * 24) * 0.22, 0, Math.cos(nowSec * 28) * 0.25);
                        }
                        const thrash = Math.sin(nowSec * 36);
                        diverRoot.position.set(-1.18 + Math.sin(nowSec * 26) * 0.09, -0.12 + Math.cos(nowSec * 28) * 0.10, 0);
                        diverRoot.rotation.set(Math.sin(nowSec * 20) * 0.24, 0, -0.25 + Math.sin(nowSec * 24) * 0.35);
                        diverChar.leftArm.rotation.set(-1.85 + thrash * 0.95, 0, 0.55);
                        diverChar.rightArm.rotation.set(-1.85 - thrash * 0.95, 0, -0.55);
                        diverChar.leftLeg.rotation.set(thrash * 0.85, 0, 0);
                        diverChar.rightLeg.rotation.set(-thrash * 0.85, 0, 0);
                        if (Math.random() < 0.22) spawnBubbles(-0.85, 0.15, 0, 1, false);
                    } else {
                        // Phase B: "꼬르륵..." bubble burst & limp sink to seabed
                        if (!oState.gurgleSpawned) {
                            oState.gurgleSpawned = true;
                            spawnBubbles(-0.82, 0.22, 0, 24, true);
                            if (diverChar.skinMat) diverChar.skinMat.color.setHex(0xc82333);
                            if (diverChar.headGroup) {
                                diverChar.headGroup.scale.setScalar(1.0);
                                diverChar.headGroup.rotation.set(0, 0, 0);
                            }
                            if (diverChar.normalFaceGroup) diverChar.normalFaceGroup.visible = false;
                            if (diverChar.deadFaceGroup) diverChar.deadFaceGroup.visible = true;
                        }
                        const sinkU = clamp01((u - gurgleSplit) / (1 - gurgleSplit));
                        const ease = sinkU * sinkU * (3 - 2 * sinkU);
                        diverRoot.position.set(-1.22, THREE.MathUtils.lerp(-0.14, -1.06, ease), 0);
                        diverRoot.rotation.set(0, 0, THREE.MathUtils.lerp(-0.25, Math.PI * 0.52, ease));
                        diverChar.leftArm.rotation.set(THREE.MathUtils.lerp(-1.4, -0.25, ease), 0, 0.45);
                        diverChar.rightArm.rotation.set(THREE.MathUtils.lerp(-1.4, -0.25, ease), 0, -0.45);
                        diverChar.leftLeg.rotation.set(0.12, 0, 0);
                        diverChar.rightLeg.rotation.set(-0.12, 0, 0);
                    }
                }
            }

            if (oCamera) {
                if (oState.shakeTime > 0) {
                    oState.shakeTime = Math.max(0, oState.shakeTime - dt);
                    const s = (oState.shakeTime / 0.55) * oState.shakeMag;
                    oCamera.position.set((Math.random() - 0.5) * s, 0.25 + (Math.random() - 0.5) * s, 4.35);
                } else {
                    oCamera.position.set(0, 0.25, 4.35);
                }
                oCamera.lookAt(0.05, -0.05, 0);
            }
        }

        function animateOctopus() {
            if (!oVisible || !oInitialized) {
                oRafId = null;
                return;
            }
            oRafId = requestAnimationFrame(animateOctopus);
            stepOctopusScene(performance.now());
            oRenderer.render(oScene, oCamera);
        }

        function setVisible(show) {
            oVisible = !!show;
            if (show) {
                if (oClock) oClock.getDelta();
                oState.lastStepPerf = performance.now();
                handleResize();
                if (!oRafId) oRafId = requestAnimationFrame(animateOctopus);
            } else {
                if (oRafId) {
                    cancelAnimationFrame(oRafId);
                    oRafId = null;
                }
                clearParticles();
                oState.mode = 'waiting';
                oState.peeking = false;
                oState.lastPeekProgress = 0;
                oState.grabStartPerf = 0;
                oState.grabEndPerf = 0;
            }
        }

        return {
            init: init,
            setVisible: setVisible,
            handleResize: handleResize,
            setupHunt: setupHunt,
            triggerPeek: triggerPeek,
            hidePeek: hidePeek,
            triggerGrabMotion: triggerGrabMotion,
            triggerWhiff: triggerWhiff,
            triggerCatch: triggerCatch,
            triggerBombExplode: triggerBombExplode,
            playDrownDeath: playDrownDeath,
            getDebugState: () => {
                if (oVisible && oInitialized && (performance.now() - oState.lastStepPerf) > 50) {
                    stepOctopusScene(performance.now());
                }
                return {
                    initialized: oInitialized,
                    visible: oVisible,
                    mode: oState.mode,
                    peeking: oState.peeking,
                    peekKind: oState.peekKind,
                    peekDuration: Number(oState.peekDuration.toFixed(3)),
                    lastPeekProgress: Number(oState.lastPeekProgress.toFixed(3)),
                    grabActive: oState.grabEndPerf > performance.now(),
                    grabStartPerf: oState.grabStartPerf,
                    diverX: diverRoot ? Number(diverRoot.position.x.toFixed(3)) : null,
                    rightArmRotX: (diverChar && diverChar.rightArm) ? Number(diverChar.rightArm.rotation.x.toFixed(3)) : null,
                    gurgleSpawned: oState.gurgleSpawned,
                    drownElapsed: Number(oState.drownElapsed.toFixed(2)),
                    diverSkinHex: (diverChar && diverChar.skinMat) ? diverChar.skinMat.color.getHexString() : null
                };
            }
        };
    }());

    return {
        init: init,
        setVisible: setVisible,
        syncPlayers: syncPlayers,
        triggerFly: triggerFly,
        triggerMissile: triggerMissile,
        triggerBombExplosion: triggerBombExplosion,
        triggerSaltAbduction: triggerSaltAbduction,
        triggerSaltReturn: triggerSaltReturn,
        triggerOctopusDive: triggerOctopusDive,
        triggerOctopusSuccessShow: triggerOctopusSuccessShow,
        triggerOctopusWaterExplosion: triggerOctopusWaterExplosion,
        showSpeechBubble: showSpeechBubble,
        updateRoamingAnimal: updateRoamingAnimal,
        handleResize: onResize,
        zoomByDelta: zoomByDelta,
        setZoomRadius: setZoomRadius,
        getTargetZoomRadius: () => targetSpherical.radius,
        duelArena: duelArena,
        octopusArena: octopusArena,
        getCameraState: () => ({
            fov: camera ? camera.fov : BASE_FOV,
            aspect: camera ? camera.aspect : 1,
            radius: spherical.radius,
            targetRadius: targetSpherical.radius,
            baselineW: baselineW,
            baselineH: baselineH,
            userHasZoomed: userHasZoomed,
            focusActive: cameraFocusState.active,
            focusRestoring: cameraFocusState.restoring,
            lookAt: {
                x: Number(currentLookAt.x.toFixed(2)),
                y: Number(currentLookAt.y.toFixed(2)),
                z: Number(currentLookAt.z.toFixed(2))
            },
            savedRadius: cameraFocusState.savedSpherical ? Number(cameraFocusState.savedSpherical.radius.toFixed(2)) : null
        }),
        getOctopusShowDebugState: () => {
            const anim = activeOctopusAnims.find(a => a && a.mode === 'show' && !a.finished);
            if (!anim) return { ...latestOctopusShowDebug, active: false, slotStandY: null, leftLegRotX: null };
            const m = anim.slot && anim.slot.avatarMeshes;
            return {
                ...latestOctopusShowDebug,
                active: true,
                slotStandY: anim.slot && anim.slot.charGroup ? Number(anim.slot.charGroup.position.y.toFixed(3)) : null,
                slotX: anim.slot && anim.slot.charGroup ? Number(anim.slot.charGroup.position.x.toFixed(3)) : null,
                slotZ: anim.slot && anim.slot.charGroup ? Number(anim.slot.charGroup.position.z.toFixed(3)) : null,
                leftLegRotX: (m && m.leftLeg) ? Number(m.leftLeg.rotation.x.toFixed(3)) : null
            };
        },
        getSlots: () => chairSlots,
        isInitialized: () => isInitialized,
        isVisible: () => isVisible
    };
}));
