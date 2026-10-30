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
        buildAnimals();
        setupControls(canvas);
        window.addEventListener('resize', onResize);

        isInitialized = true;
        if (typeof window !== 'undefined' && window.state && window.state.players) {
            syncPlayers(window.state.players);
        }
        console.log('[ThreeStageManager] Initialized v2.2 with Dynamic Player Seating & Robust State.');
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
    // 4. Flying Chairs (Dynamic Capacity matching Player Count)
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

        const chairSpacing = 3.3;
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
        canvas.width = 480;
        canvas.height = 180;
        const info = renderBubbleCanvas(canvas, text);
        const texture = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false, // Never occluded by 3D geometry!
            depthWrite: false
        });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(info.scaleW, info.scaleH, 1);
        sprite.renderOrder = 999; // Always on top of everything
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
                        // Continuous characters without spaces
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

        // Measure text with bold 42px font for crisp visibility on mobile
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

        // Size canvas exactly to bubble content with crisp padding
        const canvasW = Math.ceil(bubbleW + 20);
        const canvasH = Math.ceil(bubbleH + tailH + 20);
        canvas.width = canvasW;
        canvas.height = canvasH;

        ctx.clearRect(0, 0, canvasW, canvasH);

        const bx = 10;
        const by = 10;
        const r = 26;

        // Drop shadow for 3D depth pop
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 6;

        // Bubble body
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#ff4757';
        ctx.lineWidth = 4.5;

        ctx.beginPath();
        ctx.moveTo(bx + r, by);
        ctx.lineTo(bx + bubbleW - r, by);
        ctx.quadraticCurveTo(bx + bubbleW, by, bx + bubbleW, by + r);
        ctx.lineTo(bx + bubbleW, by + bubbleH - r);
        ctx.quadraticCurveTo(bx + bubbleW, by + bubbleH, bx + bubbleW - r, by + bubbleH);

        // Tail pointing down to character head
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

        // Reset shadow for text
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        // Render multi-line text with large crisp typography
        ctx.font = 'bold 42px Pretendard, "Apple SD Gothic Neo", sans-serif';
        ctx.fillStyle = '#111111';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const textStartY = by + padY + lineHeight / 2;
        lines.forEach((line, idx) => {
            ctx.fillText(line, canvasW / 2, textStartY + idx * lineHeight);
        });

        // 3D world scale: significantly larger than nickname tag (2.6m), perfectly readable on mobile
        let scaleW = Math.max(3.2, Math.min(4.3, (canvasW / 400) * 3.5));
        let scaleH = scaleW * (canvasH / canvasW);

        return { scaleW, scaleH, lineCount: lines.length };
    }

    // ─────────────────────────────────────────────────────────────
    // 6. Animals: 3D High-Detail Shark, Gator, Seagull
    // ─────────────────────────────────────────────────────────────
    function buildAnimals() {
        // 6-1. 🦈 High-Detail 3D Shark with 3D Head, Eyes, Sharp Teeth, Dorsal Fin & Real Caudal Fin
        const sharkGroup = new THREE.Group();
        const sharkMat = createMat(0x34495e, 0.35, 0.15); // Predatory slate blue-grey
        const sharkBellyMat = createMat(0xf8f9fa, 0.4, 0.05); // Clean white underbelly
        const toothMat = createMat(0xffffff, 0.2, 0.0);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
        const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

        // Torso (Streamlined spindle)
        const torsoGeo = new THREE.CylinderGeometry(0.75, 0.48, 3.2, 16);
        torsoGeo.rotateX(Math.PI / 2);
        const torso = new THREE.Mesh(torsoGeo, sharkMat);
        torso.position.set(0, 0.1, 0);
        sharkGroup.add(torso);

        const bellyGeo = new THREE.CylinderGeometry(0.68, 0.42, 3.0, 16);
        bellyGeo.rotateX(Math.PI / 2);
        const belly = new THREE.Mesh(bellyGeo, sharkBellyMat);
        belly.position.set(0, -0.06, 0);
        sharkGroup.add(belly);

        // Head Group (Facing forward +Z)
        const headGroup = new THREE.Group();
        headGroup.position.set(0, 0.1, 1.6);

        // Upper Snout (Cone pointing forward +Z, flattened predatory wedge)
        const snoutGeo = new THREE.ConeGeometry(0.72, 1.8, 16);
        snoutGeo.rotateX(Math.PI / 2);
        const snout = new THREE.Mesh(snoutGeo, sharkMat);
        snout.scale.set(1.0, 0.65, 1.0);
        snout.position.set(0, 0.05, 0.9);
        headGroup.add(snout);

        // Snout Underbelly
        const snoutBellyGeo = new THREE.ConeGeometry(0.64, 1.6, 16);
        snoutBellyGeo.rotateX(Math.PI / 2);
        const snoutBelly = new THREE.Mesh(snoutBellyGeo, sharkBellyMat);
        snoutBelly.scale.set(0.95, 0.55, 1.0);
        snoutBelly.position.set(0, -0.05, 0.8);
        headGroup.add(snoutBelly);

        // 3D Eyes (Left & Right with white socket and black pupil)
        [-0.48, 0.48].forEach(eyeX => {
            const eyeSocket = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), eyeWhiteMat);
            eyeSocket.position.set(eyeX, 0.22, 0.45);
            headGroup.add(eyeSocket);

            const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
            pupil.position.set(eyeX > 0 ? eyeX + 0.05 : eyeX - 0.05, 0.22, 0.48);
            headGroup.add(pupil);
        });

        // Lower Jaw (Hinged for biting motion)
        const lowerJaw = new THREE.Group();
        lowerJaw.position.set(0, -0.15, 0.2);

        const jawMeshGeo = new THREE.ConeGeometry(0.55, 1.4, 14);
        jawMeshGeo.rotateX(Math.PI / 2);
        const jawMesh = new THREE.Mesh(jawMeshGeo, sharkBellyMat);
        jawMesh.scale.set(0.9, 0.4, 1.0);
        jawMesh.position.set(0, 0, 0.7);
        lowerJaw.add(jawMesh);

        // Sharp Teeth along lower jaw rim
        const toothGeo = new THREE.ConeGeometry(0.045, 0.12, 5);
        toothGeo.rotateX(-Math.PI / 2);
        for (let i = -3; i <= 3; i++) {
            const tooth = new THREE.Mesh(toothGeo, toothMat);
            const t = i / 3.5;
            tooth.position.set(t * 0.35, 0.08, 0.4 + (1 - Math.abs(t)) * 0.75);
            tooth.rotation.x = -0.3;
            lowerJaw.add(tooth);
        }
        headGroup.add(lowerJaw);

        // Upper Teeth lining snout
        for (let i = -4; i <= 4; i++) {
            const uTooth = new THREE.Mesh(toothGeo, toothMat);
            const t = i / 4.5;
            uTooth.position.set(t * 0.42, -0.12, 0.5 + (1 - Math.abs(t)) * 0.85);
            uTooth.rotation.x = Math.PI - 0.3;
            headGroup.add(uTooth);
        }

        // 3D Gill slits on both flanks
        const gillMat = createMat(0x1a252f, 0.6);
        [-0.72, 0.72].forEach(gX => {
            for (let g = 0; g < 3; g++) {
                const gill = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.35, 0.05), gillMat);
                gill.position.set(gX, 0.1, -0.1 - g * 0.18);
                gill.rotation.z = gX > 0 ? -0.2 : 0.2;
                headGroup.add(gill);
            }
        });

        sharkGroup.add(headGroup);

        // Iconic Curved Dorsal Fin (등지느러미)
        const finShape = new THREE.Shape();
        finShape.moveTo(0, 0);
        finShape.lineTo(0.3, 1.7);
        finShape.quadraticCurveTo(0.15, 0.9, -1.1, 0);
        finShape.closePath();
        const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03 });
        finGeo.rotateY(Math.PI / 2);
        finGeo.translate(-0.06, 0.65, 0.1);
        const dorsalFin = new THREE.Mesh(finGeo, sharkMat);
        sharkGroup.add(dorsalFin);

        // Pectoral Fins (가슴지느러미 좌우)
        const pecShape = new THREE.Shape();
        pecShape.moveTo(0, 0);
        pecShape.lineTo(1.4, -0.3);
        pecShape.quadraticCurveTo(0.7, -0.7, 0, -0.3);
        pecShape.closePath();
        const pecGeo = new THREE.ExtrudeGeometry(pecShape, { depth: 0.08, bevelEnabled: false });

        const lPec = new THREE.Mesh(pecGeo, sharkMat);
        lPec.position.set(-0.65, 0, 0.6);
        lPec.rotation.set(-0.2, 0.4, 0.3);
        sharkGroup.add(lPec);

        const rPec = new THREE.Mesh(pecGeo, sharkMat);
        rPec.scale.set(-1, 1, 1);
        rPec.position.set(0.65, 0, 0.6);
        rPec.rotation.set(-0.2, -0.4, -0.3);
        sharkGroup.add(rPec);

        // Realistic Crescent Caudal Tail Fin (꼬리지느러미 - NO flat rectangle box!)
        const tailJoint = new THREE.Group();
        tailJoint.position.set(0, 0.1, -1.6);

        const tailShape = new THREE.Shape();
        tailShape.moveTo(0, 0);
        tailShape.lineTo(-0.8, 1.35);
        tailShape.quadraticCurveTo(-0.5, 0.6, -0.2, 0.1);
        tailShape.lineTo(-0.6, -0.75);
        tailShape.quadraticCurveTo(-0.3, -0.3, 0, 0);
        tailShape.closePath();

        const tailFinGeo = new THREE.ExtrudeGeometry(tailShape, { depth: 0.09, bevelEnabled: false });
        tailFinGeo.rotateY(Math.PI / 2);
        tailFinGeo.translate(-0.045, 0, 0);
        const tailFinMesh = new THREE.Mesh(tailFinGeo, sharkMat);
        tailJoint.add(tailFinMesh);
        sharkGroup.add(tailJoint);

        sharkGroup.position.set(0, 0.05, -4);
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

        const gatorEyeMat = createMat(0xf1c40f, 0.2);
        const gLeftEye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), gatorEyeMat);
        gLeftEye.position.set(-0.38, 0.36, 0.3);
        gatorGroup.add(gLeftEye);
        const gRightEye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), gatorEyeMat);
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
            targetSpherical.phi = Math.max(0.15, Math.min(Math.PI / 2.3, targetSpherical.phi));
            targetSpherical.theta = Math.max(-Math.PI / 3.0, Math.min(Math.PI / 3.0, targetSpherical.theta));
        }

        function onPointerUp() { isDragging = false; }

        function onWheel(e) {
            targetSpherical.radius += e.deltaY * 0.02;
            targetSpherical.radius = Math.max(12, Math.min(48, targetSpherical.radius));
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
                    targetSpherical.radius = Math.max(12, Math.min(48, initialRadius * factor));
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
        let baseRadius = 26;
        if (count <= 2) baseRadius = 22;
        else if (count <= 4) baseRadius = 24;
        else baseRadius = 26;

        if (aspect < 0.85) {
            targetSpherical.radius = baseRadius + 8;
        } else if (aspect < 1.2) {
            targetSpherical.radius = baseRadius + 4;
        } else {
            targetSpherical.radius = baseRadius;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 8. Player Sync & Dynamic Seating Adaptation
    // ─────────────────────────────────────────────────────────────
    function syncPlayers(players) {
        if (!isInitialized) return;
        const list = players || [];

        // Check if player count or IDs changed
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
        sharkEntity.group.position.set(pos.x + 6, 0.05, pos.z - 3);
        const attackStart = clock.getElapsedTime();

        sharkEntity.activeAttackAnim = {
            startTime: attackStart,
            update: (time) => {
                const el = time - attackStart;
                if (el < 0.9) {
                    const t = el / 0.9;
                    const curX = (pos.x + 6) * (1 - t) + pos.x * t;
                    const curZ = (pos.z - 3) * (1 - t) + pos.z * t;
                    sharkEntity.group.position.set(curX, 0.05, curZ);

                    // Face head (+Z) towards target
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

                    // Tilt predatory head up when breaching, down when diving
                    sharkEntity.group.rotation.x = -Math.cos(breachT * Math.PI) * 0.7;

                    slot.charGroup.position.set(pos.x, -0.3 - breachT * 1.5, pos.z);
                    slot.charGroup.rotation.z = Math.PI / 2;

                    if (breachT > 0.4 && !sharkEntity.splashed) {
                        createBloodSplash(pos.x, 0, pos.z);
                        sharkEntity.splashed = true;
                    }
                } else {
                    sharkEntity.group.visible = false;
                    sharkEntity.group.rotation.set(0, 0, 0);
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
                    const curX = (pos.x - 6) * (1 - t) + pos.x * t;
                    gatorEntity.group.position.set(curX, -0.15, pos.z);

                    // Face head (+Z) towards target
                    const dx = pos.x - curX;
                    gatorEntity.group.rotation.set(0, Math.atan2(dx, 0), 0);
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
    // 10. 3D Speech Bubble System (Multi-line & Anti-Overlap Staggering)
    // ─────────────────────────────────────────────────────────────
    function showSpeechBubble(playerId, text) {
        if (!isInitialized) return;
        const slot = chairSlots.find(s => s.player && s.player.id === playerId);
        if (!slot || !slot.bubbleSprite) return;

        const { canvas, texture } = slot.bubbleSprite.userData;
        const info = renderBubbleCanvas(canvas, text);
        texture.needsUpdate = true;

        // Dynamic 3D world scale based on content
        slot.bubbleSprite.scale.set(info.scaleW, info.scaleH, 1);

        // Dynamic vertical staggering to prevent neighbor overlap (generous Y clearance for large bubbles)
        const leftSlot = chairSlots.find(s => s.index === slot.index - 1);
        const rightSlot = chairSlots.find(s => s.index === slot.index + 1);
        const neighborSpeaking = (leftSlot && leftSlot.bubbleSprite && leftSlot.bubbleSprite.visible) ||
                                 (rightSlot && rightSlot.bubbleSprite && rightSlot.bubbleSprite.visible);

        let targetY = 4.3;
        if (slot.index % 2 === 1) {
            targetY = 5.2; // Stagger odd seats higher
        }
        if (neighborSpeaking) {
            targetY += (slot.index % 2 === 1) ? 0.75 : 0.6; // Guarantee clean separation across all combinations
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
            const t = sharkEntity.roamTime * 0.45;
            const posX = Math.sin(t) * 8.5;
            const posZ = -4.5 + Math.cos(t * 1.5) * 2.2;
            sharkEntity.group.position.set(posX, 0.05, posZ);

            // Tangent velocity vector (+Z faces forward heading)
            const vx = Math.cos(t) * 3.825;
            const vz = -Math.sin(t * 1.5) * 1.485;
            sharkEntity.group.rotation.set(0, Math.atan2(vx, vz), 0);
            sharkEntity.tailJoint.rotation.y = Math.sin(time * 6) * 0.45;
        }

        if (gatorEntity && gatorEntity.isRoaming && !gatorEntity.activeAttackAnim) {
            gatorEntity.roamTime += delta;
            const gt = gatorEntity.roamTime * 0.35;
            const gX = Math.sin(gt) * 7.0;
            const gZ = -3.5 + Math.sin(gt * 2) * 1.2;
            gatorEntity.group.position.set(gX, -0.15, gZ);

            const gvx = Math.cos(gt) * 2.45;
            const gvz = Math.cos(gt * 2) * 0.84;
            gatorEntity.group.rotation.set(0, Math.atan2(gvx, gvz), 0);
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
