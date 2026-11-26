// Coordinates are measured on the existing 192 × 208 desktop sprite.
const petArtProfiles = {
 default: {
  pivot: [115, 123], hand: [129, 143], cup: [95, 135, 98],
  left: {pivot: [73, 123], hand: [61, 143], arm: [[74, 115], [77, 120], [72, 130],
   [70, 141], [64, 151], [53, 152], [47, 138], [55, 127], [64, 120]]},
  sipEyes: [[[72, 83], [119, 91]], [[73, 85], [120, 95]]],
  arm: [[111, 121], [115, 116], [125, 121], [141, 133], [138, 147],
   [135, 153], [127, 154], [120, 146], [119, 138], [116, 130]]
 },
 cartoon: {
  center: 101, neck: 116,
  eyes: [[[80, 87], [124, 87]], [[72, 88], [125, 88]], [[68, 87], [115, 87]]],
  pivot: [124, 126], hand: [138, 155], cup: [102, 138, 101],
  left: {pivot: [80, 126], hand: [66, 156], arm: [[80, 117], [85, 122], [83, 132],
   [77, 142], [77, 152], [80, 162], [76, 173], [64, 175], [49, 171],
   [47, 151], [58, 138], [66, 131], [70, 121]]},
  arm: [[121, 117], [132, 118], [157, 139], [162, 164], [146, 172],
   [130, 174], [123, 165], [124, 153], [128, 140], [123, 132]]
 },
 natal: {
  center: 104, neck: 118,
  eyes: [[[85, 88], [124, 87]], [[86, 88], [126, 88]], [[86, 88], [126, 88]]],
  pivot: [126, 128], hand: [140, 157], cup: [104, 140, 102],
  left: {pivot: [80, 127], hand: [67, 158], arm: [[80, 118], [85, 123], [83, 132],
   [78, 143], [77, 153], [80, 163], [76, 174], [64, 176], [50, 171],
   [48, 151], [57, 138], [66, 131], [70, 122]]},
  arm: [[123, 119], [135, 120], [160, 142], [161, 165], [148, 173],
   [132, 175], [124, 166], [125, 155], [129, 144], [125, 135]]
 },
 aventureiro: {
  center: 98, neck: 113,
  eyes: [[[78, 87], [115, 86]], [[81, 88], [118, 87]], [[78, 87], [116, 87]]],
  pivot: [118, 127], hand: [132, 154], cup: [96, 138, 100],
  left: {pivot: [74, 126], hand: [63, 154], arm: [[73, 118], [80, 123], [78, 131],
   [74, 139], [72, 144], [73, 151], [76, 162], [72, 172], [58, 174],
   [46, 169], [44, 151], [52, 139], [62, 131], [63, 123]]},
  arm: [[115, 119], [125, 118], [152, 140], [155, 163], [141, 172],
   [124, 175], [116, 165], [117, 153], [121, 141], [117, 134]]
 }
};
const artWidth = 192;
const artHeight = 208;
const tau = 2 * Math.PI;

// The reference points follow the head and neck in each existing cartoon pose.
const scientistPoses = [
 [[102,87,101,120],[98,87,97,120],[97,87,96,119],[104,87,102,120],[101,87,100,120],[100,87,99,120]],
 [[102,87,101,120],[97,86,97,119],[102,87,101,120],[102,87,102,120],[104,85,105,118],[102,88,101,120]],
 [[102,87,101,120],[97,86,97,118],[99,82,101,112],[100,80,101,108],[100,84,101,113],[101,87,100,119]],
 [[99,85,99,116],[99,83,100,112],[99,82,101,110],[99,82,101,109],[99,83,100,112],[99,85,100,116]]
];

const standardCuffs = [[-33,25],[35,25]];
const scientistCuffs = [
 Array(6).fill(standardCuffs),
 [standardCuffs,[[-39,23],[37,14]],standardCuffs,standardCuffs,[[-32,26],[36,14]],standardCuffs],
 [standardCuffs,[[-35,15],[36,16]],[[-51,7],[49,6]],[[-54,-3],[55,-4]],[[-49,7],[51,8]],standardCuffs],
 Array(6).fill([[-64,6],[63,6]])
];

function paintSleeve(context, side, cuff) {
 const angle = Math.atan2(cuff[1] - 5,cuff[0] - side * 14);
 const length = Math.hypot(cuff[0] - side * 14,cuff[1] - 5);
 context.save();
 context.translate(side * 14,5);
 context.rotate(angle);
 context.beginPath();
 context.moveTo(-4,-8);
 context.quadraticCurveTo(length*.38,-10,length,-6);
 context.lineTo(length,6);
 context.quadraticCurveTo(length*.50,9,-4,10);
 context.closePath();
 context.fillStyle = '#dedbd2';
 context.fill();
 context.strokeStyle = '#50545a';
 context.lineWidth = 1.9;
 context.stroke();
 context.strokeStyle = '#fffaf1';
 context.lineWidth = 2.1;
 context.beginPath();
 context.moveTo(2,-4.8);
 context.lineTo(length-2,-3.7);
 context.stroke();
 context.strokeStyle = '#849397';
 context.lineWidth = 1.2;
 context.beginPath();
 context.moveTo(length-3,-5);
 context.lineTo(length-3,5);
 context.stroke();
 context.restore();
}

function paintScientist(context, row, column) {
 const [headX, headY, bodyX, bodyY] = scientistPoses[row][column];
 context.save();
 context.translate(bodyX, bodyY);
 context.globalCompositeOperation = 'source-atop';
 context.lineJoin = 'round';
 for (const [index, cuff] of scientistCuffs[row][column].entries()) paintSleeve(context, index === 0 ? -1 : 1, cuff);
 const fabric = context.createLinearGradient(-25,0,25,40);
 fabric.addColorStop(0,'#fffaf1');
 fabric.addColorStop(.56,'#f1ede2');
 fabric.addColorStop(1,'#cfc7ba');
 context.fillStyle = fabric;
 context.strokeStyle = '#4b5055';
 context.lineWidth = 2;
 context.beginPath();
 context.moveTo(-14,-2);
 context.quadraticCurveTo(-23,1,-24,12);
 context.quadraticCurveTo(-23,27,-22,39);
 context.quadraticCurveTo(-11,45,-3,42);
 context.lineTo(0,37);
 context.lineTo(4,43);
 context.quadraticCurveTo(15,44,23,39);
 context.quadraticCurveTo(21,25,24,12);
 context.quadraticCurveTo(22,1,14,-2);
 context.lineTo(0,11);
 context.closePath();
 context.fill();
 context.stroke();

 context.fillStyle = '#fffbf4';
 context.strokeStyle = '#6d7274';
 context.lineWidth = 1.45;
 context.beginPath();
 context.moveTo(-14,-1);
 context.lineTo(-19,11);
 context.lineTo(-10,12);
 context.lineTo(-13,17);
 context.lineTo(0,28);
 context.lineTo(13,17);
 context.lineTo(10,12);
 context.lineTo(19,11);
 context.lineTo(14,-1);
 context.lineTo(0,12);
 context.closePath();
 context.fill();
 context.stroke();

 context.strokeStyle = '#818a89';
 context.beginPath();
 context.moveTo(0,27);
 context.lineTo(0,37);
 context.moveTo(-17,30);
 context.lineTo(-6,30);
 context.lineTo(-7,37);
 context.lineTo(-16,37);
 context.closePath();
 context.moveTo(8,19);
 context.lineTo(18,19);
 context.lineTo(17,27);
 context.lineTo(9,27);
 context.closePath();
 context.stroke();
 context.fillStyle = '#08796e';
 context.fillRect(11,14,3,7);
 context.fillStyle = '#f6a500';
 context.fillRect(11,14,3,2);
 context.fillStyle = '#9b855b';
 context.beginPath();
 context.arc(3.5,30,1.45,0,tau);
 context.arc(3.5,36,1.45,0,tau);
 context.fill();
 context.restore();

 context.save();
 context.translate(headX, headY);
 context.lineCap = 'round';
 context.strokeStyle = '#284b51';
 context.lineWidth = 4;
 context.beginPath();
 context.moveTo(-36, -1);
 context.lineTo(-32, -3);
 context.moveTo(-9, -1);
 context.quadraticCurveTo(0, -6, 9, -1);
 context.moveTo(32, -3);
 context.lineTo(36, -1);
 context.stroke();
 for (const x of [-21, 21]) {
  context.beginPath();
  context.roundRect(x - 14, -13, 28, 26, 9);
  context.fillStyle = 'rgba(153, 241, 222, .15)';
  context.fill();
  context.strokeStyle = '#284b51';
  context.lineWidth = 3.1;
  context.stroke();
  context.strokeStyle = '#88d9cf';
  context.lineWidth = 1.3;
  context.beginPath();
  context.moveTo(x - 9, -8);
  context.lineTo(x - 2, -9);
  context.moveTo(x + 6, 8);
  context.lineTo(x + 9, 5);
  context.stroke();
 }
 context.restore();
}

function easeEdge(value) {
 const t = Math.max(0, Math.min(1, value));
 return t * t * (3 - 2 * t);
}
function artSurface() {
 return new OffscreenCanvas(artWidth, artHeight).getContext('2d', {willReadFrequently: true});
}
function traceArm(context, points) {
 context.beginPath();
 for (const [x, y] of points) context.lineTo(x, y);
 context.closePath();
}
function readPose(context, image, size, column, row = 0) {
 context.clearRect(0, 0, artWidth, artHeight);
 context.drawImage(image, column * size, row * size, size, size === 256 ? size : artHeight,
  0, size === 256 ? 16 : 0, artWidth, size === 256 ? 192 : artHeight);
}
function paintEyelid(context, eyeLayer, pose, source, target) {
 const [x, y] = target;
 eyeLayer.clearRect(0, 0, artWidth, artHeight);
 eyeLayer.globalCompositeOperation = 'source-over';
 eyeLayer.drawImage(pose.canvas, x - source[0], y - source[1]);
 eyeLayer.globalCompositeOperation = 'destination-in';
 eyeLayer.save();
 eyeLayer.translate(x, y + 1);
 eyeLayer.scale(16, 16);
 const feather = eyeLayer.createRadialGradient(0, 0, .71, 0, 0, 1);
 feather.addColorStop(0, '#fff');
 feather.addColorStop(1, '#fff0');
 eyeLayer.fillStyle = feather;
 eyeLayer.fillRect(-20, -20, 40, 40);
 eyeLayer.restore();
 context.drawImage(eyeLayer.canvas, 0, 0);
}
function makeExpressions(image, neutral, eyes, decorate) {
 const pose = artSurface(), expression = artSurface(), layer = artSurface();
 const textures = [neutral.getImageData(0, 0, artWidth, artHeight).data];
 for (const [level, column] of [[1, 3], [2, 2]]) {
  readPose(pose, image, 256, column);
  decorate?.(pose, 0, column);
  expression.clearRect(0, 0, artWidth, artHeight);
  expression.drawImage(neutral.canvas, 0, 0);
  for (let i = 0; i < eyes[0].length; i++) {
   paintEyelid(expression, layer, pose, eyes[level][i], eyes[0][i]);
  }
  textures.push(expression.getImageData(0, 0, artWidth, artHeight).data);
 }
 return textures;
}
function createIdleMotion(image, neutral, profile, context, decorate) {
 const textures = makeExpressions(image, neutral, profile.eyes, decorate);
 const output = context.createImageData(artWidth, artHeight);
 const rows = Array.from({length: artHeight}, (_, y) => ({
  head: easeEdge((profile.neck + 14 - y) / 28),
  torso: easeEdge((182 - y) / 45)
 }));
 const features = Array.from({length: artHeight}, (_, y) =>
  Array.from({length: artWidth}, (_, x) => {
   const offset = x - profile.center;
   const hand = easeEdge((Math.abs(offset) - 15) / 16) *
    easeEdge((y - profile.neck - 5) / 16) * easeEdge((181 - y) / 18);
   const mouth = easeEdge((24 - Math.abs(offset)) / 10) *
    easeEdge((13 - Math.abs(y - 105)) / 8);
   const eye = Math.max(...profile.eyes[0].map(([ex, ey]) =>
    easeEdge((14 - Math.hypot(x - ex, y - ey)) / 7)));
   return {hand, eye, mouth};
  })
 );
 return function drawIdle(time, motion) {
  const beat = time / 540 * tau;
  const sway = Math.sin(beat / 2);
  const headTilt = .065 * sway + (motion === 'thinking' ? -.055 : 0);
  const pulse = Math.cos(beat);
  const breathing = 1.7 * pulse;
  const gaze = (motion === 'thinking' ? -2.1 : 1.7 * Math.sin(beat / 4));
  const blinkTime = (time + 600) % 2800;
  const blink = Math.max(0, 2 - Math.abs(blinkTime - 1460) / 46);
  const lidA = Math.floor(blink), lidB = Math.ceil(blink), lidMix = blink - lidA;
  const a = textures[lidA], b = textures[lidB];
  for (let y = 0; y < artHeight; y++) {
   const {head, torso} = rows[y];
   for (let x = 0; x < artWidth; x++) {
    const {hand, eye, mouth} = features[y][x];
    const side = x < profile.center ? -1 : 1;
    const shoulder = 2.7 * side * sway + pulse;
    const wave = motion === 'waving' && side === -1 ? 3.5 * (1 + pulse) : 0;
    // Sample backward through the pose so the head pivots without tearing at the neck.
    const sx = x - 2.5 * torso * sway - head * (1.8 * sway - (y - profile.neck) * headTilt) -
     hand * shoulder * .6 - eye * gaze;
    const sy = y - torso * breathing - head * ((x - profile.center) * headTilt + 1.2 * pulse) +
     hand * (shoulder + wave) - mouth * pulse * .7;
    const dest = (y * artWidth + x) * 4;
    sampleArt(a, b, lidMix, sx, sy, output.data, dest);
   }
  }
  context.putImageData(output, 0, 0);
 };
}

function sampleArt(a, b, mix, x, y, output, dest) {
 const left = Math.floor(x), top = Math.floor(y);
 if (left < 0 || top < 0 || left >= artWidth - 1 || top >= artHeight - 1) {
  output[dest + 3] = 0;
  return;
 }
 const tx = x - left, ty = y - top;
 const topPixel = (top * artWidth + left) * 4;
 const bottomPixel = topPixel + artWidth * 4;
 for (let channel = 0; channel < 4; channel++) {
  const t = topPixel + channel, d = bottomPixel + channel;
  const first = (a[t] + (a[t + 4] - a[t]) * tx) * (1 - ty) + (a[d] + (a[d + 4] - a[d]) * tx) * ty;
  const second = a === b ? first : (b[t] + (b[t + 4] - b[t]) * tx) * (1 - ty) + (b[d] + (b[d + 4] - b[d]) * tx) * ty;
  output[dest + channel] = first + (second - first) * mix;
 }
}

function paintCoffeeMug(context, x, y, pixel) {
 context.save();
 context.translate(Math.round(x), Math.round(y));
 const outline = '#283136', rim = '#fff2d7', coffee = '#6e3d26';
 if (pixel) {
  context.fillStyle = outline;
  context.fillRect(18, 5, 8, 3);
  context.fillRect(23, 8, 3, 7);
  context.fillRect(18, 15, 8, 3);
  context.fillRect(0, 2, 21, 17);
  context.fillRect(3, 19, 15, 3);
  context.fillStyle = '#387e82';
  context.fillRect(1, 4, 19, 14);
  context.fillRect(4, 18, 13, 2);
  context.fillStyle = '#8cc8b5';
  context.fillRect(2, 6, 5, 11);
  context.fillStyle = rim;
  context.fillRect(1, 0, 19, 5);
  context.fillStyle = coffee;
  context.fillRect(3, 1, 15, 2);
 } else {
  context.lineWidth = 2.4;
  context.strokeStyle = outline;
  context.beginPath(); context.ellipse(21, 11, 5, 5.5, 0, 0, tau); context.stroke();
  const glaze = context.createLinearGradient(0, 0, 21, 0);
  glaze.addColorStop(0, '#7abaae');
  glaze.addColorStop(.6, '#387e82');
  glaze.addColorStop(1, '#225b65');
  context.fillStyle = glaze;
  context.beginPath();
  context.roundRect(0, 2, 21, 20, [3, 3, 6, 6]);
  context.fill();
  context.stroke();
  context.fillStyle = rim;
  context.beginPath(); context.ellipse(10.5, 3, 10.5, 3, 0, 0, tau); context.fill();
  context.fillStyle = coffee;
  context.beginPath(); context.ellipse(10.5, 3, 7.8, 1.7, 0, 0, tau); context.fill();
 }
 context.restore();
}

function prepareWing(neutral, body, {arm: points, pivot, hand}) {
 const layer = artSurface();
 traceArm(layer, points);
 layer.clip();
 layer.drawImage(neutral.canvas, 0, 0);
 body.globalCompositeOperation = 'destination-out';
 traceArm(body, points);
 body.fill();
 body.globalCompositeOperation = 'source-over';
 const [x, y] = pivot;
 body.save();
 body.beginPath();
 body.ellipse(x, y - 2, 4, 4.5, 0, 0, tau);
 body.clip();
 body.drawImage(neutral.canvas, 0, 0);
 body.restore();
 const dx = hand[0] - x, dy = hand[1] - y;
 const angle = Math.atan2(dy, dx), length = Math.hypot(dx, dy);
 return {layer: layer.canvas, x, y, angle, length, hand};
}

function poseWing(context, wing, targetX, targetY) {
 const dx = targetX - wing.x, dy = targetY - wing.y;
 context.save();
 context.translate(wing.x, wing.y);
 context.rotate(Math.atan2(dy, dx));
 context.scale(Math.hypot(dx, dy) / wing.length, 1);
 context.rotate(-wing.angle);
 context.drawImage(wing.layer, -wing.x, -wing.y);
 context.restore();
}

function paintSteam(context, x, y, time, opacity, pixel, palette) {
 context.save();
 const phase = (time % 1700) / 1700;
 context.globalAlpha = opacity * Math.sin(Math.PI * phase) * .65;
 const drift = phase * 3;
 if (pixel) {
  context.fillStyle = palette;
  context.fillRect(Math.round(x + drift), Math.round(y - 7 - drift), 2, 3);
  context.fillRect(Math.round(x + drift + 2), Math.round(y - 10 - drift), 2, 3);
  context.fillRect(Math.round(x + drift + 1), Math.round(y - 13 - drift), 2, 3);
 } else {
  context.translate(x + drift, y - drift);
  context.strokeStyle = palette;
  context.lineWidth = 1.6;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(0, -4);
  context.bezierCurveTo(-3, -8, 5, -8, 2, -13);
  context.stroke();
 }
 context.restore();
}

function createCoffeeMotion(image, neutral, profile, context, decorate) {
 const body = artSurface();
 const closedEyes = artSurface(), pose = artSurface(), eyeLayer = artSurface();
 const pixel = !profile.eyes;
 body.drawImage(neutral.canvas, 0, 0);
 const leftWing = prepareWing(neutral, body, profile.left);
 const rightWing = prepareWing(neutral, body, profile);
 const [cupX, holdY, beakY] = profile.cup;
 readPose(pose, image, pixel ? 192 : 256, 2);
 decorate?.(pose, 0, 2);
 const open = pixel ? profile.sipEyes[0] : profile.eyes[0];
 const closed = pixel ? profile.sipEyes[1] : profile.eyes[2];
 for (let i = 0; i < open.length; i++) {
  paintEyelid(closedEyes, eyeLayer, pose, closed[i], open[i]);
 }
 return function drawCoffee(time) {
  const grasp = easeEdge(time / 600) * easeEdge((7160 - time) / 580);
  const lift = easeEdge((time - 3600) / 900) * easeEdge((6220 - time) / 800);
  const sip = easeEdge((time - 4440) / 300) * easeEdge((5530 - time) / 300);
  const centerX = cupX + .6 * Math.sin(time / 425) * (1 - lift);
  const rimY = holdY + (beakY - holdY) * lift + .55 * Math.sin(time / 475) * (1 - lift);
  const gripY = rimY + 14;
  context.clearRect(0, 0, artWidth, artHeight);
  context.imageSmoothingEnabled = !pixel;
  context.drawImage(body.canvas, 0, 0);
  if (sip > 0) {
   context.globalAlpha = sip;
   context.drawImage(closedEyes.canvas, 0, 0);
   context.globalAlpha = 1;
  }

  const gripSpacing = pixel ? 13 : 16;
  for (const [wing, side] of [[leftWing, -1], [rightWing, 1]]) {
   const [x, y] = wing.hand;
   poseWing(context, wing, x + (centerX + side * gripSpacing - x) * grasp, y + (gripY - y) * grasp);
  }

  context.save();
  context.globalAlpha = easeEdge((grasp - .45) * 2.6);
  paintCoffeeMug(context, centerX - 10.5, rimY, pixel);
  context.restore();
  paintSteam(context, centerX - 2, rimY, time, grasp * (1 - lift), pixel, '#a4775e');
  paintSteam(context, centerX + 3, rimY, time + 430, grasp * (1 - lift), pixel, '#eae0cd');
 };
}

function createPetAnimation(canvas, source, id) {
 const decorate = id === 'cientista' ? paintScientist : null;
 const profile = petArtProfiles[decorate ? 'cartoon' : id];
 if (!profile) return null;
 const image = new Image();
 image.src = source;
 return image.decode().then(() => {
  const neutral = artSurface();
  readPose(neutral, image, profile.eyes ? 256 : 192, 0);
  decorate?.(neutral, 0, 0);
  const context = canvas.getContext('2d');
  return {
   idle: profile.eyes ? createIdleMotion(image, neutral, profile, context, decorate) : null,
   coffee: createCoffeeMotion(image, neutral, profile, context, decorate),
   frame: decorate ? (row, column) => {
    context.imageSmoothingEnabled = true;
    readPose(context,image,256,column,row);
    decorate(context,row,column);
   } : null
  };
 });
}
