// --- Variable Declarations ---

// Scene, camera, and renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x87ceeb); // Sky blue background
document.body.appendChild(renderer.domElement);

// Game state
let gameState = {
    score: 0,
    coinsCollected: 0,
    isGameOver: false,
    isPlaying: false,
    isInvincible: false,
    level: 1,
    obstaclesDestroyed: 0,
    totalInitialObstacles: 10
};

// Level configurations
const baseConfig = {
    obstacles: 10,
    floorColor: 0x87ceeb,
    baseObstacleSpeed: 0.05,
    speedIncreasePerLevel: 0.02,
    obstacleColor: 0xff0000
};

// Function to get level config
function getLevelConfig(level) {
    const speedMultiplier = 1 + ((level - 1) * baseConfig.speedIncreasePerLevel);
    return {
        obstacles: baseConfig.obstacles + Math.floor(level / 2), // Add more obstacles every 2 levels
        floorColor: level % 2 === 0 ? 0x800080 : 0x87ceeb, // Alternate between sky blue and purple
        obstacleSpeed: baseConfig.baseObstacleSpeed * speedMultiplier,
        obstacleColor: new THREE.Color().setHSL((level * 0.1) % 1, 0.7, 0.5).getHex() // Change color each level
    };
}

// Player (sphere for better visuals)
const playerGeometry = new THREE.SphereGeometry(0.5, 32, 32);
const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
const player = new THREE.Mesh(playerGeometry, playerMaterial);
scene.add(player);
camera.position.z = 5; // Initial camera position

// Movement controls
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
const moveSpeed = 0.1;
let velocity = new THREE.Vector3(0, 0, 0);
const gravity = 0.005;
let isOnGround = false;

// Coins group
const coinsGroup = new THREE.Group();
scene.add(coinsGroup);

// Projectiles group
const projectilesGroup = new THREE.Group();
scene.add(projectilesGroup);

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
scene.add(ambientLight);
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 5, 5);
light.castShadow = true;
scene.add(light);

// Floor with texture
const textureLoader = new THREE.TextureLoader();
const floorTexture = textureLoader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg'); // Replace with your texture URL
floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
floorTexture.repeat.set(10, 10);
const planeGeometry = new THREE.PlaneGeometry(20, 20);
const planeMaterial = new THREE.MeshStandardMaterial({ map: floorTexture, side: THREE.DoubleSide });
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = Math.PI / 2;
plane.position.y = -2;
scene.add(plane);

// Obstacles group
const obstacles = new THREE.Group();
scene.add(obstacles);

// Mouse control variables
let isLocked = false;
let yaw = 0;   // Horizontal rotation
let pitch = 0.5; // Vertical rotation
const maxPitch = Math.PI / 2 - 0.1;
const minPitch = -Math.PI / 2 + 0.1;
const sensitivity = 0.005;
const distance = 5; // Camera distance from player
const floorHeight = -1.5; // Minimum camera height

// Audio (replace with your own sound URLs)
const coinSound = new Audio('https://freesound.org/data/previews/272/272341_5123851-lq.mp3'); // Coin sound
const hitSound = new Audio('https://freesound.org/data/previews/171/171671_2435888-lq.mp3'); // Hit sound
const backgroundMusic = new Audio('https://freesound.org/data/previews/171/171671_2435888-lq.mp3'); // Background music
backgroundMusic.loop = true;
backgroundMusic.volume = 0.5;
backgroundMusic.play();

// Mobile controls
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let joystickTouch = null;
let shootTouch = null;
let joystickStartPos = { x: 0, y: 0 };
let currentJoystickPos = { x: 0, y: 0 };
let lastTapTime = 0;

// --- Function Definitions ---

// Create a coin
function createCoin(isSpecial = false) {
    const geometry = isSpecial ? new THREE.DodecahedronGeometry(0.4) : new THREE.CylinderGeometry(0.3, 0.3, 0.02, 32);
    const material = new THREE.MeshStandardMaterial({
        color: isSpecial ? 0xff00ff : 0xffd700,
        metalness: isSpecial ? 0.5 : 0.9,
        roughness: 0.2
    });
    const coin = new THREE.Mesh(geometry, material);
    coin.position.set(Math.random() * 16 - 8, 0, Math.random() * 16 - 8);
    if (!isSpecial) coin.rotation.x = Math.PI / 2;
    coin.userData.isSpecial = isSpecial;
    coinsGroup.add(coin);
}

// Create an obstacle
function createObstacle() {
    const type = Math.floor(Math.random() * 3);
    let obstacleGeometry;
    if (type === 0) obstacleGeometry = new THREE.BoxGeometry(1, 2, 1);
    else if (type === 1) obstacleGeometry = new THREE.SphereGeometry(0.7, 16, 16);
    else obstacleGeometry = new THREE.ConeGeometry(0.7, 2, 16);
    const obstacleMaterial = new THREE.MeshStandardMaterial({ 
        color: levelConfigs[gameState.level].obstacleColor 
    });
    const obstacle = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
    let x, z;
    do {
        x = Math.random() * 16 - 8;
        z = Math.random() * 16 - 8;
    } while (Math.sqrt(x * x + z * z) < 3); // Keep away from center
    obstacle.position.set(x, type === 2 ? -1 : 0, z);
    obstacle.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * levelConfigs[gameState.level].obstacleSpeed,
        0,
        (Math.random() - 0.5) * levelConfigs[gameState.level].obstacleSpeed
    );
    obstacles.add(obstacle);
}

// Create a projectile
function createProjectile() {
    const projectileGeometry = new THREE.SphereGeometry(0.2, 8, 8);
    const projectileMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x00ffff,
        emissive: 0x00ffff,
        emissiveIntensity: 0.5
    });
    const projectile = new THREE.Mesh(projectileGeometry, projectileMaterial);
    
    // Set initial position at player's position
    projectile.position.copy(player.position);
    projectile.position.y += 0.5; // Slightly above player center
    
    // Get shooting direction from camera
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.y = 0; // Keep projectiles level
    direction.normalize();
    
    // Store direction in userData for movement
    projectile.userData.direction = direction;
    projectile.userData.speed = 0.5; // Projectile speed
    projectile.userData.lifetime = 0; // Track how long projectile has existed
    
    projectilesGroup.add(projectile);
}

// Create UI
function createUI() {
    const uiContainer = document.createElement('div');
    uiContainer.id = 'game-ui';
    uiContainer.style.position = 'absolute';
    uiContainer.style.top = '10px';
    uiContainer.style.left = '10px';
    uiContainer.style.color = 'white';
    uiContainer.style.fontFamily = 'Arial, sans-serif';
    uiContainer.style.padding = '10px';
    uiContainer.style.backgroundColor = 'rgba(0,0,0,0.5)';
    uiContainer.style.borderRadius = '5px';
    uiContainer.innerHTML = `
        <div id="score">Score: 0</div>
        <div id="message">Click to start${isMobile ? ', Use left side for movement, right side to shoot' : ', WASD to move, Left Click to shoot'}</div>
    `;
    document.body.appendChild(uiContainer);

    const startScreen = document.createElement('div');
    startScreen.id = 'start-screen';
    startScreen.style.cssText = `
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        padding: 20px; background: rgba(0,0,0,0.7); color: white; text-align: center;
    `;
    startScreen.innerHTML = `<h1>Game</h1><p>Tap to start</p>${isMobile ? '<p>Use left side for movement<br>Right side to shoot</p>' : '<p>WASD: Move, Left Click: Shoot</p>'}`;
    document.body.appendChild(startScreen);

    const gameOverScreen = document.createElement('div');
    gameOverScreen.id = 'game-over-screen';
    gameOverScreen.style.cssText = `
        position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
        padding: 20px; background: rgba(0,0,0,0.7); color: white; text-align: center; display: none;
    `;
    gameOverScreen.innerHTML = `<h1>Game Over</h1><p>Score: <span id="final-score"></span></p><p>Tap to restart</p>`;
    document.body.appendChild(gameOverScreen);

    if (isMobile) {
        // Add virtual joystick background
        const joystickBg = document.createElement('div');
        joystickBg.id = 'joystick-bg';
        joystickBg.style.cssText = `
            position: absolute;
            left: 20px;
            bottom: 20px;
            width: 120px;
            height: 120px;
            background: rgba(255,255,255,0.2);
            border-radius: 60px;
            border: 2px solid rgba(255,255,255,0.3);
            display: none;
        `;
        document.body.appendChild(joystickBg);

        // Add joystick knob
        const joystickKnob = document.createElement('div');
        joystickKnob.id = 'joystick-knob';
        joystickKnob.style.cssText = `
            position: absolute;
            width: 40px;
            height: 40px;
            background: rgba(255,255,255,0.5);
            border-radius: 20px;
            display: none;
        `;
        document.body.appendChild(joystickKnob);

        // Add shoot button
        const shootButton = document.createElement('div');
        shootButton.id = 'shoot-button';
        shootButton.style.cssText = `
            position: absolute;
            right: 20px;
            bottom: 20px;
            width: 80px;
            height: 80px;
            background: rgba(255,0,0,0.3);
            border-radius: 40px;
            border: 2px solid rgba(255,255,255,0.3);
            display: none;
        `;
        document.body.appendChild(shootButton);
    }
}

// Update UI
function updateUI() {
    const scoreElement = document.getElementById('score');
    const messageElement = document.getElementById('message');
    const startScreen = document.getElementById('start-screen');
    const gameOverScreen = document.getElementById('game-over-screen');
    const finalScoreElement = document.getElementById('final-score');

    if (scoreElement) scoreElement.textContent = `Level ${gameState.level} - Score: ${gameState.score}`;
    if (messageElement) {
        if (gameState.isGameOver) {
            messageElement.textContent = 'Game Over!';
        } else {
            messageElement.textContent = `Destroy all ${gameState.totalInitialObstacles} obstacles to reach level ${gameState.level + 1}! Remaining: ${gameState.totalInitialObstacles - gameState.obstaclesDestroyed}`;
        }
    }
    if (startScreen) startScreen.style.display = !gameState.isPlaying ? 'block' : 'none';
    if (gameOverScreen) {
        gameOverScreen.style.display = gameState.isGameOver ? 'block' : 'none';
        if (gameState.isGameOver && finalScoreElement) finalScoreElement.textContent = gameState.score;
    }

    if (gameState.isGameOver) {
        document.getElementById('joystick-bg').style.display = 'none';
        document.getElementById('joystick-knob').style.display = 'none';
        document.getElementById('shoot-button').style.display = 'none';
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    if (gameState.isPlaying && !gameState.isGameOver) {
        // Apply physics
        velocity.y -= gravity;
        if (player.position.y + velocity.y <= -1) {
            player.position.y = -1;
            velocity.y = 0;
            isOnGround = true;
        } else {
            player.position.y += velocity.y;
        }

        // Move player
        const moveDirection = new THREE.Vector3(0, 0, 0);
        if (moveForward) moveDirection.z -= 1;
        if (moveBackward) moveDirection.z += 1;
        if (moveLeft) moveDirection.x -= 1;
        if (moveRight) moveDirection.x += 1;
        if (moveDirection.length() > 0) {
            moveDirection.normalize();
            const cameraDirection = new THREE.Vector3();
            camera.getWorldDirection(cameraDirection);
            cameraDirection.y = 0;
            cameraDirection.normalize();
            const movementMatrix = new THREE.Matrix4();
            movementMatrix.lookAt(new THREE.Vector3(0, 0, 0), cameraDirection, new THREE.Vector3(0, 1, 0));
            moveDirection.applyMatrix4(movementMatrix);
            moveDirection.multiplyScalar(moveSpeed);
            player.position.x += moveDirection.x;
            player.position.z += moveDirection.z;
            player.rotation.y = Math.atan2(moveDirection.x, moveDirection.z);
        }
        player.position.x = Math.max(-10, Math.min(10, player.position.x));
        player.position.z = Math.max(-10, Math.min(10, player.position.z));

        // Check coin collisions
        for (let i = coinsGroup.children.length - 1; i >= 0; i--) {
            const coin = coinsGroup.children[i];
            const distanceToCoin = player.position.distanceTo(coin.position);
            coin.rotation.z += 0.03;
            if (distanceToCoin < 1) {
                if (coin.userData.isSpecial) {
                    gameState.isInvincible = true;
                    setTimeout(() => gameState.isInvincible = false, 5000);
                } else {
                    gameState.score += 100;
                }
                coinsGroup.remove(coin);
                gameState.coinsCollected++;
                coinSound.play();
                createCoin(Math.random() < 0.2);
                if (gameState.coinsCollected % 5 === 0) createObstacle();
                updateUI();
            }
        }

        // Move obstacles and check collisions
        obstacles.children.forEach(obstacle => {
            if (obstacle.userData.velocity) {
                obstacle.position.add(obstacle.userData.velocity.clone().multiplyScalar(1 + gameState.coinsCollected * 0.05));
                if (obstacle.position.x > 10 || obstacle.position.x < -10) obstacle.userData.velocity.x *= -1;
                if (obstacle.position.z > 10 || obstacle.position.z < -10) obstacle.userData.velocity.z *= -1;
            }
            const distanceToObstacle = player.position.distanceTo(obstacle.position);
            if (distanceToObstacle < 1.2 && !gameState.isInvincible) {
                hitSound.play();
                gameState.isGameOver = true;
                updateUI();
            }
        });

        // Visual feedback for invincibility
        player.material.color.set(gameState.isInvincible ? 0xffff00 : 0x00ff00);

        // Update projectiles
        for (let i = projectilesGroup.children.length - 1; i >= 0; i--) {
            const projectile = projectilesGroup.children[i];
            
            // Move projectile
            const movement = projectile.userData.direction.clone().multiplyScalar(projectile.userData.speed);
            projectile.position.add(movement);
            
            // Increment lifetime
            projectile.userData.lifetime += 1;
            
            // Remove if too old (60 frames = ~1 second)
            if (projectile.userData.lifetime > 60) {
                projectilesGroup.remove(projectile);
                continue;
            }
            
            // Check collision with obstacles
            for (let j = obstacles.children.length - 1; j >= 0; j--) {
                const obstacle = obstacles.children[j];
                const distance = projectile.position.distanceTo(obstacle.position);
                if (distance < 1) {
                    // Remove both projectile and obstacle
                    projectilesGroup.remove(projectile);
                    obstacles.remove(obstacle);
                    gameState.score += 50;
                    gameState.obstaclesDestroyed++;
                    
                    // Check if all obstacles are destroyed to advance to next level
                    if (gameState.obstaclesDestroyed >= gameState.totalInitialObstacles) {
                        startLevel(gameState.level + 1);
                    }
                    
                    updateUI();
                    break;
                }
            }
        }
    }

    // Update camera position
    let camX = player.position.x + distance * Math.sin(yaw) * Math.cos(pitch);
    let camY = player.position.y + distance * Math.sin(pitch);
    let camZ = player.position.z + distance * Math.cos(yaw) * Math.cos(pitch);
    camY = Math.max(floorHeight, camY);
    camera.position.set(camX, camY, camZ);
    camera.lookAt(player.position);

    renderer.render(scene, camera);
}

// --- Initial Setup and Event Listeners ---

// Create initial coins and obstacles
startLevel(1);

// Create UI
createUI();

// Keyboard controls
document.addEventListener('keydown', (event) => {
    if (gameState.isGameOver && event.key === ' ') {
        // Reset game state
        gameState.score = 0;
        gameState.coinsCollected = 0;
        gameState.isGameOver = false;
        gameState.isPlaying = true;
        gameState.isInvincible = false;
        
        // Start from level 1
        startLevel(1);
        return;
    }

    if (!gameState.isPlaying) {
        gameState.isPlaying = true;
        updateUI();
    }
    switch (event.key) {
        case 'w': moveForward = true; break;
        case 's': moveBackward = true; break;
        case 'a': moveLeft = true; break;
        case 'd': moveRight = true; break;
        case ' ': if (isOnGround && !gameState.isGameOver) { velocity.y = 0.2; isOnGround = false; } break;
    }
});

document.addEventListener('keyup', (event) => {
    switch (event.key) {
        case 'w': moveForward = false; break;
        case 's': moveBackward = false; break;
        case 'a': moveLeft = false; break;
        case 'd': moveRight = false; break;
    }
});

// Mouse controls
renderer.domElement.addEventListener('click', (event) => {
    if (!isLocked) {
        renderer.domElement.requestPointerLock();
    } else if (!gameState.isGameOver && event.button === 0) { // Left click
        createProjectile();
    }
});

document.addEventListener('pointerlockchange', () => isLocked = document.pointerLockElement === renderer.domElement);
document.addEventListener('mousemove', (event) => {
    if (isLocked) {
        yaw -= event.movementX * sensitivity;
        pitch += event.movementY * sensitivity;
        pitch = Math.max(minPitch, Math.min(maxPitch, pitch));
    }
});

// Window resize
window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

// Start the game
animate();

// Add function to start new level
function startLevel(level) {
    const config = getLevelConfig(level);
    gameState.level = level;
    gameState.obstaclesDestroyed = 0;
    gameState.totalInitialObstacles = config.obstacles;
    
    // Clear existing objects
    while(coinsGroup.children.length > 0) {
        coinsGroup.remove(coinsGroup.children[0]);
    }
    while(obstacles.children.length > 0) {
        obstacles.remove(obstacles.children[0]);
    }
    while(projectilesGroup.children.length > 0) {
        projectilesGroup.remove(projectilesGroup.children[0]);
    }
    
    // Create level objects
    for (let i = 0; i < config.obstacles; i++) {
        const type = Math.floor(Math.random() * 3);
        let obstacleGeometry;
        if (type === 0) obstacleGeometry = new THREE.BoxGeometry(1, 2, 1);
        else if (type === 1) obstacleGeometry = new THREE.SphereGeometry(0.7, 16, 16);
        else obstacleGeometry = new THREE.ConeGeometry(0.7, 2, 16);
        
        const obstacleMaterial = new THREE.MeshStandardMaterial({ 
            color: config.obstacleColor 
        });
        const obstacle = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
        let x, z;
        do {
            x = Math.random() * 16 - 8;
            z = Math.random() * 16 - 8;
        } while (Math.sqrt(x * x + z * z) < 3); // Keep away from center
        
        obstacle.position.set(x, type === 2 ? -1 : 0, z);
        obstacle.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * config.obstacleSpeed,
            0,
            (Math.random() - 0.5) * config.obstacleSpeed
        );
        obstacles.add(obstacle);
    }
    
    // Update environment
    renderer.setClearColor(config.floorColor);
    
    // Reset player position
    player.position.set(0, -1, 0);
    velocity.set(0, 0, 0);
    isOnGround = true;
    
    updateUI();
}

// Add mobile touch handlers
if (isMobile) {
    let lastTouchX = 0;
    let lastTouchY = 0;
    
    document.addEventListener('touchstart', (event) => {
        event.preventDefault();
        
        if (!gameState.isPlaying) {
            gameState.isPlaying = true;
            updateUI();
            document.getElementById('joystick-bg').style.display = 'block';
            document.getElementById('joystick-knob').style.display = 'block';
            document.getElementById('shoot-button').style.display = 'block';
            return;
        }

        if (gameState.isGameOver) {
            gameState.score = 0;
            gameState.isGameOver = false;
            gameState.isPlaying = true;
            gameState.isInvincible = false;
            startLevel(1);
            document.getElementById('joystick-bg').style.display = 'block';
            document.getElementById('joystick-knob').style.display = 'block';
            document.getElementById('shoot-button').style.display = 'block';
            return;
        }

        Array.from(event.touches).forEach(touch => {
            const touchX = touch.clientX;
            const screenMiddle = window.innerWidth / 2;

            if (touchX < screenMiddle && !joystickTouch) {
                // Left side - movement
                joystickTouch = touch.identifier;
                joystickStartPos = { x: touchX, y: touch.clientY };
                currentJoystickPos = { x: touchX, y: touch.clientY };
                const knob = document.getElementById('joystick-knob');
                knob.style.left = `${touchX - 20}px`;
                knob.style.top = `${touch.clientY - 20}px`;
            } else if (touchX >= screenMiddle) {
                // Right side - camera control and shooting
                if (!shootTouch) {
                    shootTouch = touch.identifier;
                    lastTouchX = touchX;
                    lastTouchY = touch.clientY;
                    // Double tap detection for shooting
                    const now = Date.now();
                    if (now - lastTapTime < 300) {
                        createProjectile();
                    }
                    lastTapTime = now;
                }
            }
        });
    });

    document.addEventListener('touchmove', (event) => {
        event.preventDefault();
        
        Array.from(event.touches).forEach(touch => {
            if (touch.identifier === joystickTouch) {
                currentJoystickPos = { x: touch.clientX, y: touch.clientY };
                const knob = document.getElementById('joystick-knob');
                knob.style.left = `${touch.clientX - 20}px`;
                knob.style.top = `${touch.clientY - 20}px`;

                // Calculate movement direction
                const dx = currentJoystickPos.x - joystickStartPos.x;
                const dy = currentJoystickPos.y - joystickStartPos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const maxDistance = 50;
                
                if (distance > 0) {
                    const normalizedDx = dx / distance;
                    const normalizedDy = dy / distance;
                    const scale = Math.min(distance, maxDistance) / maxDistance;

                    moveForward = normalizedDy < -0.3;
                    moveBackward = normalizedDy > 0.3;
                    moveLeft = normalizedDx < -0.3;
                    moveRight = normalizedDx > 0.3;
                }
            } else if (touch.identifier === shootTouch) {
                // Camera rotation
                const dx = touch.clientX - lastTouchX;
                const dy = touch.clientY - lastTouchY;
                
                // Apply the same sensitivity as mouse movement but adjusted for touch
                yaw -= dx * sensitivity * 0.5;
                pitch += dy * sensitivity * 0.5;
                pitch = Math.max(minPitch, Math.min(maxPitch, pitch));
                
                lastTouchX = touch.clientX;
                lastTouchY = touch.clientY;
            }
        });
    });

    document.addEventListener('touchend', (event) => {
        event.preventDefault();
        
        Array.from(event.changedTouches).forEach(touch => {
            if (touch.identifier === joystickTouch) {
                joystickTouch = null;
                moveForward = moveBackward = moveLeft = moveRight = false;
                const knob = document.getElementById('joystick-knob');
                knob.style.left = `${joystickStartPos.x - 20}px`;
                knob.style.top = `${joystickStartPos.y - 20}px`;
            } else if (touch.identifier === shootTouch) {
                shootTouch = null;
            }
        });
    });
}

// Add meta viewport tag for mobile
const metaViewport = document.createElement('meta');
metaViewport.name = 'viewport';
metaViewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
document.head.appendChild(metaViewport);