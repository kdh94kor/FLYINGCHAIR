// ThreeStageManager v2.1: Robust 3D Pool & Flying Chair Renderer
// - Fixed loop re-trigger bug in triggerFly (ensures clean gator & shark despawn & 100% idle chair return)
// - 3D Speech Bubble with depthTest: false, renderOrder: 999 for crystal-clear readability
// - High-detail 3D Crocodile, 3D Shark, 3D Seagull with 3D Death-Roll & Breach
// - Responsive Mobile Framing (all 6 chairs & pool in view, dynamic fly camera tracking)

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

    // Entities
    let poolMesh, waterMesh, deckGroup;
    const chairSlots = []; // 6 slots: { index, x, z, chairGroup, hinge, seat, back, base, charGroup, player, currentAnim, bubbleSprite }
    let sharkEntity = null;
    let gatorEntity = null;
    let gullEntity = null;
    const activeParticles = [];

    let clock = null;

    // Camera control variables (Smooth Orbit & Adaptive Framing)
    let isDragging = false;
    let prevMouseX = 0, prevMouseY = 0;
    let baseRadius = 28;
    let spherical = { radius: 28, theta: 0, phi: Math.PI / 4.4 };
    let targetSpherical = { radius: 28, theta: 0, phi: Math.PI / 4.4 };
    let currentLookAt = { x: 0, y: 1.8, z: 0 };
    let targetLookAt = { x: 0, y: 1.8, z: 0 };

    const MALE_COLORS = [0x3498db, 0x2980b9, 0x1abc9c, 0x16a085, 0x34495e, 0x2c3e50];
    const FEMALE_COLORS = [0xe84393, 0xfd79a8, 0xe17055, 0xd63031, 0x9b59b6, 0x8e44ad];

    function createMat(color, roughness = 0.5, metalness = 0.1) {
        return new THREE.MeshStandardMaterial({
            color: color,
            roughness: roughness,
            metalness: metalness
        });
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
        scene.background = new THREE.Color(0x74b9ff);
        scene.fog = new THREE.FogExp2(0x74b9ff, 0.012);

        const w = containerEl.clientWidth || (containerEl.parentElement ? containerEl.parentElement.clientWidth : 800) || 800;
        const h = containerEl.clientHeight || (containerEl.parentElement ? containerEl.parentElement.clientHeight : 500) || 500;
        const aspect = w / h;

        // Auto-frame for mobile portrait (w < h): push camera back so all 6 chairs fit
        if (aspect < 0.85) {
            baseRadius = 35;
            spherical.radius = 35;
            targetSpherical.radius = 35;
            spherical.phi = Math.PI / 4.1;
            targetSpherical.phi = Math.PI / 4.1;
        } else if (aspect < 1.2) {
            baseRadius = 30;
            spherical.radius = 30;
            targetSpherical.radius = 30;
        } else {
            baseRadius = 26;
            spherical.radius = 26;
            targetSpherical.radius = 26;
        }

        camera = new THREE.PerspectiveCamera(48, aspect, 0.1, 1000);
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
        buildChairs();
        buildAnimals();
        setupControls(canvas);
        window.addEventListener('resize', onResize);

        isInitialized = true;
        console.log('[ThreeStageManager] Initialized v2.1 with Robust State & Bubble Engine.');
    }

    // ─────────────────────────────────────────────────────────────
    // 2. Lighting Setup
    // ─────────────────────────────────────────────────────────────
    function setupLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.82);
        scene.add(ambient);

        const sun = new THREE.DirectionalLight(0xfffaed, 0.95);
        sun.position.set(12, 28, 18);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 1024;
        sun.shadow.mapSize.height = 1024;
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 80;
        const d = 22;
        sun.shadow.camera.left = -d;
        sun.shadow.camera.right = d;
        sun.shadow.camera.top = d;
        sun.shadow.camera.bottom = -d;
        scene.add(sun);

        const waterGlow = new THREE.PointLight(0x00cec9, 0.5, 35);
        waterGlow.position.set(0, 1.2, -4);
        scene.add(waterGlow);
    }

    // ─────────────────────────────────────────────────────────────
    // 3. Environment: Pool & Wooden Deck
    // ─────────────────────────────────────────────────────────────
    function buildEnvironment() {
        const poolGroup = new THREE.Group();

        // Floor basin & walls
        const basinFloor = new THREE.Mesh(new THREE.BoxGeometry(26, 0.6, 17), createMat(0x00cec9, 0.25));
        basinFloor.position.set(0, -4.5, -3.5);
        basinFloor.receiveShadow = true;
        poolGroup.add(basinFloor);

        const wallMat = createMat(0x0984e3, 0.35);
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(26, 5, 0.8), wallMat);
        backWall.position.set(0, -2, -12);
        backWall.receiveShadow = true;
        poolGroup.add(backWall);

        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5, 17), wallMat);
        leftWall.position.set(-13, -2, -3.5);
        poolGroup.add(leftWall);

        const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5, 17), wallMat);
        rightWall.position.set(13, -2, -3.5);
        poolGroup.add(rightWall);

        // Water surface
        const waterGeo = new THREE.PlaneGeometry(26, 17, 24, 24);
        waterGeo.rotateX(-Math.PI / 2);
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x0984e3,
            roughness: 0.08,
            metalness: 0.15,
            transparent: true,
            opacity: 0.68,
            side: THREE.DoubleSide
        });
        waterMesh = new THREE.Mesh(waterGeo, waterMat);
        waterMesh.position.set(0, 0, -3.5);
        waterMesh.receiveShadow = true;
        poolGroup.add(waterMesh);

        scene.add(poolGroup);
        poolMesh = poolGroup;

        // Wooden Deck Platform
        deckGroup = new THREE.Group();
        const deckFloor = new THREE.Mesh(new THREE.BoxGeometry(26, 1.2, 6.5), createMat(0xd2b48c, 0.65, 0.05));
        deckFloor.position.set(0, 0.6, 7.2);
        deckFloor.receiveShadow = true;
        deckFloor.castShadow = true;
        deckGroup.add(deckFloor);

        for (let i = -12; i <= 12; i += 2) {
            const line = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 6.4), createMat(0xb89870, 0.8));
            line.position.set(i, 1.23, 7.2);
            deckGroup.add(line);
        }

        // Chrome Railing
        const railMat = createMat(0xffffff, 0.25, 0.85);
        const railBar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 26, 16), railMat);
        railBar.rotation.z = Math.PI / 2;
        railBar.position.set(0, 2.5, 10.3);
        deckGroup.add(railBar);

        for (let x = -12; x <= 12; x += 4) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5, 12), railMat);
            post.position.set(x, 1.85, 10.3);
            deckGroup.add(post);
        }

        scene.add(deckGroup);
    }

    // ─────────────────────────────────────────────────────────────
    // 4. Flying Chairs (6 Compact Slots)
    // ─────────────────────────────────────────────────────────────
    function buildChairs() {
        const chairSpacing = 3.3; // Compact 3.3m: All 6 chairs span 16.5m (fits mobile portrait nicely!)
        const totalChairs = 6;
        const startX = -((totalChairs - 1) * chairSpacing) / 2;

        for (let i = 0; i < totalChairs; i++) {
            const slotX = startX + i * chairSpacing;
            const slotZ = 6.6;

            const chairGroup = new THREE.Group();
            chairGroup.position.set(slotX, 1.2, slotZ);

            // Metal Pedestal
            const base = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.9, 0.35, 16), createMat(0x2d3436, 0.4, 0.7));
            base.position.y = 0.18;
            base.castShadow = true;
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

            chairSlots.push({
                index: i,
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
            });
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 5. 3D Character Avatar & Speech Bubble Builder
    // ─────────────────────────────────────────────────────────────
    function buildCharacterMesh(player, slotIndex) {
        const group = new THREE.Group();
        const isFemale = player.gender === 'female';
        const palette = isFemale ? FEMALE_COLORS : MALE_COLORS;
        const bodyColor = palette[slotIndex % palette.length];

        // Head
        const skinMat = createMat(0xffdbac, 0.6);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.58, 18, 18), skinMat);
        head.position.y = 1.3;
        head.castShadow = true;
        group.add(head);

        // Hair
        const hairMat = createMat(isFemale ? 0x6c5ce7 : 0x2d3436, 0.8);
        const hair = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
        hair.position.y = 1.38;
        group.add(hair);

        // Eyes
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eyeMat);
        leftEye.position.set(-0.2, 1.32, -0.52);
        group.add(leftEye);
        const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), eyeMat);
        rightEye.position.set(0.2, 1.32, -0.52);
        group.add(rightEye);

        // Torso
        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.48, 0.95, 16), createMat(bodyColor, 0.6));
        torso.position.y = 0.45;
        torso.castShadow = true;
        group.add(torso);

        // Arms
        const armMat = createMat(bodyColor, 0.6);
        const armGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.72, 10);
        const leftArm = new THREE.Mesh(armGeo, armMat);
        leftArm.position.set(-0.6, 0.45, -0.12);
        leftArm.rotation.x = -Math.PI / 4;
        group.add(leftArm);
        const rightArm = new THREE.Mesh(armGeo, armMat);
        rightArm.position.set(0.6, 0.45, -0.12);
        rightArm.rotation.x = -Math.PI / 4;
        group.add(rightArm);

        // Legs
        const pantsMat = createMat(0x34495e, 0.7);
        const legGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.72, 10);
        const leftLeg = new THREE.Mesh(legGeo, pantsMat);
        leftLeg.position.set(-0.25, -0.18, -0.32);
        leftLeg.rotation.x = -Math.PI / 2;
        group.add(leftLeg);
        const rightLeg = new THREE.Mesh(legGeo, pantsMat);
        rightLeg.position.set(0.25, -0.18, -0.32);
        rightLeg.rotation.x = -Math.PI / 2;
        group.add(rightLeg);

        // 3D Nickname Sprite
        const labelSprite = createNameLabel(player.name || '플레이어');
        labelSprite.position.set(0, 2.2, 0);
        group.add(labelSprite);

        return {
            group: group,
            head: head,
            leftEye: leftEye,
            rightEye: rightEye,
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
        canvas.width = 512;
        canvas.height = 160;
        renderBubbleCanvas(canvas, text);
        const texture = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false, // Never occluded by 3D geometry!
            depthWrite: false
        });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(4.8, 1.5, 1);
        sprite.renderOrder = 999; // Always on top of everything
        sprite.userData = { canvas: canvas, texture: texture };
        return sprite;
    }

    function renderBubbleCanvas(canvas, text) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!text) return;

        const x = 16, y = 12, w = 480, h = 105, r = 24;

        // Drop Shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 6;

        // Bubble body
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#ff4757';
        ctx.lineWidth = 4;

        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        // Tail
        ctx.lineTo(x + w / 2 + 18, y + h);
        ctx.lineTo(x + w / 2, y + h + 28);
        ctx.lineTo(x + w / 2 - 18, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Reset shadow for text
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        ctx.font = 'bold 30px Pretendard, sans-serif';
        ctx.fillStyle = '#1e272e';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const display = text.length > 18 ? text.substring(0, 18) + '...' : text;
        ctx.fillText(display, x + w / 2, y + h / 2 - 2);
    }

    // ─────────────────────────────────────────────────────────────
    // 6. Animals: 3D High-Detail Shark, Gator, Seagull
    // ─────────────────────────────────────────────────────────────
    function buildAnimals() {
        // 6-1. 🦈 High-Detail 3D Shark
        const sharkGroup = new THREE.Group();
        const sharkMat = createMat(0x4b6584, 0.4, 0.2);
        const sharkBellyMat = createMat(0xf1f2f6, 0.5, 0.1);

        const sharkBody = new THREE.Mesh(new THREE.ConeGeometry(0.95, 3.8, 16), sharkMat);
        sharkBody.rotateX(Math.PI / 2);
        sharkGroup.add(sharkBody);

        const belly = new THREE.Mesh(new THREE.ConeGeometry(0.85, 3.2, 16), sharkBellyMat);
        belly.rotateX(Math.PI / 2);
        belly.position.y = -0.15;
        sharkGroup.add(belly);

        const headGroup = new THREE.Group();
        headGroup.position.set(0, 0, 1.8);
        const snout = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.4, 12), sharkMat);
        snout.rotateX(-Math.PI / 2);
        snout.position.set(0, 0.1, 0.5);
        headGroup.add(snout);

        const lowerJaw = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.2, 12), sharkBellyMat);
        lowerJaw.rotateX(-Math.PI / 2);
        lowerJaw.position.set(0, -0.25, 0.4);
        headGroup.add(lowerJaw);
        sharkGroup.add(headGroup);

        const finShape = new THREE.Shape();
        finShape.moveTo(0, 0);
        finShape.lineTo(0.35, 1.6);
        finShape.quadraticCurveTo(0.2, 0.9, -0.7, 0);
        finShape.closePath();
        const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.12, bevelEnabled: false });
        finGeo.rotateY(Math.PI / 2);
        finGeo.translate(-0.06, 0.35, 0.1);
        const finMesh = new THREE.Mesh(finGeo, sharkMat);
        sharkGroup.add(finMesh);

        const lPec = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 8), sharkMat);
        lPec.rotation.set(0, 0, Math.PI / 3);
        lPec.position.set(-0.9, -0.15, 0.4);
        sharkGroup.add(lPec);
        const rPec = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.4, 8), sharkMat);
        rPec.rotation.set(0, 0, -Math.PI / 3);
        rPec.position.set(0.9, -0.15, 0.4);
        sharkGroup.add(rPec);

        const tailJoint = new THREE.Group();
        tailJoint.position.set(0, 0, -1.8);
        const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.8, 1.0), sharkMat);
        tailFin.position.set(0, 0, -0.5);
        tailJoint.add(tailFin);
        sharkGroup.add(tailJoint);

        sharkGroup.position.set(0, -0.4, -4);
        sharkGroup.visible = false;
        scene.add(sharkGroup);
        sharkEntity = {
            group: sharkGroup,
            headGroup: headGroup,
            lowerJaw: lowerJaw,
            tailJoint: tailJoint,
            isRoaming: false,
            roamTime: 0,
            activeAttackAnim: null
        };

        // 6-2. 🐊 3D Crocodile / Gator
        const gatorGroup = new THREE.Group();
        const gatorMat = createMat(0x1e824c, 0.7);
        const gatorBellyMat = createMat(0x82ccdd, 0.6);

        const upperJaw = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 2.4), gatorMat);
        upperJaw.position.set(0, 0.1, 1.1);
        gatorGroup.add(upperJaw);

        const gLowerJaw = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 2.2), gatorBellyMat);
        gLowerJaw.position.set(0, -0.18, 1.0);
        gatorGroup.add(gLowerJaw);

        const eyeMat = createMat(0xf1c40f, 0.2);
        const gLeftEye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), eyeMat);
        gLeftEye.position.set(-0.38, 0.36, 0.3);
        gatorGroup.add(gLeftEye);
        const gRightEye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), eyeMat);
        gRightEye.position.set(0.38, 0.36, 0.3);
        gatorGroup.add(gRightEye);

        const gBody = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.6, 2.4), gatorMat);
        gBody.position.set(0, 0, -1.2);
        gatorGroup.add(gBody);

        for (let rz = -0.4; rz >= -2.0; rz -= 0.5) {
            const ridge = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 4), createMat(0x145a32, 0.8));
            ridge.position.set(0.25, 0.45, rz);
            gatorGroup.add(ridge);
            const ridge2 = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 4), createMat(0x145a32, 0.8));
            ridge2.position.set(-0.25, 0.45, rz);
            gatorGroup.add(ridge2);
        }

        const gTailJoint = new THREE.Group();
        gTailJoint.position.set(0, -0.05, -2.4);
        const gTail = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 2.0), gatorMat);
        gTail.position.set(0, 0, -1.0);
        gTailJoint.add(gTail);
        gatorGroup.add(gTailJoint);

        gatorGroup.position.set(-5, -0.15, -5);
        gatorGroup.visible = false;
        scene.add(gatorGroup);
        gatorEntity = {
            group: gatorGroup,
            lowerJaw: gLowerJaw,
            tailJoint: gTailJoint,
            isRoaming: false,
            roamTime: 0,
            activeAttackAnim: null
        };

        // 6-3. 🦅 3D Seagull
        const gullGroup = new THREE.Group();
        const birdMat = createMat(0xf5f6fa, 0.5);

        const gullBody = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.8, 12), birdMat);
        gullBody.rotateX(Math.PI / 2);
        gullGroup.add(gullBody);

        const beak = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 8), createMat(0xf39c12, 0.3));
        beak.rotateX(-Math.PI / 2);
        beak.position.set(0, 0.05, -1.1);
        gullGroup.add(beak);

        const leftWingJoint = new THREE.Group();
        leftWingJoint.position.set(-0.35, 0.12, -0.1);
        const lWing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.65), createMat(0xdcdde1, 0.5));
        lWing.position.set(-0.9, 0, 0);
        leftWingJoint.add(lWing);
        gullGroup.add(leftWingJoint);

        const rightWingJoint = new THREE.Group();
        rightWingJoint.position.set(0.35, 0.12, -0.1);
        const rWing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.65), createMat(0xdcdde1, 0.5));
        rWing.position.set(0.9, 0, 0);
        rightWingJoint.add(rWing);
        gullGroup.add(rightWingJoint);

        gullGroup.position.set(0, 14, -4);
        gullGroup.visible = false;
        scene.add(gullGroup);
        gullEntity = {
            group: gullGroup,
            leftWingJoint: leftWingJoint,
            rightWingJoint: rightWingJoint,
            isRoaming: false,
            roamAngle: 0,
            activeAttackAnim: null
        };
    }

    // ─────────────────────────────────────────────────────────────
    // 7. Controls & Dynamic Camera Tracking
    // ─────────────────────────────────────────────────────────────
    function setupControls(canvas) {
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
            targetSpherical.phi = Math.max(0.15, Math.min(Math.PI / 2.3, targetSpherical.phi));
            targetSpherical.theta = Math.max(-Math.PI / 3.0, Math.min(Math.PI / 3.0, targetSpherical.theta));
        }

        function onPointerUp() { isDragging = false; }

        function onWheel(e) {
            targetSpherical.radius += e.deltaY * 0.02;
            targetSpherical.radius = Math.max(16, Math.min(45, targetSpherical.radius));
            e.preventDefault();
        }

        canvas.addEventListener('mousedown', onPointerDown);
        window.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);

        canvas.addEventListener('touchstart', onPointerDown, { passive: true });
        window.addEventListener('touchmove', onPointerMove, { passive: true });
        window.addEventListener('touchend', onPointerUp);
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

        if (aspect < 0.85) {
            targetSpherical.radius = 35;
        } else if (aspect < 1.2) {
            targetSpherical.radius = 30;
        } else {
            targetSpherical.radius = 26;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 8. Player Sync & Immediate Clean Seating Recovery
    // ─────────────────────────────────────────────────────────────
    function syncPlayers(players) {
        if (!isInitialized) return;
        const list = players || [];

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

                // When player becomes healthy seated or idle: ALWAYS immediately reset to chair!
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
        } else if (status === 'dead' || status === 'dead-gator') {
            hinge.rotation.x = -1.3;
            charGroup.position.set(slot.x, -0.6, -2.5);
            charGroup.rotation.z = Math.PI / 2;
        } else if (status === 'snatched') {
            hinge.rotation.x = -1.3;
            charGroup.position.set(slot.x, 13, -3);
        } else if (status === 'dead-missile') {
            hinge.rotation.x = -0.5;
            charGroup.position.set(slot.x, 2.4, slot.z + 0.1);
            charGroup.rotation.x = -0.8;
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
            slot.avatarMeshes.leftLeg.rotation.x = -Math.PI / 2;
            slot.avatarMeshes.rightLeg.rotation.x = -Math.PI / 2;
            slot.avatarMeshes.leftArm.rotation.x = -Math.PI / 4;
            slot.avatarMeshes.rightArm.rotation.x = -Math.PI / 4;
        }
        slot.currentAnim = null;
    }

    // ─────────────────────────────────────────────────────────────
    // 9. 3D Flying & Attack Animations (With Bug-Free Lifecycle)
    // ─────────────────────────────────────────────────────────────
    function triggerFly(playerId, specialEvent) {
        if (!isInitialized) return;
        const slot = chairSlots.find(s => s.player && s.player.id === playerId);
        if (!slot) return;

        const startTime = clock.getElapsedTime();
        const startPos = { x: slot.x, y: 2.4, z: slot.z + 0.1 };
        const landingPos = { x: slot.x + (Math.random() * 1.5 - 0.75), y: 0.2, z: -2.5 };

        // Dynamic Camera Focus on Flying Player
        targetLookAt.x = slot.x * 0.45;
        targetLookAt.y = 3.5;

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

                const arcY = Math.sin(progress * Math.PI) * 9.5;
                const curX = startPos.x + (landingPos.x - startPos.x) * progress;
                const curZ = startPos.z + (landingPos.z - startPos.z) * progress;
                const curY = startPos.y + (landingPos.y - startPos.y) * progress + arcY;

                slot.charGroup.position.set(curX, curY, curZ);
                slot.charGroup.rotation.x = progress * Math.PI * 4;

                if (progress >= 1) {
                    // CRITICAL FIX: Invalidate current flying anim so it never loops!
                    slot.currentAnim = null;
                    createWaterSplash(landingPos.x, 0, landingPos.z);
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

    // 9-B. 🦈 3D Shark Breach & Submerge Attack
    function triggerSharkAttack(slot, pos) {
        if (!sharkEntity) return;
        sharkEntity.group.visible = true;
        sharkEntity.group.position.set(pos.x + 6, -0.4, pos.z - 3);
        const attackStart = clock.getElapsedTime();

        sharkEntity.activeAttackAnim = {
            startTime: attackStart,
            update: (time) => {
                const el = time - attackStart;
                if (el < 0.9) {
                    const t = el / 0.9;
                    sharkEntity.group.position.x = (pos.x + 6) * (1 - t) + pos.x * t;
                    sharkEntity.group.position.z = (pos.z - 3) * (1 - t) + pos.z * t;
                    sharkEntity.group.lookAt(pos.x, 0, pos.z);
                    if (sharkEntity.lowerJaw) sharkEntity.lowerJaw.rotation.x = t * 0.45;
                } else if (el < 2.0) {
                    const breachT = (el - 0.9) / 1.1;
                    const leapY = Math.sin(breachT * Math.PI) * 2.2;
                    sharkEntity.group.position.y = -0.4 + leapY;

                    slot.charGroup.position.set(pos.x, -0.3 - breachT * 1.5, pos.z);
                    slot.charGroup.rotation.z = Math.PI / 2;

                    if (breachT > 0.4 && !sharkEntity.splashed) {
                        createBloodSplash(pos.x, 0, pos.z);
                        sharkEntity.splashed = true;
                    }
                } else {
                    sharkEntity.group.visible = false;
                    sharkEntity.splashed = false;
                    sharkEntity.activeAttackAnim = null;
                    targetLookAt.x = 0;
                    targetLookAt.y = 1.8;
                }
            }
        };
    }

    // 9-C. 🐊 3D Crocodile Death-Roll Attack
    function triggerGatorAttack(slot, pos) {
        if (!gatorEntity) return;
        gatorEntity.group.visible = true;
        gatorEntity.group.position.set(pos.x - 6, -0.15, pos.z);
        const attackStart = clock.getElapsedTime();

        gatorEntity.activeAttackAnim = {
            startTime: attackStart,
            update: (time) => {
                const el = time - attackStart;
                if (el < 0.8) {
                    const t = el / 0.8;
                    gatorEntity.group.position.x = (pos.x - 6) * (1 - t) + pos.x * t;
                    gatorEntity.group.lookAt(pos.x, 0, pos.z);
                    if (gatorEntity.lowerJaw) gatorEntity.lowerJaw.rotation.x = -t * 0.4;
                } else if (el < 2.4) {
                    // Death Roll: 360-degree spin
                    const rollT = el - 0.8;
                    gatorEntity.group.rotation.z = rollT * Math.PI * 6;
                    slot.charGroup.rotation.z = rollT * Math.PI * 6;
                    slot.charGroup.position.set(pos.x, -0.2, pos.z);
                    if (Math.random() < 0.3) {
                        createWaterSplash(pos.x, 0, pos.z, 0.45);
                    }
                } else {
                    createBloodSplash(pos.x, 0, pos.z);
                    gatorEntity.group.visible = false;
                    gatorEntity.group.rotation.set(0, 0, 0);
                    gatorEntity.activeAttackAnim = null;
                    targetLookAt.x = 0;
                    targetLookAt.y = 1.8;
                }
            }
        };
    }

    // 9-D. 🦅 3D Seagull Swoop & Snatch
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

                    gullEntity.group.position.set(skyX, skyY, skyZ);
                    slot.charGroup.position.set(skyX, skyY - 0.85, skyZ);
                    slot.charGroup.rotation.z = Math.sin(time * 12) * 0.3;
                } else {
                    gullEntity.activeAttackAnim = null;
                    slot.currentAnim = null;
                    targetLookAt.x = 0;
                    targetLookAt.y = 1.8;
                }
            }
        };
    }

    // 9-E. Normal Swim & Return Walk
    function triggerSwimAndReturn(slot, landingPos) {
        const swimStart = clock.getElapsedTime();
        const deckEdgeZ = 4.2;

        slot.currentAnim = {
            type: 'swim_return',
            startTime: swimStart,
            update: (time) => {
                const el = time - swimStart;
                if (el < 1.8) {
                    const t = el / 1.8;
                    const curZ = landingPos.z * (1 - t) + deckEdgeZ * t;
                    slot.charGroup.position.set(slot.x, -0.25, curZ);
                    if (slot.avatarMeshes) {
                        slot.avatarMeshes.leftArm.rotation.x = Math.sin(time * 10) * 1.2;
                        slot.avatarMeshes.rightArm.rotation.x = -Math.sin(time * 10) * 1.2;
                    }
                } else if (el < 3.4) {
                    const walkT = (el - 1.8) / 1.6;
                    const curZ = deckEdgeZ * (1 - walkT) + (slot.z + 0.1) * walkT;
                    slot.charGroup.position.set(slot.x, 2.4, curZ);
                    if (slot.avatarMeshes) {
                        slot.avatarMeshes.leftLeg.rotation.x = Math.sin(time * 12) * 0.8;
                        slot.avatarMeshes.rightLeg.rotation.x = -Math.sin(time * 12) * 0.8;
                    }
                } else {
                    resetSlotToSeat(slot);
                    targetLookAt.x = 0;
                    targetLookAt.y = 1.8;
                }
            }
        };
    }

    // ─────────────────────────────────────────────────────────────
    // 10. 3D Speech Bubble System
    // ─────────────────────────────────────────────────────────────
    function showSpeechBubble(playerId, text) {
        if (!isInitialized) return;
        const slot = chairSlots.find(s => s.player && s.player.id === playerId);
        if (!slot || !slot.bubbleSprite) return;

        const { canvas, texture } = slot.bubbleSprite.userData;
        renderBubbleCanvas(canvas, text);
        texture.needsUpdate = true;
        slot.bubbleSprite.visible = true;

        if (slot.bubbleTimeout) clearTimeout(slot.bubbleTimeout);
        slot.bubbleTimeout = setTimeout(() => {
            slot.bubbleSprite.visible = false;
        }, 3400);
    }

    // ─────────────────────────────────────────────────────────────
    // 11. 3D Particles
    // ─────────────────────────────────────────────────────────────
    function createWaterSplash(x, y, z, scale = 1.0) {
        const count = 26;
        const pGeo = new THREE.SphereGeometry(0.12 * scale, 6, 6);
        const pMat = new THREE.MeshBasicMaterial({ color: 0xe0f7fa, transparent: true, opacity: 0.85 });

        for (let i = 0; i < count; i++) {
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
        const pMat = new THREE.MeshBasicMaterial({ color: 0xc0392b, transparent: true, opacity: 0.9 });

        for (let i = 0; i < count; i++) {
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
    // 12. Roaming Animals
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
    // 13. Main Render Loop
    // ─────────────────────────────────────────────────────────────
    function animate() {
        if (!isVisible) return;
        animFrameId = requestAnimationFrame(animate);

        const delta = clock.getDelta();
        const time = clock.getElapsedTime();

        updateCameraPosition();

        if (waterMesh && waterMesh.geometry) {
            const posAttr = waterMesh.geometry.attributes.position;
            for (let i = 0; i < posAttr.count; i++) {
                const u = posAttr.getX(i);
                const v = posAttr.getY(i);
                const waveY = Math.sin(u * 0.4 + time * 2.4) * 0.11 + Math.cos(v * 0.4 + time * 1.8) * 0.09;
                posAttr.setZ(i, waveY);
            }
            posAttr.needsUpdate = true;
        }

        if (sharkEntity && sharkEntity.isRoaming && !sharkEntity.activeAttackAnim) {
            sharkEntity.roamTime += delta;
            const t = sharkEntity.roamTime * 0.5;
            sharkEntity.group.position.set(Math.sin(t) * 8.5, -0.38, -4.5 + Math.cos(t * 1.5) * 2.2);
            sharkEntity.group.rotation.y = Math.cos(t) > 0 ? -Math.PI / 2 : Math.PI / 2;
            sharkEntity.tailJoint.rotation.y = Math.sin(time * 6) * 0.45;
        }

        if (gatorEntity && gatorEntity.isRoaming && !gatorEntity.activeAttackAnim) {
            gatorEntity.roamTime += delta;
            const gt = gatorEntity.roamTime * 0.35;
            gatorEntity.group.position.set(Math.sin(gt) * 7.0, -0.15, -3.5 + Math.sin(gt * 2) * 1.2);
            gatorEntity.group.rotation.y = Math.cos(gt) > 0 ? Math.PI / 2 : -Math.PI / 2;
            gatorEntity.tailJoint.rotation.y = Math.sin(time * 4) * 0.35;
        }

        if (gullEntity) {
            const flap = Math.sin(time * 12) * 0.45;
            gullEntity.leftWingJoint.rotation.z = flap;
            gullEntity.rightWingJoint.rotation.z = -flap;

            if (gullEntity.isRoaming && !gullEntity.activeAttackAnim) {
                gullEntity.roamAngle += delta * 0.38;
                const rX = Math.sin(gullEntity.roamAngle) * 9.5;
                const rZ = -3.5 + Math.cos(gullEntity.roamAngle) * 5.5;
                gullEntity.group.position.set(rX, 13.0 + Math.sin(time * 2) * 0.7, rZ);
                gullEntity.group.rotation.y = gullEntity.roamAngle + Math.PI / 2;
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

        for (let i = activeParticles.length - 1; i >= 0; i--) {
            const p = activeParticles[i];
            p.life -= delta;
            if (p.life <= 0) {
                scene.remove(p);
                activeParticles.splice(i, 1);
            } else {
                p.position.addScaledVector(p.velocity, delta);
                p.velocity.y -= p.gravity * delta;
                p.material.opacity = p.life / p.maxLife;
            }
        }

        renderer.render(scene, camera);
    }

    // ─────────────────────────────────────────────────────────────
    // 14. Visibility
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
        }
    }

    return {
        init: init,
        setVisible: setVisible,
        syncPlayers: syncPlayers,
        triggerFly: triggerFly,
        showSpeechBubble: showSpeechBubble,
        updateRoamingAnimal: updateRoamingAnimal,
        handleResize: onResize,
        getSlots: () => chairSlots,
        isInitialized: () => isInitialized,
        isVisible: () => isVisible
    };
}));
