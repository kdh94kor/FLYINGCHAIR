// ThreeStageManager: 3D Pool & Flying Chair Renderer for Flying Chair Online
// Stylized Low-Poly Three.js Engine with Full Sync for Chairs, Characters, Shark, Gator, and Seagull.

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

    // Groups & Entities
    let poolMesh, waterMesh, deckGroup;
    const chairSlots = []; // array of 6 slots: { chairGroup, hinge, seat, back, base, charGroup, player, currentAnim }
    let sharkEntity = null;
    let gatorEntity = null;
    let gullEntity = null;
    const activeParticles = []; // list of active particle meshes / emitters

    // Water wave clock
    let clock = null;

    // Camera control variables (Smooth Orbit & Pan)
    let isDragging = false;
    let prevMouseX = 0, prevMouseY = 0;
    let spherical = { radius: 26, theta: 0, phi: Math.PI / 4.2 }; // theta: horizontal, phi: vertical
    let targetSpherical = { radius: 26, theta: 0, phi: Math.PI / 4.2 };
    const centerLookAt = { x: 0, y: 2, z: 0 };

    // Player Colors by Gender & Index
    const MALE_COLORS = [0x3498db, 0x2980b9, 0x1abc9c, 0x16a085, 0x34495e, 0x2c3e50];
    const FEMALE_COLORS = [0xe84393, 0xfd79a8, 0xe17055, 0xd63031, 0x9b59b6, 0x8e44ad];

    // Helper: Material creator
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

        // 1-1. Scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x87CEEB); // Sky blue
        scene.fog = new THREE.FogExp2(0x87CEEB, 0.015);

        // 1-2. Camera
        const aspect = (containerEl.clientWidth || 800) / (containerEl.clientHeight || 500);
        camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
        updateCameraPosition();

        // 1-3. Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        renderer.setSize(containerEl.clientWidth || 800, containerEl.clientHeight || 500);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Ensure canvas fills container
        const canvas = renderer.domElement;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
        containerEl.appendChild(canvas);

        // 1-4. Lights
        setupLights();

        // 1-5. Environment (Pool, Water, Deck)
        buildEnvironment();

        // 1-6. 6 Flying Chair Slots
        buildChairs();

        // 1-7. Animals (Shark, Gator, Seagull)
        buildAnimals();

        // 1-8. Event Listeners (Resize & Orbit Controls)
        setupControls(canvas);
        window.addEventListener('resize', onResize);

        isInitialized = true;
        console.log('[ThreeStageManager] Initialized successfully in 3D mode.');
    }

    // ─────────────────────────────────────────────────────────────
    // 2. Lighting Setup
    // ─────────────────────────────────────────────────────────────
    function setupLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.75);
        scene.add(ambient);

        const sun = new THREE.DirectionalLight(0xfff6e5, 0.85);
        sun.position.set(15, 30, 20);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 1024;
        sun.shadow.mapSize.height = 1024;
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 100;
        const d = 25;
        sun.shadow.camera.left = -d;
        sun.shadow.camera.right = d;
        sun.shadow.camera.top = d;
        sun.shadow.camera.bottom = -d;
        scene.add(sun);

        const waterReflect = new THREE.PointLight(0x00cec9, 0.45, 40);
        waterReflect.position.set(0, 1, -5);
        scene.add(waterReflect);
    }

    // ─────────────────────────────────────────────────────────────
    // 3. Environment: Pool & Wooden Deck
    // ─────────────────────────────────────────────────────────────
    function buildEnvironment() {
        // Pool Tub
        const poolGroup = new THREE.Group();

        // Pool floor
        const floorGeo = new THREE.BoxGeometry(32, 1, 24);
        const floorMat = createMat(0x27ae60, 0.6); // grass around
        const grassMesh = new THREE.Mesh(floorGeo, floorMat);
        grassMesh.position.set(0, -5, -4);
        grassMesh.receiveShadow = true;
        poolGroup.add(grassMesh);

        // Pool basin floor (inside water)
        const basinFloorGeo = new THREE.BoxGeometry(28, 0.5, 18);
        const basinFloorMat = createMat(0x1abc9c, 0.3); // turquoise tile
        const basinFloor = new THREE.Mesh(basinFloorGeo, basinFloorMat);
        basinFloor.position.set(0, -4.5, -4);
        basinFloor.receiveShadow = true;
        poolGroup.add(basinFloor);

        // Pool basin walls
        const wallMat = createMat(0x16a085, 0.3);
        // Back wall
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(28, 5, 0.8), wallMat);
        backWall.position.set(0, -2, -13);
        backWall.receiveShadow = true;
        poolGroup.add(backWall);
        // Left wall
        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5, 18), wallMat);
        leftWall.position.set(-14, -2, -4);
        poolGroup.add(leftWall);
        // Right wall
        const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5, 18), wallMat);
        rightWall.position.set(14, -2, -4);
        poolGroup.add(rightWall);

        // Water surface with wavy vertices
        const waterGeo = new THREE.PlaneGeometry(28, 18, 24, 24);
        waterGeo.rotateX(-Math.PI / 2);
        const waterMat = new THREE.MeshStandardMaterial({
            color: 0x0984e3,
            roughness: 0.1,
            metalness: 0.15,
            transparent: true,
            opacity: 0.68,
            side: THREE.DoubleSide
        });
        waterMesh = new THREE.Mesh(waterGeo, waterMat);
        waterMesh.position.set(0, 0, -4);
        waterMesh.receiveShadow = true;
        poolGroup.add(waterMesh);

        scene.add(poolGroup);
        poolMesh = poolGroup;

        // Wooden Deck (Where the chairs sit)
        deckGroup = new THREE.Group();
        const deckFloorGeo = new THREE.BoxGeometry(28, 1.2, 7);
        const deckFloorMat = createMat(0xd2b48c, 0.6, 0.05); // warm tan wood
        const deckFloor = new THREE.Mesh(deckFloorGeo, deckFloorMat);
        deckFloor.position.set(0, 0.6, 7.5);
        deckFloor.receiveShadow = true;
        deckFloor.castShadow = true;
        deckGroup.add(deckFloor);

        // Wood planks decorative lines
        for (let i = -13; i <= 13; i += 2) {
            const lineGeo = new THREE.BoxGeometry(0.06, 0.05, 6.9);
            const lineMat = createMat(0xb89870, 0.8);
            const line = new THREE.Mesh(lineGeo, lineMat);
            line.position.set(i, 1.23, 7.5);
            deckGroup.add(line);
        }

        // Safety Railing along the back of the deck
        const railMat = createMat(0xffffff, 0.3, 0.8); // chrome white
        const railBar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 28, 16), railMat);
        railBar.rotation.z = Math.PI / 2;
        railBar.position.set(0, 2.6, 10.8);
        deckGroup.add(railBar);

        for (let x = -13; x <= 13; x += 4.3) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 12), railMat);
            post.position.set(x, 1.9, 10.8);
            deckGroup.add(post);
        }

        scene.add(deckGroup);
    }

    // ─────────────────────────────────────────────────────────────
    // 4. Flying Chairs (6 Slots)
    // ─────────────────────────────────────────────────────────────
    function buildChairs() {
        const chairSpacing = 4.2;
        const totalChairs = 6;
        const startX = -((totalChairs - 1) * chairSpacing) / 2;

        for (let i = 0; i < totalChairs; i++) {
            const slotX = startX + i * chairSpacing;
            const slotZ = 6.8;

            const chairGroup = new THREE.Group();
            chairGroup.position.set(slotX, 1.2, slotZ);

            // Metal Base Pedestal
            const baseGeo = new THREE.CylinderGeometry(0.8, 1.1, 0.4, 16);
            const metalMat = createMat(0x2d3436, 0.4, 0.7);
            const base = new THREE.Mesh(baseGeo, metalMat);
            base.position.y = 0.2;
            base.castShadow = true;
            base.receiveShadow = true;
            chairGroup.add(base);

            // Hydraulic Piston Cylinder
            const pistonGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.9, 16);
            const pistonMat = createMat(0x636e72, 0.2, 0.9);
            const piston = new THREE.Mesh(pistonGeo, pistonMat);
            piston.position.y = 0.7;
            chairGroup.add(piston);

            // Hinge Group (Rotates backwards when flying)
            const hinge = new THREE.Group();
            hinge.position.set(0, 1.15, -0.4); // hinge pivot point behind seat
            chairGroup.add(hinge);

            // Seat Cushion
            const seatGeo = new THREE.BoxGeometry(1.6, 0.35, 1.6);
            const seatMat = createMat(0xd63031, 0.7); // vibrant red chair
            const seat = new THREE.Mesh(seatGeo, seatMat);
            seat.position.set(0, 0.175, 0.4);
            seat.castShadow = true;
            hinge.add(seat);

            // Backrest
            const backGeo = new THREE.BoxGeometry(1.6, 2.2, 0.3);
            const backMat = createMat(0xd63031, 0.7);
            const back = new THREE.Mesh(backGeo, backMat);
            back.position.set(0, 1.3, -0.3);
            back.castShadow = true;
            hinge.add(back);

            // Armrests
            const armMat = createMat(0x2d3436, 0.5, 0.5);
            const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 1.2), armMat);
            leftArm.position.set(-0.85, 0.65, 0.4);
            hinge.add(leftArm);
            const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 1.2), armMat);
            rightArm.position.set(0.85, 0.65, 0.4);
            hinge.add(rightArm);

            scene.add(chairGroup);

            // Character Group attached to slot
            const charGroup = new THREE.Group();
            charGroup.position.set(slotX, 2.5, slotZ + 0.1);
            charGroup.visible = false;
            scene.add(charGroup);

            chairSlots.push({
                index: i,
                x: slotX,
                z: slotZ,
                chairGroup: chairGroup,
                hinge: hinge,
                seat: seat,
                back: back,
                charGroup: charGroup,
                player: null,
                isTilted: false,
                currentAnim: null,
                avatarMeshes: null
            });
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 5. 3D Character Avatar Builder
    // ─────────────────────────────────────────────────────────────
    function buildCharacterMesh(player, slotIndex) {
        const group = new THREE.Group();
        const isFemale = player.gender === 'female';
        const palette = isFemale ? FEMALE_COLORS : MALE_COLORS;
        const bodyColor = palette[slotIndex % palette.length];

        // Head
        const skinMat = createMat(0xffdbac, 0.6);
        const headGeo = new THREE.SphereGeometry(0.65, 20, 20);
        const head = new THREE.Mesh(headGeo, skinMat);
        head.position.y = 1.35;
        head.castShadow = true;
        group.add(head);

        // Hair / Hat
        const hairMat = createMat(isFemale ? 0x6c5ce7 : 0x2d3436, 0.8);
        const hairGeo = new THREE.SphereGeometry(0.68, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const hair = new THREE.Mesh(hairGeo, hairMat);
        hair.position.y = 1.45;
        group.add(hair);

        // Eyes
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const eyeGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.22, 1.38, -0.6);
        group.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.22, 1.38, -0.6);
        group.add(rightEye);

        // Torso / Shirt
        const torsoMat = createMat(bodyColor, 0.6);
        const torsoGeo = new THREE.CylinderGeometry(0.5, 0.55, 1.1, 16);
        const torso = new THREE.Mesh(torsoGeo, torsoMat);
        torso.position.y = 0.45;
        torso.castShadow = true;
        group.add(torso);

        // Arms
        const armMat = createMat(bodyColor, 0.6);
        const armGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.8, 10);
        const leftArm = new THREE.Mesh(armGeo, armMat);
        leftArm.position.set(-0.7, 0.45, -0.15);
        leftArm.rotation.x = -Math.PI / 4;
        group.add(leftArm);
        const rightArm = new THREE.Mesh(armGeo, armMat);
        rightArm.position.set(0.7, 0.45, -0.15);
        rightArm.rotation.x = -Math.PI / 4;
        group.add(rightArm);

        // Legs (Seated pose by default)
        const pantsMat = createMat(0x34495e, 0.7);
        const legGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.8, 10);
        const leftLeg = new THREE.Mesh(legGeo, pantsMat);
        leftLeg.position.set(-0.3, -0.2, -0.4);
        leftLeg.rotation.x = -Math.PI / 2;
        group.add(leftLeg);
        const rightLeg = new THREE.Mesh(legGeo, pantsMat);
        rightLeg.position.set(0.3, -0.2, -0.4);
        rightLeg.rotation.x = -Math.PI / 2;
        group.add(rightLeg);

        // 3D Nickname Label (Canvas Sprite)
        const labelSprite = createNameLabel(player.name || '플레이어');
        labelSprite.position.set(0, 2.4, 0);
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

    // Helper: Canvas-rendered 3D text sprite for nicknames
    function createNameLabel(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.roundRect ? ctx.roundRect(8, 8, 240, 48, 16) : ctx.rect(8, 8, 240, 48);
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
        const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(3, 0.75, 1);
        return sprite;
    }

    // ─────────────────────────────────────────────────────────────
    // 6. Animals: Shark, Gator, Seagull
    // ─────────────────────────────────────────────────────────────
    function buildAnimals() {
        // 6-1. 🦈 Shark (Sleek predatory body with fin and jaws)
        const sharkGroup = new THREE.Group();

        // Main body
        const sharkMat = createMat(0x57606f, 0.4, 0.2); // Slate grey shark skin
        const bodyGeo = new THREE.ConeGeometry(0.9, 3.2, 16);
        bodyGeo.rotateX(Math.PI / 2);
        const sharkBody = new THREE.Mesh(bodyGeo, sharkMat);
        sharkGroup.add(sharkBody);

        // Dorsal Fin (The iconic fin cutting through water)
        const finShape = new THREE.Shape();
        finShape.moveTo(0, 0);
        finShape.lineTo(0.3, 1.4);
        finShape.quadraticCurveTo(0.2, 0.8, -0.6, 0);
        finShape.closePath();
        const extrudeSettings = { depth: 0.12, bevelEnabled: false };
        const finGeo = new THREE.ExtrudeGeometry(finShape, extrudeSettings);
        finGeo.rotateY(Math.PI / 2);
        finGeo.translate(-0.06, 0.3, 0.2);
        const finMesh = new THREE.Mesh(finGeo, sharkMat);
        sharkGroup.add(finMesh);

        // Pectoral Fins
        const lPec = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.2, 8), sharkMat);
        lPec.rotation.set(0, 0, Math.PI / 3);
        lPec.position.set(-0.8, -0.1, 0.3);
        sharkGroup.add(lPec);
        const rPec = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.2, 8), sharkMat);
        rPec.rotation.set(0, 0, -Math.PI / 3);
        rPec.position.set(0.8, -0.1, 0.3);
        sharkGroup.add(rPec);

        // Tail Joint (Wiggles when swimming)
        const tailJoint = new THREE.Group();
        tailJoint.position.set(0, 0, -1.5);
        const tailFinGeo = new THREE.BoxGeometry(0.1, 1.6, 0.9);
        const tailFin = new THREE.Mesh(tailFinGeo, sharkMat);
        tailFin.position.set(0, 0, -0.4);
        tailJoint.add(tailFin);
        sharkGroup.add(tailJoint);

        // Shark position & state
        sharkGroup.position.set(0, -0.4, -4); // Sitting just below water surface so fin pokes out
        sharkGroup.visible = false;
        scene.add(sharkGroup);
        sharkEntity = {
            group: sharkGroup,
            tailJoint: tailJoint,
            isRoaming: false,
            roamTime: 0,
            activeAttackAnim: null
        };

        // 6-2. 🐊 Gator (Crocodile with scaly back and snout)
        const gatorGroup = new THREE.Group();
        const gatorMat = createMat(0x1e824c, 0.7); // Deep reptile green
        // Snout
        const snoutGeo = new THREE.BoxGeometry(0.9, 0.35, 2.2);
        const snout = new THREE.Mesh(snoutGeo, gatorMat);
        snout.position.set(0, 0, 0.8);
        gatorGroup.add(snout);
        // Eyes (protruding above water)
        const eyeMat = createMat(0xf1c40f, 0.2); // yellow slit eyes
        const gLeftEye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), eyeMat);
        gLeftEye.position.set(-0.35, 0.25, 0.2);
        gatorGroup.add(gLeftEye);
        const gRightEye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), eyeMat);
        gRightEye.position.set(0.35, 0.25, 0.2);
        gatorGroup.add(gRightEye);
        // Body
        const gBodyGeo = new THREE.BoxGeometry(1.2, 0.5, 2.0);
        const gBody = new THREE.Mesh(gBodyGeo, gatorMat);
        gBody.position.set(0, -0.1, -1.0);
        gatorGroup.add(gBody);
        // Tail
        const gTailJoint = new THREE.Group();
        gTailJoint.position.set(0, -0.1, -2.0);
        const gTail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 1.8), gatorMat);
        gTail.position.set(0, 0, -0.9);
        gTailJoint.add(gTail);
        gatorGroup.add(gTailJoint);

        gatorGroup.position.set(-5, -0.15, -6);
        gatorGroup.visible = false;
        scene.add(gatorGroup);
        gatorEntity = {
            group: gatorGroup,
            tailJoint: gTailJoint,
            isRoaming: false,
            roamTime: 0,
            activeAttackAnim: null
        };

        // 6-3. 🦅 Seagull (White bird with flapping wings soaring in the sky)
        const gullGroup = new THREE.Group();
        const birdMat = createMat(0xf5f6fa, 0.5);
        // Body
        const gullBodyGeo = new THREE.ConeGeometry(0.45, 1.6, 10);
        gullBodyGeo.rotateX(Math.PI / 2);
        const gullBody = new THREE.Mesh(gullBodyGeo, birdMat);
        gullGroup.add(gullBody);
        // Beak
        const beakMat = createMat(0xf39c12, 0.3);
        const beakGeo = new THREE.ConeGeometry(0.15, 0.6, 8);
        beakGeo.rotateX(-Math.PI / 2);
        const beak = new THREE.Mesh(beakGeo, beakMat);
        beak.position.set(0, 0.05, -0.9);
        gullGroup.add(beak);

        // Wings
        const wingMat = createMat(0xdcdde1, 0.5);
        const wingGeo = new THREE.BoxGeometry(1.6, 0.06, 0.6);
        const leftWingJoint = new THREE.Group();
        leftWingJoint.position.set(-0.35, 0.1, -0.1);
        const leftWing = new THREE.Mesh(wingGeo, wingMat);
        leftWing.position.set(-0.8, 0, 0);
        leftWingJoint.add(leftWing);
        gullGroup.add(leftWingJoint);

        const rightWingJoint = new THREE.Group();
        rightWingJoint.position.set(0.35, 0.1, -0.1);
        const rightWing = new THREE.Mesh(wingGeo, wingMat);
        rightWing.position.set(0.8, 0, 0);
        rightWingJoint.add(rightWing);
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
    // 7. Controls: Smooth Orbit & Touch Dragging
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

            // Rotate camera horizontally (theta) and vertically (phi)
            targetSpherical.theta -= deltaX * 0.007;
            targetSpherical.phi -= deltaY * 0.007;

            // Clamp vertical rotation so we never go under the floor or directly overhead
            targetSpherical.phi = Math.max(0.15, Math.min(Math.PI / 2.3, targetSpherical.phi));
            // Limit horizontal angle to comfortable 90 degrees studio view
            targetSpherical.theta = Math.max(-Math.PI / 3.2, Math.min(Math.PI / 3.2, targetSpherical.theta));
        }

        function onPointerUp() {
            isDragging = false;
        }

        function onWheel(e) {
            targetSpherical.radius += e.deltaY * 0.02;
            targetSpherical.radius = Math.max(16, Math.min(38, targetSpherical.radius));
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
        // Damping / interpolation
        spherical.theta += (targetSpherical.theta - spherical.theta) * 0.1;
        spherical.phi += (targetSpherical.phi - spherical.phi) * 0.1;
        spherical.radius += (targetSpherical.radius - spherical.radius) * 0.1;

        const x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
        const y = spherical.radius * Math.cos(spherical.phi);
        const z = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);

        camera.position.set(x + centerLookAt.x, y + centerLookAt.y, z + centerLookAt.z);
        camera.lookAt(centerLookAt.x, centerLookAt.y, centerLookAt.z);
    }

    function onResize() {
        if (!renderer || !containerEl || !camera) return;
        const width = containerEl.clientWidth || 800;
        const height = containerEl.clientHeight || 500;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }

    // ─────────────────────────────────────────────────────────────
    // 8. Player Synchronization
    // ─────────────────────────────────────────────────────────────
    function syncPlayers(players) {
        if (!isInitialized) return;
        const list = players || [];

        chairSlots.forEach((slot, index) => {
            const player = list[index];
            if (player) {
                // Check if avatar needs to be constructed
                if (!slot.avatarMeshes || slot.player?.id !== player.id || slot.player?.name !== player.name) {
                    if (slot.charGroup.children.length > 0) {
                        while (slot.charGroup.children.length > 0) {
                            slot.charGroup.remove(slot.charGroup.children[0]);
                        }
                    }
                    slot.avatarMeshes = buildCharacterMesh(player, index);
                    slot.charGroup.add(slot.avatarMeshes.group);
                }
                slot.player = player;
                slot.charGroup.visible = true;

                // Sync status if not in the middle of a custom flying sequence
                if (!slot.currentAnim) {
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
        const { hinge, charGroup, avatarMeshes } = slot;
        if (!charGroup) return;

        if (status === 'flying') {
            hinge.rotation.x = -1.2;
        } else if (status === 'dead' || status === 'dead-gator') {
            hinge.rotation.x = -1.2;
            charGroup.position.set(slot.x, -0.6, -2);
            charGroup.rotation.z = Math.PI / 2;
        } else if (status === 'snatched') {
            hinge.rotation.x = -1.2;
            charGroup.position.set(slot.x, 12, -4);
        } else if (status === 'dead-missile') {
            hinge.rotation.x = -0.5;
            charGroup.position.set(slot.x, 2.5, slot.z + 0.1);
            charGroup.rotation.x = -0.8;
        } else {
            // Idle / seated
            hinge.rotation.x = 0;
            charGroup.position.set(slot.x, 2.5, slot.z + 0.1);
            charGroup.rotation.set(0, 0, 0);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 9. 3D Flying & Splash & Animal Attack Sequences
    // ─────────────────────────────────────────────────────────────
    function triggerFly(playerId, specialEvent) {
        if (!isInitialized) return;
        const slot = chairSlots.find(s => s.player && s.player.id === playerId);
        if (!slot) return;

        const startTime = clock.getElapsedTime();
        const startPos = { x: slot.x, y: 2.5, z: slot.z + 0.1 };
        const landingPos = { x: slot.x + (Math.random() * 2 - 1), y: 0.2, z: -3 };

        // 9-A. Gull Snatch Event
        if (specialEvent === 'gull') {
            triggerGullSnatch(slot);
            return;
        }

        // Tilt chair back with hydraulic sound effect
        slot.isTilted = true;
        slot.hinge.rotation.x = -1.3;

        // Flying Parabola Animation
        slot.currentAnim = {
            type: 'flying',
            specialEvent: specialEvent,
            startTime: startTime,
            duration: 1.0,
            update: (time) => {
                const elapsed = time - slot.currentAnim.startTime;
                const progress = Math.min(1, elapsed / 1.0);

                // Parabola: Y reaches high apex (y=11)
                const arcY = Math.sin(progress * Math.PI) * 9.5;
                const curX = startPos.x + (landingPos.x - startPos.x) * progress;
                const curZ = startPos.z + (landingPos.z - startPos.z) * progress;
                const curY = startPos.y + (landingPos.y - startPos.y) * progress + arcY;

                slot.charGroup.position.set(curX, curY, curZ);
                // 360-degree tumbling flip
                slot.charGroup.rotation.x = progress * Math.PI * 4;

                if (progress >= 1) {
                    // Impact with water!
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

    // 9-B. 🦈 3D Shark Attack Sequence
    function triggerSharkAttack(slot, pos) {
        if (!sharkEntity) return;
        sharkEntity.group.visible = true;
        sharkEntity.group.position.set(pos.x + 8, -0.3, pos.z - 4);
        const attackStart = clock.getElapsedTime();

        sharkEntity.activeAttackAnim = {
            startTime: attackStart,
            update: (time) => {
                const el = time - attackStart;
                if (el < 1.0) {
                    // Shark rushes toward landing spot
                    const t = el / 1.0;
                    sharkEntity.group.position.x = (pos.x + 8) * (1 - t) + pos.x * t;
                    sharkEntity.group.position.z = (pos.z - 4) * (1 - t) + pos.z * t;
                    sharkEntity.group.lookAt(pos.x, 0, pos.z);
                } else if (el < 2.0) {
                    // Breach! Leap up out of water and bite down
                    const breachT = (el - 1.0) / 1.0;
                    const leapY = Math.sin(breachT * Math.PI) * 2.2;
                    sharkEntity.group.position.y = -0.3 + leapY;

                    // Drag player down
                    slot.charGroup.position.set(pos.x, -0.4 - breachT * 1.5, pos.z);
                    slot.charGroup.rotation.z = Math.PI / 2;

                    if (breachT > 0.5 && !sharkEntity.splashed) {
                        createBloodSplash(pos.x, 0, pos.z);
                        sharkEntity.splashed = true;
                    }
                } else {
                    // Deep sea submerged
                    sharkEntity.group.visible = false;
                    sharkEntity.splashed = false;
                    sharkEntity.activeAttackAnim = null;
                    slot.currentAnim = null;
                }
            }
        };
    }

    // 9-C. 🐊 3D Gator Attack Sequence (Death Roll)
    function triggerGatorAttack(slot, pos) {
        if (!gatorEntity) return;
        gatorEntity.group.visible = true;
        gatorEntity.group.position.set(pos.x - 7, -0.15, pos.z);
        const attackStart = clock.getElapsedTime();

        gatorEntity.activeAttackAnim = {
            startTime: attackStart,
            update: (time) => {
                const el = time - attackStart;
                if (el < 0.8) {
                    // Rush in
                    const t = el / 0.8;
                    gatorEntity.group.position.x = (pos.x - 7) * (1 - t) + pos.x * t;
                    gatorEntity.group.lookAt(pos.x, 0, pos.z);
                } else if (el < 2.4) {
                    // Death Roll: Gator and player spin furiously together!
                    const rollT = (el - 0.8);
                    gatorEntity.group.rotation.z = rollT * Math.PI * 6;
                    slot.charGroup.rotation.z = rollT * Math.PI * 6;
                    slot.charGroup.position.set(pos.x, -0.2, pos.z);
                    if (Math.random() < 0.4) {
                        createWaterSplash(pos.x, 0, pos.z, 0.4);
                    }
                } else {
                    createBloodSplash(pos.x, 0, pos.z);
                    gatorEntity.group.visible = false;
                    gatorEntity.activeAttackAnim = null;
                    slot.currentAnim = null;
                }
            }
        };
    }

    // 9-D. 🦅 3D Seagull Snatch Event
    function triggerGullSnatch(slot) {
        if (!gullEntity) return;
        gullEntity.group.visible = true;
        const startY = 16;
        gullEntity.group.position.set(slot.x + 12, startY, slot.z - 8);
        const snatchStart = clock.getElapsedTime();

        gullEntity.activeAttackAnim = {
            startTime: snatchStart,
            update: (time) => {
                const el = time - snatchStart;
                if (el < 1.2) {
                    // Dive swooping down toward chair
                    const t = el / 1.2;
                    gullEntity.group.position.x = (slot.x + 12) * (1 - t) + slot.x * t;
                    gullEntity.group.position.y = startY * (1 - t) + 2.8 * t;
                    gullEntity.group.position.z = (slot.z - 8) * (1 - t) + slot.z * t;
                    gullEntity.group.lookAt(slot.x, 2.5, slot.z);
                } else if (el < 1.4) {
                    // Snatch player! Chair tilts
                    slot.hinge.rotation.x = -1.2;
                    gullEntity.group.position.set(slot.x, 2.8, slot.z);
                    slot.charGroup.position.set(slot.x, 2.2, slot.z);
                } else if (el < 4.0) {
                    // Ascend into the sky carrying player
                    const soarT = (el - 1.4) / 2.6;
                    const skyY = 2.8 + soarT * 12;
                    const skyX = slot.x + Math.sin(soarT * Math.PI * 2) * 8;
                    const skyZ = slot.z - Math.cos(soarT * Math.PI * 2) * 6;

                    gullEntity.group.position.set(skyX, skyY, skyZ);
                    slot.charGroup.position.set(skyX, skyY - 0.9, skyZ);
                    // Player dangles and kicks legs
                    slot.charGroup.rotation.z = Math.sin(time * 12) * 0.3;
                } else {
                    // Keep circling in sky
                    gullEntity.activeAttackAnim = null;
                    slot.currentAnim = null;
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
                if (el < 2.0) {
                    // Swimming toward deck
                    const t = el / 2.0;
                    const curZ = landingPos.z * (1 - t) + deckEdgeZ * t;
                    slot.charGroup.position.set(slot.x, -0.3, curZ);
                    // Arm paddling
                    if (slot.avatarMeshes) {
                        slot.avatarMeshes.leftArm.rotation.x = Math.sin(time * 10) * 1.2;
                        slot.avatarMeshes.rightArm.rotation.x = -Math.sin(time * 10) * 1.2;
                    }
                } else if (el < 3.8) {
                    // Climbing onto deck and walking to chair
                    const walkT = (el - 2.0) / 1.8;
                    const curZ = deckEdgeZ * (1 - walkT) + (slot.z + 0.1) * walkT;
                    slot.charGroup.position.set(slot.x, 2.5, curZ);
                    // Leg walking animation
                    if (slot.avatarMeshes) {
                        slot.avatarMeshes.leftLeg.rotation.x = Math.sin(time * 12) * 0.8;
                        slot.avatarMeshes.rightLeg.rotation.x = -Math.sin(time * 12) * 0.8;
                    }
                } else {
                    // Reached chair! Sit down, un-tilt chair
                    slot.hinge.rotation.x = 0;
                    slot.charGroup.position.set(slot.x, 2.5, slot.z + 0.1);
                    slot.charGroup.rotation.set(0, 0, 0);
                    if (slot.avatarMeshes) {
                        slot.avatarMeshes.leftLeg.rotation.x = -Math.PI / 2;
                        slot.avatarMeshes.rightLeg.rotation.x = -Math.PI / 2;
                        slot.avatarMeshes.leftArm.rotation.x = -Math.PI / 4;
                        slot.avatarMeshes.rightArm.rotation.x = -Math.PI / 4;
                    }
                    slot.currentAnim = null;
                }
            }
        };
    }

    // ─────────────────────────────────────────────────────────────
    // 10. 3D Particle Systems: Water Splash & Blood
    // ─────────────────────────────────────────────────────────────
    function createWaterSplash(x, y, z, scale = 1.0) {
        const particleCount = 28;
        const pGeo = new THREE.SphereGeometry(0.12 * scale, 6, 6);
        const pMat = new THREE.MeshBasicMaterial({ color: 0xe0f7fa, transparent: true, opacity: 0.85 });

        for (let i = 0; i < particleCount; i++) {
            const p = new THREE.Mesh(pGeo, pMat);
            p.position.set(x, y + 0.1, z);
            const angle = Math.random() * Math.PI * 2;
            const speed = (2.5 + Math.random() * 4.5) * scale;
            p.velocity = new THREE.Vector3(
                Math.cos(angle) * (0.8 + Math.random() * 1.5),
                speed,
                Math.sin(angle) * (0.8 + Math.random() * 1.5)
            );
            p.gravity = 9.8;
            p.life = 0.85 + Math.random() * 0.4;
            p.maxLife = p.life;
            scene.add(p);
            activeParticles.push(p);
        }
    }

    function createBloodSplash(x, y, z) {
        const count = 20;
        const pGeo = new THREE.SphereGeometry(0.18, 6, 6);
        const pMat = new THREE.MeshBasicMaterial({ color: 0xc0392b, transparent: true, opacity: 0.9 });

        for (let i = 0; i < count; i++) {
            const p = new THREE.Mesh(pGeo, pMat);
            p.position.set(x, y + 0.1, z);
            p.velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 3,
                1.5 + Math.random() * 3,
                (Math.random() - 0.5) * 3
            );
            p.gravity = 6.0;
            p.life = 1.5;
            p.maxLife = p.life;
            scene.add(p);
            activeParticles.push(p);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 11. Roaming Animals Management
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
    // 12. Main Animation & Render Loop
    // ─────────────────────────────────────────────────────────────
    function animate() {
        if (!isVisible) return;
        animFrameId = requestAnimationFrame(animate);

        const delta = clock.getDelta();
        const time = clock.getElapsedTime();

        // 12-1. Camera position interpolation
        updateCameraPosition();

        // 12-2. Dynamic Water Wave animation
        if (waterMesh && waterMesh.geometry) {
            const posAttr = waterMesh.geometry.attributes.position;
            for (let i = 0; i < posAttr.count; i++) {
                const u = posAttr.getX(i);
                const v = posAttr.getY(i);
                // Create ripple waves across pool
                const waveY = Math.sin(u * 0.4 + time * 2.5) * 0.12 + Math.cos(v * 0.4 + time * 1.8) * 0.1;
                posAttr.setZ(i, waveY);
            }
            posAttr.needsUpdate = true;
        }

        // 12-3. Roaming Animals Idle/Patrol Updates
        // 🦈 Shark Patrol
        if (sharkEntity && sharkEntity.isRoaming && !sharkEntity.activeAttackAnim) {
            sharkEntity.roamTime += delta;
            const t = sharkEntity.roamTime * 0.5;
            const sharkX = Math.sin(t) * 9.0;
            const sharkZ = -5.0 + Math.cos(t * 1.5) * 2.5;
            sharkEntity.group.position.set(sharkX, -0.38, sharkZ);
            sharkEntity.group.rotation.y = Math.cos(t) > 0 ? -Math.PI / 2 : Math.PI / 2;
            // Tail wag
            sharkEntity.tailJoint.rotation.y = Math.sin(time * 6) * 0.45;
        }

        // 🐊 Gator Patrol
        if (gatorEntity && gatorEntity.isRoaming && !gatorEntity.activeAttackAnim) {
            gatorEntity.roamTime += delta;
            const gt = gatorEntity.roamTime * 0.35;
            const gX = Math.sin(gt) * 7.5;
            const gZ = -3.5 + Math.sin(gt * 2) * 1.2;
            gatorEntity.group.position.set(gX, -0.15, gZ);
            gatorEntity.group.rotation.y = Math.cos(gt) > 0 ? Math.PI / 2 : -Math.PI / 2;
            gatorEntity.tailJoint.rotation.y = Math.sin(time * 4) * 0.35;
        }

        // 🦅 Seagull Soaring
        if (gullEntity) {
            // Flap wings
            const flap = Math.sin(time * 12) * 0.45;
            gullEntity.leftWingJoint.rotation.z = flap;
            gullEntity.rightWingJoint.rotation.z = -flap;

            if (gullEntity.isRoaming && !gullEntity.activeAttackAnim) {
                gullEntity.roamAngle += delta * 0.4;
                const rX = Math.sin(gullEntity.roamAngle) * 10;
                const rZ = -4 + Math.cos(gullEntity.roamAngle) * 6;
                gullEntity.group.position.set(rX, 13.5 + Math.sin(time * 2) * 0.8, rZ);
                gullEntity.group.rotation.y = gullEntity.roamAngle + Math.PI / 2;
            }
        }

        // 12-4. Active Attack Animations
        if (sharkEntity && sharkEntity.activeAttackAnim) sharkEntity.activeAttackAnim.update(time);
        if (gatorEntity && gatorEntity.activeAttackAnim) gatorEntity.activeAttackAnim.update(time);
        if (gullEntity && gullEntity.activeAttackAnim) gullEntity.activeAttackAnim.update(time);

        // 12-5. Chair Slot Flying & Character Animations
        chairSlots.forEach(slot => {
            if (slot.currentAnim && slot.currentAnim.update) {
                slot.currentAnim.update(time);
            }
        });

        // 12-6. Particle Physics
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

        // 12-7. Render Scene
        renderer.render(scene, camera);
    }

    // ─────────────────────────────────────────────────────────────
    // 13. Visibility & Lifecycle Toggle
    // ─────────────────────────────────────────────────────────────
    function setVisible(show) {
        isVisible = show;
        if (containerEl) {
            containerEl.style.display = show ? 'block' : 'none';
        }
        if (show) {
            if (!isInitialized) {
                init(containerEl);
            }
            onResize();
            if (!animFrameId) {
                animFrameId = requestAnimationFrame(animate);
            }
        } else {
            if (animFrameId) {
                cancelAnimationFrame(animFrameId);
                animFrameId = null;
            }
        }
    }

    // Public API
    return {
        init: init,
        setVisible: setVisible,
        syncPlayers: syncPlayers,
        triggerFly: triggerFly,
        updateRoamingAnimal: updateRoamingAnimal,
        handleResize: onResize,
        isInitialized: () => isInitialized,
        isVisible: () => isVisible
    };
}));
